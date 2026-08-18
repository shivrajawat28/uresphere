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
import { requireMember } from "@/lib/data/session"
import { loadAssignedSectionAdmin, loadAssignedSectionRoles } from "@/lib/data/section-admin"
import { updateEventAction, deleteEventAction } from "@/lib/actions/admin"

const MEMBER = {
  userId: "u1",
  email: "manager@uresphere.app",
  role: "user",
  accountStatus: "active",
  sphereId: "s-its",
  sphereName: "ITS",
  anonymousHandle: "@Manager",
  realName: "Test Manager",
  avatarUrl: null,
}

const EVENT_MANAGER_SCOPE = {
  permissions: ["events.read", "events.create", "events.update", "events.delete"],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
})

// ---------------------------------------------------------------------------
// Workspace resolution (drives nav entries + page gates)
// ---------------------------------------------------------------------------

describe("loadAssignedSectionAdmin", () => {
  it("resolves the workspace for an assigned role in the member's own Sphere", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { role: "event_manager", scope: EVENT_MANAGER_SCOPE },
      error: null,
    })
    const from = vi.fn((table: string) =>
      table === "role_assignments"
        ? {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }),
            }),
          }
        : {},
    )
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const workspace = await loadAssignedSectionAdmin(MEMBER as never, "event_manager")
    expect(workspace).toEqual({
      role: "event_manager",
      sphereId: "s-its",
      sphereName: "ITS",
      permissions: EVENT_MANAGER_SCOPE.permissions,
    })
  })

  it("returns null when the member has no assignment for that role", async () => {
    const from = vi.fn((table: string) =>
      table === "role_assignments"
        ? {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }),
            }),
          }
        : {},
    )
    vi.mocked(createClient).mockReturnValue({ from } as never)

    expect(await loadAssignedSectionAdmin(MEMBER as never, "social_moderator")).toBeNull()
  })

  it("returns null for members with no Sphere at all", async () => {
    const noSphere = { ...MEMBER, sphereId: null }
    expect(await loadAssignedSectionAdmin(noSphere as never, "event_manager")).toBeNull()
  })
})

describe("loadAssignedSectionRoles", () => {
  it("returns only the roles the member actually holds", async () => {
    const from = vi.fn((table: string) =>
      table === "role_assignments"
        ? {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ role: "promotion_moderator" }, { role: "event_manager" }], error: null }) }) }),
            }),
          }
        : {},
    )
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const roles = await loadAssignedSectionRoles(MEMBER as never)
    expect(roles).toEqual(["promotion_moderator", "event_manager"])
  })

  it("returns [] when nothing is assigned", async () => {
    const from = vi.fn((table: string) =>
      table === "role_assignments"
        ? {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
            }),
          }
        : {},
    )
    vi.mocked(createClient).mockReturnValue({ from } as never)

    expect(await loadAssignedSectionRoles(MEMBER as never)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Server-action gates (event manager)
// ---------------------------------------------------------------------------

function makeClient({
  event = null,
  assignment = null,
  assignmentSphere = "s-its",
}: {
  event?: { id: string; sphere_id: string } | null
  assignment?: { role: string; scope: Record<string, unknown> } | null
  assignmentSphere?: string
}) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const auditInsert = vi.fn().mockResolvedValue({ error: null })

  const raEq2 = vi.fn((col: string, val: string) => ({
    then: (resolve: (v: unknown) => unknown) =>
      resolve({
        data: col === "sphere_id" && val !== assignmentSphere
          ? []
          : assignment
            ? [assignment]
            : [],
        error: null,
      }),
  }))

  const from = vi.fn((table: string) => {
    if (table === "events") {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: event, error: null }) }) }),
        update,
        delete: del,
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
  vi.mocked(createClient).mockReturnValue({ from } as never)
  return { update, del, auditInsert }
}

describe("updateEventAction — event manager scoping", () => {
  it("lets an event manager edit an event in their own Sphere", async () => {
    const mock = makeClient({
      event: { id: "ev-1", sphere_id: "s-its" },
      assignment: { role: "event_manager", scope: EVENT_MANAGER_SCOPE },
    })
    const fd = new FormData()
    fd.set("id", "ev-1")
    fd.set("title", "Tech Fest (updated)")
    fd.set("date", "2026-09-01")
    const result = await updateEventAction(fd)
    expect(result.error).toBeNull()
    expect(mock.update).toHaveBeenCalledTimes(1)
  })

  it("denies an event manager editing an event in another Sphere (forged id)", async () => {
    const mock = makeClient({
      event: { id: "ev-9", sphere_id: "s-sharda" },
      assignment: { role: "event_manager", scope: EVENT_MANAGER_SCOPE },
      assignmentSphere: "s-its",
    })
    const fd = new FormData()
    fd.set("id", "ev-9")
    fd.set("title", "Sneaky")
    fd.set("date", "2026-09-01")
    const result = await updateEventAction(fd)
    expect(result.error).not.toBeNull()
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("denies a plain member with no assignment", async () => {
    const mock = makeClient({ event: { id: "ev-1", sphere_id: "s-its" }, assignment: null })
    const fd = new FormData()
    fd.set("id", "ev-1")
    fd.set("title", "Nope")
    fd.set("date", "2026-09-01")
    const result = await updateEventAction(fd)
    expect(result.error).not.toBeNull()
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("denies an event manager who only holds a different section role (promotion_moderator)", async () => {
    const mock = makeClient({
      event: { id: "ev-1", sphere_id: "s-its" },
      assignment: {
        role: "promotion_moderator",
        scope: { permissions: ["promotions.review", "promotions.approve", "promotions.reject"] },
      },
    })
    const fd = new FormData()
    fd.set("id", "ev-1")
    fd.set("title", "Not my section")
    fd.set("date", "2026-09-01")
    const result = await updateEventAction(fd)
    expect(result.error).not.toBeNull()
    expect(mock.update).not.toHaveBeenCalled()
  })
})

describe("deleteEventAction — event manager scoping", () => {
  it("denies deleting an event in another Sphere even with an event_manager assignment", async () => {
    const mock = makeClient({
      event: { id: "ev-9", sphere_id: "s-sharda" },
      assignment: { role: "event_manager", scope: EVENT_MANAGER_SCOPE },
      assignmentSphere: "s-its",
    })
    const result = await deleteEventAction("ev-9")
    expect(result.error).not.toBeNull()
    expect(mock.del).not.toHaveBeenCalled()
  })
})
