import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/site-url", () => ({
  getSiteUrl: vi.fn(() => "https://uresphere.in"),
}))

import { createClient } from "@/lib/supabase/server"
import { GET as callbackGet } from "@/app/auth/callback/route"
import { GET as confirmGet } from "@/app/auth/confirm/route"
import { POST as sessionPost } from "@/app/api/auth/session/route"
import { sanitizeRedirectPath } from "@/lib/validation"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Auth Verification Security & Functionality", () => {
  describe("sanitizeRedirectPath", () => {
    it("allows valid relative paths", () => {
      expect(sanitizeRedirectPath("/dashboard")).toBe("/dashboard")
      expect(sanitizeRedirectPath("/dashboard/academic")).toBe("/dashboard/academic")
      expect(sanitizeRedirectPath("/settings?tab=profile")).toBe("/settings?tab=profile")
    })

    it("prevents open redirects via protocol-relative URLs", () => {
      expect(sanitizeRedirectPath("//evil.com")).toBe("/dashboard")
      expect(sanitizeRedirectPath("///evil.com")).toBe("/dashboard")
    })

    it("prevents open redirects via backslashes", () => {
      expect(sanitizeRedirectPath("/\\evil.com")).toBe("/dashboard")
      expect(sanitizeRedirectPath("/\\\\evil.com")).toBe("/dashboard")
    })

    it("prevents open redirects via full URLs", () => {
      expect(sanitizeRedirectPath("https://evil.com")).toBe("/dashboard")
      expect(sanitizeRedirectPath("http://evil.com/phish")).toBe("/dashboard")
      expect(sanitizeRedirectPath("javascript:alert(1)")).toBe("/dashboard")
    })

    it("prevents CRLF header injection attempts", () => {
      expect(sanitizeRedirectPath("/dashboard\r\nSet-Cookie:bad=1")).toBe("/dashboard")
    })
  })

  describe("/auth/callback", () => {
    it("verifies token_hash and redirects to sanitized dashboard path on success", async () => {
      const verifyOtp = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { verifyOtp },
      } as never)

      const req = new NextRequest("https://uresphere.in/auth/callback?token_hash=th_123&type=email")
      const res = await callbackGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe("https://uresphere.in/dashboard")
      expect(verifyOtp).toHaveBeenCalledWith({
        type: "email",
        token_hash: "th_123",
      })
    })

    it("sanitizes open redirect attempts in next param", async () => {
      const verifyOtp = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { verifyOtp },
      } as never)

      const req = new NextRequest("https://uresphere.in/auth/callback?token_hash=th_123&type=email&next=//evil.com")
      const res = await callbackGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe("https://uresphere.in/dashboard")
    })

    it("verifies token_hash with recovery type and redirects to reset-password", async () => {
      const verifyOtp = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { verifyOtp },
      } as never)

      const req = new NextRequest("https://uresphere.in/auth/callback?token_hash=th_123&type=recovery")
      const res = await callbackGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe("https://uresphere.in/auth/reset-password")
    })

    it("redirects to /auth/error if token_hash verification fails", async () => {
      const verifyOtp = vi.fn().mockResolvedValue({
        data: { user: null },
        error: { code: "otp_expired", message: "Email link is invalid or has expired." },
      })
      vi.mocked(createClient).mockResolvedValue({
        auth: { verifyOtp },
      } as never)

      const req = new NextRequest("https://uresphere.in/auth/callback?token_hash=th_expired&type=email")
      const res = await callbackGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toContain("/auth/error?error=otp_expired")
    })

    it("exchanges code for session and redirects to dashboard", async () => {
      const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: { session: {} }, error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { exchangeCodeForSession },
      } as never)

      const req = new NextRequest("https://uresphere.in/auth/callback?code=valid_code")
      const res = await callbackGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe("https://uresphere.in/dashboard")
      expect(exchangeCodeForSession).toHaveBeenCalledWith("valid_code")
    })

    it("redirects to /auth/error if code exchange fails", async () => {
      const exchangeCodeForSession = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "bad_code", message: "Invalid code" },
      })
      vi.mocked(createClient).mockResolvedValue({
        auth: { exchangeCodeForSession },
      } as never)

      const req = new NextRequest("https://uresphere.in/auth/callback?code=bad_code")
      const res = await callbackGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toContain("/auth/error?error=bad_code")
    })

    it("redirects immediately to /auth/error if Supabase provided error in query params", async () => {
      const req = new NextRequest(
        "https://uresphere.in/auth/callback?error=access_denied&error_description=Link+expired",
      )
      const res = await callbackGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toContain("/auth/error?error=access_denied")
    })

    it("returns client-side verification bridge HTML when neither code nor token_hash is in query", async () => {
      const getUser = vi.fn().mockResolvedValue({ data: { user: null } })
      vi.mocked(createClient).mockResolvedValue({
        auth: { getUser },
      } as never)

      const req = new NextRequest("https://uresphere.in/auth/callback")
      const res = await callbackGet(req)

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/html")
      const body = await res.text()
      expect(body).toContain("window.location.hash")
      expect(body).toContain("/api/auth/session")
      expect(body).toContain("access_token")
    })
  })

  describe("/auth/confirm", () => {
    it("verifies token_hash and redirects to dashboard", async () => {
      const verifyOtp = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { verifyOtp },
      } as never)

      const req = new NextRequest("https://uresphere.in/auth/confirm?token_hash=th_confirm&type=email")
      const res = await confirmGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe("https://uresphere.in/dashboard")
      expect(verifyOtp).toHaveBeenCalledWith({
        type: "email",
        token_hash: "th_confirm",
      })
    })

    it("sanitizes open redirect attempts in next param", async () => {
      const verifyOtp = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { verifyOtp },
      } as never)

      const req = new NextRequest(
        "https://uresphere.in/auth/confirm?token_hash=th_confirm&type=email&next=https://malicious.site",
      )
      const res = await confirmGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe("https://uresphere.in/dashboard")
    })

    it("redirects to error if token_hash is missing", async () => {
      const req = new NextRequest("https://uresphere.in/auth/confirm")
      const res = await confirmGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toContain("/auth/error?error=missing_token")
    })
  })

  describe("/api/auth/session", () => {
    it("sets session cookies when valid tokens are provided from valid origin", async () => {
      const setSession = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { setSession },
      } as never)

      const req = new NextRequest("https://uresphere.in/api/auth/session", {
        method: "POST",
        headers: {
          origin: "https://uresphere.in",
        },
        body: JSON.stringify({ access_token: "at_123", refresh_token: "rt_123" }),
      })
      const res = await sessionPost(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      // Confirm tokens/user data are NOT leaked in response
      expect(data.access_token).toBeUndefined()
      expect(data.user).toBeUndefined()
      expect(setSession).toHaveBeenCalledWith({
        access_token: "at_123",
        refresh_token: "rt_123",
      })
    })

    it("rejects unauthorized cross-origin requests", async () => {
      const req = new NextRequest("https://uresphere.in/api/auth/session", {
        method: "POST",
        headers: {
          origin: "https://evil-attacker.com",
        },
        body: JSON.stringify({ access_token: "at_123", refresh_token: "rt_123" }),
      })
      const res = await sessionPost(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toMatch(/Cross-origin/i)
    })

    it("rejects request if tokens are missing or invalid type", async () => {
      const req = new NextRequest("https://uresphere.in/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ access_token: 12345 }),
      })
      const res = await sessionPost(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toMatch(/Missing or invalid token parameters/i)
    })

    it("rejects request if tokens exceed safe size limits", async () => {
      const req = new NextRequest("https://uresphere.in/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ access_token: "a".repeat(10000), refresh_token: "b" }),
      })
      const res = await sessionPost(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toMatch(/Missing or invalid token parameters/i)
    })

    it("rejects request if Supabase rejects the tokens as forged/expired", async () => {
      const setSession = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Invalid JWT token signature." },
      })
      vi.mocked(createClient).mockResolvedValue({
        auth: { setSession },
      } as never)

      const req = new NextRequest("https://uresphere.in/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ access_token: "forged_token", refresh_token: "forged_refresh" }),
      })
      const res = await sessionPost(req)
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.error).toBe("Invalid JWT token signature.")
    })
  })
})
