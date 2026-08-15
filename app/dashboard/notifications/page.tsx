import Link from "next/link"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { MarkAllReadButton } from "./mark-all-read-button"
import { Card, CardContent } from "@/components/ui/card"
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
            const inner = (
              <CardContent className="flex items-start gap-3 p-4">
                <div className="mt-0.5 shrink-0">{TYPE_ICONS[n.type] ?? <Bell className="size-4 text-muted-foreground" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {new Date(n.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </CardContent>
            )
            const card = (
              <Card key={n.id} className={`border-border/70 bg-card transition-colors ${n.read ? "opacity-60" : ""}`}>
                {inner}
              </Card>
            )
            return n.link ? (
              <Link key={n.id} href={n.link} className="block rounded-xl transition-transform duration-150 hover:-translate-y-0.5">
                {card}
              </Link>
            ) : (
              card
            )
          })}
        </div>
      )}
    </div>
  )
}
