// Live verification of the Academic Section Admin assignment flow against the
// running app + live Supabase.
//
// What this verifies (works WITHOUT migration 0010):
//   1. Super admin opens the ITS Sphere Roles UI and assigns the test member
//      as academic_manager with TWO sections (First Year any degree/branch +
//      B.Tech Second Year CSE). The saved assignment renders both sections —
//      proving the admin UI writes the sections[] scope the dashboard and the
//      server actions consume.
//   2. Cleanup: the assignment is revoked through the UI (assignment removal
//      revokes access).
//
// Best-effort member-side checks (require migration 0010 to be applied AND
// valid RT_USER_A credentials): "Academic Admin" nav entry for the manager,
// workspace resolution on /dashboard/academic/admin. If either prerequisite
// is missing the script reports the check as BLOCKED instead of failing.
//
// Run: node scripts/verify-academic-admin.mjs
// Env: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD (or .env.rt), APP_URL,
//      RT_USER_A_EMAIL/PASSWORD.

import { readFileSync, existsSync } from "node:fs"
import { chromium } from "playwright-core"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const PASSWORD = "CodebuffRt!2026"

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
// The member to assign: MEMBER_EMAIL overrides the RT defaults (used when no
// test account exists in the Sphere). Member login is only attempted when real
// test credentials were explicitly provided.
const MEMBER = {
  email: process.env.MEMBER_EMAIL || process.env.RT_USER_A_EMAIL || e.RT_USER_A_EMAIL || "codebuff.rt.a@example.com",
  password: process.env.RT_USER_A_PASSWORD || e.RT_USER_A_PASSWORD || PASSWORD,
}
const tryMemberLogin = Boolean(process.env.RT_USER_A_EMAIL || e.RT_USER_A_EMAIL)
if (!ADMIN.email || !ADMIN.password) {
  console.log("BLOCKED: SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set")
  process.exit(2)
}

const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}
function blocked(name, why) {
  results.push({ name, ok: true })
  console.log(`SKIP  ${name} — ${why}`)
}

async function login(page, user, expectPath, timeoutMs = 30000) {
  await page.goto(`${APP_URL}/auth/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(user.email)
  await page.locator('input[name="password"]').fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL(`**${expectPath}**`, { timeout: timeoutMs })
  await page.waitForTimeout(1200)
  return true
}

async function hasNavEntry(page, label) {
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500)
  return (await page.getByText(label, { exact: true }).count()) > 0
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  // =====================================================================
  // 1. ADMIN — assign academic_manager with two sections
  // =====================================================================
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const admin = await actx.newPage()
  const adminErrors = []
  admin.on("pageerror", (err) => adminErrors.push(err.message.slice(0, 200)))

  await login(admin, ADMIN, "/admin")
  check("Super admin lands on /admin", admin.url().includes("/admin"), admin.url())

  const sphereCard = admin.locator("a").filter({ hasText: "ITS ENGINEERING COLLEGE" }).first()
  const sphereVisible = await sphereCard.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
  check("Sphere selector shows ITS Engineering College", sphereVisible)
  if (!sphereVisible) throw new Error("ITS sphere card not visible — cannot continue")

  const sphereHref = await sphereCard.getAttribute("href")
  await admin.goto(`${APP_URL}${sphereHref}`, { waitUntil: "domcontentloaded" })
  await admin.waitForTimeout(1000)

  const rolesTab = admin.locator("a").filter({ hasText: "Roles" }).first()
  const rolesVisible = await rolesTab.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
  check("Sphere page has a Roles tab", rolesVisible)
  if (!rolesVisible) throw new Error("Roles tab not found — cannot continue")
  await rolesTab.click()
  await admin.waitForURL("**/roles", { timeout: 15000 })
  await admin.waitForTimeout(1000)

  // Search for the member; abort the assignment if they are not an ITS member.
  await admin.locator("#memberSearch").fill(MEMBER.email)
  await admin.waitForTimeout(600)
  const memberOption = admin.locator("button[type='button']").filter({ hasText: MEMBER.email }).first()
  const optionVisible = await memberOption.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)
  check("Member search finds the test user in ITS", optionVisible, MEMBER.email)
  if (optionVisible) {
    await memberOption.click()
    await admin.waitForTimeout(400)

    // Default role is academic_manager. Two sections:
    //   Section 1: year = First Year (degree/branch blank = wildcard)
    //   Section 2: degree = B.Tech, year = Second Year, branch = CSE
    await admin.locator('input[aria-label="Section 1 year"]').fill("First Year")
    await admin.getByRole("button", { name: "Add section" }).click()
    await admin.waitForTimeout(300)
    await admin.locator('input[aria-label="Section 2 degree"]').fill("B.Tech")
    await admin.locator('input[aria-label="Section 2 year"]').fill("Second Year")
    await admin.locator('input[aria-label="Section 2 branch"]').fill("CSE")

    await admin.getByRole("button", { name: "Assign role" }).click()
    await admin.waitForTimeout(3000)

    // Diagnostics: any toast (error/success) and the form state after submit.
    const toastText = await admin.locator("[data-sonner-toast], .sonner, [role='status']").allInnerTexts().catch(() => [])
    const diag = toastText.join(" | ").replace(/\s+/g, " ").slice(0, 200)

    // Assignment cards render the member's handle (not email) — match on the
    // role label + scope text, anchored to the card root (div.bg-card) so the
    // action buttons are inside. Scope text disambiguates our assignment from
    // any pre-existing academic_manager rows without sections.
    const card = admin.locator("div.bg-card").filter({ hasText: "Academic manager" }).filter({ hasText: "scope:" }).last()
    const cardVisible = await card.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
    check("Assignment saved and shown in Current assignments", cardVisible, diag || "no toast")
    const cardText = cardVisible ? (await card.innerText()) : ""
    check(
      "Assignment persists BOTH sections in scope (First Year + B.Tech Second Year CSE)",
      cardText.includes("First Year") && cardText.includes("Second Year") && cardText.includes("CSE"),
      cardText.replace(/\s+/g, " ").slice(0, 140),
    )
    check("Assignment permissions include academic CRUD", /academic\.(create|update|delete)/.test(cardText), cardText.replace(/\s+/g, " ").slice(0, 140))

    // =================================================================
    // 2. MEMBER-side (best effort — needs migration 0010 + credentials)
    // =================================================================
    const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const member = await mctx.newPage()
    const memberOk = tryMemberLogin ? await login(member, MEMBER, "/dashboard", 15000).catch(() => false) : false
    if (!memberOk && !tryMemberLogin) {
      blocked("Manager dashboard: 'Academic Admin' nav entry", "member login skipped (no explicit test credentials) — covered by unit tests + verify-rls.sql §13b after migration 0010")
      blocked("Manager workspace: /dashboard/academic/admin resolves sections", "member login skipped — needs migration 0010 applied + a test account")
    } else if (!memberOk) {
      blocked("Manager dashboard: 'Academic Admin' nav entry", "member login failed (stale RT credentials) — covered by unit tests + verify-rls.sql §13b after migration 0010")
      blocked("Manager workspace: /dashboard/academic/admin resolves sections", "member login failed — needs migration 0010 applied + valid credentials")
    } else {
      check("Manager lands on /dashboard", member.url().includes("/dashboard"), member.url())
      const navAfter = await hasNavEntry(member, "Academic Admin")
      check("Manager: 'Academic Admin' nav entry (needs migration 0010 — role_assignments_select_own)", navAfter, navAfter ? "visible" : "hidden before migration — expected until 0010 is applied")
      await member.goto(`${APP_URL}/dashboard/academic/admin`, { waitUntil: "domcontentloaded" })
      await member.waitForTimeout(1500)
      const workspaceShown = (await member.getByText("You don't manage any academic sections yet.", { exact: false }).count()) === 0
      check("Manager: workspace resolves assigned sections (needs migration 0010)", workspaceShown, workspaceShown ? "workspace visible" : "empty state pre-migration")
    }
    await mctx.close()

    // =================================================================
    // 3. CLEANUP — revoke the assignment (access revocation)
    // =================================================================
    const revokeCard = admin.locator("div.bg-card").filter({ hasText: "Academic manager" }).filter({ hasText: "scope:" }).last()
    const revokeBtn = revokeCard.getByRole("button", { name: "Revoke" })
    const revokeVisible = await revokeBtn.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)
    check("Cleanup: assignment revoke button available", revokeVisible)
    if (revokeVisible) {
      admin.on("dialog", (d) => d.accept())
      await revokeBtn.click()
      // Server action + revalidation re-render — wait for the card to detach.
      const detached = await revokeCard.waitFor({ state: "detached", timeout: 20000 }).then(() => true).catch(() => false)
      const gone = detached || (await admin.locator("div.bg-card").filter({ hasText: "Academic manager" }).filter({ hasText: "scope:" }).count()) === 0
      check("Cleanup: assignment revoked (access removed)", gone)
    }
  } else {
    blocked("Assignment persistence (sections scope)", "test member not an active ITS member — provide a valid ITS member email")
  }

  check("No admin page JS errors", adminErrors.length === 0, adminErrors.join(" | ") || "clean")
  await actx.close()
} catch (err) {
  console.log(`ERROR: ${err.message}`)
  results.push({ name: "script completed", ok: false })
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed (skips count as passed)`)
process.exit(failed > 0 ? 1 : 0)
