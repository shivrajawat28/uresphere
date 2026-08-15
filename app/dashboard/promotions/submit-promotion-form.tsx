"use client"

import { useTransition } from "react"
import { submitPromotionAction } from "@/lib/actions/promotions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Megaphone } from "lucide-react"
import { toast } from "sonner"

export function SubmitPromotionForm() {
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await submitPromotionAction(formData)
      if (result.error) toast.error(result.error)
      else toast.success("Submitted for review — your admins will approve it shortly.")
    })
  }

  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="p-5">
        <form action={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" maxLength={120} required placeholder="e.g. Hostel fest registration" />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="url">Link</Label>
            <Input id="url" name="url" type="url" required placeholder="https://example.com/fest" />
          </div>
          <Button type="submit" disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
            Submit for review
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          ₹10 per promotion (24 hours live). After submitting, pay via the QR shown and enter your UTR —
          an admin verifies it before your link goes live.
        </p>
      </CardContent>
    </Card>
  )
}
