"use client"

import { useTransition } from "react"
import { toggleClubMembershipAction } from "@/lib/actions/clubs"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function JoinClubButton({ clubId, joined }: { clubId: string; joined: boolean }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await toggleClubMembershipAction(clubId)
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <Button size="sm" variant={joined ? "outline" : "default"} onClick={handleClick} disabled={isPending}>
      {joined ? "Joined" : "Join"}
    </Button>
  )
}
