import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the server-side Supabase client and the session loader so we can
// exercise the real server action end-to-end without a database.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/data/session", () => ({
  requireMember: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { submitPromotionAction } from "@/lib/actions/promotions"

const member = { userId: "u1", sphereId: "s1" }

function makeSupabaseMock() {
  // submitPromotionAction now reads the inserted row back (select id, single)
  // so it can notify the Sphere's admins.
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "p1" }, error: null }),
    }),
  })
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: { value: { price_inr: 10 } }, error: null }),
    }),
  })
  const insertBuilder = { insert, select }
  const rpc = vi.fn().mockResolvedValue({ error: null })
  return { insertBuilder, insert, select, rpc }
}

beforeEach(() => {
  vi.mocked(requireMember).mockResolvedValue(member as never)
})

describe("submitPromotionAction", () => {
  it("rejects javascript: URLs without touching the database", async () => {
    const { insert } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: () => ({ insert }), rpc: vi.fn() } as never)

    const formData = new FormData()
    formData.set("title", "Hack")
    formData.set("url", "javascript:alert(1)")

    const result = await submitPromotionAction(formData)
    expect(result.error).toMatch(/valid http\(s\) URL/i)
    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects URLs with embedded credentials", async () => {
    const { insert } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: () => ({ insert }), rpc: vi.fn() } as never)

    const formData = new FormData()
    formData.set("title", "Phish")
    formData.set("url", "https://user:pass@evil.example.com")

    const result = await submitPromotionAction(formData)
    expect(result.error).toMatch(/valid http\(s\) URL/i)
    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects missing title and missing URL", async () => {
    const { insert } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: () => ({ insert }), rpc: vi.fn() } as never)

    const noTitle = new FormData()
    noTitle.set("url", "https://example.com")
    expect((await submitPromotionAction(noTitle)).error).toMatch(/title/i)

    const noUrl = new FormData()
    noUrl.set("title", "Valid title")
    expect((await submitPromotionAction(noUrl)).error).toMatch(/URL/i)

    expect(insert).not.toHaveBeenCalled()
  })

  it("submits a valid URL scoped to the member's Sphere with a due fee", async () => {
    const { insertBuilder, insert, rpc } = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: () => insertBuilder, rpc } as never)

    const formData = new FormData()
    formData.set("title", "Hostel fest")
    formData.set("url", "https://example.com/fest")

    const result = await submitPromotionAction(formData)
    expect(result.error).toBeNull()
    expect(insert).toHaveBeenCalledTimes(1)
    const payload = insert.mock.calls[0][0]
    expect(payload.sphere_id).toBe("s1")
    expect(payload.user_id).toBe("u1")
    expect(payload.status).toBe("pending")
    expect(payload.fee_status).toBe("due")
  })

  it("defaults to the ₹10 fee when the payment config is missing", async () => {
    const { insertBuilder, insert, select, rpc } = makeSupabaseMock()
    select.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })
    vi.mocked(createClient).mockReturnValue({ from: () => insertBuilder, rpc } as never)

    const formData = new FormData()
    formData.set("title", "Campus sale")
    formData.set("url", "https://example.com/sale")

    const result = await submitPromotionAction(formData)
    expect(result.error).toBeNull()
    const payload = insert.mock.calls[0][0]
    expect(payload.fee_status).toBe("due")
  })
})
