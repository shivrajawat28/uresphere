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

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Auth Verification Routes", () => {
  describe("/auth/callback", () => {
    it("verifies token_hash and redirects to dashboard on success", async () => {
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

    it("redirects to error if token_hash is missing", async () => {
      const req = new NextRequest("https://uresphere.in/auth/confirm")
      const res = await confirmGet(req)

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toContain("/auth/error?error=missing_token")
    })
  })

  describe("/api/auth/session", () => {
    it("sets session cookies when access_token and refresh_token are provided", async () => {
      const setSession = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
      vi.mocked(createClient).mockResolvedValue({
        auth: { setSession },
      } as never)

      const req = new NextRequest("https://uresphere.in/api/auth/session", {
        method: "POST",
        body: JSON.stringify({ access_token: "at_123", refresh_token: "rt_123" }),
      })
      const res = await sessionPost(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(setSession).toHaveBeenCalledWith({
        access_token: "at_123",
        refresh_token: "rt_123",
      })
    })

    it("rejects request if tokens are missing", async () => {
      const req = new NextRequest("https://uresphere.in/api/auth/session", {
        method: "POST",
        body: JSON.stringify({}),
      })
      const res = await sessionPost(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toMatch(/Missing access or refresh token/i)
    })
  })
})
