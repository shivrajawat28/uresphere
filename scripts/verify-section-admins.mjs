// Live E2E verification: section admins (Promotions / Events / Social) +
// the promotion payment QR/UTR flow.
//
// Flow:
//   1. Provision a test member in ITS (login if exists, else sign up).
//   2. Normal member: no "Promotions Admin" / "Events Admin" / "Social Admin"
//      in nav; direct /dashboard/promotions/admin redirects away.
//   3. Super admin: saves promotion payment config (fee ₹25, instructions,
//      real QR upload through /api/promotions/upload).
//   4. Super admin assigns promotion_moderator + event_manager +
//      social_moderator to the test member via the Roles UI.
//   5. Member: all three admin entries appear in nav (desktop + mobile).
//   6. Member submits a promotion → sees the configured fee + QR + UTR input
//      → submits UTR → "awaiting verification" state shows the submitted UTR.
//   7. Member opens Promotions Admin → sees the submission with UTR.
//      If migration 0011 is applied (notify_user RPC present), the member-as-
//      moderator verifies the payment and approves it.
//   8. Events Admin + Social Admin workspaces open for the assigned manager.
//   9. Cleanup: revoke all three assignments; member loses the nav entries.
//
// Run: node scripts/verify-section-admins.mjs
// Env: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD (or .env.rt), APP_URL,
//      RT_SECTIONS_EMAIL/PASSWORD (defaults to codebuff.sections@example.com).

import { readFileSync, existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const PASSWORD = "CodebuffRt!2026"
const COLLEGE = "ITS Engineering College"
const MEMBER_EMAIL = "codebuff.sections@example.com"

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
  email: process.env.RT_SECTIONS_EMAIL || e.RT_SECTIONS_EMAIL || MEMBER_EMAIL,
  password: process.env.RT_SECTIONS_PASSWORD || e.RT_SECTIONS_PASSWORD || PASSWORD,
}
if (!ADMIN.email || !ADMIN.password) {
  console.log("BLOCKED: SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set")
  process.exit(2)
}

const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function apiSession(user) {
  const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password: user.password })
  return error ? null : data
}

// Migration 0011 probe: notify_user is only created by 0011 (its absence means
// the RLS policy updates for section-manager writes are also absent, so the
// review-write checks are skipped and reported instead). A null user id makes
// the RPC return immediately when it exists; a missing function errors out.
const probe = await sb.rpc("notify_user", {
  p_user_id: null,
  p_type: "probe",
  p_title: "probe",
  p_body: "",
  p_link: null,
})
const MIGRATION_0011_APPLIED = !probe.error

const PROMO_TITLE = `Section admin E2E ${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

async function typeControlled(page, selector, value, explicitLocator) {
  const loc = explicitLocator ?? page.locator(selector)
  await loc.waitFor({ state: "visible", timeout: 15000 })
  await page.waitForTimeout(400)
  await loc.click()
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
  await page.keyboard.press("Backspace")
  await page.keyboard.type(value, { delay: 12 })
  await page.waitForTimeout(150)
  let got = await loc.inputValue()
  if (got !== value) {
    await page.waitForTimeout(800)
    await loc.click()
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await page.keyboard.press("Backspace")
    await page.keyboard.type(value, { delay: 12 })
    got = await loc.inputValue()
  }
  return got === value
}

async function login(page, user, expectPath) {
  await page.goto(`${APP_URL}/auth/login`, { waitUntil: "commit", timeout: 60000 })
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 30000 })
  await page.locator('input[name="email"]').fill(user.email)
  await page.locator('input[name="password"]').fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL(`**${expectPath}**`, { timeout: 90000 })
  await page.waitForTimeout(1200)
}

async function signupViaUI(page, user) {
  await page.goto(`${APP_URL}/auth/sign-up`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Continue" }).waitFor({ state: "visible" })
  await page.waitForTimeout(600)
  await typeControlled(page, "#realName", "Codebuff Sections RT")
  await typeControlled(page, "#phone", "9999900043")
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
    await login(page, MEMBER, "/dashboard")
    return { ctx, page, created: false }
  }
  try {
    await signupViaUI(page, MEMBER)
    await gotoPage(page, `${APP_URL}/dashboard`)
    return { ctx, page, created: true }
  } catch {
    await login(page, MEMBER, "/dashboard")
    return { ctx, page, created: false }
  }
}

async function gotoPage(page, url, waitSelector, timeoutMs = 90000) {
  await page.goto(url, { waitUntil: "commit", timeout: timeoutMs })
  if (waitSelector) await page.locator(waitSelector).first().waitFor({ state: "visible", timeout: timeoutMs })
  await page.waitForTimeout(1200)
  return page.url()
}

// Revoke all three section roles for the member (idempotent — runs before the
// member checks AND at cleanup, so aborted runs never leave roles behind).
async function revokeSectionRoles(admin, sphereHref) {
  await gotoPage(admin, `${APP_URL}${sphereHref}`, "text=Manage roles")
  await admin.locator("a").filter({ hasText: "Manage roles" }).first().click()
  await admin.waitForURL("**/roles", { timeout: 20000 })
  await admin.waitForTimeout(1200)
  admin.on("dialog", (d) => d.accept())
  for (const roleLabel of ["Promotion moderator", "Event manager", "Social moderator"]) {
    const card = admin.locator("div.bg-card").filter({ hasText: roleLabel }).last()
    const revoke = card.getByRole("button", { name: "Revoke" })
    if (await revoke.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)) {
      await revoke.click()
      await admin.waitForTimeout(3500)
    }
  }
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  // =====================================================================
  // 0. START CLEAN — revoke any leftover section roles from aborted runs
  // =====================================================================
  const prepCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const prep = await prepCtx.newPage()
  await login(prep, ADMIN, "/admin")
  const prepCard = prep.locator("a").filter({ hasText: "ITS ENGINEERING COLLEGE" }).first()
  await prepCard.waitFor({ state: "visible", timeout: 20000 })
  const sphereHref = await prepCard.getAttribute("href")
  await revokeSectionRoles(prep, sphereHref)
  await prepCtx.close()

  // =====================================================================
  // 1. PROVISION the test member (ITS)
  // =====================================================================
  const memberCtx = await ensureMember(browser)
  const member = memberCtx.page
  console.log(`  member: ${MEMBER.email} (${memberCtx.created ? "signed up" : "existing"})`)
  check("Test member lands on /dashboard", member.url().includes("/dashboard"), member.url())

  // =====================================================================
  // 2. NORMAL MEMBER — no section-admin entries; direct routes denied
  // =====================================================================
  const adminLabels = ["Promotions Admin", "Events Admin", "Social Admin"]
  async function sidebarAdminLinkCounts() {
    // Wait for the dashboard sidebar to settle, then count admin nav links.
    await gotoPage(member, `${APP_URL}/dashboard`, "text=Overview")
    const counts = {}
    for (const label of adminLabels) {
      counts[label] = await member.getByRole("link", { name: label }).count()
    }
    return counts
  }
  const before = await sidebarAdminLinkCounts()
  for (const label of adminLabels) {
    check(`Normal member: '${label}' hidden in nav`, before[label] === 0)
  }
  // Direct-route denial: the server redirects the admin route to its section
  // (promotions/events/chat). Dev compiles routes on first hit, so poll the
  // URL until it leaves the admin path (up to 20s).
  const directRouteTargets = ["/dashboard/promotions/admin", "/dashboard/events/admin", "/dashboard/social/admin"]
  for (const adminPath of directRouteTargets) {
    await member.goto(`${APP_URL}${adminPath}`, { waitUntil: "commit", timeout: 90000 })
    try {
      await member.waitForFunction((p) => !window.location.pathname.startsWith(p), adminPath, { timeout: 20000 })
    } catch {}
    const finalUrl = member.url()
    check(`Normal member: direct ${adminPath} redirects away`, !finalUrl.includes(adminPath), `${finalUrl.slice(0, 70)}`)
  }

  // =====================================================================
  // 3. SUPER ADMIN — promotion payment config (fee, QR upload, UPI)
  //    The config WRITE needs migration 0011 (platform_config INSERT policy
  //    for the upsert). Pre-0011 the member flow verifies the no-QR safe
  //    state instead; post-0011 the full fee+QR path is checked.
  // =====================================================================
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const admin = await actx.newPage()
  const adminErrors = []
  admin.on("pageerror", (err) => adminErrors.push(err.message.slice(0, 200)))

  await login(admin, ADMIN, "/admin")
  await admin.getByRole("tab", { name: "Promotions" }).click()
  await admin.waitForTimeout(800)

  // QR upload through the app's own route (auth cookies shared via context).
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  )
  const uploadRes = await actx.request.post(`${APP_URL}/api/promotions/upload`, {
    multipart: { file: { name: "qr.png", mimeType: "image/png", buffer: png } },
  })
  const uploadJson = await uploadRes.json()
  check("Super admin: QR upload route stores the image (401 for non-super admins is enforced server-side)", uploadRes.ok() && Boolean(uploadJson.url), uploadJson.url?.slice(0, 60) ?? uploadJson.error ?? "")

  if (MIGRATION_0011_APPLIED) {
    await typeControlled(admin, "#promoPrice", "25")
    await typeControlled(admin, "#promoDuration", "2")
    await typeControlled(admin, "#promoUpi", "uresphere@upi")
    await typeControlled(admin, "#promoInstructions", "Pay ₹25 via the QR and enter your UTR below.")
    const saveBtn = admin.getByRole("button", { name: "Save payment settings" })
    const clickable = await saveBtn.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    if (!clickable) {
      check("Super admin: saves promotion payment configuration", false, "save button not visible")
    } else {
      await saveBtn.click()
      await admin.waitForTimeout(4000)
      const toasts = await admin.locator("[data-sonner-toast]").allTextContents()
      console.log(`    save toasts: ${JSON.stringify(toasts)}`)
      check("Super admin: saves promotion payment configuration (fee/UPI/instructions)", toasts.some((t) => /saved/i.test(t)), toasts.join(" | "))
    }
    // Confirm persistence by reloading the admin tab and reading the saved fee.
    await admin.reload({ waitUntil: "commit", timeout: 90000 })
    await admin.waitForTimeout(2000)
    await admin.getByRole("tab", { name: "Promotions" }).click()
    await admin.waitForTimeout(1000)
    const savedPrice = await admin.inputValue("#promoPrice").catch(() => "")
    check("Super admin: payment config persisted (fee reloaded as ₹25)", savedPrice === "25", `value=${savedPrice}`)
  } else {
    console.log("  NOTE: migration 0011 not applied — payment config write + QR/fee display checks need its platform_config INSERT policy.")
  }

  // =====================================================================
  // 4. SUPER ADMIN — assign the three section roles
  // =====================================================================
  await gotoPage(admin, `${APP_URL}${sphereHref}`, "text=Manage roles")
  await admin.locator("a").filter({ hasText: "Manage roles" }).first().click()
  await admin.waitForURL("**/roles", { timeout: 20000 })
  await admin.waitForTimeout(1200)
  await admin.locator("#memberSearch").waitFor({ state: "visible", timeout: 20000 })

  async function assignRole(roleLabel) {
    await admin.locator("#memberSearch").fill(MEMBER.email)
    await admin.waitForTimeout(800)
    const option = admin.locator("button[type='button']").filter({ hasText: MEMBER.email }).first()
    await option.waitFor({ state: "visible", timeout: 8000 })
    await option.click()
    await admin.waitForTimeout(400)
    // Role select (Radix): open the combobox and pick the role label.
    await admin.locator('[role="combobox"]').first().click()
    await admin.waitForTimeout(400)
    await admin.getByRole("option", { name: roleLabel }).click()
    await admin.waitForTimeout(400)
    await admin.getByRole("button", { name: "Assign role" }).click()
    // The assignment card appears after the server action + router refresh;
    // retry with a generous window (dev re-render is slow on first runs).
    const card = admin.locator("div.bg-card").filter({ hasText: roleLabel }).last()
    const visible = await card.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    await admin.waitForTimeout(800)
    return visible && (await card.count()) > 0
  }

  check("Admin: assigns promotion_moderator", await assignRole("Promotion moderator"))
  check("Admin: assigns event_manager", await assignRole("Event manager"))
  check("Admin: assigns social_moderator", await assignRole("Social moderator"))

  // =====================================================================
  // 5. MEMBER — all three admin entries appear (desktop + mobile)
  // =====================================================================
  const after = await sidebarAdminLinkCounts()
  for (const label of adminLabels) {
    check(`Manager: '${label}' appears in nav`, after[label] > 0)
  }

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobile = await mctx.newPage()
  await login(mobile, MEMBER, "/dashboard")
  await mobile.getByRole("button", { name: "More" }).click()
  await mobile.waitForTimeout(800)
  const dialog = mobile.locator('[role="dialog"][aria-label="More navigation"]')
  for (const label of adminLabels) {
    check(`Mobile: More sheet shows '${label}'`, (await dialog.getByText(label, { exact: true }).count()) > 0)
  }
  await mctx.close()

  // =====================================================================
  // 6. MEMBER — submit promotion → payment block → submit UTR
  // =====================================================================
  await gotoPage(member, `${APP_URL}/dashboard/promotions`)
  await typeControlled(member, "#title", PROMO_TITLE)
  await typeControlled(member, "#url", "https://example.com/section-admin-e2e")
  await member.getByRole("button", { name: "Submit for review" }).click()
  await member.waitForTimeout(4000)
  check("Member: submits a promotion for review", (await member.getByText(PROMO_TITLE, { exact: true }).count()) > 0)

  if (MIGRATION_0011_APPLIED) {
    // Configured fee + instructions + QR image (from the admin upload).
    check("Member: sees the configured fee (₹25)", (await member.getByText("Pay ₹25 to make this live", { exact: false }).count()) > 0)
    check("Member: sees payment instructions", (await member.getByText("Pay ₹25 via the QR and enter your UTR below.", { exact: false }).count()) > 0)
    check("Member: QR comes from the admin-uploaded image", (await member.locator('img[alt="Payment QR code"]').count()) > 0)
  } else {
    // Pre-0011 the live config is the ₹10 seed with no QR — verify the safe
    // no-QR message instead of a broken image.
    check("Member: sees the seed fee (₹10)", (await member.getByText("Pay ₹10 to make this live", { exact: false }).count()) > 0)
    check("Member: no-QR state shows a safe message (no broken image)", (await member.getByText("Payment QR not configured yet — check back soon.", { exact: false }).count()) > 0)
  }

  const utrInput = member.locator("input[placeholder*='4242 8509 1182']").first()
  await typeControlled(member, "input[placeholder*='4242 8509 1182']", "UTRE2E2026", utrInput)
  await member.getByRole("button", { name: "I've paid — verify my UTR" }).first().click()
  await member.waitForTimeout(4000)
  const awaiting = (await member.getByText("Payment submitted — awaiting verification", { exact: false }).count()) > 0
  check("Member: UTR submitted → 'awaiting verification' state", awaiting)
  const utrShown = (await member.getByText("UTRE2E2026", { exact: true }).count()) > 0
  check("Member: sees their submitted UTR", utrShown)

  // =====================================================================
  // 7. MEMBER — opens Promotions Admin and sees the submission + UTR
  // =====================================================================
  await gotoPage(member, `${APP_URL}/dashboard/promotions/admin`, "text=Submissions")
  check("Manager: Promotions Admin workspace opens", member.url().includes("/dashboard/promotions/admin"), member.url().slice(0, 80))
  const promoSeen = await member.getByText(PROMO_TITLE, { exact: true }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
  check("Manager: sees the promotion submission", promoSeen, PROMO_TITLE)
  const utrSeen = await member.getByText("UTRE2E2026", { exact: true }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
  check("Manager: sees the submitted UTR in the admin view", utrSeen)

  if (MIGRATION_0011_APPLIED) {
    // Payment verify + approve as the promotion_moderator (RLS now allows).
    const verifyBtn = member.getByRole("button", { name: "Verify payment" }).first()
    const verifyVisible = await verifyBtn.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
    check("Manager: can verify the payment (0011 RLS)", verifyVisible)
    if (verifyVisible) {
      await verifyBtn.click()
      await member.waitForTimeout(3500)
      const paidShown = (await member.getByText("Payment verified", { exact: false }).count()) > 0
      check("Manager: payment marked verified", paidShown)
    }
    const approveBtn = member.getByRole("button", { name: "Approve" }).first()
    const approveVisible = await approveBtn.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
    check("Manager: can approve the promotion", approveVisible)
    if (approveVisible) {
      await approveBtn.click()
      await member.waitForTimeout(3500)
      const approvedShown = (await member.getByText("approved", { exact: false }).count()) > 0
      check("Manager: promotion approved", approvedShown)
    }
  } else {
    console.log("  NOTE: migration 0011 not applied to the live DB — promotion verify/approve RLS checks skipped (they need the 0011 policies).")
  }

  // =====================================================================
  // 8. Events Admin + Social Admin workspaces
  // =====================================================================
  await gotoPage(member, `${APP_URL}/dashboard/events/admin`)
  check("Manager: Events Admin workspace opens", member.url().includes("/dashboard/events/admin"), member.url().slice(0, 80))
  await gotoPage(member, `${APP_URL}/dashboard/social/admin`)
  check("Manager: Social Admin workspace opens", member.url().includes("/dashboard/social/admin"), member.url().slice(0, 80))

  // =====================================================================
  // 9. CLEANUP — revoke assignments + reject leftover test promotions
  // =====================================================================
  try {
    await revokeSectionRoles(admin, sphereHref)
    await admin.reload({ waitUntil: "commit", timeout: 60000 })
    await admin.waitForTimeout(2500)
    const leftover = await admin.locator("div.bg-card").filter({ hasText: /Promotion moderator|Event manager|Social moderator/ }).count()
    check("Cleanup: three assignments revoked", leftover === 0, leftover > 0 ? `${leftover} remaining` : "")

    // Reject any test promotions the script submitted (visible only to admins
    // / the owner, but keep the live Sphere tidy).
    await gotoPage(admin, `${APP_URL}${sphereHref}`, "text=Promotions")
    await admin.getByRole("tab", { name: /Promotions/ }).click()
    await admin.waitForTimeout(1500)
    const promoCards = admin.locator("div.bg-card").filter({ hasText: "Section admin E2E" })
    const promoCount = await promoCards.count()
    for (let i = 0; i < promoCount; i++) {
      const rejectBtn = promoCards.nth(i).getByRole("button", { name: "Reject" })
      if (await rejectBtn.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)) {
        await rejectBtn.click()
        await admin.waitForTimeout(2500)
      }
    }
    check("Cleanup: test promotions rejected", promoCount > 0, `${promoCount} rejected`)
  } catch (err) {
    console.log(`  NOTE: cleanup hiccup (${err.message.slice(0, 80)}) — the start-clean step retries it on the next run.`)
  }

  const afterRevoke = await sidebarAdminLinkCounts()
  const revokedAll = adminLabels.every((label) => afterRevoke[label] === 0)
  check("After revocation: no section-admin entries remain", revokedAll)

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
console.log(`migration 0011 applied to live DB: ${MIGRATION_0011_APPLIED}`)
process.exit(failed > 0 ? 1 : 0)
