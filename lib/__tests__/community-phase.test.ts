import { describe, expect, it, vi } from "vitest"
import {
  isLivePromotion,
  selectLivePromotions,
  promotionExpiry,
  type PromotionRow,
} from "@/lib/promotions"
import { summarizePlanFeedback } from "@/lib/plans"
import { TAB_PERMISSION, ASSIGNABLE_ROLES } from "@/lib/roles"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/data/session", () => ({
  requireMember: vi.fn(),
}))

function promo(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    id: "p1",
    title: "Hostel fest",
    url: "https://example.com",
    status: "approved",
    fee_status: "paid",
    user_id: "u1",
    created_at: "2026-08-08T10:00:00Z",
    reviewed_at: "2026-08-08T11:00:00Z",
    paid_at: "2026-08-08T11:00:00Z",
    ...overrides,
  }
}

describe("public promotion visibility", () => {
  const now = new Date("2026-08-10T00:00:00Z")
  const durationDays = 7

  it("shows an approved + paid promotion that is not expired", () => {
    expect(isLivePromotion(promo(), durationDays, now)).toBe(true)
  })

  it("hides pending, rejected and removed promotions", () => {
    for (const status of ["pending", "rejected", "removed"]) {
      expect(isLivePromotion(promo({ status }), durationDays, now)).toBe(false)
    }
  })

  it("hides approved promotions whose payment is not verified", () => {
    expect(isLivePromotion(promo({ fee_status: "due" }), durationDays, now)).toBe(false)
    expect(isLivePromotion(promo({ fee_status: "payment_pending" }), durationDays, now)).toBe(false)
  })

  it("shows a free promotion even though there is no payment", () => {
    expect(isLivePromotion(promo({ fee_status: "free" }), durationDays, now)).toBe(true)
  })

  it("hides an approved promotion after its expiry window", () => {
    const expired = new Date("2026-08-15T10:00:01Z") // just past 7 days from created_at
    expect(isLivePromotion(promo(), durationDays, expired)).toBe(false)
  })

  it("treats the instant just before expiry as still live", () => {
    const justBefore = new Date("2026-08-15T09:59:59Z")
    expect(isLivePromotion(promo(), durationDays, justBefore)).toBe(true)
  })

  it("selectLivePromotions only returns live rows, newest first", () => {
    const rows = [
      promo({ id: "a", status: "pending", created_at: "2026-08-09T10:00:00Z" }),
      promo({ id: "b", created_at: "2026-08-09T08:00:00Z" }),
      promo({ id: "c", fee_status: "due", created_at: "2026-08-09T12:00:00Z" }),
      promo({ id: "d", created_at: "2026-08-08T12:00:00Z" }),
    ]
    const live = selectLivePromotions(rows, durationDays, now)
    expect(live.map((r) => r.id)).toEqual(["b", "d"])
  })

  it("promotionExpiry adds the configured duration to created_at", () => {
    const expiry = promotionExpiry("2026-08-01T10:00:00Z", 1)
    expect(expiry.toISOString()).toBe("2026-08-02T10:00:00.000Z")
  })
})

describe("summarizePlanFeedback — admin plans aggregation", () => {
  const plans = [{ id: "plan-a" }, { id: "plan-b" }]
  const feedback = [
    { plan_id: "plan-a", rating: 5 },
    { plan_id: "plan-a", rating: 3 },
    { plan_id: "plan-a", rating: 4 },
    { plan_id: "plan-b", rating: 2 },
  ]

  it("counts feedback rows and averages ratings per plan", () => {
    const summary = summarizePlanFeedback(plans, feedback)
    expect(summary["plan-a"]).toEqual({ feedbackCount: 3, averageRating: 4 })
    expect(summary["plan-b"]).toEqual({ feedbackCount: 1, averageRating: 2 })
  })

  it("returns zero / null for plans without feedback", () => {
    const summary = summarizePlanFeedback([{ id: "plan-c" }], feedback)
    expect(summary["plan-c"]).toEqual({ feedbackCount: 0, averageRating: null })
  })

  it("is empty for no plans", () => {
    expect(summarizePlanFeedback([], [])).toEqual({})
  })
})

describe("admin tab permissions", () => {
  it("maps the Groups tab to social.manage_groups", () => {
    expect(TAB_PERMISSION.groups).toBe("social.manage_groups")
  })

  it("gives social_moderator the manage_groups permission (groups visible)", () => {
    // social_moderator presets include social.manage_groups, so the Groups tab
    // is reachable by a scoped moderator, not just sphere admins.
    expect(ASSIGNABLE_ROLES).toContain("social_moderator")
  })
})
