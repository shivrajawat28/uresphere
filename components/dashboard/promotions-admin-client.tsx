"use client"

import { useTransition } from "react"
import { Megaphone } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { reviewPromotionAction } from "@/lib/actions/admin"
import { verifyPromotionPaymentAction } from "@/lib/actions/platform"
import { toast } from "sonner"

type Promotion = {
  id: string
  title: string
  url: string
  status: string
  fee_status: string
  utr: string | null
  publisher: string
  created_at: string
  reviewed_at: string | null
  paid_at: string | null
}

export function PromotionsAdminClient({
  sphereName,
  feeInr,
  promotions,
}: {
  sphereName: string
  feeInr: number
  promotions: Promotion[]
}) {
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  const pendingCount = promotions.filter((p) => p.status === "pending").length

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Megaphone className="size-3.5" aria-hidden="true" />
          Promotions Admin
        </p>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{sphereName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review promotion submissions, verify payments and approve links for your Sphere. The payment QR and fee
          are configured by the platform team — you only review submissions.
        </p>
      </div>

      <p className="mb-3 text-sm font-medium text-foreground">
        Submissions ({pendingCount} pending)
      </p>

      {promotions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No promotions submitted in this Sphere yet.
        </p>
      ) : (
        <div className="space-y-3">
          {promotions.map((p) => {
            const needsPayment = p.fee_status === "due"
            const paymentLabel =
              p.fee_status === "free"
                ? "No fee"
                : p.fee_status === "paid"
                  ? "Payment verified"
                  : p.fee_status === "payment_pending"
                    ? "Payment pending verification"
                    : `Payment due (₹${feeInr})`
            return (
              <Card key={p.id} className="border-border/70 bg-card">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{p.title || p.url}</p>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-primary hover:underline">
                        {p.url}
                      </a>
                      <p className="mt-1 text-xs text-muted-foreground">
                        by <span className="font-mono text-[11px] text-primary">{p.publisher}</span>
                        {" · "}submitted{" "}
                        {new Date(p.created_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className="border-border/60 text-[10px] font-normal capitalize">
                        {p.status}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground/80">{paymentLabel}</span>
                    </div>
                  </div>

                  {p.utr && (
                    <p className="mt-2 rounded-md bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground">
                      UTR/reference: <span className="font-mono font-medium text-foreground">{p.utr}</span>
                      {p.paid_at
                        ? ` · submitted ${new Date(p.paid_at).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </p>
                  )}
                  {p.reviewed_at && (
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      Reviewed{" "}
                      {new Date(p.reviewed_at).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  )}

                  {p.status === "pending" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={isPending || needsPayment}
                        title={needsPayment ? "Verify the UTR before approving" : undefined}
                        onClick={() => run(() => reviewPromotionAction(p.id, "approved"), "Promotion approved")}
                      >
                        Approve
                      </Button>
                      {needsPayment && (
                        <span className="text-[11px] text-amber-600">Payment not received yet — verify the UTR first.</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => run(() => reviewPromotionAction(p.id, "rejected"), "Promotion rejected")}
                      >
                        Reject
                      </Button>
                      {p.fee_status === "payment_pending" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onClick={() => run(() => verifyPromotionPaymentAction(p.id), "Payment verified")}
                        >
                          Verify payment
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
