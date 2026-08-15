"use client"

import { useTransition } from "react"
import { toggleRsvpAction } from "@/lib/actions/events"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, CalendarPlus } from "lucide-react"
import { toast } from "sonner"

export function RsvpButton({ eventId, isRsvped, isPast }: { eventId: string; isRsvped: boolean; isPast: boolean }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await toggleRsvpAction(eventId)
      if (result.error) toast.error(result.error)
    })
  }

  if (isPast) {
    return isRsvped ? (
      <Badge className="border-border/60 font-normal">Attended</Badge>
    ) : null
  }

  return (
    <Button size="sm" variant={isRsvped ? "outline" : "default"} onClick={handleClick} disabled={isPending} className="gap-1.5">
      {isRsvped ? <Check className="size-3.5" /> : <CalendarPlus className="size-3.5" />}
      {isRsvped ? "Going" : "RSVP"}
    </Button>
  )
}
