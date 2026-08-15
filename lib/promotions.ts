// Pure helpers for promotion visibility. Dependency-free and unit-testable.
// "Live" means: admin-approved AND payment settled when a fee applies AND not
// yet expired. Pending / rejected / removed / unpaid promotions are never live.

export type PromotionRow = {
  id: string
  title: string
  url: string
  status: string
  fee_status: string
  user_id: string
  created_at: string
  reviewed_at: string | null
  paid_at: string | null
}

/** A promotion is live for `durationDays` starting from its created_at. */
export function promotionExpiry(createdAt: string, durationDays: number): Date {
  return new Date(new Date(createdAt).getTime() + durationDays * 24 * 60 * 60 * 1000)
}

/** True when the promotion is approved, payment-settled (or free), and live. */
export function isLivePromotion(row: PromotionRow, durationDays: number, now: Date = new Date()): boolean {
  if (row.status !== "approved") return false
  // A fee applies to the promotion unless it was free; an unpaid (due /
  // payment_pending) promotion is not shown publicly even if approved.
  if (row.fee_status !== "free" && row.fee_status !== "paid") return false
  return promotionExpiry(row.created_at, durationDays).getTime() > now.getTime()
}

/** Publicly visible promotions, newest first. Generic so callers can attach
 * extra display fields (publisher handle, payment flags) to each row. */
export function selectLivePromotions<T extends PromotionRow>(
  rows: T[],
  durationDays: number,
  now: Date = new Date(),
): T[] {
  return rows
    .filter((r) => isLivePromotion(r, durationDays, now))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
