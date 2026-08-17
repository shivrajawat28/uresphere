import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanOrigin, getSiteUrl } from "@/lib/site-url"

const env = process.env as Record<string, string | undefined>

const originalEnv = process.env.NODE_ENV
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
const originalProdUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL

describe("cleanOrigin", () => {
  it("returns scheme+host without trailing slash", () => {
    expect(cleanOrigin("https://uresphere.in/")).toBe("https://uresphere.in")
    expect(cleanOrigin("https://uresphere.in/about")).toBe("https://uresphere.in")
    expect(cleanOrigin("http://localhost:3000")).toBe("http://localhost:3000")
  })

  it("rejects non-http(s) schemes and garbage", () => {
    expect(cleanOrigin("javascript:alert(1)")).toBeNull()
    expect(cleanOrigin("ftp://uresphere.in")).toBeNull()
    expect(cleanOrigin("not a url")).toBeNull()
    expect(cleanOrigin("")).toBeNull()
    expect(cleanOrigin(null)).toBeNull()
  })
})

describe("getSiteUrl", () => {
  beforeEach(() => {
    env.NODE_ENV = "production"
    delete env.NEXT_PUBLIC_APP_URL
    delete env.VERCEL_PROJECT_PRODUCTION_URL
  })

  afterEach(() => {
    env.NODE_ENV = originalEnv
    if (originalAppUrl === undefined) delete env.NEXT_PUBLIC_APP_URL
    else env.NEXT_PUBLIC_APP_URL = originalAppUrl
    if (originalProdUrl === undefined) delete env.VERCEL_PROJECT_PRODUCTION_URL
    else env.VERCEL_PROJECT_PRODUCTION_URL = originalProdUrl
  })

  it("prefers an explicit NEXT_PUBLIC_APP_URL", () => {
    env.NEXT_PUBLIC_APP_URL = "https://uresphere.in"
    expect(getSiteUrl()).toBe("https://uresphere.in")
  })

  it("rejects a localhost NEXT_PUBLIC_APP_URL in production", () => {
    env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
    env.VERCEL_PROJECT_PRODUCTION_URL = "uresphere.in"
    expect(getSiteUrl()).toBe("https://uresphere.in")
  })

  it("rejects a vercel.app NEXT_PUBLIC_APP_URL in favor of the production domain", () => {
    env.NEXT_PUBLIC_APP_URL = "https://uresphere-1z11pyqub-shiv-rajawats-projects.vercel.app"
    env.VERCEL_PROJECT_PRODUCTION_URL = "uresphere.in"
    expect(getSiteUrl()).toBe("https://uresphere.in")
  })

  it("uses Vercel's injected production URL when NEXT_PUBLIC_APP_URL is unset", () => {
    env.VERCEL_PROJECT_PRODUCTION_URL = "uresphere.in"
    expect(getSiteUrl()).toBe("https://uresphere.in")
  })

  it("falls back to the production domain in production with no env config", () => {
    expect(getSiteUrl()).toBe("https://uresphere.in")
  })

  it("never returns a vercel.app URL in production", () => {
    env.NEXT_PUBLIC_APP_URL = "https://something.vercel.app"
    expect(getSiteUrl()).not.toContain("vercel.app")
    env.VERCEL_PROJECT_PRODUCTION_URL = "preview-abc.vercel.app"
    expect(getSiteUrl()).not.toContain("vercel.app")
  })

  it("returns localhost outside production", () => {
    env.NODE_ENV = "development"
    expect(getSiteUrl()).toBe("http://localhost:3000")
  })
})

describe("sitemap output", () => {
  beforeEach(() => {
    env.NODE_ENV = "production"
    env.NEXT_PUBLIC_APP_URL = "https://uresphere-1z11pyqub-shiv-rajawats-projects.vercel.app"
    env.VERCEL_PROJECT_PRODUCTION_URL = "uresphere.in"
  })

  afterEach(() => {
    env.NODE_ENV = originalEnv
    if (originalAppUrl === undefined) delete env.NEXT_PUBLIC_APP_URL
    else env.NEXT_PUBLIC_APP_URL = originalAppUrl
    if (originalProdUrl === undefined) delete env.VERCEL_PROJECT_PRODUCTION_URL
    else env.VERCEL_PROJECT_PRODUCTION_URL = originalProdUrl
  })

  // Import after env is set so the module reads production values.
  it("contains only https://uresphere.in URLs and zero vercel.app / private routes", async () => {
    const { default: sitemap } = await import("@/app/sitemap")
    const entries = sitemap()
    expect(entries.length).toBeGreaterThan(0)

    const urls = entries.map((e) => e.url)
    const unique = new Set(urls)
    expect(unique.size).toBe(urls.length) // no duplicates

    for (const url of urls) {
      expect(url.startsWith("https://uresphere.in")).toBe(true) // canonical domain only
      expect(url).not.toContain("vercel.app")
      expect(url).not.toContain("localhost")
      expect(url).toMatch(/^https:\/\/uresphere\.in(\/|$)/)
    }

    // Private / authenticated routes must never appear.
    for (const url of urls) {
      expect(url).not.toMatch(/\/dashboard(\/|$)/)
      expect(url).not.toMatch(/\/admin(\/|$)/)
      expect(url).not.toMatch(/\/auth(\/|$)/)
      expect(url).not.toMatch(/\/onboarding(\/|$)/)
      expect(url).not.toMatch(/\/api(\/|$)/)
    }
  })

  it("lists only genuinely public routes", async () => {
    const { default: sitemap } = await import("@/app/sitemap")
    const paths = sitemap().map((e) => new URL(e.url).pathname)
    const allowed = new Set(["/", "/about", "/request-college"])
    for (const p of paths) expect(allowed.has(p)).toBe(true)
  })
})

describe("robots output", () => {
  beforeEach(() => {
    env.NODE_ENV = "production"
    delete env.NEXT_PUBLIC_APP_URL
    env.VERCEL_PROJECT_PRODUCTION_URL = "uresphere.in"
  })

  afterEach(() => {
    env.NODE_ENV = originalEnv
    if (originalAppUrl === undefined) delete env.NEXT_PUBLIC_APP_URL
    else env.NEXT_PUBLIC_APP_URL = originalAppUrl
    if (originalProdUrl === undefined) delete env.VERCEL_PROJECT_PRODUCTION_URL
    else env.VERCEL_PROJECT_PRODUCTION_URL = originalProdUrl
  })

  it("points the sitemap at the production domain and blocks private routes", async () => {
    const { default: robots } = await import("@/app/robots")
    const output = robots()
    expect(output.sitemap).toBe("https://uresphere.in/sitemap.xml")
    expect(output.sitemap).not.toContain("vercel.app")

    const rules = Array.isArray(output.rules) ? output.rules : [output.rules]
    const disallows = rules.flatMap((r) => r.disallow ?? [])
    for (const privatePrefix of ["/dashboard/", "/admin/", "/onboarding/", "/auth/", "/api/"]) {
      expect(disallows).toContain(privatePrefix)
    }
  })
})
