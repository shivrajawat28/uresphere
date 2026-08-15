"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { regenerateHandleAction } from "@/lib/actions/profile"

export function RegenerateHandleButton() {
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleClick() {
    if (!confirmOpen) {
      setConfirmOpen(true)
      return
    }
    startTransition(async () => {
      const result = await regenerateHandleAction()
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`New handle: ${result.handle}`)
      }
      setConfirmOpen(false)
    })
  }

  return (
    <Button
      variant={confirmOpen ? "default" : "outline"}
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="gap-1.5"
    >
      <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
      {confirmOpen ? "Confirm" : "Regenerate"}
    </Button>
  )
}
