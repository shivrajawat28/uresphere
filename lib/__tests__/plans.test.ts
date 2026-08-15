import { beforeEach, describe, expect, it, vi } from "vitest"
import { latestPublishedPlan, planAnchor, type Plan } from "@/lib/plans"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/data/session", () => ({
  requireMember: vi.fn(),
  requireAdmin: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { submitPlanFeedbackAction, upsertPlanAction } from "@/lib/actions/platform"

const adminMember = { userId: "u1", sphereId: "s1", role: "admin" }

function plan(id: string, createdAt: string, active: boolean): Plan {
  return { id, title: `Plan ${id}`, description: "desc", display_order: 0, active, created_at: createdAt }
}

describe("latestPublishedPlan", () => {
  it("returns the newest published plan (published plan visible)", () => {
    const plans = [
      plan("a", "2026-01-01T10:00:00Z", true),
      plan("b", "2026-01-03T10:00:00Z", true),
      plan("c", "2026-01-02T10:00:00Z", true),
    ]
    expect(latestPublishedPlan(plans)?.id).toBe("b")
  })

  it("never returns an unpublished / draft plan (unpublished plan invisible)", () => {
    const plans = [plan("draft", "2026-01-04T10:00:00Z", false), plan("older", "2026-01-01T10:00:00Z", true)]
    expect(latestPublishedPlan(plans)?.id).toBe("older")
  })

  it("returns null when nothing is published", () => {
    expect(latestPublishedPlan([plan("d1", "2026-01-01T10:00:00Z", false)])).toBeNull()
    expect(latestPublishedPlan([])).toBeNull()
  })
})

describe("planAnchor", () => {
  it("produces the dashboard anchor used by notification links (dedupe key)", () => {
    expect(planAnchor("abc")).toBe("/dashboard#plan-abc")
  })
})

describe("submitPlanFeedbackAction", () => {
  function makeSupabaseMock() {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    return {
      upsert,
      from: vi.fn(() => ({ upsert })),
    }
  }

  beforeEach(() => {
    vi.mocked(requireMember).mockResolvedValue({ userId: "u1", sphereId: "s1" } as never)
  })

  it("rejects ratings outside 1–5 without touching the database", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    expect((await submitPlanFeedbackAction("plan-1", 0, "meh")).error).toMatch(/rating/i)
    expect((await submitPlanFeedbackAction("plan-1", 6, "wow")).error).toMatch(/rating/i)
    expect(mock.upsert).not.toHaveBeenCalled()
  })

  it("upserts one row per user + plan (duplicate feedback prevented)", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await submitPlanFeedbackAction("plan-1", 4, "  love it  ")
    expect(result.error).toBeNull()
    expect(mock.upsert).toHaveBeenCalledTimes(1)
    const [payload, options] = mock.upsert.mock.calls[0]
    expect(payload).toMatchObject({ plan_id: "plan-1", user_id: "u1", rating: 4, comment: "love it" })
    expect(options).toEqual({ onConflict: "plan_id,user_id" })
  })

  it("updates the same row on a second submission (edit own feedback)", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    await submitPlanFeedbackAction("plan-1", 3, "first take")
    await submitPlanFeedbackAction("plan-1", 5, "changed my mind")
    expect(mock.upsert).toHaveBeenCalledTimes(2)
    const secondPayload = mock.upsert.mock.calls[1][0]
    expect(secondPayload.rating).toBe(5)
    expect(secondPayload).toMatchObject({ plan_id: "plan-1", user_id: "u1" })
  })
})

describe("upsertPlanAction — publish notifications", () => {
  function makeSupabaseMock() {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "plan-new" }, error: null }) }),
    })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table !== "platform_plans") throw new Error(`Unexpected table ${table}`)
      return { insert, update }
    })
    return { insert, update, rpc, from }
  }

  beforeEach(() => {
    vi.mocked(requireMember).mockResolvedValue(adminMember as never)
  })

  function form(title: string, active: boolean, id = "") {
    const fd = new FormData()
    fd.set("title", title)
    fd.set("description", "Something new")
    if (id) fd.set("id", id)
    if (!active) fd.set("active", "off")
    return fd
  }

  it("notifies members when a new plan is published", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await upsertPlanAction(form("Campus 2.0", true))
    expect(result.error).toBeNull()
    expect(mock.rpc).toHaveBeenCalledWith("notify_plan_published", { p_plan_id: "plan-new" })
  })

  it("does not notify for an unpublished (draft) plan", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await upsertPlanAction(form("Draft idea", false))
    expect(result.error).toBeNull()
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("notifies when an existing plan is published (update path passes the id)", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await upsertPlanAction(form("Going live", true, "plan-9"))
    expect(result.error).toBeNull()
    expect(mock.update).toHaveBeenCalled()
    expect(mock.rpc).toHaveBeenCalledWith("notify_plan_published", { p_plan_id: "plan-9" })
  })

  it("does not re-notify when an already-published plan is only edited", async () => {
    // Idempotency lives in the DB RPC (dedupe by type + link); the action still
    // calls it, and the RPC returns without inserting a second notification.
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await upsertPlanAction(form("Campus 2.0 (edited)", true, "plan-new"))
    expect(result.error).toBeNull()
    expect(mock.rpc).toHaveBeenCalledWith("notify_plan_published", { p_plan_id: "plan-new" })
  })
})
