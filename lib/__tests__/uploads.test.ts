import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  isAllowedUploadOrigin,
  normalizeOrigin,
  sniffFileType,
  sniffImageTypeFromBytes,
  sniffPdf,
} from "@/lib/uploads"
import { normalizeIndianPhone } from "@/lib/validation"

describe("normalizeOrigin", () => {
  it("keeps scheme + host and strips path/trailing slashes", () => {
    expect(normalizeOrigin("https://uresphere.app/dashboard")).toBe("https://uresphere.app")
    expect(normalizeOrigin("https://uresphere.app/")).toBe("https://uresphere.app")
  })

  it("lowercases the host", () => {
    expect(normalizeOrigin("HTTPS://UreSphere.APP")).toBe("https://uresphere.app")
  })

  it("keeps the port when present", () => {
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000")
  })
})

describe("isAllowedUploadOrigin", () => {
  const originalEnv = process.env.NODE_ENV
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  // NODE_ENV cannot be vi.stubEnv'd (vitest guards it) — assign directly
  // (via a mutable cast) and restore in afterEach.
  const env = process.env as Record<string, string | undefined>
  beforeEach(() => {
    env.NODE_ENV = "production"
    env.NEXT_PUBLIC_APP_URL = "https://uresphere.app"
  })

  afterEach(() => {
    env.NODE_ENV = originalEnv
    if (originalAppUrl === undefined) delete env.NEXT_PUBLIC_APP_URL
    else env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  it("allows requests without an Origin header (server-to-server, curl)", () => {
    expect(isAllowedUploadOrigin(null, "https://uresphere.app/api/upload")).toBe(true)
    expect(isAllowedUploadOrigin("", "https://uresphere.app/api/upload")).toBe(true)
  })

  it("allows the canonical app URL", () => {
    expect(isAllowedUploadOrigin("https://uresphere.app", "https://uresphere.app/api/upload")).toBe(true)
  })

  it("allows the origin the request was actually addressed to (tunnels / previews)", () => {
    // Preview deployment: NEXT_PUBLIC_APP_URL is the canonical domain, but the
    // browser talks to the preview host — the request origin must still pass.
    expect(isAllowedUploadOrigin("https://uresphere-git-main.vercel.app", "https://uresphere-git-main.vercel.app/api/upload")).toBe(true)
    // ngrok / cloudflared tunnel during local testing
    expect(isAllowedUploadOrigin("https://abc-123.ngrok-free.app", "https://abc-123.ngrok-free.app/api/upload")).toBe(true)
  })

  it("rejects a cross-site attacker origin (evil.com POSTing to the API)", () => {
    expect(isAllowedUploadOrigin("https://evil.com", "https://uresphere.app/api/upload")).toBe(false)
  })

  it("rejects an attacker origin even when it looks similar to the app URL", () => {
    expect(isAllowedUploadOrigin("https://uresphere.app.evil.com", "https://uresphere.app/api/upload")).toBe(false)
    expect(isAllowedUploadOrigin("https://uresphere.app.ngrok-free.app", "https://uresphere.app/api/upload")).toBe(false)
  })

  it("does not do prefix matching — different path on same host is still same origin", () => {
    expect(isAllowedUploadOrigin("https://uresphere.app", "https://uresphere.app/anything")).toBe(true)
  })

  it("whitelists localhost in development so a tunnel APP_URL never blocks local work", () => {
    env.NODE_ENV = "development"
    env.NEXT_PUBLIC_APP_URL = "https://abc-123.ngrok-free.app"
    expect(isAllowedUploadOrigin("http://localhost:3000", "http://localhost:3000/api/upload")).toBe(true)
    expect(isAllowedUploadOrigin("http://127.0.0.1:3000", "http://127.0.0.1:3000/api/upload")).toBe(true)
  })

  it("does not whitelist localhost in production", () => {
    // In production a localhost Origin hitting the canonical app URL is
    // cross-origin (the site is served from the app URL, not localhost).
    expect(isAllowedUploadOrigin("http://localhost:3000", "https://uresphere.app/api/upload")).toBe(false)
  })
})

describe("sniffPdf", () => {
  function bytes(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2)
    for (let i = 0; i < arr.length; i++) arr[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    return arr
  }

  it("detects a real PDF header", () => {
    expect(sniffPdf(bytes("255044462d312e37"))).toBe(true) // %PDF-1.7
  })

  it("rejects non-PDF bytes", () => {
    expect(sniffPdf(bytes("89504e470d0a1a0a"))).toBe(false) // PNG
    expect(sniffPdf(bytes("ffd8ff"))).toBe(false) // JPEG
    expect(sniffPdf(new Uint8Array(0))).toBe(false) // empty
  })
})

describe("sniffImageTypeFromBytes", () => {
  function bytes(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2)
    for (let i = 0; i < arr.length; i++) arr[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    return arr
  }

  it("detects JPEG, PNG, GIF and WebP from magic bytes", () => {
    expect(sniffImageTypeFromBytes(bytes("ffd8ff"))).toBe("image/jpeg")
    expect(sniffImageTypeFromBytes(bytes("89504e470d0a1a0a"))).toBe("image/png")
    expect(sniffImageTypeFromBytes(bytes("474946383961"))).toBe("image/gif") // GIF89a
    expect(sniffImageTypeFromBytes(bytes("524946463000000057454250"))).toBe("image/webp") // RIFF....WEBP
  })

  it("returns null for unknown bytes", () => {
    expect(sniffImageTypeFromBytes(bytes("000000000000"))).toBeNull()
  })
})

describe("sniffFileType", () => {
  it("classifies a PDF Blob even when the client MIME is fake", async () => {
    const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], {
      type: "text/plain", // spoofed client MIME — must still be caught by bytes
    })
    expect(await sniffFileType(pdf)).toBe("application/pdf")
  })

  it("classifies a PNG Blob by bytes regardless of client MIME", async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: "application/octet-stream",
    })
    expect(await sniffFileType(png)).toBe("image/png")
  })

  it("returns null for junk bytes", async () => {
    const junk = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])], { type: "image/png" })
    expect(await sniffFileType(junk)).toBeNull()
  })
})

describe("normalizeIndianPhone", () => {
  it("normalizes a bare 10-digit number starting with 6–9", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("+919876543210")
    expect(normalizeIndianPhone(" 98765 43210 ")).toBe("+919876543210")
  })

  it("normalizes 91 and 091 prefixed numbers", () => {
    expect(normalizeIndianPhone("919876543210")).toBe("+919876543210")
    expect(normalizeIndianPhone("0919876543210")).toBe("+919876543210")
  })

  it("rejects invalid numbers", () => {
    expect(normalizeIndianPhone("12345")).toBeNull()
    expect(normalizeIndianPhone("5876543210")).toBeNull() // does not start 6–9
    expect(normalizeIndianPhone("98765432101")).toBeNull() // 11 digits
    expect(normalizeIndianPhone("")).toBeNull()
  })
})
