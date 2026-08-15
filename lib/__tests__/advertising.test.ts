import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/data/session", () => ({
  requireAdmin: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/data/session"
import { adStatus, fetchLiveAds, isAdLive, validateAdInput, type AdCampaign } from "@/lib/ads"
import {
  archiveAdAction,
  createAdAction,
  deleteAdAction,
  setAdActiveAction,
  updateAdAction,
} from "@/lib/actions/advertising"

const SUPER = { userId: "u-admin", role: "super_admin" }
const SPHERE_ADMIN = { userId: "u-admin", role: "admin" }
const NORMAL = { userId: "u1", role: "user" }

function makeSupabaseMock({ exists = true } = {}) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "ad-1" }, error: null }),
    }),
  })
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(exists ? { data: { id: "ad-1" }, error: null } : { data: null, error: null }),
    }),
  })
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const del = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const from = vi.fn((table: string) => {
    if (table === "audit_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) }
    return { insert, select, update, delete: del }
  })
  return { from, insert, select, update, del }
}

function validForm(overrides: Record<string, string | string[]> = {}) {
  const f = new FormData()
  f.set("title", "Campus Café")
  f.set("description", "20% off this month")
  f.set("imageUrl", "https://cdn.example.com/ad.png")
  f.set("destinationUrl", "https://example.com/offer")
  f.append("placements", "academic")
  f.append("placements", "social")
  f.set("startsAt", "2026-08-01T00:00:00.000Z")
  f.set("endsAt", "2026-09-01T00:00:00.000Z")
  f.set("active", "on")
  for (const [k, v] of Object.entries(overrides)) {
    f.delete(k)
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x))
    else f.set(k, v)
  }
  return f
}

function ad(overrides: Partial<AdCampaign> = {}): AdCampaign {
  return {
    id: "ad-1",
    title: "Campus Café",
    description: "20% off this month",
    imageUrl: "https://cdn.example.com/ad.png",
    destinationUrl: "https://example.com/offer",
    placements: ["academic", "social"],
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z",
    active: true,
    archived: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockReset()
})

// ---------------------------------------------------------------------------
// Display / eligibility
// ---------------------------------------------------------------------------

describe("isAdLive (display eligibility)", () => {
  const now = new Date("2026-08-15T12:00:00.000Z")

  it("1. active + within schedule → visible", () => {
    expect(isAdLive(ad(), { now })).toBe(true)
  })

  it("2. inactive → hidden", () => {
    expect(isAdLive(ad({ active: false }), { now })).toBe(false)
  })

  it("3. future start → hidden", () => {
    expect(isAdLive(ad({ startsAt: "2026-08-20T00:00:00.000Z" }), { now })).toBe(false)
  })

  it("4. expired → hidden", () => {
    expect(isAdLive(ad({ endsAt: "2026-08-01T00:00:00.000Z" }), { now })).toBe(false)
  })

  it("5. Academic placement → visible on Academic, hidden elsewhere", () => {
    expect(isAdLive(ad({ placements: ["academic"] }), { now, placement: "academic" })).toBe(true)
    expect(isAdLive(ad({ placements: ["academic"] }), { now, placement: "social" })).toBe(false)
  })

  it("6. Social placement → visible on Social", () => {
    expect(isAdLive(ad({ placements: ["social"] }), { now, placement: "social" })).toBe(true)
  })

  it("7. Marketplace placement → visible on Marketplace", () => {
    expect(isAdLive(ad({ placements: ["marketplace"] }), { now, placement: "marketplace" })).toBe(true)
  })

  it("8. multiple placements → visible in each selected placement", () => {
    const multi = ad({ placements: ["academic", "social"] })
    expect(isAdLive(multi, { now, placement: "academic" })).toBe(true)
    expect(isAdLive(multi, { now, placement: "social" })).toBe(true)
    expect(isAdLive(multi, { now, placement: "marketplace" })).toBe(false)
  })

  it("archived ads never display, even when active and in schedule", () => {
    expect(isAdLive(ad({ archived: true }), { now })).toBe(false)
  })
})

describe("adStatus (admin table labels)", () => {
  const now = new Date("2026-08-15T12:00:00.000Z")

  it("classifies live / scheduled / expired / inactive / archived", () => {
    expect(adStatus(ad(), now)).toBe("live")
    expect(adStatus(ad({ startsAt: "2026-08-20T00:00:00.000Z" }), now)).toBe("scheduled")
    expect(adStatus(ad({ endsAt: "2026-08-01T00:00:00.000Z" }), now)).toBe("expired")
    expect(adStatus(ad({ active: false }), now)).toBe("inactive")
    expect(adStatus(ad({ archived: true }), now)).toBe("archived")
  })
})

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("validateAdInput", () => {
  const base = {
    title: "Campus Café",
    description: "20% off this month",
    imageUrl: "https://cdn.example.com/ad.png",
    destinationUrl: "https://example.com/offer",
    placements: ["academic"],
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z",
    active: true,
  }

  it("accepts a valid advertisement", () => {
    const result = validateAdInput(base)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.title).toBe("Campus Café")
    expect(result.data.placements).toEqual(["academic"])
    expect(result.data.destinationUrl).toMatch(/^https:\/\//)
  })

  it("rejects an empty title", () => {
    const r = validateAdInput({ ...base, title: "  " })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/title/i)
  })

  it("rejects a missing image", () => {
    const r = validateAdInput({ ...base, imageUrl: "" })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/image/i)
  })

  it("9. rejects an unsafe / invalid destination URL", () => {
    for (const bad of ["javascript:alert(1)", "ftp://example.com/x", "https://user:pass@evil.example.com", "not a url"]) {
      const r = validateAdInput({ ...base, destinationUrl: bad })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/valid http/i)
    }
  })

  it("requires at least one supported placement", () => {
    const r1 = validateAdInput({ ...base, placements: [] })
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toMatch(/placement/i)
    // unsupported placement values are filtered out → still rejected
    const r2 = validateAdInput({ ...base, placements: ["bogus"] })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toMatch(/placement/i)
  })

  it("10. rejects an invalid schedule (end not after start)", () => {
    const r1 = validateAdInput({ ...base, startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-08-01T00:00:00.000Z" })
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toMatch(/after the start/i)
    const r2 = validateAdInput({ ...base, startsAt: "not-a-date" })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toMatch(/start/i)
    const r3 = validateAdInput({ ...base, endsAt: "not-a-date" })
    expect(r3.ok).toBe(false)
    if (!r3.ok) expect(r3.error).toMatch(/end/i)
  })

  it("rejects an over-long description", () => {
    const r = validateAdInput({ ...base, description: "x".repeat(301) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/300/i)
  })
})

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("advertising actions — authorization", () => {
  it("rejects a normal user trying to create an ad", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(NORMAL as never)

    const result = await createAdAction(validForm())
    expect(result.error).toMatch(/super admins/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("rejects a Sphere admin (role 'admin') — advertising is super-admin only", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(SPHERE_ADMIN as never)

    const result = await createAdAction(validForm())
    expect(result.error).toMatch(/super admins/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("rejects a normal user editing an ad", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(NORMAL as never)

    const result = await updateAdAction(validForm({ id: "ad-1" }))
    expect(result.error).toMatch(/super admins/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("rejects a normal user deleting an ad", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(NORMAL as never)

    const result = await deleteAdAction("ad-1")
    expect(result.error).toMatch(/super admins/i)
    expect(mock.del).not.toHaveBeenCalled()
  })

  it("lets a super admin create an ad", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(SUPER as never)

    const result = await createAdAction(validForm())
    expect(result.error).toBeNull()
    expect(mock.insert).toHaveBeenCalledTimes(1)
    const payload = mock.insert.mock.calls[0][0]
    expect(payload.advertiser_name).toBe("Campus Café")
    expect(payload.placements).toEqual(["academic", "social"])
    expect(payload.destination_url).toMatch(/^https:\/\//)
    expect(payload.active).toBe(true)
    expect(payload.archived).toBe(false)
  })

  it("lets a super admin edit an ad", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(SUPER as never)

    const result = await updateAdAction(validForm({ id: "ad-1", title: "Renamed Café" }))
    expect(result.error).toBeNull()
    expect(mock.update).toHaveBeenCalledTimes(1)
    expect(mock.update.mock.calls[0][0].advertiser_name).toBe("Renamed Café")
  })

  it("lets a super admin deactivate an ad", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(SUPER as never)

    const result = await setAdActiveAction("ad-1", false)
    expect(result.error).toBeNull()
    expect(mock.update).toHaveBeenCalledTimes(1)
    expect(mock.update.mock.calls[0][0].active).toBe(false)
  })

  it("lets a super admin archive an ad", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(SUPER as never)

    const result = await archiveAdAction("ad-1")
    expect(result.error).toBeNull()
    expect(mock.update).toHaveBeenCalledTimes(1)
    expect(mock.update.mock.calls[0][0].archived).toBe(true)
    expect(mock.update.mock.calls[0][0].active).toBe(false)
  })

  it("lets a super admin delete an ad", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(SUPER as never)

    const result = await deleteAdAction("ad-1")
    expect(result.error).toBeNull()
    expect(mock.del).toHaveBeenCalledTimes(1)
  })

  it("returns not-found when the ad doesn't exist (no silent success)", async () => {
    const mock = makeSupabaseMock({ exists: false })
    vi.mocked(createClient).mockReturnValue({ from: mock.from } as never)
    vi.mocked(requireAdmin).mockResolvedValue(SUPER as never)

    expect((await setAdActiveAction("missing", true)).error).toMatch(/not found/i)
    expect((await archiveAdAction("missing")).error).toMatch(/not found/i)
    expect((await deleteAdAction("missing")).error).toMatch(/not found/i)
    expect(mock.update).not.toHaveBeenCalled()
    expect(mock.del).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Live query — filters happen in the database, not in JavaScript
// ---------------------------------------------------------------------------

describe("fetchLiveAds", () => {
  it("filters by active, archived, schedule window and placement server-side", async () => {
    const calls: { col: string; op: string; value: unknown }[] = []
    const record = (op: string, col: string, value: unknown) => {
      calls.push({ col, op, value })
      return chain
    }
    const chain = {
      eq: (col: string, v: unknown) => record("eq", col, v),
      lte: (col: string, v: string) => record("lte", col, v),
      gte: (col: string, v: string) => record("gte", col, v),
      contains: (col: string, v: string[]) => record("contains", col, v),
      order: () => chain,
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const from = vi.fn(() => ({
      select: vi.fn(() => chain),
    }))
    const supabase = { from } as never

    await fetchLiveAds(supabase, "social", 1)

    expect(from).toHaveBeenCalledWith("ad_campaigns")
    // archived = false filter present alongside active = true
    const eqs = calls.filter((c) => c.op === "eq")
    expect(eqs.map((c) => c.col)).toEqual(["active", "archived"])
    expect(calls.find((c) => c.op === "lte")).toMatchObject({ col: "starts_at_ts" })
    expect(calls.find((c) => c.op === "gte")).toMatchObject({ col: "ends_at_ts" })
    expect(calls.find((c) => c.op === "contains")).toMatchObject({ col: "placements", value: ["social"] })
  })

  it("returns an empty array on query error instead of throwing", async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: () => ({
          eq: () => ({
            lte: () => ({
              gte: () => ({
                contains: () => ({
                  order: () => ({
                    limit: vi.fn().mockResolvedValue({ data: null, error: { message: "relation does not exist" } }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })),
    }))
    const result = await fetchLiveAds({ from } as never, "academic", 1)
    expect(result).toEqual([])
  })
})
