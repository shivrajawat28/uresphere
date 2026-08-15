import { beforeEach, describe, expect, it, vi } from "vitest"

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
import { createEventAction, createClubAction, createSubjectAction } from "@/lib/actions/admin"
import { adminDeleteGroupAction } from "@/lib/actions/groups"

const MEMBER = {
  userId: "u1",
  email: "admin@uresphere.app",
  role: "super_admin",
  accountStatus: "active",
  sphereId: null,
  sphereName: "Platform",
  anonymousHandle: "@Admin",
  realName: "Platform Admin",
  avatarUrl: null,
}

function makeFrom(tableBehaviors: Record<string, () => unknown>) {
  return vi.fn((table: string) => tableBehaviors[table]?.() ?? {})
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("super_admin sphere-scoped writes", () => {
  it("lets a super_admin create an event in any Sphere with an explicit sphereId", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)

    const insert = vi.fn().mockResolvedValue({ error: null })
    const audit = vi.fn().mockResolvedValue({ error: null })
    const from = makeFrom({
      events: () => ({ insert }),
      audit_logs: () => ({ insert: audit }),
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const fd = new FormData()
    fd.set("sphereId", "s-its")
    fd.set("title", "Tech Fest")
    fd.set("date", "2026-09-01")

    const result = await createEventAction(fd)
    expect(result.error).toBeNull()
    expect(insert).toHaveBeenCalledTimes(1)
    const payload = insert.mock.calls[0][0]
    expect(payload.sphere_id).toBe("s-its")
    expect(payload.created_by).toBe("u1")
  })

  it("rejects a create with no explicit sphereId (never 'all Spheres')", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const insert = vi.fn()
    vi.mocked(createClient).mockReturnValue({ from: makeFrom({ events: () => ({ insert }) }) } as never)

    const fd = new FormData()
    fd.set("title", "Tech Fest")
    fd.set("date", "2026-09-01")

    const result = await createEventAction(fd)
    expect(result.error).toMatch(/Missing Sphere/)
    expect(insert).not.toHaveBeenCalled()
  })

  it("lets a super_admin create a club and a subject with explicit sphereId", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)

    const clubInsert = vi.fn().mockResolvedValue({ error: null })
    const subjectInsert = vi.fn().mockResolvedValue({ error: null })
    const audit = vi.fn().mockResolvedValue({ error: null })
    const from = makeFrom({
      clubs: () => ({ insert: clubInsert }),
      subjects: () => ({ insert: subjectInsert }),
      audit_logs: () => ({ insert: audit }),
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const clubFd = new FormData()
    clubFd.set("sphereId", "s-sharda")
    clubFd.set("name", "Robotics Club")
    expect((await createClubAction(clubFd)).error).toBeNull()
    expect(clubInsert.mock.calls[0][0].sphere_id).toBe("s-sharda")

    const subFd = new FormData()
    subFd.set("sphereId", "s-sharda")
    subFd.set("name", "Data Structures")
    subFd.set("degree", "btech")
    subFd.set("year", "2")
    subFd.set("branch", "cse")
    expect((await createSubjectAction(subFd)).error).toBeNull()
    expect(subjectInsert.mock.calls[0][0].sphere_id).toBe("s-sharda")
  })
})

describe("sphere_admin isolation on writes", () => {
  it("blocks a sphere_admin (profile role) from writing in a Sphere they are not a member of", async () => {
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, role: "admin", sphereId: "s-its" } as never)

    // No membership row for the requested Sphere → gate denies.
    const from = makeFrom({
      user_spheres: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      role_assignments: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const fd = new FormData()
    fd.set("sphereId", "s-sharda")
    fd.set("title", "Sneak event")
    fd.set("date", "2026-09-01")

    const result = await createEventAction(fd)
    expect(result.error).not.toBeNull()
  })

  it("rejects normal users performing admin writes", async () => {
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, role: "user", sphereId: "s-its" } as never)
    const insert = vi.fn()
    vi.mocked(createClient).mockReturnValue({
      from: makeFrom({
        events: () => ({ insert }),
        role_assignments: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
    } as never)

    const fd = new FormData()
    fd.set("sphereId", "s-its")
    fd.set("title", "Event")
    fd.set("date", "2026-09-01")

    const result = await createEventAction(fd)
    expect(result.error).not.toBeNull()
    expect(insert).not.toHaveBeenCalled()
  })
})

describe("admin group deletion gating", () => {
  it("allows a super_admin to delete a group in any Sphere", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const groupSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "g1", sphere_id: "s-its" }, error: null }) }),
    })
    const delEq = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn().mockReturnValue({ eq: delEq })
    const from = makeFrom({
      groups: () => ({ select: groupSelect, delete: del }),
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await adminDeleteGroupAction("g1")
    expect(result.error).toBeNull()
    expect(delEq).toHaveBeenCalledWith("id", "g1")
  })

  it("blocks a normal user from deleting a group (no assignment)", async () => {
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, role: "user", sphereId: "s-its" } as never)
    const groupSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "g1", sphere_id: "s-its" }, error: null }) }),
    })
    const del = vi.fn()
    const from = makeFrom({
      groups: () => ({ select: groupSelect, delete: del }),
      user_spheres: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      role_assignments: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await adminDeleteGroupAction("g1")
    expect(result.error).not.toBeNull()
    expect(del).not.toHaveBeenCalled()
  })
})
