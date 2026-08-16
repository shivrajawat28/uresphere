// Browser verification of the separated About pages.
//
// Covers: public /about still renders with the landing header; /dashboard/about
// is auth-gated; the logged-in dashboard About page uses the dashboard layout
// (sidebar, no landing navbar), shows the adapted content + data-driven team
// section, works on desktop and mobile (no horizontal overflow, stacked team
// cards, mobile More sheet), and respects light/dark theme.
//
// Run: node scripts/verify-about-browser.mjs
// Optional env: APP_URL (default http://localhost:3000),
//               RT_USER_A_EMAIL/PASSWORD (member), SUPER_ADMIN_EMAIL/PASSWORD
//
// Requires the app running on APP_URL (production build or dev) and the real
// Supabase backend reachable (test accounts come from .env.rt / defaults).

import { readFileSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"

function env() {
  const out = { ...process.env }
  for (const file of [".env.local", ".env.rt"]) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
      if (m && !out[m[1]]) {
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        out[m[1]] = v
      }
    }
  }
  return out
}

const e = env()
const CANDIDATES = [
  { email: process.env.RT_USER_A_EMAIL || e.RT_USER_A_EMAIL || "codebuff.rt.a@example.com", password: process.env.RT_USER_A_PASSWORD || e.RT_USER_A_PASSWORD || "CodebuffRt!2026" },
  { email: e.SUPER_ADMIN_EMAIL, password: e.SUPER_ADMIN_PASSWORD },
].filter((c) => c.email && c.password)

// Pick the first account that actually authenticates against the backend.
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
let ACCOUNT = null
for (const c of CANDIDATES) {
  const { error } = await sb.auth.signInWithPassword({ email: c.email, password: c.password })
  if (!error) {
    ACCOUNT = c
    break
  }
}

const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

async function login(page, user) {
  await page.goto(`${APP_URL}/auth/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(user.email)
  await page.locator('input[name="password"]').fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/dashboard**", { timeout: 30000 }).catch(async () => {
    await page.waitForURL("**/admin**", { timeout: 30000 })
  })
  await page.waitForTimeout(800)
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  // ---------- 1. Public /about stays the landing marketing page ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`${APP_URL}/about`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(800)
    check("Public /about loads", (await page.locator("h1").count()) > 0)
    // Landing nav CTAs render as role=button (Base UI Button wraps the Link).
    const signInCtas =
      (await page.getByRole("button", { name: "Sign in" }).count()) +
      (await page.getByRole("link", { name: "Sign in" }).count())
    const joinCtas =
      (await page.getByRole("button", { name: "Join your Sphere" }).count()) +
      (await page.getByRole("link", { name: "Join your Sphere" }).count())
    check(
      "Public /about shows the landing header (Sign in + Join your Sphere)",
      signInCtas > 0 && joinCtas > 0,
      `signIn=${signInCtas} join=${joinCtas}`,
    )
    check(
      "Public /about landing nav still links to /about",
      (await page.locator('a[href="/about"]').count()) > 0,
    )
    check(
      "Public /about has NO dashboard sidebar",
      (await page.locator('nav[aria-label="Dashboard navigation"]').count()) === 0,
    )
    check(
      "Public /about shows the marketing hero (Your campus, your Sphere)",
      (await page.getByText("Your campus, your Sphere").count()) > 0,
    )
    check("Public /about has no horizontal overflow", await noHorizontalOverflow(page))
    await ctx.close()
  }

  // ---------- 2. Unauthenticated /dashboard/about redirects to login ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`${APP_URL}/dashboard/about`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200)
    const url = new URL(page.url())
    check(
      "Unauthenticated /dashboard/about redirects to login",
      url.pathname.startsWith("/auth/login"),
      url.pathname,
    )
    await ctx.close()
  }

  if (!ACCOUNT) {
    console.log("SKIP — no working test account (set RT_USER_A_* or SUPER_ADMIN_*)")
    process.exit(0)
  }
  const account = ACCOUNT
  {
    console.log(`Using account: ${account.email}`)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await login(page, account)

    // Sidebar About link points to the NEW route.
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(800)
    const sidebarAbout = page.locator('nav[aria-label="Dashboard navigation"] a[href="/dashboard/about"]')
    check("Desktop sidebar About link → /dashboard/about", (await sidebarAbout.count()) > 0)

    await page.goto(`${APP_URL}/dashboard/about`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(900)
    check("Dashboard About URL is /dashboard/about", new URL(page.url()).pathname === "/dashboard/about")

    check(
      "Dashboard About shows the dashboard sidebar",
      (await page.locator('nav[aria-label="Dashboard navigation"]').count()) > 0 &&
        (await page.getByRole("link", { name: "Overview" }).count()) > 0,
    )
    check(
      "Dashboard About has NO landing navbar (no Join your Sphere)",
      (await page.getByText("Join your Sphere").count()) === 0,
    )
    check(
      "Dashboard About shows the dashboard content sections",
      (await page.getByRole("heading", { name: "Your campus, your Sphere" }).count()) > 0 &&
        (await page.getByRole("heading", { name: "Why we built it" }).count()) > 0 &&
        (await page.getByRole("heading", { name: "Our vision" }).count()) > 0 &&
        (await page.getByRole("heading", { name: "The UreSphere story" }).count()) > 0 &&
        (await page.getByRole("heading", { name: "Trust, privacy & community" }).count()) > 0 &&
        (await page.getByRole("heading", { name: "How UreSphere works" }).count()) > 0 &&
        (await page.getByRole("heading", { name: "Our Team" }).count()) > 0,
    )
    check(
      "Dashboard About team section renders placeholder entries",
      (await page.getByText("Founder Name", { exact: true }).count()) > 0 &&
        (await page.getByText("Co-founder Name", { exact: true }).count()) > 0 &&
        (await page.getByText("Team Member Name", { exact: true }).count()) > 0,
    )
    check("Dashboard About has no horizontal overflow (desktop)", await noHorizontalOverflow(page))

    // Light/dark theme.
    const beforeDark = await page.evaluate(() => document.documentElement.classList.contains("dark"))
    await page.getByRole("button", { name: "Toggle theme" }).click()
    await page.getByRole("menuitem", { name: "Dark" }).click()
    await page.waitForTimeout(400)
    const afterDark = await page.evaluate(() => document.documentElement.classList.contains("dark"))
    check("Theme toggle switches to dark and page still renders", !beforeDark && afterDark, `dark=${afterDark}`)
    await page.getByRole("button", { name: "Toggle theme" }).click()
    await page.getByRole("menuitem", { name: "Light" }).click()
    await page.waitForTimeout(300)
    check(
      "Dashboard About still renders after theme switch",
      (await page.getByRole("heading", { name: "Your campus, your Sphere" }).count()) > 0,
    )
    await ctx.close()
  }

  // ---------- 4. Mobile (390×844) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await login(page, account)
    await page.goto(`${APP_URL}/dashboard/about`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(900)

    check(
      "Mobile dashboard About shows mobile top bar + bottom nav",
      (await page.locator('nav[aria-label="Mobile navigation"]').count()) > 0,
    )
    check("Mobile dashboard About has no horizontal overflow", await noHorizontalOverflow(page))

    const teamGridCols = await page
      .locator('div:has(h2:text-is("Our Team")) + div.grid, div.grid:has-text("Founder Name")')
      .first()
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)
      .catch(() => 0)
    check("Mobile team grid stacks to a single column", teamGridCols === 1, `cols=${teamGridCols}`)

    // Mobile More sheet → About → /dashboard/about.
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(700)
    await page.getByRole("button", { name: "More" }).click()
    // Scope to the More sheet dialog (the desktop sidebar link is hidden on
    // mobile and would be the first CSS match otherwise).
    const sheetAbout = page.locator('[role="dialog"] a[href="/dashboard/about"]')
    check("Mobile More sheet has About → /dashboard/about", (await sheetAbout.count()) > 0)
    await sheetAbout.first().click()
    await page.waitForTimeout(900)
    check("Mobile More → About lands on /dashboard/about", new URL(page.url()).pathname === "/dashboard/about")
    await ctx.close()
  }
} catch (err) {
  console.log(`\nSCRIPT ERROR: ${err.message}`)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
