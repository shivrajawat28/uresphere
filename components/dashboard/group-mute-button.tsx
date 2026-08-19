"use client"

import { useEffect, useState, useTransition } from "react"
import { toggleGroupMuteAction, getGroupMuteStatus } from "@/lib/actions/groups"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Bell, BellOff, Loader2 } from "lucide-react"

export function GroupMuteButton({ groupId }: { groupId: string }) {
  const [muted, setMuted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getGroupMuteStatus(groupId).then((result) => {
      if (!cancelled && result.muted !== undefined) {
        setMuted(result.muted)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [groupId])

  function toggle() {
    const newMuted = !muted
    setMuted(newMuted)
    startTransition(async () => {
      const result = await toggleGroupMuteAction(groupId, newMuted)
      if (result.error) {
        toast.error(result.error)
        setMuted(muted) // Revert
      } else {
        toast.success(newMuted ? "Notifications muted" : "Notifications enabled")
      }
    })
  }

  if (loading) return null

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={toggle}
      disabled={isPending}
      aria-label={muted ? "Unmute notifications" : "Mute notifications"}
    >
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : muted ? (
        <BellOff className="size-3.5" />
      ) : (
        <Bell className="size-3.5" />
      )}
      {muted ? "Unmute" : "Mute"}
    </Button>
  )
}
