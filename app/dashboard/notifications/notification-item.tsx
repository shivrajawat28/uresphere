"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { markNotificationReadAction } from "@/lib/actions/notifications"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"

export function NotificationItem({
  notification,
  icon,
}: {
  notification: {
    id: string
    title: string
    body: string
    link: string | null
    created_at: string
  }
  icon: ReactNode
}) {
  const router = useRouter()

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    
    // Optimistically navigate if there's a link
    if (notification.link) {
      router.push(notification.link)
    }

    // Delete the notification
    const res = await markNotificationReadAction(notification.id)
    if (res.error) {
      toast.error(res.error)
    }
  }

  const inner = (
    <CardContent className="flex items-start gap-3 p-4">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{notification.title}</p>
        {notification.body && <p className="text-sm text-muted-foreground">{notification.body}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {new Date(notification.created_at).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
    </CardContent>
  )

  const card = (
    <Card className="border-border/70 bg-card transition-colors hover:bg-secondary/50">
      {inner}
    </Card>
  )

  return (
    <a
      href={notification.link ?? "#"}
      onClick={handleClick}
      className="block rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
    >
      {card}
    </a>
  )
}
