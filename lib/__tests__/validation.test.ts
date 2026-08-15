import { describe, expect, it } from "vitest"
import {
  mapAuthError,
  normalizeEmail,
  isValidEmail,
  validateLogin,
  validateMessageBody,
  validatePromotionUrl,
  validateSignup,
} from "@/lib/validation"

describe("validateSignup", () => {
  const valid = {
    realName: "Alice Verma",
    phone: "9876543210",
    college: "ITS Engineering College",
    email: "alice@example.com",
    password: "hunter2hunter",
    confirmPassword: "hunter2hunter",
  }

  it("accepts a valid registration", () => {
    expect(validateSignup(valid)).toBeNull()
  })

  it("rejects a missing short name", () => {
    expect(validateSignup({ ...valid, realName: "A" })).toMatch(/full name/i)
  })

  it("rejects a short phone number", () => {
    expect(validateSignup({ ...valid, phone: "123" })).toMatch(/phone/i)
  })

  it("rejects a missing college", () => {
    expect(validateSignup({ ...valid, college: "" })).toMatch(/college/i)
  })

  it("rejects a malformed email", () => {
    expect(validateSignup({ ...valid, email: "not-an-email" })).toMatch(/email/i)
  })

  it("rejects a short password", () => {
    expect(validateSignup({ ...valid, password: "short", confirmPassword: "short" })).toMatch(/8 characters/i)
  })

  it("rejects mismatched confirmation password", () => {
    expect(validateSignup({ ...valid, confirmPassword: "different!" })).toMatch(/don't match/i)
  })
})

describe("normalizeEmail / isValidEmail", () => {
  it("lowercases and trims email addresses", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com")
  })

  it("accepts standard addresses and rejects garbage", () => {
    expect(isValidEmail("a@b.co")).toBe(true)
    expect(isValidEmail("a@b")).toBe(false)
    expect(isValidEmail("a b@c.com")).toBe(false)
    expect(isValidEmail("")).toBe(false)
  })
})

describe("validateLogin", () => {
  it("rejects empty credentials", () => {
    expect(validateLogin("", "")).toMatch(/email and password/i)
  })

  it("accepts present credentials", () => {
    expect(validateLogin("a@b.com", "secret")).toBeNull()
  })
})

describe("validatePromotionUrl", () => {
  it("accepts normal http(s) URLs and normalizes them", () => {
    expect(validatePromotionUrl("https://example.com/fest")).toBe("https://example.com/fest")
    expect(validatePromotionUrl("http://example.com")).toBe("http://example.com/")
  })

  it("rejects non-http schemes", () => {
    expect(validatePromotionUrl("javascript:alert(1)")).toBeNull()
    expect(validatePromotionUrl("data:text/html,<script>alert(1)</script>")).toBeNull()
    expect(validatePromotionUrl("file:///etc/passwd")).toBeNull()
    expect(validatePromotionUrl("ftp://example.com")).toBeNull()
  })

  it("rejects URLs with embedded credentials", () => {
    expect(validatePromotionUrl("https://user:pass@example.com")).toBeNull()
  })

  it("rejects missing or invalid hostnames", () => {
    expect(validatePromotionUrl("https://")).toBeNull()
    expect(validatePromotionUrl("https://localhost")).toBeNull()
    expect(validatePromotionUrl("https://127.0.0.1")).toBeNull()
    expect(validatePromotionUrl("not a url")).toBeNull()
  })
})

describe("validateMessageBody", () => {
  it("rejects empty and over-length messages", () => {
    expect(validateMessageBody("   ")).toMatch(/empty/i)
    expect(validateMessageBody("x".repeat(1001))).toMatch(/too long/i)
  })

  it("accepts a normal message", () => {
    expect(validateMessageBody("hello sphere")).toBeNull()
  })
})

describe("mapAuthError", () => {
  it("maps known auth failures to friendly messages", () => {
    expect(mapAuthError("Email not confirmed")).toMatch(/confirm your email/i)
    expect(mapAuthError("User already registered")).toMatch(/signing in instead/i)
    expect(mapAuthError("Password should be at least 8 characters.")).toMatch(/8 characters/i)
    expect(mapAuthError("Request rate limit reached")).toMatch(/Too many attempts/i)
  })

  it("never leaks the raw Supabase message", () => {
    const raw = "supabase: invalid api key abc123secret"
    const mapped = mapAuthError(raw)
    expect(mapped).not.toContain("abc123secret")
    expect(mapped).not.toContain("supabase")
  })
})
