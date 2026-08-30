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
import { loginAction, resendVerificationEmailAction, resetPasswordAction, signUpAction } from "@/lib/auth/actions"

beforeEach(() => {
  vi.clearAllMocks()
  // Short-circuit the auth redirect URL so next/headers is never needed.
  process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL = "http://localhost:3000/auth/callback"
})

// ---------------------------------------------------------------------------
// signUpAction
// ---------------------------------------------------------------------------

function makeSignupClient(college: { id: string; status: string } | null, phoneExists = false) {
  // session: null models email confirmation ENABLED — signUp succeeds but no
  // session is issued, so the action reports needsEmailConfirmation.
  const signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null })
  const rpc = vi.fn().mockResolvedValue({ data: phoneExists, error: null })
  const from = vi.fn((table: string) => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === "colleges" ? college : null,
          error: null,
        }),
      }),
    })
    return { select }
  })
  vi.mocked(createClient).mockReturnValue({ from, auth: { signUp }, rpc } as never)
  return { signUp, rpc }
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
    expect(credentials.options.data.phone).toBe("+919876543210")
    expect(credentials.options.data.college_input).toBe("ITS Engineering College")
  })

  it("rejects a college_id that does not exist", async () => {
    const { signUp } = makeSignupClient(null)
    const result = await signUpAction(validSignupFormData("does-not-exist"))
    expect(result.error).toMatch(/Select your college/i)
    expect(signUp).not.toHaveBeenCalled()
  })

  it("rejects a phone number that is already linked to an account (one phone = one account)", async () => {
    const { signUp } = makeSignupClient({ id: "c1", status: "active" }, true)

    const result = await signUpAction(validSignupFormData("c1"))
    expect(result.error).toMatch(/already registered/i)
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
    const update = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }))
    return { select, update }
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

  it("rejects a phone number — login is email-based (phone is profile info only)", async () => {
    const { signInWithPassword } = makeLoginClient({ phoneProfile: null, roleProfile: null })
    const result = await loginAction(loginFormData("9876543210"))
    expect(result.error).toMatch(/couldn't find an account/i)
    expect(signInWithPassword).not.toHaveBeenCalled()
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

// ---------------------------------------------------------------------------
// resetPasswordAction — Supabase-native recovery session, no custom tokens
// ---------------------------------------------------------------------------

function makeResetClient(opts: { user: { id: string } | null; updateError?: { message: string } | null }) {
  const getUser = vi.fn().mockResolvedValue({ data: { user: opts.user }, error: null })
  const updateUser = vi.fn().mockResolvedValue({ data: { user: opts.user }, error: opts.updateError ?? null })
  vi.mocked(createClient).mockReturnValue({ auth: { getUser, updateUser } } as never)
  return { getUser, updateUser }
}

function resetFormData(password: string, confirmPassword: string): FormData {
  const fd = new FormData()
  fd.set("password", password)
  fd.set("confirmPassword", confirmPassword)
  return fd
}

describe("resetPasswordAction", () => {
  it("rejects a short new password before touching auth", async () => {
    const { updateUser } = makeResetClient({ user: { id: "u1" } })
    const result = await resetPasswordAction(resetFormData("short", "short"))
    expect(result.error).toMatch(/8 characters/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it("rejects mismatched confirmation", async () => {
    const { updateUser } = makeResetClient({ user: { id: "u1" } })
    const result = await resetPasswordAction(resetFormData("hunter2hunter", "different!"))
    expect(result.error).toMatch(/don't match/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it("rejects a reset without a valid recovery session (invalid/expired link)", async () => {
    const { updateUser } = makeResetClient({ user: null })
    const result = await resetPasswordAction(resetFormData("hunter2hunter", "hunter2hunter"))
    expect(result.error).toMatch(/invalid or has expired/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it("updates the password when a valid recovery session exists", async () => {
    const { updateUser } = makeResetClient({ user: { id: "u1" } })
    const result = await resetPasswordAction(resetFormData("hunter2hunter", "hunter2hunter"))
    expect(result.error).toBeNull()
    expect(updateUser).toHaveBeenCalledWith({ password: "hunter2hunter" })
  })

  it("maps a session-related update failure to the invalid-link message", async () => {
    const { updateUser } = makeResetClient({ user: { id: "u1" }, updateError: { message: "Auth session missing" } })
    const result = await resetPasswordAction(resetFormData("hunter2hunter", "hunter2hunter"))
    expect(result.error).toMatch(/invalid or has expired/i)
    expect(updateUser).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// resendVerificationEmailAction
// ---------------------------------------------------------------------------

describe("resendVerificationEmailAction", () => {
  it("rejects an empty email", async () => {
    const fd = new FormData()
    fd.set("email", "")
    const result = await resendVerificationEmailAction(fd)
    expect(result.error).toMatch(/valid email/i)
  })

  it("rejects an invalid email format", async () => {
    const fd = new FormData()
    fd.set("email", "not-an-email")
    const result = await resendVerificationEmailAction(fd)
    expect(result.error).toMatch(/valid email/i)
  })

  it("calls supabase.auth.resend with normalized email and correct options", async () => {
    const resend = vi.fn().mockResolvedValue({ data: {}, error: null })
    vi.mocked(createClient).mockReturnValue({ auth: { resend } } as never)

    const fd = new FormData()
    fd.set("email", "  TestUser@Example.COM ")
    const result = await resendVerificationEmailAction(fd)

    expect(result.error).toBeNull()
    expect(resend).toHaveBeenCalledTimes(1)
    expect(resend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "signup",
        email: "testuser@example.com",
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining("/auth/callback"),
        }),
      }),
    )
  })
})

