// Live verification of user-facing flows against the running app + live Supabase.
// Covers: dashboard greeting/redesign, plans empty state, promotions, groups,
// mobile bottom nav + More sheet, no horizontal overflow, admin redirect for
// normal users, and light performance measurements.
//
// Run: node scripts/verify-user-flows.mjs
// Optional env: APP_URL (default http://localhost:3000), RT_USER_A_EMAIL/PASSWORD

import { chromium } from "playwright-core"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const PASSWORD = process.env.RT_USER_A_PASSWORD || "CodebuffRt!2026"
const A = { email: process.env.RT_USER_A_EMAIL || "codebuff.rt.a@example.com", password: PASSWORD }

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
  await page.waitForURL("**/dashboard**", { timeout: 30000 })
  // Wait for the dashboard to actually render (server fetch + hydration).
  await page.getByText("Hello,", { exact: false }).first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)
}

async function navTiming(page, url) {
  const t0 = Date.now()
  await page.goto(`${APP_URL}${url}`, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {})
  return Date.now() - t0
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  // ---------- Login as a normal user ----------
  await login(page, A)
  check("Normal user logs in and lands on /dashboard", page.url().includes("/dashboard"), page.url())

  // ---------- Dashboard greeting ----------
  const greeting = await page.locator("main p.font-serif").first().textContent().catch(() => "")
  check(
    "Greeting uses display name 'Hello, …'",
    /Hello, Codebuff RT A/.test(greeting ?? ""),
    (greeting ?? "").trim(),
  )
  check(
    "Sphere name remains visible on dashboard",
    (await page.getByText(/ITS ENGINEERING COLLEGE/i).count()) > 0,
  )
  // Marketplace must appear only as a compact quick-action card, never as a
  // large section card with heading + content. Assert there is no standalone
  // Marketplace heading outside the quick actions grid.
  const bigMarketplace = await page
    .locator("section")
    .filter({ has: page.locator("h2") })
    .filter({ hasText: /^Marketplace$/ })
    .count()
  check("Marketplace is NOT a large overview card", bigMarketplace === 0, `${bigMarketplace} big sections`)
  check("Quick actions include Marketplace as a compact card", (await page.getByText("Buy & sell on campus").count()) > 0)

  // ---------- Dashboard sections ----------
  const sections = {
    "Your Sphere stats": /Your Sphere/,
    "What's happening on your campus": /What's happening on your campus/,
    "quick actions (Jump back in)": /Jump back in/,
    "recent activity": /Latest activity/,
  }
  for (const [label, re] of Object.entries(sections)) {
    check(`Dashboard section: ${label}`, (await page.getByText(re).count()) > 0)
  }
  // Empty-state for events when there are none
  const eventsEmpty = await page.getByText(/No events on campus yet/i).count()
  check("Events section shows clean empty state (no data)", eventsEmpty > 0)

  // "What's coming next" — no published plans → section omitted (not a broken card)
  const plansSection = await page.getByText("What's coming next", { exact: false }).count()
  check("Plans section correctly absent when nothing published", plansSection === 0, "no published plans in DB")

  // ---------- Promotions ----------
  let t = await navTiming(page, "/dashboard/promotions")
  check("Promotions page loads", (await page.getByRole("heading", { name: "Promotions" }).count()) > 0, `${t}ms`)
  check(
    "Promotion submission form present",
    (await page.getByRole("button", { name: /Submit|Promote/i }).count()) > 0,
  )
  check(
    "'Live promotions' section present",
    (await page.getByText(/Live in ITS/i).count()) > 0,
  )
  check(
    "Live promotions shows empty state (no approved+paid rows in DB)",
    (await page.getByText(/No live promotions right now/i).count()) > 0,
  )
  check("'Your submissions' section present", (await page.getByText("Your submissions", { exact: true }).count()) > 0)

  // ---------- Groups ----------
  t = await navTiming(page, "/dashboard/groups")
  check("Groups page loads", (await page.getByRole("heading", { name: /Groups/i }).count()) > 0, `${t}ms`)
  check("Groups shows empty/valid state (no groups in DB)", (await page.getByText(/no groups|No groups/i).count()) > 0 || (await page.getByRole("button", { name: /New group|Create group/i }).count()) > 0)

  // ---------- Admin access denied for normal user ----------
  await page.goto(`${APP_URL}/admin`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2500)
  check("Normal user cannot access /admin (redirected)", !page.url().includes("/admin"), page.url())

  // ---------- Chat quick check (page loads, recent window) ----------
  t = await navTiming(page, "/dashboard/chat")
  check("Chat page loads", (await page.locator("textarea[placeholder^='Message ']").count()) > 0, `${t}ms`)

  await ctx.close()

  // ---------- Mobile viewport ----------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const mpage = await mctx.newPage()
  await login(mpage, A)

  // Bottom navigation visible on mobile
  const bottomNav = await mpage.locator('nav[aria-label="Mobile navigation"]').isVisible().catch(() => false)
  check("Mobile bottom navigation visible", bottomNav)

  // No horizontal overflow
  const overflow = await mpage.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth > doc.clientWidth + 1
  })
  check("No horizontal overflow on mobile", !overflow)

  // More sheet opens and exposes remaining sections
  await mpage.getByRole("button", { name: "More" }).click()
  const moreVisible = await mpage.getByRole("dialog", { name: "More navigation" }).isVisible().catch(() => false)
  check("More sheet opens", moreVisible)
  const reachable = await mpage.getByRole("link", { name: /Groups|Promotions|Academic|Events|Clubs|Premium|Global Listings|Roadmap/ }).count()
  check("More sheet exposes remaining sections (incl. Roadmap)", reachable >= 4, `${reachable} links`)
  const roadmapInMore = (await mpage.getByRole("link", { name: "Roadmap" }).count()) > 0
  check("More sheet includes Roadmap", roadmapInMore)

  // Clicking a nav item closes the sheet (Groups)
  await mpage.getByRole("link", { name: /Groups/ }).first().click()
  await mpage.waitForTimeout(1200)
  check("More sheet closes on navigation", !(await mpage.getByRole("dialog", { name: "More navigation" }).isVisible().catch(() => false)), mpage.url())

  // Desktop sidebar groups (mobile hides it; check desktop separately)
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const dpage = await dctx.newPage()
  await login(dpage, A)
  const groups = ["Your Sphere", "Campus", "Community", "Other"]
  for (const g of groups) {
    check(`Sidebar group present: ${g}`, (await dpage.getByText(g, { exact: true }).count()) > 0)
  }
  check("Sidebar includes Roadmap link", (await dpage.getByRole("link", { name: "Roadmap" }).count()) > 0)
  await dpage.goto(`${APP_URL}/dashboard/roadmap`, { waitUntil: "domcontentloaded" })
  await dpage.waitForTimeout(1200)
  const roadmapHeader = await dpage.getByText("Help shape what's coming next.", { exact: false }).count()
  check("Dashboard Roadmap page loads (authenticated)", roadmapHeader > 0, dpage.url())
  await dctx.close()
  await mctx.close()

  // ---------- Performance sanity ----------
  const perfCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const ppage = await perfCtx.newPage()
  await login(ppage, A)
  const perf = {}
  for (const url of ["/dashboard", "/dashboard/promotions", "/dashboard/groups", "/dashboard/chat", "/dashboard/notifications"]) {
    const t0 = Date.now()
    await ppage.goto(`${APP_URL}${url}`, { waitUntil: "domcontentloaded" })
    await ppage.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {})
    perf[url] = Date.now() - t0
  }
  console.log("  perf (load-to-networkidle):", JSON.stringify(perf))
  check("Dashboard loads within 4s", perf["/dashboard"] < 4000, `${perf["/dashboard"]}ms`)
  check("No route over 6s", Object.values(perf).every((v) => v < 6000), JSON.stringify(perf))
  await perfCtx.close()
} catch (err) {
  console.log(`\nSCRIPT ERROR: ${err.message}`)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
