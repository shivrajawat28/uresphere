import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { selectLivePromotions, promotionExpiry, type PromotionRow } from "@/lib/promotions"
import { SubmitPromotionForm } from "./submit-promotion-form"
import { PaymentVerification } from "./payment-verification"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Clock, Megaphone } from "lucide-react"

export const dynamic = "force-dynamic"

type Row = PromotionRow & {
  publisher: string
  hasPayment: boolean
  utr: string | null
}

export default async function PromotionsPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const [{ data: promotions }, { data: config }] = await Promise.all([
    supabase
      .from("promotions")
      .select("id, title, url, status, fee_status, utr, created_at, reviewed_at, paid_at, user_id")
      .eq("sphere_id", member.sphereId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("platform_config").select("value").eq("key", "promotion_payment").maybeSingle(),
  ])

  // promotions -> user_spheres has no FK; resolve publisher handles separately
  // (anonymous, same-Sphere handles only).
  const promoUserIds = Array.from(new Set((promotions ?? []).map((p) => p.user_id)))
  const { data: publisherRows } = promoUserIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", promoUserIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }
  const handleByUserId = new Map((publisherRows ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  const paymentConfig = (config?.value ?? {}) as {
    price_inr?: number
    qr_image_url?: string | null
    upi_id?: string | null
    instructions?: string
    duration_days?: number
  }
  const price = paymentConfig.price_inr ?? 10
  const durationDays = paymentConfig.duration_days ?? 1

  const rows: Row[] = (promotions ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    url: p.url,
    status: p.status,
    fee_status: p.fee_status,
    user_id: p.user_id,
    created_at: p.created_at,
    reviewed_at: p.reviewed_at,
    paid_at: p.paid_at,
    publisher: handleByUserId.get(p.user_id) ?? "Unknown",
    hasPayment: Boolean(p.utr || p.paid_at),
    utr: p.utr ?? null,
  }))

  const mine = rows.filter((p) => p.user_id === member.userId)
  const live = selectLivePromotions(rows, durationDays)

  function formatExpiry(createdAt: string) {
    return promotionExpiry(createdAt, durationDays).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Promotions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Promote a link to your Sphere — an event page, a side project, a form you need filled. ₹{price} per
          link, live for {durationDays} day{durationDays > 1 ? "s" : ""} after admin approval.
        </p>
      </div>

      <div className="mb-10">
        <SubmitPromotionForm />
      </div>

      {/* Live promotions — approved, payment settled, not expired */}
      <section className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-medium text-foreground">Live in {member.sphereName}</h2>
        </div>
        {live.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No live promotions right now. Check back soon.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {live.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                    {p.title || p.url}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono text-[11px] text-primary">{p.publisher}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                    <Clock className="size-3" aria-hidden="true" />
                    Live until {formatExpiry(p.created_at)}
                  </p>
                </div>
                <ExternalLink className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Your submissions */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-foreground">Your submissions</h2>
        {mine.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            You haven&apos;t submitted any promotions yet.
          </p>
        ) : (
          <div className="space-y-2">
            {mine.map((p) => {
              const approvalLabel =
                p.status === "approved"
                  ? "Approved — live"
                  : p.status === "rejected"
                    ? "Rejected"
                    : p.status === "removed"
                      ? "Removed by admin"
                      : "Pending review"
              const paymentLabel =
                p.fee_status === "free"
                  ? "No fee"
                  : p.fee_status === "paid"
                    ? "Payment verified"
                    : p.fee_status === "payment_pending"
                      ? "Payment verification pending"
                      : "Payment due"
              return (
                <Card key={p.id} className="border-border/70 bg-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{p.title || p.url}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.url}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge
                          variant="outline"
                          className={`border-border/60 text-[11px] font-normal ${
                            p.status === "approved"
                              ? "text-primary"
                              : p.status === "rejected" || p.status === "removed"
                                ? "text-destructive"
                                : p.fee_status === "payment_pending"
                                  ? "text-amber-600"
                                  : ""
                          }`}
                        >
                          {approvalLabel}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground/80">{paymentLabel}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        Submitted {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      {p.status === "approved" && (
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" aria-hidden="true" />
                          Expires {formatExpiry(p.created_at)}
                        </span>
                      )}
                      {p.reviewed_at && (
                        <span>Reviewed {new Date(p.reviewed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      )}
                    </div>

                    {p.status === "pending" && p.fee_status !== "free" && (
                      <PaymentVerification
                        promotionId={p.id}
                        qrImageUrl={paymentConfig.qr_image_url ?? null}
                        instructions={paymentConfig.instructions ?? ""}
                        priceInr={price}
                        upiId={paymentConfig.upi_id ?? null}
                        feeStatus={p.fee_status}
                        utr={p.utr}
                        paidAt={p.paid_at}
                      />
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
