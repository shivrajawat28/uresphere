"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Clock, Loader2, QrCode, Wallet } from "lucide-react"
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
  upiId: string | null
  feeStatus: string
  utr: string | null
  paidAt: string | null
}

export function PaymentVerification({
  promotionId,
  qrImageUrl,
  instructions,
  priceInr,
  upiId,
  feeStatus,
  utr,
  paidAt,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState("")

  // Already paid — nothing to do, just show the verified state.
  if (feeStatus === "paid" || feeStatus === "free") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
        <span className="font-medium">Payment verified.</span>
        {feeStatus === "paid" && utr && <span className="text-muted-foreground">UTR {utr}</span>}
      </div>
    )
  }

  // UTR submitted — awaiting admin verification.
  if (feeStatus === "payment_pending") {
    return (
      <div className="mt-3 space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Clock className="size-4 text-amber-600" aria-hidden="true" />
          Payment submitted — awaiting verification
        </p>
        {utr && (
          <p className="text-xs text-muted-foreground">
            Your UTR/reference: <span className="font-mono font-medium text-foreground">{utr}</span>
            {paidAt ? ` · submitted ${new Date(paidAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/80">
          An admin will verify your payment shortly. You can update the UTR below if you entered it wrong.
        </p>
        <PaymentForm
          promotionId={promotionId}
          priceInr={priceInr}
          isPending={isPending}
          value={value}
          setValue={setValue}
          startTransition={startTransition}
        />
      </div>
    )
  }

  // fee_status "due" — payment required.
  return (
    <div className="mt-3 space-y-3 rounded-md border border-border/70 bg-secondary/20 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Wallet className="size-4 text-primary" aria-hidden="true" />
        Pay ₹{priceInr} to make this live
      </p>

      {qrImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrImageUrl} alt="Payment QR code" className="h-32 w-32 rounded-md border border-border bg-white object-contain" />
      ) : (
        <div className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-background p-2">
          <QrCode className="size-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-center text-[10px] leading-tight text-muted-foreground/70">
            Payment QR not configured yet — check back soon.
          </p>
        </div>
      )}

      {upiId && (
        <p className="text-xs text-muted-foreground">
          Or pay to UPI: <span className="font-mono font-medium text-foreground">{upiId}</span>
        </p>
      )}
      {instructions && <p className="text-xs leading-relaxed text-muted-foreground">{instructions}</p>}

      <PaymentForm
        promotionId={promotionId}
        priceInr={priceInr}
        isPending={isPending}
        value={value}
        setValue={setValue}
        startTransition={startTransition}
      />
    </div>
  )
}

function PaymentForm({
  promotionId,
  isPending,
  value,
  setValue,
  startTransition,
}: {
  promotionId: string
  priceInr: number
  isPending: boolean
  value: string
  setValue: (v: string) => void
  startTransition: (fn: () => void) => void
}) {
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (value.trim().length < 4) {
      toast.error("Enter the UTR/reference number from your payment.")
      return
    }
    startTransition(async () => {
      const result = await submitPromotionPaymentAction(promotionId, value)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Payment submitted for verification — an admin will confirm it soon.")
        setValue("")
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={`utr-${promotionId}`}>UTR / reference number</Label>
        <Input
          id={`utr-${promotionId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 4242 8509 1182"
          maxLength={40}
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending} className="gap-2">
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
        I&apos;ve paid — verify my UTR
      </Button>
    </form>
  )
}
