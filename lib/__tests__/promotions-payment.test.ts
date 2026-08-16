import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

vi.mock("@/lib/data/session", () => ({
  requireMember: vi.fn(),
  requireAdmin: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { requireMember, requireAdmin } from "@/lib/data/session"
import { reviewPromotionAction } from "@/lib/actions/admin"
import {
  submitPromotionPaymentAction,
  verifyPromotionPaymentAction,
  updatePromotionPaymentConfigAction,
} from "@/lib/actions/platform"

const MEMBER = {
  userId: "u1",
  email: "member@uresphere.app",
  role: "user",
  accountStatus: "active",
  sphereId: "s-its",
  sphereName: "ITS",
  anonymousHandle: "@Member",
  realName: "Test Member",
  avatarUrl: null,
}

const PROMOTION_MODERATOR = {
  role: "promotion_moderator",
  scope: {
    permissions: ["promotions.review", "promotions.approve", "promotions.reject", "promotions.delete"],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
})

// ---------------------------------------------------------------------------
// Payment configuration — super admin only
// ---------------------------------------------------------------------------

function configClient() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const auditInsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) => {
    if (table === "platform_config") return { upsert }
    if (table === "audit_logs") return { insert: auditInsert }
    return {}
  })
  vi.mocked(createClient).mockReturnValue({ from } as never)
  return { upsert, auditInsert }
}

describe("updatePromotionPaymentConfigAction — payment configuration", () => {
  it("lets the super admin save fee + QR + instructions", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ...MEMBER, role: "super_admin" } as never)
    const mock = configClient()

    const fd = new FormData()
    fd.set("priceInr", "25")
    fd.set("durationDays", "2")
    fd.set("qrImageUrl", "https://blob.example/qr.png")
    fd.set("upiId", "uresphere@upi")
    fd.set("instructions", "Pay and enter your UTR below.")

    const result = await updatePromotionPaymentConfigAction(fd)
    expect(result.error).toBeNull()
    expect(mock.upsert).toHaveBeenCalledTimes(1)
    const [payload] = mock.upsert.mock.calls[0]
    expect(payload.key).toBe("promotion_payment")
    expect(payload.value).toMatchObject({
      price_inr: 25,
      duration_days: 2,
      qr_image_url: "https://blob.example/qr.png",
      upi_id: "uresphere@upi",
    })
  })

  it("refuses a sphere admin (not super admin)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ...MEMBER, role: "admin" } as never)
    const mock = configClient()
    const fd = new FormData()
    fd.set("priceInr", "25")
    fd.set("durationDays", "2")
    const result = await updatePromotionPaymentConfigAction(fd)
    expect(result.error).toMatch(/super admins/i)
    expect(mock.upsert).not.toHaveBeenCalled()
  })

  it("rejects invalid fee / duration", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ...MEMBER, role: "super_admin" } as never)
    const mock = configClient()

    const badFee = new FormData()
    badFee.set("priceInr", "-5")
    badFee.set("durationDays", "2")
    expect((await updatePromotionPaymentConfigAction(badFee)).error).toMatch(/fee/i)

    const badDuration = new FormData()
    badDuration.set("priceInr", "10")
    badDuration.set("durationDays", "0")
    expect((await updatePromotionPaymentConfigAction(badDuration)).error).toMatch(/duration/i)

    expect(mock.upsert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// UTR submission — user side
// ---------------------------------------------------------------------------

function paymentClient({
  promo = null,
  updateError = null,
}: {
  promo?: { id: string; user_id: string; sphere_id: string; fee_status: string; status: string } | null
  updateError?: unknown
}) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) =>
    table === "promotions"
      ? {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: promo, error: null }) }) }) }),
          update,
        }
      : {},
  )
  vi.mocked(createClient).mockReturnValue({ from, rpc } as never)
  return { update, rpc }
}

describe("submitPromotionPaymentAction — UTR storage", () => {
  it("saves a valid UTR against the user's own pending promotion and notifies admins", async () => {
    const mock = paymentClient({
      promo: { id: "promo-1", user_id: "u1", sphere_id: "s-its", fee_status: "due", status: "pending" },
    })
    const result = await submitPromotionPaymentAction("promo-1", "4242 8509 1182")
    expect(result.error).toBeNull()
    expect(mock.update).toHaveBeenCalledTimes(1)
    const [payload] = mock.update.mock.calls[0]
    expect(payload).toMatchObject({ utr: "4242 8509 1182", fee_status: "payment_pending" })
    expect(mock.rpc).toHaveBeenCalledWith("notify_sphere_admins", expect.objectContaining({ p_sphere_id: "s-its" }))
  })

  it("is idempotent — re-submitting updates the same row (no duplicate records)", async () => {
    const mock = paymentClient({
      promo: { id: "promo-1", user_id: "u1", sphere_id: "s-its", fee_status: "payment_pending", status: "pending" },
    })
    const first = await submitPromotionPaymentAction("promo-1", "ABC123")
    const second = await submitPromotionPaymentAction("promo-1", "XYZ789")
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect(mock.update).toHaveBeenCalledTimes(2)
    expect(mock.update.mock.calls[1][0].utr).toBe("XYZ789")
  })

  it("rejects a forged promotion id (not owned by the caller)", async () => {
    // The query filters by user_id = caller, so a row owned by someone else
    // never comes back (emulated here as null) and the action refuses it.
    const mock = paymentClient({ promo: null })
    const result = await submitPromotionPaymentAction("promo-9", "ABCD1234")
    expect(result.error).toMatch(/not found/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("rejects an invalid UTR (too short / illegal characters)", async () => {
    const mock = paymentClient({
      promo: { id: "promo-1", user_id: "u1", sphere_id: "s-its", fee_status: "due", status: "pending" },
    })
    expect((await submitPromotionPaymentAction("promo-1", "ab")).error).toMatch(/4–40/i)
    expect((await submitPromotionPaymentAction("promo-1", "ab@cd;ef")).error).toMatch(/letters, numbers/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("refuses payment once the promotion is approved or rejected", async () => {
    const mock = paymentClient({
      promo: { id: "promo-1", user_id: "u1", sphere_id: "s-its", fee_status: "due", status: "approved" },
    })
    const result = await submitPromotionPaymentAction("promo-1", "ABCD1234")
    expect(result.error).toMatch(/no longer awaiting payment/i)
    expect(mock.update).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Admin review + payment verification
// ---------------------------------------------------------------------------

function reviewClient({
  promo = null,
  assignment = null,
  assignmentSphere = "s-its",
}: {
  promo?: { id: string; sphere_id: string; fee_status: string; user_id: string } | null
  assignment?: { role: string; scope: Record<string, unknown> } | null
  assignmentSphere?: string
}) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const auditInsert = vi.fn().mockResolvedValue({ error: null })

  const raMaybeSingle = vi.fn().mockResolvedValue({ data: assignment, error: null })
  const raEq2 = vi.fn((col: string, val: string) => {
    if (col === "sphere_id" && val !== assignmentSphere) {
      raMaybeSingle.mockResolvedValue({ data: null, error: null })
    }
    return { maybeSingle: raMaybeSingle }
  })

  const from = vi.fn((table: string) => {
    if (table === "promotions") {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: promo, error: null }) }) }),
        update,
      }
    }
    if (table === "user_spheres") {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
    }
    if (table === "role_assignments") {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: raEq2 }) }) }
    }
    if (table === "audit_logs") {
      return { insert: auditInsert }
    }
    return {}
  })
  vi.mocked(createClient).mockReturnValue({ from, rpc } as never)
  return { update, rpc, auditInsert }
}

describe("reviewPromotionAction — payment-aware review", () => {
  it("blocks approval while the fee is unpaid (due)", async () => {
    const mock = reviewClient({
      promo: { id: "p1", sphere_id: "s-its", fee_status: "due", user_id: "u1" },
      assignment: PROMOTION_MODERATOR,
    })
    const result = await reviewPromotionAction("p1", "approved")
    expect(result.error).toMatch(/payment not received/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("approving with a submitted UTR settles the payment and notifies the owner", async () => {
    const mock = reviewClient({
      promo: { id: "p1", sphere_id: "s-its", fee_status: "payment_pending", user_id: "u1" },
      assignment: PROMOTION_MODERATOR,
    })
    const result = await reviewPromotionAction("p1", "approved")
    expect(result.error).toBeNull()
    const [payload] = mock.update.mock.calls[0]
    expect(payload).toMatchObject({ status: "approved", fee_status: "paid" })
    expect(mock.rpc).toHaveBeenCalledWith("notify_user", expect.objectContaining({ p_user_id: "u1", p_type: "promotion_approved" }))
  })

  it("lets a free promotion be approved without payment", async () => {
    const mock = reviewClient({
      promo: { id: "p2", sphere_id: "s-its", fee_status: "free", user_id: "u1" },
      assignment: PROMOTION_MODERATOR,
    })
    const result = await reviewPromotionAction("p2", "approved")
    expect(result.error).toBeNull()
    expect(mock.update.mock.calls[0][0]).toMatchObject({ status: "approved" })
  })

  it("denies a promotion_moderator reviewing another Sphere's promotion", async () => {
    const mock = reviewClient({
      promo: { id: "p9", sphere_id: "s-sharda", fee_status: "payment_pending", user_id: "u1" },
      assignment: PROMOTION_MODERATOR,
      assignmentSphere: "s-its",
    })
    const result = await reviewPromotionAction("p9", "approved")
    expect(result.error).not.toBeNull()
    expect(mock.update).not.toHaveBeenCalled()
  })
})

describe("verifyPromotionPaymentAction — explicit payment verification", () => {
  it("lets a promotion_moderator verify a submitted payment", async () => {
    const mock = reviewClient({
      promo: { id: "p1", sphere_id: "s-its", fee_status: "payment_pending", user_id: "u1" },
      assignment: PROMOTION_MODERATOR,
    })
    const result = await verifyPromotionPaymentAction("p1")
    expect(result.error).toBeNull()
    expect(mock.update.mock.calls[0][0]).toMatchObject({ fee_status: "paid" })
    expect(mock.rpc).toHaveBeenCalledWith("notify_user", expect.objectContaining({ p_type: "promotion_payment_verified" }))
  })

  it("refuses to verify a promotion with no fee", async () => {
    const mock = reviewClient({
      promo: { id: "p2", sphere_id: "s-its", fee_status: "free", user_id: "u1" },
      assignment: PROMOTION_MODERATOR,
    })
    const result = await verifyPromotionPaymentAction("p2")
    expect(result.error).toMatch(/no fee/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("denies cross-sphere verification (forged promotion id)", async () => {
    const mock = reviewClient({
      promo: { id: "p9", sphere_id: "s-sharda", fee_status: "payment_pending", user_id: "u1" },
      assignment: PROMOTION_MODERATOR,
      assignmentSphere: "s-its",
    })
    const result = await verifyPromotionPaymentAction("p9")
    expect(result.error).not.toBeNull()
    expect(mock.update).not.toHaveBeenCalled()
  })
})
