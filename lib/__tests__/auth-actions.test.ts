import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}))

import { createClient } from "@/lib/supabase/server"
import { loginAction, signUpAction } from "@/lib/auth/actions"

beforeEach(() => {
  vi.clearAllMocks()
  // Short-circuit the auth redirect URL so next/headers is never needed.
  process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL = "http://localhost:3000/auth/callback"
})

// ---------------------------------------------------------------------------
// signUpAction
// ---------------------------------------------------------------------------

function makeSignupClient(college: { id: string; status: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: college, error: null })
  const signUp = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle }),
    }),
  })
  vi.mocked(createClient).mockReturnValue({ from, auth: { signUp } } as never)
  return { signUp }
}

function validSignupFormData(collegeId = "c1"): FormData {
  const fd = new FormData()
  fd.set("realName", "Alice Verma")
  fd.set("phone", "9876543210")
  fd.set("college", "ITS Engineering College")
  fd.set("collegeId", collegeId)
  fd.set("email", "alice@example.com")
  fd.set("password", "hunter2hunter")
  fd.set("confirmPassword", "hunter2hunter")
  return fd
}

describe("signUpAction", () => {
  it("accepts a valid signup with an active directory college", async () => {
    const { signUp } = makeSignupClient({ id: "c1", status: "active" })
    const result = await signUpAction(validSignupFormData("c1"))
    expect(result.error).toBeNull()
    expect(signUp).toHaveBeenCalledTimes(1)
    const [credentials] = signUp.mock.calls[0]
    expect(credentials.email).toBe("alice@example.com")
    expect(credentials.password).toBe("hunter2hunter")
    expect(credentials.options.data.college_id).toBe("c1")
    expect(credentials.options.data.real_name).toBe("Alice Verma")
    expect(credentials.options.data.phone).toBe("9876543210")
    expect(credentials.options.data.college_input).toBe("ITS Engineering College")
  })

  it("rejects a college_id that does not exist", async () => {
    const { signUp } = makeSignupClient(null)
    const result = await signUpAction(validSignupFormData("does-not-exist"))
    expect(result.error).toMatch(/Select your college/i)
    expect(signUp).not.toHaveBeenCalled()
  })

  it("rejects an inactive college (never trusts a stale directory row)", async () => {
    const { signUp } = makeSignupClient({ id: "c1", status: "inactive" })
    const result = await signUpAction(validSignupFormData("c1"))
    expect(result.error).toMatch(/Select your college/i)
    expect(signUp).not.toHaveBeenCalled()
  })

  it("rejects missing collegeId without calling Supabase auth", async () => {
    const { signUp } = makeSignupClient({ id: "c1", status: "active" })
    const fd = validSignupFormData()
    fd.set("collegeId", "")
    const result = await signUpAction(fd)
    expect(result.error).toMatch(/Select your college/i)
    expect(signUp).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// loginAction — email OR phone
// ---------------------------------------------------------------------------

function makeLoginClient(opts: {
  phoneProfile?: { email: string } | null
  roleProfile?: { role: string } | null
}) {
  const signInWithPassword = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
  const from = vi.fn(() => {
    const select = vi.fn((cols: string) => {
      const eq = vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: cols.includes("role") ? (opts.roleProfile ?? null) : (opts.phoneProfile ?? null),
          error: null,
        }),
      }))
      return { eq }
    })
    return { select }
  })
  vi.mocked(createClient).mockReturnValue({ from, auth: { signInWithPassword } } as never)
  return { signInWithPassword, from }
}

function loginFormData(identifier: string): FormData {
  const fd = new FormData()
  fd.set("email", identifier)
  fd.set("password", "hunter2hunter")
  return fd
}

describe("loginAction", () => {
  it("signs in a normal user with email (case/whitespace normalized) and does not redirect", async () => {
    const { signInWithPassword } = makeLoginClient({ phoneProfile: null, roleProfile: { role: "user" } })
    const result = await loginAction(loginFormData("  Alice@Example.COM "))
    expect(result.error).toBeNull()
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "alice@example.com", password: "hunter2hunter" })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("resolves a phone number to the registered email and signs in", async () => {
    const { signInWithPassword } = makeLoginClient({
      phoneProfile: { email: "bob@example.com" },
      roleProfile: { role: "user" },
    })
    const result = await loginAction(loginFormData("9876543210"))
    expect(result.error).toBeNull()
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "bob@example.com", password: "hunter2hunter" })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("redirects a super_admin to /admin after a successful login", async () => {
    const { signInWithPassword } = makeLoginClient({ phoneProfile: null, roleProfile: { role: "super_admin" } })
    const result = await loginAction(loginFormData("root@uresphere.app"))
    expect(result.error).toBeNull()
    expect(signInWithPassword).toHaveBeenCalledTimes(1)
    expect(redirectMock).toHaveBeenCalledWith("/admin")
  })

  it("rejects a phone number with no account", async () => {
    const { signInWithPassword } = makeLoginClient({ phoneProfile: null, roleProfile: null })
    const result = await loginAction(loginFormData("0000000000"))
    expect(result.error).toMatch(/couldn't find an account/i)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })
})
