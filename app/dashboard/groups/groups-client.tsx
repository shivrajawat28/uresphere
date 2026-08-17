"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  adminDeleteGroupAction,
  createGroupAction,
  inviteToGroupAction,
  leaveGroupAction,
  respondToInviteAction,
  sendGroupMessageAction,
  deleteGroupMessageAction,
} from "@/lib/actions/groups"
import { mergeChatMessages, shouldSendOnEnter } from "@/lib/chat"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Users,
  Plus,
  Check,
  X,
  SendHorizontal,
  MessageCircle,
  UserPlus,
  Trash2,
  ChevronUp,
  Loader2,
  LogOut,
} from "lucide-react"

type GroupSummary = {
  id: string
  name: string
  description: string
  created_by: string
  created_at: string
  memberCount: number
  isMember: boolean
}

type Invite = { id: string; groupId: string; groupName: string }

type Message = {
  id: string
  body: string
  authorId: string
  createdAt: string
  isDeleted: boolean
  authorHandle: string
}

export function GroupsClient({
  groups,
  pendingInvites,
  activeGroup,
  initialMessages,
  initialHasMore,
  initialOldestCreatedAt,
  currentUserId,
  currentHandle,
  isAdmin,
}: {
  groups: GroupSummary[]
  pendingInvites: Invite[]
  activeGroup: { id: string; name: string; created_by: string; isMember: boolean } | null
  initialMessages: Message[]
  initialHasMore: boolean
  initialOldestCreatedAt: string | null
  currentUserId: string
  currentHandle: string
  isAdmin: boolean
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createGroupAction(formData)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Group created")
        setCreateOpen(false)
      }
    })
  }

  function handleInvite(formData: FormData) {
    if (!activeGroup) return
    formData.set("groupId", activeGroup.id)
    startTransition(async () => {
      const result = await inviteToGroupAction(formData)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Invite sent")
        setInviteOpen(false)
      }
    })
  }

  function handleRespond(inviteId: string, accept: boolean) {
    startTransition(async () => {
      const result = await respondToInviteAction(inviteId, accept)
      if (result.error) toast.error(result.error)
      else toast.success(accept ? "Joined the group" : "Invite declined")
    })
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar: groups + invites */}
      <div className="flex w-full flex-col gap-4 lg:w-80">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Your groups</h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New group
          </Button>
        </div>

        {pendingInvites.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Invitations</p>
            {pendingInvites.map((invite) => (
              <Card key={invite.id} className="border-border/70 bg-card">
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{invite.groupName}</p>
                    <p className="text-xs text-muted-foreground">invited you to join</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="icon-sm" variant="outline" onClick={() => handleRespond(invite.id, true)} aria-label="Accept">
                      <Check className="size-3.5 text-primary" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => handleRespond(invite.id, false)} aria-label="Decline">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {groups.length === 0 && (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No groups yet. Create the first one.
            </p>
          )}
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/dashboard/groups?group=${group.id}`}
              className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                activeGroup?.id === group.id
                  ? "border-primary/40 bg-primary/8"
                  : "border-border/70 hover:bg-secondary"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{group.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3" />
                  {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                </p>
              </div>
              {group.isMember && (
                <Badge variant="outline" className="shrink-0 border-border/60 text-[10px] font-normal">
                  Joined
                </Badge>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Chat pane — remounted per group so state resets cleanly */}
      {activeGroup ? (
        <GroupChat
          key={activeGroup.id}
          group={activeGroup}
          initialMessages={initialMessages}
          initialHasMore={initialHasMore}
          initialOldestCreatedAt={initialOldestCreatedAt}
          currentUserId={currentUserId}
          currentHandle={currentHandle}
          isAdmin={isAdmin}
          onOpenInvite={() => setInviteOpen(true)}
        />
      ) : (
        <div className="flex min-h-[60svh] flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-8 text-center lg:h-[70svh]">
          <MessageCircle className="size-8 text-muted-foreground/50" />
          <p className="font-serif text-lg text-foreground">Select a group to start chatting</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Only accepted members can see or send messages in a group.
          </p>
        </div>
      )}

      {/* Create group dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a group</DialogTitle>
            <DialogDescription>Private to your Sphere members.</DialogDescription>
          </DialogHeader>
          <form action={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Group name</Label>
              <Input id="name" name="name" maxLength={80} required placeholder="Study group — Data Structures" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea id="description" name="description" maxLength={500} rows={3} placeholder="What's this group about?" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                Create group
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a member</DialogTitle>
            <DialogDescription>Invite someone by their anonymous handle — e.g. {currentHandle}.</DialogDescription>
          </DialogHeader>
          <form action={handleInvite} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="handle">Anonymous handle</Label>
              <Input id="handle" name="handle" placeholder="@SilentWolf482" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GroupChat({
  group,
  initialMessages,
  initialHasMore,
  initialOldestCreatedAt,
  currentUserId,
  currentHandle,
  isAdmin,
  onOpenInvite,
}: {
  group: { id: string; name: string; created_by: string; isMember: boolean }
  initialMessages: Message[]
  initialHasMore: boolean
  initialOldestCreatedAt: string | null
  currentUserId: string
  currentHandle: string
  isAdmin: boolean
  onOpenInvite: () => void
}) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const isCreator = group.created_by === currentUserId
  const canDeleteGroup = isCreator || isAdmin

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveGroupAction(group.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success("You left the group")
        setLeaveOpen(false)
        router.refresh()
      }
    })
  }

  function handleDeleteGroup() {
    startTransition(async () => {
      const result = await adminDeleteGroupAction(group.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Group deleted")
        setDeleteOpen(false)
        router.refresh()
      }
    })
  }
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(initialOldestCreatedAt)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const handleCache = useRef(new Map<string, string>())
  const didInitialScroll = useRef(false)

  useEffect(() => {
    for (const m of initialMessages) handleCache.current.set(m.authorId, m.authorHandle)
  }, [initialMessages])

  // Open at the newest messages (the server loads only the latest window).
  useEffect(() => {
    if (didInitialScroll.current) return
    const el = scrollRef.current
    if (!el) return
    didInitialScroll.current = true
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" })
    }
  }, [])

  // Only follow to the bottom when the user is already there (new messages
  // arrive via realtime; don't yank someone reading history).
  useEffect(() => {
    if (messages.length === 0) return
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages.length])

  async function loadOlder() {
    if (loadingOlder || !oldestCreatedAt) return
    setLoadingOlder(true)
    const el = scrollRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0
    const prevScrollTop = el?.scrollTop ?? 0
    const wasNearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 160 : false
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("group_messages")
        .select("id, group_id, author_id, body, created_at, is_deleted")
        .eq("group_id", group.id)
        .lt("created_at", oldestCreatedAt)
        .order("created_at", { ascending: false })
        .limit(50)
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
      setHasMore(rows.length === 50)
      if (rows.length > 0) setOldestCreatedAt(rows[0].created_at)
      requestAnimationFrame(() => {
        const nextEl = scrollRef.current
        if (!nextEl) return
        nextEl.scrollTo({
          top: wasNearBottom ? nextEl.scrollHeight : prevScrollTop + (nextEl.scrollHeight - prevScrollHeight),
          behavior: "auto",
        })
      })
    } catch {
      toast.error("Couldn't load earlier messages.")
    } finally {
      setLoadingOlder(false)
    }
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`group-${group.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` },
        async (payload) => {
          const row = payload.new as {
            id: string
            body: string
            author_id: string
            created_at: string
            is_deleted: boolean
          }
          const cachedHandle = handleCache.current.get(row.author_id)
          const handle =
            cachedHandle ??
            (await supabase
              .from("user_spheres")
              .select("anonymous_handle")
              .eq("user_id", row.author_id)
              .maybeSingle())?.data?.anonymous_handle ??
            "Unknown"
          handleCache.current.set(row.author_id, handle)
          // Dedupe by id + keep chronological order (same helper as Sphere chat).
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
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [group.id])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    // Guard against duplicate sends: a second Enter (or click) while the
    // previous send is still in flight is ignored.
    if (isPending) return
    const body = draft.trim()
    if (!body) return
    const formData = new FormData()
    formData.set("groupId", group.id)
    formData.set("body", body)
    setDraft("")
    startTransition(async () => {
      const result = await sendGroupMessageAction(formData)
      if (result.error) toast.error(result.error)
    })
  }

  // Enter sends the message; Shift+Enter inserts a newline; mid-IME
  // composition (CJK input) never sends. Same rule as Sphere chat.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSendOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode })) {
      e.preventDefault()
      handleSend(e as unknown as React.FormEvent)
    }
  }

  function handleDeleteMessage(id: string) {
    startTransition(async () => {
      const result = await deleteGroupMessageAction(id)
      if (result.error) toast.error(result.error)
      else toast.success("Message removed")
    })
  }

  return (
    <div className="flex min-h-[60svh] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card lg:h-[70svh]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-lg font-medium text-foreground">{group.name}</h2>
          <p className="text-xs text-muted-foreground">Private group chat in your Sphere</p>
        </div>
        {group.isMember && (
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenInvite}>
              <UserPlus className="size-3.5" />
              Invite
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLeaveOpen(true)}>
              <LogOut className="size-3.5" />
              Leave
            </Button>
            {canDeleteGroup && (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-3.5" />
                Delete group
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Leave group — confirm before removing membership */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave “{group.name}”?</DialogTitle>
            <DialogDescription>
              You&apos;ll no longer see or send messages in this group. Your messages stay visible to remaining
              members.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleLeave} disabled={isPending}>
              Leave group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete group — creator/admin only, destructive with confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{group.name}”?</DialogTitle>
            <DialogDescription>
              This permanently deletes the group and its message history for everyone. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteGroup} disabled={isPending}>
              Delete group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {group.isMember ? (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-2xl space-y-3">
              {hasMore && (
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                  >
                    {loadingOlder ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ChevronUp className="size-3.5" />
                    )}
                    {loadingOlder ? "Loading…" : "Load earlier messages"}
                  </Button>
                </div>
              )}
              {messages.length === 0 && (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No messages yet. Say hi to your group.
                </p>
              )}
              {messages.map((m) => {
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
                            ? "border border-dashed border-border italic text-muted-foreground"
                            : isSelf
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-foreground"
                        }`}
                      >
                        {m.isDeleted ? "Message deleted by admin" : m.body}
                      </div>
                      {!m.isDeleted && (isSelf || isAdmin) && (
                        <button
                          onClick={() => handleDeleteMessage(m.id)}
                          className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          aria-label="Delete message"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <form onSubmit={handleSend} className="border-t border-border px-4 py-3">
            <div className="mx-auto flex max-w-2xl items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message as ${currentHandle}...`}
                rows={1}
                maxLength={1000}
                className="min-h-11 flex-1 resize-none bg-secondary/40"
              />
              <Button type="submit" size="icon" disabled={isPending || !draft.trim()} aria-label="Send message">
                <SendHorizontal className="size-4" />
              </Button>
            </div>
          </form>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">You haven&apos;t joined this group yet.</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Ask a member to send you an invite by your anonymous handle ({currentHandle}).
          </p>
        </div>
      )}
    </div>
  )
}
