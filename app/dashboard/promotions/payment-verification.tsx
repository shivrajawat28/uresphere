"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2, QrCode, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { submitPromotionPaymentAction } from "@/lib/actions/platform"
import { toast } from "sonner"

type Props = {
  promotionId: string
  qrImageUrl: string | null
  instructions: string
  priceInr: number
}

export function PaymentVerification({ promotionId, qrImageUrl, instructions, priceInr }: Props) {
  const [isPending, startTransition] = useTransition()
  const [utr, setUtr] = useState("")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (utr.trim().length < 4) {
      toast.error("Enter the UTR/reference number from your payment.")
      return
    }
    startTransition(async () => {
      const result = await submitPromotionPaymentAction(promotionId, utr)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Payment submitted for verification — an admin will confirm it soon.")
        setUtr("")
      }
    })
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border/70 bg-secondary/20 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Wallet className="size-4 text-primary" />
        Pay ₹{priceInr} to make this live
      </p>

      {qrImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrImageUrl} alt="Payment QR code" className="h-32 w-32 rounded-md border border-border bg-white object-contain" />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-border bg-background">
          <QrCode className="size-8 text-muted-foreground/50" />
        </div>
      )}

      {instructions && <p className="text-xs leading-relaxed text-muted-foreground">{instructions}</p>}

      <form onSubmit={submit} className="space-y-2">
        <div className="space-y-1.5">
          <Label htmlFor={`utr-${promotionId}`}>UTR / reference number</Label>
          <Input
            id={`utr-${promotionId}`}
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            placeholder="e.g. 4242 8509 1182"
            maxLength={40}
          />
        </div>
        <Button type="submit" size="sm" disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          I&apos;ve paid — verify my UTR
        </Button>
      </form>
    </div>
  )
}
