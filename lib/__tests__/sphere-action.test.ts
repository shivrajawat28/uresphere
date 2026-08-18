import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    redirectMock(to)
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

// requireSphereAction calls requireMember as its first line; provide a mock so
// each test controls who the caller is.
vi.mock("@/lib/data/session", () => ({
  requireMember: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { requireSphereAction } from "@/lib/actions/admin"
import { requireMember } from "@/lib/data/session"
import { scopeCovers, type ScopeFilter } from "@/lib/validation"
import { ASSIGNABLE_ROLES, ROLE_PERMISSION_PRESETS, ROLE_SCOPE_FIELDS } from "@/lib/roles"

type CurrentMember = {
  userId: string
  email: string | null
  role: "user" | "admin" | "super_admin"
  accountStatus: "active" | "suspended"
  sphereId: string | null
  sphereName: string
  anonymousHandle: string
  realName: string
  avatarUrl: string | null
}

const MEMBER: CurrentMember = {
  userId: "u1",
  email: "member@uresphere.app",
  role: "user",
  accountStatus: "active",
  sphereId: "s1",
  sphereName: "ITS",
  anonymousHandle: "@Handle1",
  realName: "Test Member",
  avatarUrl: null,
}

function mockClient(db: { user_spheres?: { data: unknown; error: unknown } | null; role_assignments?: { data: unknown; error: unknown } | null }) {
  const from = vi.fn((table: keyof typeof db & string) => {
    const result = db[table] ?? { data: null, error: null }
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })),
      // requireSphereAction now awaits the query chain directly (multi-row
      // assignment semantics): resolve a row array. A single row passed by a
      // test is wrapped; null stays an empty list.
      then: (resolve: (v: unknown) => unknown) =>
        resolve({
          data: Array.isArray(result.data) ? result.data : result.data ? [result.data] : [],
          error: result.error ?? null,
        }),
    }
    return chain
  })
  vi.mocked(createClient).mockReturnValue({ from } as never)
}

const requireMemberMock = vi.mocked(requireMember)

const ASSIGN = (role: string, scope: Record<string, unknown> = {}) => ({ role, scope })

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockClear()
  requireMemberMock.mockReset()
})

describe("requireSphereAction — sphere-scoped server action gate", () => {
  it("lets a super_admin act on any Sphere without a membership check", async () => {
    requireMemberMock.mockResolvedValue({ ...MEMBER, role: "super_admin", sphereId: null })
    const gate = await requireSphereAction("s-any", "events.create")
    expect(gate.ok).toBe(true)
  })

  it("lets a sphere admin (profile role) act inside their Sphere", async () => {
    requireMemberMock.mockResolvedValue({ ...MEMBER, role: "admin" })
    mockClient({ user_spheres: { data: { user_id: "u1" }, error: null } })
    const gate = await requireSphereAction("s1", "events.create")
    expect(gate.ok).toBe(true)
  })

  it("blocks a sphere admin from acting in another Sphere", async () => {
    requireMemberMock.mockResolvedValue({ ...MEMBER, role: "admin" })
    mockClient({ user_spheres: { data: null, error: null }, role_assignments: { data: null, error: null } })
    const gate = await requireSphereAction("s-other", "events.create")
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error).toMatch(/access/)
  })

  it("gives a sphere_admin assignment full Sphere powers", async () => {
    requireMemberMock.mockResolvedValue(MEMBER)
    mockClient({ role_assignments: { data: ASSIGN("sphere_admin"), error: null } })
    const gate = await requireSphereAction("s1", "marketplace.manage_orders")
    expect(gate.ok).toBe(true)
  })

  it("denies an academic_manager acting outside their degree scope", async () => {
    requireMemberMock.mockResolvedValue(MEMBER)
    mockClient({
      role_assignments: {
        data: ASSIGN("academic_manager", { permissions: ["academic.create"], degree: "btech", year: "1", branch: "cse" }),
        error: null,
      },
    })
    const gate = await requireSphereAction("s1", "academic.create", { degree: "mba", year: "1", branch: "finance" })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error).toMatch(/scope/)
  })

  it("allows an academic_manager inside their exact scope", async () => {
    requireMemberMock.mockResolvedValue(MEMBER)
    mockClient({
      role_assignments: {
        data: ASSIGN("academic_manager", { permissions: ["academic.create", "academic.delete"], degree: "btech", year: "1", branch: "cse" }),
        error: null,
      },
    })
    const gate = await requireSphereAction("s1", "academic.delete", { degree: "btech", year: "1", branch: "cse" })
    expect(gate.ok).toBe(true)
  })

  it("denies an assignment that lacks the required permission", async () => {
    requireMemberMock.mockResolvedValue(MEMBER)
    mockClient({ role_assignments: { data: ASSIGN("social_moderator", { permissions: ["social.moderate"] }), error: null } })
    const gate = await requireSphereAction("s1", "events.create")
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error).toMatch(/permission/)
  })

  it("denies a user with no assignment in that Sphere", async () => {
    requireMemberMock.mockResolvedValue(MEMBER)
    mockClient({ role_assignments: { data: null, error: null } })
    const gate = await requireSphereAction("s1", "events.create")
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error).toMatch(/access/)
  })

  it("denies an unauthenticated user (requireMember redirect propagates)", async () => {
    requireMemberMock.mockRejectedValue(new Error("NEXT_REDIRECT:/auth/login"))
    await expect(requireSphereAction("s1", "events.create")).rejects.toThrow(/NEXT_REDIRECT/)
    expect(requireMemberMock).toHaveBeenCalled()
  })

  it("lets a manager with MULTIPLE role assignments act on a granted permission (regression: .maybeSingle() on >1 row denied every action)", async () => {
    requireMemberMock.mockResolvedValue(MEMBER)
    // Real live shape: academic_manager + listing_manager + club_manager in
    // the same Sphere. The academic permission is on the academic_manager row.
    mockClient({
      role_assignments: {
        data: [
          ASSIGN("club_manager", { permissions: ["clubs.create"] }),
          ASSIGN("listing_manager", { permissions: ["listings.update"] }),
          ASSIGN("academic_manager", {
            permissions: ["academic.read", "academic.create", "academic.update", "academic.delete"],
            sections: [{ degree: "Btech", year: "2", branch: "CSE-Core and Applied Branches" }],
            degree: "Btech",
            year: "2",
            branch: "CSE-Core and Applied Branches",
          }),
        ],
        error: null,
      },
    })
    const gate = await requireSphereAction("s1", "academic.create", {
      degree: "Btech",
      year: "2",
      branch: "CSE-Core and Applied Branches",
    })
    expect(gate.ok).toBe(true)
  })

  it("still denies an out-of-scope target when the manager holds multiple assignments", async () => {
    requireMemberMock.mockResolvedValue(MEMBER)
    mockClient({
      role_assignments: {
        data: [
          ASSIGN("club_manager", { permissions: ["clubs.create"] }),
          ASSIGN("academic_manager", {
            permissions: ["academic.create"],
            sections: [{ degree: "Btech", year: "2", branch: "CSE" }],
            degree: "Btech",
            year: "2",
            branch: "CSE",
          }),
        ],
        error: null,
      },
    })
    const gate = await requireSphereAction("s1", "academic.create", { degree: "Btech", year: "1", branch: "CSE" })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error).toMatch(/scope/)
  })

  it("denies when no assignment grants the permission even with multiple assignments", async () => {
    requireMemberMock.mockResolvedValue(MEMBER)
    mockClient({
      role_assignments: {
        data: [
          ASSIGN("club_manager", { permissions: ["clubs.create"] }),
          ASSIGN("academic_manager", { permissions: ["academic.create"], degree: "btech", year: "2", branch: "cse" }),
        ],
        error: null,
      },
    })
    const gate = await requireSphereAction("s1", "events.create")
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.error).toMatch(/permission/)
  })
})

describe("scopeCovers — academic manager scope mask", () => {
  const manager: ScopeFilter = { degree: "btech", year: "1", branch: "cse" }

  it("covers the exact same scope", () => {
    expect(scopeCovers(manager, { degree: "btech", year: "1", branch: "cse" })).toBe(true)
  })

  it("covers a narrower target (mask leaves a field blank = unrestricted)", () => {
    expect(scopeCovers({ degree: "btech" }, { degree: "btech", year: "2", branch: "mech" })).toBe(true)
  })

  it("rejects a different degree", () => {
    expect(scopeCovers(manager, { degree: "mba", year: "1", branch: "cse" })).toBe(false)
  })

  it("rejects a different year within the same degree", () => {
    expect(scopeCovers(manager, { degree: "btech", year: "2", branch: "cse" })).toBe(false)
  })

  it("rejects a different branch", () => {
    expect(scopeCovers(manager, { degree: "btech", year: "1", branch: "mech" })).toBe(false)
  })

  it("is case-insensitive", () => {
    expect(scopeCovers({ degree: "B.Tech" }, { degree: "b.tech" })).toBe(true)
  })

  it("never covers anything when there is no assignment scope", () => {
    expect(scopeCovers(undefined, { degree: "btech" })).toBe(false)
    expect(scopeCovers(null, { degree: "btech" })).toBe(false)
  })
})

describe("permission-first role names", () => {
  it("never uses giant role-name strings", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("academic_first_year_btech_ambassador")
    for (const role of ASSIGNABLE_ROLES) {
      expect(role).not.toMatch(/_first_|_second_|_third_|_fourth_/)
    }
  })

  it("defines a permission preset for every assignable role", () => {
    for (const role of ASSIGNABLE_ROLES) {
      expect(ROLE_PERMISSION_PRESETS[role].length).toBeGreaterThan(0)
    }
  })

  it("scopes academic_manager by degree/year/branch and nothing else", () => {
    expect(ROLE_SCOPE_FIELDS.academic_manager).toEqual(["degree", "year", "branch"])
  })

  it("does not scope section-level manager roles", () => {
    expect(ROLE_SCOPE_FIELDS.event_manager).toEqual([])
    expect(ROLE_SCOPE_FIELDS.club_manager).toEqual([])
    expect(ROLE_SCOPE_FIELDS.sphere_admin).toEqual([])
  })
})
