// Full live E2E verification of the Academic Section Admin manager flow.
// Requires migration 0010 applied to the live Supabase project.
//
// Flow:
//   1. Provision a test member in ITS (login if the account exists, else sign
//      up through the app form — same pattern as chat-realtime-browser.mjs).
//   2. Normal member: no "Academic Admin" nav entry; direct route = empty
//      state (no data leaked).
//   3. Super admin assigns academic_manager with section { year: "First Year" }
//      (degree/branch blank = wildcard).
//   4. Member: "Academic Admin" appears in the desktop sidebar AND the mobile
//      More sheet; workspace lists the assigned "First Year" section.
//   5. CRUD: create a subject (B.Tech / First Year / CSE), see it in the
//      member Academic UI drill-down, edit it, delete it.
//   6. Unauthorized section: direct navigation to a Second Year section key
//      redirects away (no content exposed).
//   7. Cleanup: assignment revoked; member no longer sees "Academic Admin".
//
// Run: node scripts/verify-academic-manager-flow.mjs
// Env: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD (or .env.rt), APP_URL,
//      RT_ACADEMIC_EMAIL/PASSWORD (defaults to codebuff.academic@example.com).

import { readFileSync, existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const PASSWORD = "CodebuffRt!2026"
const COLLEGE = "ITS Engineering College"

function env() {
  const out = { ...process.env }
  for (const f of [".env.local", ".env.rt"]) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
      if (m && !out[m[1]]) out[m[1]] = m[2].trim()
    }
  }
  return out
}

const e = env()
const ADMIN = { email: process.env.SUPER_ADMIN_EMAIL || e.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD || e.SUPER_ADMIN_PASSWORD }
const MEMBER = {
  email: process.env.RT_ACADEMIC_EMAIL || e.RT_ACADEMIC_EMAIL || "codebuff.academic@example.com",
  password: process.env.RT_ACADEMIC_PASSWORD || e.RT_ACADEMIC_PASSWORD || PASSWORD,
}
if (!ADMIN.email || !ADMIN.password) {
  console.log("BLOCKED: SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set")
  process.exit(2)
}

// API probe (instant, no page load) — decides login-vs-signup deterministically
// so we never re-signup an existing email (signup then stays on /auth/sign-up
// with an "already registered" error). Same pattern as chat-realtime-browser.mjs.
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function apiSession(user) {
  const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password: user.password })
  return error ? null : data
}

const SUBJECT_NAME = `Academic Admin E2E ${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
const SUBJECT_EDITED = `${SUBJECT_NAME} (edited)`
const FIRST_YEAR_KEY = `${encodeURIComponent("")}~${encodeURIComponent("First Year")}~${encodeURIComponent("")}`
const SECOND_YEAR_KEY = `${encodeURIComponent("")}~${encodeURIComponent("Second Year")}~${encodeURIComponent("")}`

const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

// React 19 controlled inputs: type real keys after hydration, verify value.
async function typeControlled(page, selector, value) {
  await page.locator(selector).waitFor({ state: "visible", timeout: 15000 })
  await page.waitForTimeout(400)
  await page.locator(selector).click()
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
  await page.keyboard.press("Backspace")
  await page.keyboard.type(value, { delay: 12 })
  await page.waitForTimeout(150)
  let got = await page.inputValue(selector)
  if (got !== value) {
    await page.waitForTimeout(800)
    await page.locator(selector).click()
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await page.keyboard.press("Backspace")
    await page.keyboard.type(value, { delay: 12 })
    got = await page.inputValue(selector)
  }
  return got === value
}

async function login(page, user, expectPath) {
  await page.goto(`${APP_URL}/auth/login`, { waitUntil: "commit", timeout: 60000 })
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 })
  await page.locator('input[name="email"]').fill(user.email)
  await page.locator('input[name="password"]').fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  // /dashboard is server-rendered and compiles on first hit in dev — allow time.
  await page.waitForURL(`**${expectPath}**`, { timeout: 90000 })
  await page.waitForTimeout(1200)
}

async function signupViaUI(page, user) {
  await page.goto(`${APP_URL}/auth/sign-up`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Continue" }).waitFor({ state: "visible" })
  await page.waitForTimeout(600)
  await typeControlled(page, "#realName", "Codebuff Academic RT")
  await typeControlled(page, "#phone", "9999900042")
  await page.getByRole("button", { name: "Continue" }).click()
  await page.waitForSelector("#college", { state: "visible", timeout: 8000 }).catch(async () => {
    const alert = await page.locator("[role=alert]").allTextContents()
    throw new Error(`Sign-up step 1 did not advance — ${alert.join(" | ") || "(none)"}`)
  })
  await typeControlled(page, "#college", "ITS")
  await page.locator("#college-results li").filter({ hasText: COLLEGE }).first().waitFor({ state: "visible", timeout: 15000 })
  await page.locator("#college-results li").filter({ hasText: COLLEGE }).first().click()
  await page.getByText(COLLEGE, { exact: true }).waitFor({ state: "visible", timeout: 5000 })
  await page.getByRole("button", { name: "Continue" }).click()
  await typeControlled(page, "#email", user.email)
  await typeControlled(page, "#password", user.password)
  await typeControlled(page, "#confirmPassword", user.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await page.waitForURL("**/auth/sign-up-success**", { timeout: 30000 })
}

async function ensureMember(browser) {
  const session = await apiSession(MEMBER)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  if (session) {
    // Account exists with the right password → plain login.
    await login(page, MEMBER, "/dashboard")
    return { ctx, page, created: false }
  }
  // Account does not exist → create it through the real signup form. If the
  // signup errors (e.g. the email is already registered with another password),
  // fall back to a UI login and let the real auth error surface.
  try {
    await signupViaUI(page, MEMBER)
    await gotoPage(page, `${APP_URL}/dashboard`)
    return { ctx, page, created: true }
  } catch {
    await login(page, MEMBER, "/dashboard")
    return { ctx, page, created: false }
  }
}

// Dev mode compiles routes on first hit — use commit + generous timeouts and
// wait for a stable marker instead of relying on domcontentloaded.
async function gotoPage(page, url, waitSelector, timeoutMs = 90000) {
  await page.goto(url, { waitUntil: "commit", timeout: timeoutMs })
  if (waitSelector) await page.locator(waitSelector).first().waitFor({ state: "visible", timeout: timeoutMs })
  await page.waitForTimeout(1200)
  return page.url()
}

async function navHasAcademicAdmin(page) {
  await gotoPage(page, `${APP_URL}/dashboard`)
  return (await page.getByText("Academic Admin", { exact: true }).count()) > 0
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  // =====================================================================
  // 1. PROVISION the test member (ITS)
  // =====================================================================
  const memberCtx = await ensureMember(browser)
  const member = memberCtx.page
  console.log(`  member: ${MEMBER.email} (${memberCtx.created ? "signed up" : "existing"})`)
  check("Test member lands on /dashboard", member.url().includes("/dashboard"), member.url())

  // =====================================================================
  // 2. NORMAL MEMBER — no Academic Admin anywhere
  // =====================================================================
  const navBefore = await navHasAcademicAdmin(member)
  check("Normal member: 'Academic Admin' hidden in dashboard nav", !navBefore)
  await gotoPage(member, `${APP_URL}/dashboard/academic/admin`)
  const emptyBefore = (await member.getByText("You don't manage any academic sections yet.", { exact: false }).count()) > 0
  check("Normal member: direct route shows empty state (no data leak)", emptyBefore)

  // =====================================================================
  // 3. SUPER ADMIN — assign academic_manager with First Year (wildcard)
  // =====================================================================
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const admin = await actx.newPage()
  const adminErrors = []
  admin.on("pageerror", (err) => adminErrors.push(err.message.slice(0, 200)))

  await login(admin, ADMIN, "/admin")
  const sphereCard = admin.locator("a").filter({ hasText: "ITS ENGINEERING COLLEGE" }).first()
  await sphereCard.waitFor({ state: "visible", timeout: 20000 })
  const sphereHref = await sphereCard.getAttribute("href")
  await gotoPage(admin, `${APP_URL}${sphereHref}`)
  await admin.locator("a").filter({ hasText: "Roles" }).first().click()
  await admin.waitForURL("**/roles", { timeout: 15000 })
  await admin.waitForTimeout(1000)

  await admin.locator("#memberSearch").fill(MEMBER.email)
  await admin.waitForTimeout(800)
  const memberOption = admin.locator("button[type='button']").filter({ hasText: MEMBER.email }).first()
  const optionVisible = await memberOption.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)
  check("Admin: member search finds the test member", optionVisible, MEMBER.email)
  if (!optionVisible) throw new Error("Test member not found in ITS — cannot assign")
  await memberOption.click()
  await admin.waitForTimeout(400)

  await admin.locator('input[aria-label="Section 1 year"]').fill("First Year")
  await admin.getByRole("button", { name: "Assign role" }).click()
  await admin.waitForTimeout(3000)
  const assignedCard = admin.locator("div.bg-card").filter({ hasText: "Academic manager" }).filter({ hasText: "scope:" }).last()
  const assignedVisible = await assignedCard.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
  check("Admin: academic_manager assigned with First Year scope", assignedVisible, assignedVisible ? (await assignedCard.innerText()).replace(/\s+/g, " ").slice(0, 90) : "")

  // =====================================================================
  // 4. MEMBER — nav entry + workspace
  // =====================================================================
  const navAfter = await navHasAcademicAdmin(member)
  check("Manager: 'Academic Admin' appears in dashboard nav", navAfter)

  await gotoPage(member, `${APP_URL}/dashboard/academic/admin`)
  check("Manager: workspace opens at Academic Admin", member.url().includes("/dashboard/academic/admin"), member.url())
  const firstYearCard = member.locator("a").filter({ hasText: "First Year" }).first()
  const fyVisible = await firstYearCard.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
  check("Manager: assigned 'First Year' section listed", fyVisible)

  // =====================================================================
  // 5. CRUD — create / member UI / edit / delete
  // =====================================================================
  await gotoPage(member, `${APP_URL}/dashboard/academic/admin/${FIRST_YEAR_KEY}`)
  await member.getByRole("button", { name: "Add subject" }).click()
  await member.waitForTimeout(800)
  // Degree select (placeholder "Any") → B.Tech; year defaults to "First Year".
  const degreeTrigger = member.locator('[role="combobox"]').filter({ hasText: "Any" }).first()
  await degreeTrigger.click()
  await member.getByRole("option", { name: "B.Tech" }).click()
  await member.waitForTimeout(400)
  await member.locator("#acBranch").fill("CSE")
  await member.locator("#acName").fill(SUBJECT_NAME)
  await member.getByRole("button", { name: "Add subject" }).last().click()
  await member.waitForTimeout(3500)
  const createdVisible = (await member.getByText(SUBJECT_NAME, { exact: true }).count()) > 0
  check("Manager: creates a subject in the assigned section", createdVisible, SUBJECT_NAME)

  // Member Academic UI sees it (drill B.Tech → First Year → CSE).
  await gotoPage(member, `${APP_URL}/dashboard/academic`)
  await member.getByRole("button", { name: "B.Tech" }).first().click()
  await member.waitForTimeout(600)
  await member.getByRole("button", { name: "First Year" }).first().click()
  await member.waitForTimeout(600)
  await member.getByRole("button", { name: "CSE" }).first().click()
  await member.waitForTimeout(800)
  const memberSees = (await member.getByText(SUBJECT_NAME, { exact: true }).count()) > 0
  check("Member Academic UI shows the managed subject", memberSees, SUBJECT_NAME)

  // Edit.
  await gotoPage(member, `${APP_URL}/dashboard/academic/admin/${FIRST_YEAR_KEY}`)
  await member.getByRole("button", { name: `Edit ${SUBJECT_NAME}` }).click()
  await member.waitForTimeout(800)
  await typeControlled(member, "#acName", SUBJECT_EDITED)
  await member.getByRole("button", { name: "Save changes" }).click()
  await member.waitForTimeout(3500)
  const editedVisible = (await member.getByText(SUBJECT_EDITED, { exact: true }).count()) > 0
  check("Manager: edits the subject (update reflected)", editedVisible, SUBJECT_EDITED)

  // =====================================================================
  // 6. MOBILE — More sheet shows Academic Admin
  // =====================================================================
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobile = await mctx.newPage()
  await login(mobile, MEMBER, "/dashboard")
  await mobile.getByRole("button", { name: "More" }).click()
  await mobile.waitForTimeout(800)
  const mobileShown = (await mobile.locator('[role="dialog"][aria-label="More navigation"]').getByText("Academic Admin", { exact: true }).count()) > 0
  check("Mobile: More sheet shows 'Academic Admin' for the manager", mobileShown)
  await mctx.close()

  // =====================================================================
  // 7. UNAUTHORIZED SECTION — direct URL is denied
  // =====================================================================
  await gotoPage(member, `${APP_URL}/dashboard/academic/admin/${SECOND_YEAR_KEY}`)
  const redirectedAway = !member.url().includes(SECOND_YEAR_KEY)
  check("Manager: direct Second Year URL redirects away (denied)", redirectedAway, member.url().slice(0, 80))

  // =====================================================================
  // 8. DELETE + cleanup
  // =====================================================================
  await gotoPage(member, `${APP_URL}/dashboard/academic/admin/${FIRST_YEAR_KEY}`)
  member.on("dialog", (d) => d.accept())
  const delBtn = member.getByRole("button", { name: `Delete ${SUBJECT_EDITED}` })
  const delVisible = await delBtn.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)
  check("Manager: delete button available for the subject", delVisible)
  if (delVisible) {
    await delBtn.click()
    const deleted = await member.getByText(SUBJECT_EDITED, { exact: true }).waitFor({ state: "detached", timeout: 20000 }).then(() => true).catch(() => false)
    check("Manager: deletes the subject (gone from admin list)", deleted || (await member.getByText(SUBJECT_EDITED, { exact: true }).count()) === 0)
  }

  // Revoke assignment via admin UI.
  const revokeBtn = assignedCard.getByRole("button", { name: "Revoke" })
  const revokeVisible = await revokeBtn.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)
  check("Cleanup: revoke button available", revokeVisible)
  if (revokeVisible) {
    admin.on("dialog", (d) => d.accept())
    await revokeBtn.click()
    const detached = await assignedCard.waitFor({ state: "detached", timeout: 20000 }).then(() => true).catch(() => false)
    check("Cleanup: assignment revoked", detached)
  }

  // =====================================================================
  // 9. POST-REVOCATION — access removed
  // =====================================================================
  const navAfterRevoke = await navHasAcademicAdmin(member)
  check("After revocation: 'Academic Admin' no longer in nav", !navAfterRevoke)

  check("No admin page JS errors", adminErrors.length === 0, adminErrors.join(" | ") || "clean")
  await memberCtx.ctx.close()
  await actx.close()
} catch (err) {
  console.log(`ERROR: ${err.message}`)
  results.push({ name: "script completed", ok: false })
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed > 0 ? 1 : 0)
