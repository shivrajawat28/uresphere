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
