import Link from "next/link"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { MarkAllReadButton } from "./mark-all-read-button"
import { NotificationItem } from "./notification-item"
import { Bell, BellRing, Sparkles } from "lucide-react"
import type { ReactNode } from "react"

export const dynamic = "force-dynamic"

const TYPE_ICONS: Record<string, ReactNode> = {
  group_invite: <Bell className="size-4 text-primary" />,
  group_invite_accepted: <BellRing className="size-4 text-primary" />,
  plan_published: <Sparkles className="size-4 text-primary" />,
}

export default async function NotificationsPage() {
  await requireMember()
  const supabase = await createClient()

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read, created_at")
    .order("created_at", { ascending: false })
    .limit(50)

  const unread = (notifications ?? []).filter((n) => !n.read).length

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "You're all caught up"}
          </p>
        </div>
        {unread > 0 && <MarkAllReadButton />}
      </div>

      {!notifications || notifications.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No notifications yet. Group invitations and moderation updates will show up here.
        </p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const icon = TYPE_ICONS[n.type] ?? <Bell className="size-4 text-muted-foreground" />
            return <NotificationItem key={n.id} notification={n} icon={icon} />
          })}
        </div>
      )}
    </div>
  )
}
