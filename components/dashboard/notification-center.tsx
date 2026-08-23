"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/lib/actions/notifications"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import {
  Bell,
  BellRing,
  CheckCheck,
  MessageCircle,
  Users,
  Sparkles,
  ShoppingBag,
  Megaphone,
  X,
} from "lucide-react"

type Notification = {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  created_at: string
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  chat_message: MessageCircle,
  group_message: Users,
  group_invite: Bell,
  group_invite_accepted: BellRing,
  plan_published: Sparkles,
  listing_approved: ShoppingBag,
  listing_rejected: ShoppingBag,
  listing_submitted: ShoppingBag,
  promotion_approved: Megaphone,
  promotion_rejected: Megaphone,
}

export function NotificationCenter({
  userId,
  initialUnread,
}: {
  userId: string
  initialUnread: number
}) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  // Unique channel name per component instance — the dashboard layout renders
  // TWO NotificationCenter instances (mobile + desktop). If they share a
  // channel name, Supabase returns the already-subscribed channel object on
  // the second call, and the subsequent .on() throws:
  //   "cannot add postgres_changes callbacks after subscribe()"
  // useState with lazy initializer runs exactly once, avoiding the React
  // purity lint rule and guaranteeing a stable ID across re-renders.
  const [channelId] = useState(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().slice(0, 8)
    return "fallback"
  })

  // Subscribe to real-time notification changes. The channel must NOT depend
  // on `open` — tearing it down on every dropdown toggle causes missed UPDATE
  // events during the gap, which is the root cause of stale unread counts.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    // All .on() handlers MUST be registered BEFORE .subscribe().
    // Channel name must be unique per instance to avoid the two-instance
    // collision described above.
    const channel = supabase
      .channel(`notif-center-${userId}-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as Notification
          if (!n.read) setUnread((c) => c + 1)
          setNotifications((prev) => [n, ...prev].slice(0, 20))
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const prev = (payload.old as Notification).read
          const next = (payload.new as Notification).read
          if (prev !== next) setUnread((c) => Math.max(0, c + (next ? -1 : 1)))
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const old = payload.old as { id: string }
          setNotifications((prev) => {
            const exists = prev.find((n) => n.id === old.id)
            if (exists && !exists.read) setUnread((c) => Math.max(0, c - 1))
            return prev.filter((n) => n.id !== old.id)
          })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, channelId])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Fetch recent notifications when opening.
  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, read, created_at")
        .order("created_at", { ascending: false })
        .limit(20)
      setNotifications(data ?? [])
    } catch {
      // Silently fail — dropdown still works, just empty.
    } finally {
      setLoading(false)
    }
  }, [])

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) fetchNotifications()
  }

  async function handleMarkRead(id: string) {
    const result = await markNotificationReadAction(id)
    if (result.error) toast.error(result.error)
    else {
      // Update local notification list AND decrement unread count immediately.
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      setUnread((c) => Math.max(0, c - 1))
    }
  }

  async function handleMarkAllRead() {
    // Count unread before the action so we can set the count to 0 directly.
    setUnread(0)
    const result = await markAllNotificationsReadAction()
    if (result.error) {
      toast.error(result.error)
      // On error, we need to recount — but we don't have the exact count.
      // The realtime subscription will correct the count as UPDATE events
      // arrive. As a safety net, set to the previous count from the list.
      setNotifications((prev) => {
        const unreadCount = prev.filter((n) => !n.read).length
        setUnread(unreadCount)
        return prev
      })
    } else {
      setNotifications([])
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={handleToggle}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-serif text-sm font-medium text-foreground">Notifications</h3>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={handleMarkAllRead}>
                  <CheckCheck className="size-3" />
                  Mark all read
                </Button>
              )}
              <Button variant="ghost" size="icon" className="size-6" onClick={() => setOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </div>
          </div>

          <ScrollArea className="max-h-80">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No notifications yet.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {notifications.map((n) => {
                  const Icon = TYPE_ICONS[n.type] ?? Bell
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        if (!n.read) handleMarkRead(n.id)
                        if (n.link) {
                          setOpen(false)
                          // Navigation is handled by Link below.
                        }
                      }}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 ${
                        n.read ? "opacity-60" : ""
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                        <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>

          <div className="border-t border-border px-4 py-2">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-medium text-primary hover:underline"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}
