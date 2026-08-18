import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

// next/navigation's redirect throws in real Next.js; simulate that so the
// session gate code paths behave exactly like production.
const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    redirectMock(to)
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

import { createClient } from "@/lib/supabase/server"
import { requireAdmin, requireMember } from "@/lib/data/session"

type MockMembership = { sphere_id: string; anonymous_handle: string; avatar_url: string | null }

type MockProfile = { role: string; account_status: string; last_activity_at?: string | null }

function mockSessionClient(opts: {
  user?: { id: string; email: string } | null
  profile?: MockProfile | null
  membership?: MockMembership | null
}) {
  const user = opts.user === undefined ? { id: "u1", email: "admin@uresphere.app" } : opts.user
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null })
  const signOut = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === "profiles" ? (opts.profile ?? null) : (opts.membership ?? null),
          error: null,
        }),
      }),
    }),
  }))
  vi.mocked(createClient).mockReturnValue({ auth: { getUser, signOut }, from } as never)
  return { signOut }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("requireMember", () => {
  it("redirects an unauthenticated visitor to /auth/login", async () => {
    mockSessionClient({ user: null })
    await expect(requireMember()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith("/auth/login")
  })

  it("lets a super_admin without membership bypass onboarding", async () => {
    // A super admin created via the Supabase dashboard has a profile but no
    // college membership — they must never be stuck on /onboarding/pending.
    mockSessionClient({ profile: { role: "super_admin", account_status: "active" }, membership: null })
    const member = await requireMember()
    expect(member.role).toBe("super_admin")
    expect(member.sphereId).toBeNull()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("keeps a normal user without membership on /onboarding/pending", async () => {
    mockSessionClient({ profile: { role: "user", account_status: "active" }, membership: null })
    await expect(requireMember()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith("/onboarding/pending")
  })

  it("returns the real membership for a normal member", async () => {
    mockSessionClient({
      profile: { role: "user", account_status: "active" },
      membership: { sphere_id: "s1", anonymous_handle: "@SilentWolf482", avatar_url: null },
    })
    const member = await requireMember()
    expect(member.role).toBe("user")
    expect(member.sphereId).toBe("s1")
    expect(member.anonymousHandle).toBe("@SilentWolf482")
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("allows a member whose last activity was under 48 hours ago", async () => {
    const recent = new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString()
    mockSessionClient({
      profile: { role: "user", account_status: "active", last_activity_at: recent },
      membership: { sphere_id: "s1", anonymous_handle: "@Active1", avatar_url: null },
    })
    const member = await requireMember()
    expect(member.role).toBe("user")
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("allows a member with no recorded activity yet (never signed out on first check)", async () => {
    mockSessionClient({
      profile: { role: "user", account_status: "active", last_activity_at: null },
      membership: { sphere_id: "s1", anonymous_handle: "@Fresh1", avatar_url: null },
    })
    const member = await requireMember()
    expect(member.role).toBe("user")
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("signs out + redirects to login when inactive for 48+ hours", async () => {
    const stale = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    const { signOut } = mockSessionClient({
      profile: { role: "user", account_status: "active", last_activity_at: stale },
      membership: { sphere_id: "s1", anonymous_handle: "@Gone1", avatar_url: null },
    })
    await expect(requireMember()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(redirectMock).toHaveBeenCalledWith("/auth/login")
  })

  it("sends suspended accounts to /auth/suspended — even super admins", async () => {
    mockSessionClient({ profile: { role: "super_admin", account_status: "suspended" }, membership: null })
    await expect(requireMember()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith("/auth/suspended")
  })
})

describe("requireAdmin (server-side authorization for /admin)", () => {
  it("blocks a normal user from /admin", async () => {
    mockSessionClient({
      profile: { role: "user", account_status: "active" },
      membership: { sphere_id: "s1", anonymous_handle: "@X", avatar_url: null },
    })
    await expect(requireAdmin()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith("/dashboard")
  })

  it("allows a super_admin without membership into /admin", async () => {
    mockSessionClient({ profile: { role: "super_admin", account_status: "active" }, membership: null })
    const member = await requireAdmin()
    expect(member.role).toBe("super_admin")
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("allows a sphere admin with membership into /admin", async () => {
    mockSessionClient({
      profile: { role: "admin", account_status: "active" },
      membership: { sphere_id: "s1", anonymous_handle: "@Y", avatar_url: null },
    })
    const member = await requireAdmin()
    expect(member.role).toBe("admin")
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
