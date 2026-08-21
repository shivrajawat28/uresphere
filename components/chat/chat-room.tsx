"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
import { sendMessageAction, deleteMessageAction, reportMessageAction } from "@/lib/actions/chat"
import {
  computeScrollAnchor,
  deletedMessageLabel,
  mergeChatMessages,
  replaceOptimisticMessage,
  shouldSendOnEnter,
  type ChatMessage,
  type DeletedByRole,
} from "@/lib/chat"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  CornerUpLeft,
  Flag,
  Loader2,
  MessageCircle,
  MoreVertical,
  SendHorizontal,
  ShieldCheck,
  ChevronUp,
  Trash2,
  X,
} from "lucide-react"

const PAGE_SIZE = 50

export function ChatRoom({
  sphereId,
  sphereName,
  currentUserId,
  currentHandle,
  isAdmin,
  initialMessages,
  initialHasMore,
  initialOldestCreatedAt,
}: {
  // null only for global (super_admin) accounts with no college membership.
  sphereId: string | null
  sphereName: string
  currentUserId: string
  currentHandle: string
  isAdmin: boolean
  initialMessages: ChatMessage[]
  initialHasMore: boolean
  initialOldestCreatedAt: string | null
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(initialOldestCreatedAt)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null)
  const [reportTarget, setReportTarget] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  // Reply targets that fell outside the loaded window are fetched here (batched
  // into a single query) so reply previews never cause N+1 lookups.
  const [replyCache, setReplyCache] = useState<Record<string, ChatMessage>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const handleCache = useRef(new Map<string, string>())
  const subscribedSphere = useRef<string | null>(null)
  // The server loads only the newest window, so the very first thing we do on
  // open is jump to the bottom (instantly, no smooth scroll-through of
  // history). Runs once per mount — closing and reopening the chat always
  // lands on the latest message.
  const didInitialScroll = useRef(false)

  useEffect(() => {
    for (const m of initialMessages) handleCache.current.set(m.authorId, m.authorHandle)
  }, [initialMessages])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
  }, [])

  // Open at the newest messages: jump straight to the bottom once, on mount.
  useEffect(() => {
    if (didInitialScroll.current) return
    const el = scrollRef.current
    if (!el) return
    didInitialScroll.current = true
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" })
    }
  }, [])

  // Only auto-scroll when the newest message is our own or arrives via
  // realtime (i.e. the user is already at the bottom of the conversation).
  useEffect(() => {
    if (messages.length === 0) return
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom) scrollToBottom("smooth")
  }, [messages.length, scrollToBottom])

  const resolveHandle = useCallback(
    async (authorId: string): Promise<string> => {
      const cached = handleCache.current.get(authorId)
      if (cached) return cached
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from("user_spheres")
          .select("anonymous_handle")
          .eq("user_id", authorId)
          .maybeSingle()
        const handle = data?.anonymous_handle ?? "Unknown"
        handleCache.current.set(authorId, handle)
        return handle
      } catch {
        return "Unknown"
      }
    },
    [],
  )

  useEffect(() => {
    // No Sphere (e.g. a super admin without college membership): nothing to
    // subscribe to — there is no chat channel without a Sphere.
    if (!sphereId) return

    // Re-create the subscription when the Sphere changes only. Re-renders and
    // draft keystrokes must never tear down / rebuild the channel.
    if (subscribedSphere.current === sphereId) return
    subscribedSphere.current = sphereId

    const supabase = createClient()

    const channel = supabase
      .channel(`sphere-chat-${sphereId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          // NOTE: keep this to a SINGLE filter condition. Supabase Realtime on
          // this stack silently matches nothing for `and`-combined filters
          // (verified live: `sphere_id=eq.X and author_id=neq.Y` never fires,
          // while either condition alone delivers). The sender's own echo is
          // handled client-side below instead of via an `and` filter.
          filter: `sphere_id=eq.${sphereId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string
            body: string
            author_id: string
            created_at: string
            is_deleted: boolean
            deleted_by_role: string | null
            reply_to_message_id: string | null
          }
          if (row.author_id === currentUserId) {
            // The sender's own message may still be pending as an optimistic
            // bubble (temp id). Swap it for the persisted row so the realtime
            // echo never creates a duplicate, in either arrival order. When no
            // bubble exists (e.g. sent from another tab of the same user) the
            // swap is a no-op and the message is simply already/soon applied
            // via the server-action response.
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev // already applied
              const optimistic = prev.find(
                (m) => m.id.startsWith("optimistic-") && m.authorId === currentUserId && m.body === row.body,
              )
              if (optimistic) {
                return prev.map((m) =>
                  m.id === optimistic.id ? { ...m, id: row.id, createdAt: row.created_at } : m,
                )
              }
              return prev
            })
            return
          }
          const handle = await resolveHandle(row.author_id)
          setMessages((prev) =>
            mergeChatMessages(prev, [
              {
                id: row.id,
                body: row.body,
                authorId: row.author_id,
                createdAt: row.created_at,
                isDeleted: row.is_deleted,
                deletedByRole: (row.deleted_by_role as DeletedByRole | null) ?? null,
                replyToMessageId: row.reply_to_message_id ?? null,
                authorHandle: handle,
              },
            ]),
          )
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `sphere_id=eq.${sphereId}` },
        (payload) => {
          const row = payload.new as { id: string; is_deleted: boolean; deleted_by_role: string | null }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id
                ? { ...m, isDeleted: row.is_deleted, deletedByRole: (row.deleted_by_role as DeletedByRole | null) ?? m.deletedByRole }
                : m,
            ),
          )
        },
      )
      // The 24-hour retention purge hard-deletes rows; connected clients must
      // drop them from the list (no reload, no realtime errors).
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `sphere_id=eq.${sphereId}` },
        (payload) => {
          const old = payload.old as { id: string }
          setMessages((prev) => prev.filter((m) => m.id !== old.id))
          setReplyCache((prev) => {
            if (!(old.id in prev)) return prev
            const next = { ...prev }
            delete next[old.id]
            return next
          })
        },
      )
      .subscribe()

    return () => {
      subscribedSphere.current = null
      supabase.removeChannel(channel)
    }
  }, [sphereId, currentUserId, resolveHandle])

  // Batch-fetch reply targets that are not in the loaded window (single query
  // per batch — no N+1 for reply previews).
  const missingReplyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of messages) {
      if (m.replyToMessageId && !messages.some((x) => x.id === m.replyToMessageId) && !(m.replyToMessageId in replyCache)) {
        ids.add(m.replyToMessageId)
      }
    }
    return Array.from(ids)
  }, [messages, replyCache])

  useEffect(() => {
    if (missingReplyIds.length === 0) return
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, body, author_id, created_at, is_deleted, deleted_by_role")
        .in("id", missingReplyIds)
      if (cancelled || !data || data.length === 0) return
      const authorIds = Array.from(new Set(data.map((r) => r.author_id)))
      const handleMap = new Map<string, string>()
      if (authorIds.length > 0) {
        const { data: handles } = await supabase
          .from("user_spheres")
          .select("user_id, anonymous_handle")
          .in("user_id", authorIds)
        for (const h of handles ?? []) {
          handleMap.set(h.user_id, h.anonymous_handle)
          handleCache.current.set(h.user_id, h.anonymous_handle)
        }
      }
      setReplyCache((prev) => {
        const next = { ...prev }
        for (const r of data) {
          next[r.id] = {
            id: r.id,
            body: r.body,
            authorId: r.author_id,
            createdAt: r.created_at,
            isDeleted: r.is_deleted,
            deletedByRole: (r.deleted_by_role as DeletedByRole | null) ?? null,
            authorHandle: handleMap.get(r.author_id) ?? "Unknown",
          }
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [missingReplyIds])

  function resolveReplyTarget(id: string): ChatMessage | null {
    return messages.find((m) => m.id === id) ?? replyCache[id] ?? null
  }

  function scrollToMessage(id: string) {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`)
    if (!el) {
      toast.info("That message isn't loaded right now.")
      return
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightedId(id)
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1800)
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return

    const replyingTo = replyTarget
    const formData = new FormData()
    formData.set("body", body)
    formData.set("sphereId", sphereId ?? "")
    if (replyingTo) formData.set("replyToMessageId", replyingTo.id)
    setDraft("")
    const el = document.getElementById("chat-composer")
    if (el) el.style.height = "auto"

    // Optimistic bubble: the sender sees their message instantly. The temp id
    // is reconciled with the persisted row when the action resolves.
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setMessages((prev) =>
      mergeChatMessages(prev, [
        {
          id: optimisticId,
          body,
          authorId: currentUserId,
          createdAt: new Date().toISOString(),
          isDeleted: false,
          replyToMessageId: replyingTo?.id ?? null,
          authorHandle: currentHandle,
        },
      ]),
    )
    setTimeout(() => scrollToBottom("smooth"), 0)

    startTransition(async () => {
      const result = await sendMessageAction(formData)
      if (result.error) {
        toast.error(result.error)
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        return
      }
      setReplyTarget(null)
      if (result.message) {
        setMessages((prev) =>
          replaceOptimisticMessage(prev, optimisticId, {
            id: result.message!.id,
            body,
            authorId: currentUserId,
            createdAt: result.message!.createdAt,
            isDeleted: false,
            replyToMessageId: replyingTo?.id ?? null,
            authorHandle: currentHandle,
          }),
        )
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline, and mid-IME composition
    // (CJK input) never sends. Same rule as the group chat composer.
    if (shouldSendOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode })) {
      e.preventDefault()
      handleSend(e as unknown as React.FormEvent)
    }
  }

  async function loadOlder() {
    if (!sphereId || loadingOlder || !oldestCreatedAt) return
    setLoadingOlder(true)

    // Capture the viewport before older messages are prepended so we can
    // restore the reading position afterwards (no unexpected jump).
    const el = scrollRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0
    const prevScrollTop = el?.scrollTop ?? 0
    const wasNearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 160 : false

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, body, author_id, created_at, is_deleted, deleted_by_role, reply_to_message_id")
        .eq("sphere_id", sphereId)
        .lt("created_at", oldestCreatedAt)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
      if (error) {
        toast.error("Couldn't load earlier messages.")
        return
      }
      const rows = (data ?? []).reverse()
      const authorIds = Array.from(new Set(rows.map((r) => r.author_id)))
      const handleMap = new Map<string, string>()
      if (authorIds.length > 0) {
        const { data: handles } = await supabase
          .from("user_spheres")
          .select("user_id, anonymous_handle")
          .in("user_id", authorIds)
        for (const h of handles ?? []) {
          handleMap.set(h.user_id, h.anonymous_handle)
          handleCache.current.set(h.user_id, h.anonymous_handle)
        }
      }
      const older = rows.map((r) => ({
        id: r.id,
        body: r.body,
        authorId: r.author_id,
        createdAt: r.created_at,
        isDeleted: r.is_deleted,
        deletedByRole: (r.deleted_by_role as DeletedByRole | null) ?? null,
        replyToMessageId: r.reply_to_message_id ?? null,
        authorHandle: handleMap.get(r.author_id) ?? "Unknown",
      }))
      setMessages((prev) => mergeChatMessages(prev, older))
      setHasMore(rows.length === PAGE_SIZE)
      if (rows.length > 0) setOldestCreatedAt(rows[0].created_at)

      // Anchoring runs after React commits the prepended rows (rAF fires
      // before the next paint, so no visible shift): stay at the bottom if we
      // were there, otherwise keep the same messages in view.
      requestAnimationFrame(() => {
        const nextEl = scrollRef.current
        if (!nextEl) return
        nextEl.scrollTo({
          top: computeScrollAnchor({
            wasNearBottom,
            prevScrollTop,
            prevScrollHeight,
            nextScrollHeight: nextEl.scrollHeight,
          }),
          behavior: "auto",
        })
      })
    } catch {
      toast.error("Couldn't load earlier messages.")
    } finally {
      setLoadingOlder(false)
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeleteTarget(null)
    startTransition(async () => {
      const result = await deleteMessageAction(id)
      if (result.error) toast.error(result.error)
      else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, isDeleted: true, deletedByRole: result.deletedByRole ?? "user", body: "" }
              : m,
          ),
        )
        toast.success("Message removed.")
      }
    })
  }

  function submitReport() {
    if (!reportTarget || !reportReason.trim()) return
    const formData = new FormData()
    formData.set("messageId", reportTarget)
    formData.set("sphereId", sphereId ?? "")
    formData.set("reason", reportReason.trim())

    startTransition(async () => {
      const result = await reportMessageAction(formData)
      if (result.error) toast.error(result.error)
      else toast.success("Report submitted to your Sphere's admins.")
      setReportTarget(null)
      setReportReason("")
    })
  }

  // The message action menu opens from the three-dot button only. There is no
  // row-level long-press: a pointerdown on the row used to start a delayed
  // open that re-opened the menu after the user's tap closed it, which is why
  // closing sometimes took several taps. The three-dot button stops
  // propagation so no other handler can interfere with a single tap.

  const sorted = useMemo(() => mergeChatMessages([], messages), [messages])

  return (
    <div className="flex h-full flex-col">
      <div className="hidden md:flex items-center gap-3 border-b border-border px-4 py-4 md:px-8">
        <MessageCircle className="size-5 text-primary" />
        <div>
          <h1 className="font-serif text-lg font-medium text-foreground">{sphereName} — Live Chat</h1>
          <p className="text-xs text-muted-foreground">Anonymous, real-time, scoped to your Sphere only.</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={() => {
          // Scrolling the message list closes any open action menu so it can
          // never end up detached from its message mid-scroll.
          if (openMenuId) setOpenMenuId(null)
        }}
        className="flex-1 overflow-y-auto px-4 py-6 md:px-8"
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronUp className="size-3.5" />}
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </Button>
            </div>
          )}
          {sorted.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No messages yet. Be the first to say something in {sphereName}.
            </p>
          )}
          {sorted.map((m) => {
            const isSelf = m.authorId === currentUserId
            const deletedLabel = deletedMessageLabel(m.isDeleted, m.deletedByRole)
            const replyTo = m.replyToMessageId ? resolveReplyTarget(m.replyToMessageId) : null
            return (
              <div
                key={m.id}
                data-message-id={m.id}
                className={`group flex flex-col ${isSelf ? "items-end" : "items-start"} ${
                  highlightedId === m.id ? "rounded-xl bg-primary/10 ring-1 ring-primary/40" : ""
                }`}
              >
                <div className="mb-1 flex items-center gap-2 px-1">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {isSelf ? currentHandle : m.authorHandle}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex max-w-[85%] items-start gap-1">
                  <div
                    className={`break-words whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.isDeleted
                        ? "border border-dashed border-border text-muted-foreground italic"
                        : isSelf
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                    }`}
                  >
                    {m.replyToMessageId && !m.isDeleted && (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(m.replyToMessageId!)}
                        className={`mb-1.5 flex w-full max-w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                          isSelf
                            ? "bg-white/15 text-primary-foreground/90 hover:bg-white/25"
                            : "bg-background/70 text-muted-foreground hover:bg-background"
                        }`}
                        aria-label={replyTo && !replyTo.isDeleted ? `Jump to the message you replied to` : "Reply target no longer available"}
                      >
                        <CornerUpLeft className="mt-0.5 size-3 shrink-0 opacity-70" aria-hidden="true" />
                        <span className="min-w-0">
                          {!replyTo ? (
                            <span className="italic">Message no longer available</span>
                          ) : replyTo.isDeleted ? (
                            <span className="italic">Message deleted</span>
                          ) : (
                            <>
                              <span className={`mr-1.5 font-mono text-[10px] font-medium ${isSelf ? "text-primary-foreground/80" : "text-primary"}`}>
                                {replyTo.authorHandle}
                              </span>
                              <span className="line-clamp-2 wrap-break-word">{replyTo.body}</span>
                            </>
                          )}
                        </span>
                      </button>
                    )}
                    {deletedLabel ?? m.body}
                  </div>
                  {!m.isDeleted && (
                    <DropdownMenu open={openMenuId === m.id} onOpenChange={(open) => setOpenMenuId(open ? m.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 rounded p-1 text-muted-foreground transition hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                          aria-label="Message options"
                        >
                          <MoreVertical className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      {/* The menu anchors to the three-dot button (Base UI
                          floating positioning with viewport collision
                          handling), so it always appears next to the message
                          — never detached at the top of the page. */}
                      <DropdownMenuContent align={isSelf ? "end" : "start"} side="bottom" sideOffset={4}>
                        <DropdownMenuItem
                          onClick={() => {
                            setReplyTarget(m)
                            setOpenMenuId(null)
                          }}
                          className="gap-2"
                        >
                          <CornerUpLeft className="size-3.5" />
                          Reply
                        </DropdownMenuItem>
                        {(isSelf || isAdmin) && (
                          <DropdownMenuItem
                            onClick={() => {
                              setDeleteTarget(m)
                              setOpenMenuId(null)
                            }}
                            variant="destructive"
                            className="gap-2"
                          >
                            <Trash2 className="size-3.5" />
                            {isAdmin && !isSelf ? "Remove (admin)" : "Delete"}
                          </DropdownMenuItem>
                        )}
                        {!isSelf && !isAdmin && (
                          <DropdownMenuItem
                            onClick={() => {
                              setReportTarget(m.id)
                              setOpenMenuId(null)
                            }}
                            className="gap-2"
                          >
                            <Flag className="size-3.5" />
                            Report
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <form onSubmit={handleSend} className="shrink-0 bg-background border-t border-border px-4 py-4 md:px-8">
        <div className="mx-auto max-w-2xl">
          {replyTarget && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2">
              <CornerUpLeft className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Replying to {replyTarget.authorHandle}
                </p>
                <p className="truncate text-xs text-foreground/80">
                  {replyTarget.isDeleted ? "Message deleted" : replyTarget.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="Cancel reply"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              id="chat-composer"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                e.target.style.height = "auto"
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
              }}
              onKeyDown={handleKeyDown}
              placeholder={replyTarget ? `Reply to ${replyTarget.authorHandle}...` : `Message anonymously as ${currentHandle.startsWith('@') ? currentHandle : `@${currentHandle}`}`}
              rows={1}
              maxLength={1000}
              className="min-h-10 max-h-[120px] flex-1 resize-none bg-secondary/40 py-2 overflow-y-auto"
            />
            <Button type="submit" size="icon" disabled={isPending || !draft.trim()} aria-label="Send message" onClick={() => {
              const el = document.getElementById("chat-composer")
              if (el) el.style.height = "auto"
            }}>
              <SendHorizontal className="size-4" />
            </Button>
          </div>
          <p className="hidden md:block mt-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="mr-1 inline size-3" />
            Sent as {currentHandle}. Visible only to {sphereName}.
          </p>
        </div>
      </form>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this message?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The message will be removed for everyone in {sphereName}. Original content stays visible to Sphere
            admins for moderation and is permanently deleted after 24 hours.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportTarget !== null} onOpenChange={(open) => !open && setReportTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this message</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="What's wrong with this message?"
            maxLength={500}
            rows={4}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={submitReport} disabled={!reportReason.trim() || isPending}>
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
