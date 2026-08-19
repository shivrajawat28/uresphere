"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { markAllNotificationsReadAction } from "@/lib/actions/notifications"
import { Button } from "@/components/ui/button"
import { CheckCheck } from "lucide-react"
import { toast } from "sonner"

export function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction()
          if (result.error) toast.error(result.error)
          else router.refresh()
        })
      }
    >
      <CheckCheck className="size-3.5" />
      Mark all read
    </Button>
  )
}
