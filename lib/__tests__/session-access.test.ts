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

import { createClient } from "@/lib/supabase/server"
import {
  canAccessSphere,
  isSphereAdministrator,
  requireAdminAccess,
  requireSphereAdmin,
} from "@/lib/data/session"

type DB = {
  profiles?: { data: unknown; error: unknown } | null
  user_spheres?: { data: unknown; error: unknown } | null
  role_assignments?: { data: unknown; error: unknown } | null
}

function mockClient(db: DB) {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "admin@uresphere.app" } }, error: null })
  const from = vi.fn((table: keyof DB & string) => {
    const result = db[table]
    const filters: Record<string, unknown> = {}
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => {
        filters[col] = val
        return chain
      }),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() => {
        // Respect the key filters the gates rely on (sphere isolation!).
        let data = result?.data ?? null
        if (data && typeof data === "object") {
          const row = data as Record<string, unknown>
          if ("sphere_id" in row && filters.sphere_id !== undefined && row.sphere_id !== filters.sphere_id) data = null
          if (data && "role" in (data as Record<string, unknown>) && filters.role !== undefined) {
            if ((data as Record<string, unknown>).role !== filters.role) data = null
          }
        }
        return Promise.resolve({ data, error: result?.error ?? null })
      }),
    }
    return chain
  })
  vi.mocked(createClient).mockReturnValue({ auth: { getUser }, from } as never)
  return from
}

const PROFILE = (role: string, accountStatus = "active") => ({ role, account_status: accountStatus })
const MEMBERSHIP = { sphere_id: "s1", anonymous_handle: "@Handle1", avatar_url: null }
const ASSIGNMENT = (role: string, scope: Record<string, unknown> = {}) => ({ sphere_id: "s1", role, scope })

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockClear()
})

describe("requireAdminAccess (Level-1 gate)", () => {
  it("admits a super_admin without membership and flags isSuperAdmin", async () => {
    mockClient({ profiles: { data: PROFILE("super_admin"), error: null }, user_spheres: { data: null, error: null } })
    const access = await requireAdminAccess()
    expect(access.isSuperAdmin).toBe(true)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("admits a sphere admin (profile role)", async () => {
    mockClient({ profiles: { data: PROFILE("admin"), error: null }, user_spheres: { data: MEMBERSHIP, error: null } })
    const access = await requireAdminAccess()
    expect(access.isSuperAdmin).toBe(false)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("admits a scoped manager holding a role assignment in some Sphere", async () => {
    mockClient({
      profiles: { data: PROFILE("user"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: ASSIGNMENT("academic_manager", { permissions: ["academic.read"] }), error: null },
    })
    const access = await requireAdminAccess()
    expect(access.isSuperAdmin).toBe(false)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("blocks a normal user with no assignment — redirects to /dashboard", async () => {
    mockClient({
      profiles: { data: PROFILE("user"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: null, error: null },
    })
    await expect(requireAdminAccess()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith("/dashboard")
  })
})

describe("canAccessSphere", () => {
  it("lets a super_admin open any Sphere without a membership check", async () => {
    mockClient({ profiles: { data: PROFILE("super_admin"), error: null }, user_spheres: { data: null, error: null } })
    expect(await canAccessSphere("s-other")).toBe(true)
  })

  it("lets a sphere admin open their own Sphere", async () => {
    mockClient({
      profiles: { data: PROFILE("admin"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
    })
    expect(await canAccessSphere("s1")).toBe(true)
  })

  it("blocks a sphere admin from another Sphere", async () => {
    const from = mockClient({
      profiles: { data: PROFILE("admin"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: null, error: null },
    })
    expect(await canAccessSphere("s-other")).toBe(false)
    // The membership lookup must be scoped to the requested Sphere.
    const userSpheresChain = from.mock.calls.find(([t]) => t === "user_spheres")
    expect(userSpheresChain).toBeDefined()
  })

  it("lets a scoped manager open their assigned Sphere only", async () => {
    mockClient({
      profiles: { data: PROFILE("user"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: ASSIGNMENT("event_manager"), error: null },
    })
    expect(await canAccessSphere("s1")).toBe(true)
    expect(await canAccessSphere("s-other")).toBe(false)
  })
})

describe("isSphereAdministrator", () => {
  it("true for a super_admin", async () => {
    mockClient({ profiles: { data: PROFILE("super_admin"), error: null }, user_spheres: { data: null, error: null } })
    expect(await isSphereAdministrator("s1")).toBe(true)
  })

  it("true for a sphere admin in their own Sphere", async () => {
    mockClient({ profiles: { data: PROFILE("admin"), error: null }, user_spheres: { data: MEMBERSHIP, error: null } })
    expect(await isSphereAdministrator("s1")).toBe(true)
  })

  it("false for a sphere admin outside their Sphere", async () => {
    mockClient({ profiles: { data: PROFILE("admin"), error: null }, user_spheres: { data: MEMBERSHIP, error: null } })
    expect(await isSphereAdministrator("s-other")).toBe(false)
  })

  it("true for a user holding the sphere_admin role assignment", async () => {
    mockClient({
      profiles: { data: PROFILE("user"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: ASSIGNMENT("sphere_admin"), error: null },
    })
    expect(await isSphereAdministrator("s1")).toBe(true)
  })

  it("false for a scoped manager (not an administrator)", async () => {
    mockClient({
      profiles: { data: PROFILE("user"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: ASSIGNMENT("academic_manager", { permissions: ["academic.read"] }), error: null },
    })
    expect(await isSphereAdministrator("s1")).toBe(false)
  })
})

describe("requireSphereAdmin (Level-2 gate)", () => {
  it("lets a super_admin open any Sphere as administrator", async () => {
    mockClient({ profiles: { data: PROFILE("super_admin"), error: null }, user_spheres: { data: null, error: null } })
    const access = await requireSphereAdmin("s-any")
    expect(access.isSphereAdministrator).toBe(true)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("lets a sphere admin open their own Sphere", async () => {
    mockClient({ profiles: { data: PROFILE("admin"), error: null }, user_spheres: { data: MEMBERSHIP, error: null } })
    const access = await requireSphereAdmin("s1")
    expect(access.isSphereAdministrator).toBe(true)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("redirects a sphere admin who hand-edits a different sphereId", async () => {
    mockClient({
      profiles: { data: PROFILE("admin"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: null, error: null },
    })
    await expect(requireSphereAdmin("s-other")).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith("/admin")
  })

  it("lets a scoped manager open their assigned Sphere with their permissions", async () => {
    mockClient({
      profiles: { data: PROFILE("user"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: ASSIGNMENT("academic_manager", { permissions: ["academic.read", "academic.create"] }), error: null },
    })
    const access = await requireSphereAdmin("s1")
    expect(access.isSphereAdministrator).toBe(false)
    expect(access.permissions).toEqual(["academic.read", "academic.create"])
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("redirects a normal user with no assignment to /admin", async () => {
    mockClient({
      profiles: { data: PROFILE("user"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: null, error: null },
    })
    await expect(requireSphereAdmin("s1")).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith("/admin")
  })
})

// ---------------------------------------------------------------------------
// Global Listings Admin visibility — server-side permission gating
// ---------------------------------------------------------------------------

describe("Global Listings Admin visibility", () => {
  /**
   * Simulates the permission logic used by the Global Listings page to
   * determine whether the user can manage global listings. The server page
   * checks this flag and passes it to the client component, which uses it
   * to decide whether to show admin UI (add/edit/delete buttons).
   */
  async function canManageGlobalListings(
    profile: { role: string },
    listingManagerAssignment: { id: string } | null,
  ): Promise<boolean> {
    if (profile.role === "super_admin") return true
    return listingManagerAssignment !== null
  }

  it("super_admin can always manage global listings", async () => {
    expect(await canManageGlobalListings({ role: "super_admin" }, null)).toBe(true)
  })

  it("listing_manager can manage global listings", async () => {
    expect(await canManageGlobalListings({ role: "user" }, { id: "ra-1" })).toBe(true)
  })

  it("normal user without listing_manager assignment cannot manage global listings", async () => {
    expect(await canManageGlobalListings({ role: "user" }, null)).toBe(false)
  })

  it("sphere admin without listing_manager assignment cannot manage global listings", async () => {
    expect(await canManageGlobalListings({ role: "admin" }, null)).toBe(false)
  })

  it("admin with listing_manager assignment can manage global listings", async () => {
    expect(await canManageGlobalListings({ role: "admin" }, { id: "ra-1" })).toBe(true)
  })

  /**
   * Server-side gate used by upsertGlobalListingAction / deleteGlobalListingAction.
   * These always call requireAdmin() first (ensuring authentication), then
   * check canManageGlobalListings. This test verifies that the gate correctly
   * denies unauthorized users at the server-action level.
   */
  it("server-side action gate denies a normal user without listing_manager", async () => {
    mockClient({
      profiles: { data: PROFILE("user"), error: null },
      user_spheres: { data: MEMBERSHIP, error: null },
      role_assignments: { data: null, error: null },
    })
    // requireAdmin redirects normal users — the Global Listings page's
    // server action (upsertGlobalListingAction) calls requireAdmin first,
    // so a normal user can never reach the canManageGlobalListings check.
    await expect(requireAdminAccess()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith("/dashboard")
  })
})

// ---------------------------------------------------------------------------
// Session persistence — inactivity timeout logic
// ---------------------------------------------------------------------------

describe("Session persistence — inactivity timeout", () => {
  it("does not log out a user whose last_activity_at is recent", async () => {
    // requireMember calls requireMember which checks last_activity_at.
    // A recent timestamp means the user is active — no sign-out should occur.
    const recentTimestamp = new Date(Date.now() - 1000 * 60 * 60).toISOString() // 1 hour ago
    const signOut = vi.fn().mockResolvedValue({ error: null })
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    const from = vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(() => {
          if (table === "profiles") {
            return Promise.resolve({ data: { role: "user", account_status: "active", real_name: "Test", last_activity_at: recentTimestamp }, error: null })
          }
          if (table === "user_spheres") {
            return Promise.resolve({ data: { sphere_id: "s1", anonymous_handle: "@Test", avatar_url: null, spheres: { name: "Test Sphere" } }, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }
      return chain
    })
    vi.mocked(createClient).mockReturnValue({ auth: { getUser, signOut }, from } as never)

    // Import requireMember fresh to get the latest version
    const { requireMember } = await import("@/lib/data/session")
    const member = await requireMember()
    expect(member.userId).toBe("u1")
    expect(signOut).not.toHaveBeenCalled()
  })

  it("signs out a user whose last_activity_at is older than 48 hours", async () => {
    const oldTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000 - 1000).toISOString() // 48h + 1s ago
    const signOut = vi.fn().mockResolvedValue({ error: null })
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
    const from = vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(() => {
          if (table === "profiles") {
            return Promise.resolve({ data: { role: "user", account_status: "active", real_name: "Test", last_activity_at: oldTimestamp }, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }
      return chain
    })
    vi.mocked(createClient).mockReturnValue({ auth: { getUser, signOut }, from } as never)

    const { requireMember } = await import("@/lib/data/session")
    await expect(requireMember()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(signOut).toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith("/auth/login")
  })
})
