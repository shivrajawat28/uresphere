"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
import { sendMessageAction, deleteMessageAction, reportMessageAction } from "@/lib/actions/chat"
import { computeScrollAnchor, mergeChatMessages, replaceOptimisticMessage, type ChatMessage } from "@/lib/chat"
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
  MessageCircle,
  MoreVertical,
  Trash2,
  Flag,
  SendHorizontal,
  ShieldCheck,
  ChevronUp,
  Loader2,
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
  const [reportTarget, setReportTarget] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState("")
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
          const row = payload.new as { id: string; is_deleted: boolean }
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, isDeleted: row.is_deleted } : m)))
        },
      )
      .subscribe()

    return () => {
      subscribedSphere.current = null
      supabase.removeChannel(channel)
    }
  }, [sphereId, currentUserId, resolveHandle])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return

    const formData = new FormData()
    formData.set("body", body)
    formData.set("sphereId", sphereId ?? "")
    setDraft("")

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
      if (result.message) {
        setMessages((prev) =>
          replaceOptimisticMessage(prev, optimisticId, {
            id: result.message!.id,
            body,
            authorId: currentUserId,
            createdAt: result.message!.createdAt,
            isDeleted: false,
            authorHandle: currentHandle,
          }),
        )
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Avoid submitting mid-IME composition (CJK input) on Enter.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
        .select("id, body, author_id, created_at, is_deleted")
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

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteMessageAction(id)
      if (result.error) toast.error(result.error)
      else {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isDeleted: true } : m)))
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

  const sorted = useMemo(() => mergeChatMessages([], messages), [messages])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4 md:px-8">
        <MessageCircle className="size-5 text-primary" />
        <div>
          <h1 className="font-serif text-lg font-medium text-foreground">{sphereName} — Live Chat</h1>
          <p className="text-xs text-muted-foreground">Anonymous, real-time, scoped to your Sphere only.</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
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
            return (
              <div key={m.id} className={`group flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
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
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.isDeleted
                        ? "border border-dashed border-border text-muted-foreground italic"
                        : isSelf
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                    }`}
                  >
                    {m.isDeleted ? "Message deleted by admin" : m.body}
                  </div>
                  {!m.isDeleted && (isSelf || isAdmin) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                          aria-label="Message options"
                        >
                          <MoreVertical className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isSelf ? "end" : "start"}>
                        <DropdownMenuItem onClick={() => handleDelete(m.id)} className="gap-2 text-destructive">
                          <Trash2 className="size-3.5" />
                          {isAdmin && !isSelf ? "Remove (admin)" : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {!m.isDeleted && !isSelf && !isAdmin && (
                    <button
                      onClick={() => setReportTarget(m.id)}
                      className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      aria-label="Report message"
                    >
                      <Flag className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <form onSubmit={handleSend} className="border-t border-border px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${sphereName} as ${currentHandle}...`}
            rows={1}
            maxLength={1000}
            className="min-h-11 flex-1 resize-none bg-secondary/40"
          />
          <Button type="submit" size="icon" disabled={isPending || !draft.trim()} aria-label="Send message">
            <SendHorizontal className="size-4" />
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-[11px] text-muted-foreground">
          <ShieldCheck className="mr-1 inline size-3" />
          Sent as {currentHandle}. Visible only to {sphereName}.
        </p>
      </form>

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
