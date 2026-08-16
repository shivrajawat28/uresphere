// Live E2E: promotion payment QR/UTR states end-to-end.
//
// Covers the full admin-config → user-payment → review pipeline:
//   1. Super admin configures the promotion payment (fee, duration, UPI id,
//      instructions) and uploads the payment QR through the app's own UI.
//   2. Member submits a promotion → sees the configured fee + QR image + UPI
//      id + instructions.
//   3. Member submits a UTR → "Payment submitted — awaiting verification" with
//      the UTR shown back to them.
//   4. Promotion moderator verifies the payment → member sees "Payment
//      verified"; then approves → member sees "Approved — live" and the
//      promotion appears in the Sphere's Live section.
//   5. Cleanup: the original platform payment config is restored EXACTLY
//      (fee/QR/UPI/instructions), roles revoked and test promotions rejected.
//
// Migration dependency: steps 1 and 4 need migration 0011 applied to the live
// project (platform_config INSERT policy for the config upsert, and the
// section-manager write policies). Without it the script runs the user-side
// flow against the existing config and clearly reports the blocked checks.
//
// Run: node scripts/verify-promotions-payment.mjs
// Env: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD (or .env.rt), APP_URL,
//      RT_PAYMENT_EMAIL/PASSWORD (defaults to codebuff.payment@example.com).

import { readFileSync, existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const PASSWORD = "CodebuffRt!2026"
const COLLEGE = "ITS Engineering College"
const MEMBER_EMAIL = "codebuff.payment@example.com"

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
  email: process.env.RT_PAYMENT_EMAIL || e.RT_PAYMENT_EMAIL || MEMBER_EMAIL,
  password: process.env.RT_PAYMENT_PASSWORD || e.RT_PAYMENT_PASSWORD || PASSWORD,
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

// 0011 probe (notify_user only exists post-0011; null id returns immediately).
const probe = await sb.rpc("notify_user", { p_user_id: null, p_type: "probe", p_title: "probe", p_body: "", p_link: null })
const MIGRATION_0011_APPLIED = !probe.error

// Capture the CURRENT platform payment config so cleanup can restore it exactly.
const adminSession = await apiSession(ADMIN)
let ORIGINAL_CONFIG = null
if (adminSession) {
  const { data } = await sb.from("platform_config").select("value").eq("key", "promotion_payment")
  ORIGINAL_CONFIG = (data?.[0]?.value ?? null)
}
console.log(`migration 0011 applied to live DB: ${MIGRATION_0011_APPLIED}`)
console.log(`original promotion_payment config: ${JSON.stringify(ORIGINAL_CONFIG)}`)

const PROMO_TITLE = `Payment flow E2E ${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
const UTR = "PAYUTR2026"
const TEST_FEE = 25
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
  await typeControlled(page, "#realName", "Codebuff Payment RT")
  await typeControlled(page, "#phone", "9999900044")
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
  // Use a DEDICATED client for the member's session so the shared `sb` client
  // (used later by the cleanup restore with the admin session) is never
  // re-authenticated as the member.
  const memberSb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const session = await memberSb.auth.signInWithPassword({ email: MEMBER.email, password: MEMBER.password }).then((r) => (r.error ? null : r.data))
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

// Revoke the promotion_moderator assignment (idempotent).
async function revokePromotionModerator(admin, sphereHref) {
  await gotoPage(admin, `${APP_URL}${sphereHref}`, "text=Manage roles")
  await admin.locator("a").filter({ hasText: "Manage roles" }).first().click()
  await admin.waitForURL("**/roles", { timeout: 20000 })
  await admin.waitForTimeout(1200)
  admin.on("dialog", (d) => d.accept())
  const card = admin.locator("div.bg-card").filter({ hasText: "Promotion moderator" }).last()
  const revoke = card.getByRole("button", { name: "Revoke" })
  if (await revoke.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)) {
    await revoke.click()
    await admin.waitForTimeout(3500)
  }
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  // =====================================================================
  // 0. START CLEAN — revoke leftover assignment, reject leftover test promos
  // =====================================================================
  // API-level cleanup first (robust against UI hiccups): reject any leftover
  // test promotions (approved or pending) and revoke the leftover moderator
  // assignment for the test member.
  if (adminSession) {
    await sb.from("promotions").update({ status: "rejected" }).like("title", "Payment flow E2E%")
    const memberSb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const memberRes = await memberSb.auth.signInWithPassword({ email: MEMBER.email, password: MEMBER.password })
    if (!memberRes.error && memberRes.data.user) {
      await sb.from("role_assignments").delete().eq("role", "promotion_moderator").eq("user_id", memberRes.data.user.id)
    }
  }
  const prepCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const prep = await prepCtx.newPage()
  await login(prep, ADMIN, "/admin")
  const sphereCard = prep.locator("a").filter({ hasText: "ITS ENGINEERING COLLEGE" }).first()
  await sphereCard.waitFor({ state: "visible", timeout: 20000 })
  const sphereHref = await sphereCard.getAttribute("href")
  await revokePromotionModerator(prep, sphereHref)
  await prepCtx.close()

  // =====================================================================
  // 1. PROVISION the test member (ITS)
  // =====================================================================
  const memberCtx = await ensureMember(browser)
  const member = memberCtx.page
  console.log(`  member: ${MEMBER.email} (${memberCtx.created ? "signed up" : "existing"})`)
  check("Test member lands on /dashboard", member.url().includes("/dashboard"), member.url())

  // =====================================================================
  // 2. SUPER ADMIN — configure payment + upload QR (needs 0011 for the save)
  // =====================================================================
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const admin = await actx.newPage()
  const adminErrors = []
  admin.on("pageerror", (err) => adminErrors.push(err.message.slice(0, 120)))

  await login(admin, ADMIN, "/admin")
  await admin.getByRole("tab", { name: "Promotions" }).click()
  await admin.waitForTimeout(1000)

  // 1x1 PNG used as the QR fixture.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  )

  if (MIGRATION_0011_APPLIED) {
    await typeControlled(admin, "#promoPrice", String(TEST_FEE))
    await typeControlled(admin, "#promoDuration", "2")
    await typeControlled(admin, "#promoUpi", "uresphere@upi")
    await typeControlled(admin, "#promoInstructions", `Pay ₹${TEST_FEE} via the QR and enter your UTR below.`)

    // If a QR is already set (e.g. a leftover from an aborted run), the file
    // input is hidden behind the preview — remove it first so the input shows.
    const existingPreview = admin.locator('img[alt="Payment QR preview"]')
    if ((await existingPreview.count()) > 0) {
      await admin.getByRole("button", { name: "Remove" }).first().click()
      await admin.waitForTimeout(1200)
    }

    // Upload the QR through the real UI (hidden file input) so the component
    // state holds the blob URL before saving.
    await admin.locator('input[type="file"]').setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: png })
    const preview = admin.locator('img[alt="Payment QR preview"]')
    const previewShown = await preview.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
    check("Super admin: QR upload shows a preview in the config form", previewShown)
    if (previewShown) {
      await admin.getByRole("button", { name: "Save payment settings" }).click()
      await admin.waitForTimeout(4000)
      const toasts = await admin.locator("[data-sonner-toast]").allTextContents()
      console.log(`    save toasts: ${JSON.stringify(toasts)}`)
      check("Super admin: saves fee/QR/UPI/instructions", toasts.some((t) => /saved/i.test(t)), toasts.join(" | "))
    }
    // Confirm persistence.
    await admin.reload({ waitUntil: "commit", timeout: 90000 })
    await admin.waitForTimeout(2000)
    await admin.getByRole("tab", { name: "Promotions" }).click()
    await admin.waitForTimeout(1000)
    const savedPrice = await admin.inputValue("#promoPrice").catch(() => "")
    const qrPreviewAfter = (await admin.locator('img[alt="Payment QR preview"]').count()) > 0
    check("Super admin: config persisted (fee ₹25 + QR after reload)", savedPrice === String(TEST_FEE) && qrPreviewAfter, `fee=${savedPrice}, qr=${qrPreviewAfter}`)
  } else {
    console.log("  NOTE: migration 0011 not applied — config save + QR display checks are skipped (need its platform_config INSERT policy).")
  }

  // =====================================================================
  // 3. SUPER ADMIN — assign promotion_moderator
  // =====================================================================
  await gotoPage(admin, `${APP_URL}${sphereHref}`, "text=Manage roles")
  await admin.locator("a").filter({ hasText: "Manage roles" }).first().click()
  await admin.waitForURL("**/roles", { timeout: 20000 })
  await admin.waitForTimeout(1200)
  await admin.locator("#memberSearch").waitFor({ state: "visible", timeout: 20000 })
  await admin.locator("#memberSearch").fill(MEMBER.email)
  await admin.waitForTimeout(800)
  const option = admin.locator("button[type='button']").filter({ hasText: MEMBER.email }).first()
  await option.waitFor({ state: "visible", timeout: 8000 })
  await option.click()
  await admin.waitForTimeout(400)
  await admin.locator('[role="combobox"]').first().click()
  await admin.waitForTimeout(400)
  await admin.getByRole("option", { name: "Promotion moderator" }).click()
  await admin.waitForTimeout(400)
  await admin.getByRole("button", { name: "Assign role" }).click()
  const assignedCard = admin.locator("div.bg-card").filter({ hasText: "Promotion moderator" }).last()
  const assigned = await assignedCard.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
  check("Admin: assigns promotion_moderator", assigned)

  // =====================================================================
  // 4. MEMBER — submit promotion → payment states
  // =====================================================================
  await gotoPage(member, `${APP_URL}/dashboard/promotions`)
  await typeControlled(member, "#title", PROMO_TITLE)
  await typeControlled(member, "#url", "https://example.com/payment-flow-e2e")
  await member.getByRole("button", { name: "Submit for review" }).click()
  await member.waitForTimeout(4000)
  const submitted = await member.getByText(PROMO_TITLE, { exact: true }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
  check("Member: submits a promotion for review", submitted)

  if (MIGRATION_0011_APPLIED) {
    // Configured payment block: fee, instructions, UPI id and the uploaded QR.
    // All wait-based — dev cold-compiles can outlast a fixed sleep.
    const feeShown = await member.getByText(`Pay ₹${TEST_FEE} to make this live`, { exact: false }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
    check("Member: sees the configured fee (₹25)", feeShown)
    const instrShown = await member.getByText(`Pay ₹${TEST_FEE} via the QR and enter your UTR below.`, { exact: false }).first().waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    check("Member: sees payment instructions", instrShown)
    const upiShown = await member.getByText("uresphere@upi", { exact: true }).first().waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    check("Member: sees the UPI id", upiShown)
    const qrShown = await member.locator('img[alt="Payment QR code"]').waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    check("Member: QR shown from the admin-uploaded config", qrShown)
  } else {
    // Pre-0011: the live config is the ₹10 seed with no QR — the member sees
    // the safe no-QR message, never a broken image.
    check("Member: sees the seed fee (₹10)", (await member.getByText("Pay ₹10 to make this live", { exact: false }).count()) > 0)
    check("Member: no-QR state shows a safe message (no broken image)", (await member.getByText("Payment QR not configured yet — check back soon.", { exact: false }).count()) > 0)
  }

  // UTR submission → "awaiting verification" with the UTR shown back.
  await typeControlled(member, "input[placeholder*='4242 8509 1182']", UTR)
  await member.getByRole("button", { name: "I've paid — verify my UTR" }).first().click()
  const awaiting = await member.getByText("Payment submitted — awaiting verification", { exact: false }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
  check("Member: UTR submitted → 'awaiting verification' state", awaiting)
  const utrShown = await member.getByText(UTR, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
  check("Member: sees their submitted UTR", utrShown)

  // =====================================================================
  // 5. MODERATOR — verify payment, then approve (needs 0011 RLS)
  // =====================================================================
  if (MIGRATION_0011_APPLIED) {
    await gotoPage(member, `${APP_URL}/dashboard/promotions/admin`, "text=Submissions")
    check("Manager: Promotions Admin opens", member.url().includes("/dashboard/promotions/admin"))
    check("Manager: sees the submission", await member.getByText(PROMO_TITLE, { exact: true }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false))
    check("Manager: sees the submitted UTR", await member.getByText(UTR, { exact: true }).first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false))

    // Verify payment (approve button is disabled until the fee is settled).
    const verifyBtn = member.getByRole("button", { name: "Verify payment" }).first()
    const verifyVisible = await verifyBtn.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    check("Manager: can verify the payment", verifyVisible)
    if (verifyVisible) {
      await verifyBtn.click()
      await member.waitForTimeout(3500)
      check("Manager: payment marked verified", (await member.getByText("Payment verified", { exact: false }).count()) > 0)
    }

    // Approve → the member's own card flips to Approved + Live section shows it.
    const approveBtn = member.getByRole("button", { name: "Approve" }).first()
    const approveVisible = await approveBtn.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    check("Manager: can approve after payment is verified", approveVisible)
    if (approveVisible) {
      await approveBtn.click()
      await member.waitForTimeout(3500)
    }

    // Member-facing state: approved + live in the Sphere. The label check
    // waits for visibility (dev cold-compiles can outlast the gotoPage settle).
    await gotoPage(member, `${APP_URL}/dashboard/promotions`)
    const approvedLabel = await member
      .getByText("Approved — live", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    check("Member: own submission shows 'Approved — live'", approvedLabel)
    const liveShown = await member.getByText(PROMO_TITLE, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    check("Member: approved promotion appears in the Live section", liveShown)
  } else {
    console.log("  NOTE: migration 0011 not applied — verify/approve RLS checks skipped (they need the 0011 promotions update policy).")
  }

  // =====================================================================
  // 6. CLEANUP — restore the EXACT original config + revoke + reject
  // =====================================================================
  try {
    if (ORIGINAL_CONFIG && adminSession) {
      // Restore via a plain UPDATE (works without 0011; super-admin policy).
      // Verify by re-reading the row — an UPDATE matching 0 rows returns no
      // error, so a bare `!restore.error` check is not proof of persistence.
      const restore = await sb.from("platform_config").update({ value: ORIGINAL_CONFIG }).eq("key", "promotion_payment")
      let restored = !restore.error
      if (restored) {
        const { data: reread } = await sb.from("platform_config").select("value").eq("key", "promotion_payment").maybeSingle()
        restored = JSON.stringify(reread?.value ?? null) === JSON.stringify(ORIGINAL_CONFIG)
        if (!restored) {
          // Retry once (transient RLS/session hiccup).
          const retry = await sb.from("platform_config").update({ value: ORIGINAL_CONFIG }).eq("key", "promotion_payment")
          const { data: reread2 } = await sb.from("platform_config").select("value").eq("key", "promotion_payment").maybeSingle()
          restored = !retry.error && JSON.stringify(reread2?.value ?? null) === JSON.stringify(ORIGINAL_CONFIG)
        }
      }
      check("Cleanup: original payment config restored exactly", restored, restored ? "" : `now=${JSON.stringify((await sb.from("platform_config").select("value").eq("key", "promotion_payment").maybeSingle()).data?.value ?? null)?.slice(0, 120)}`)
    }
    await revokePromotionModerator(admin, sphereHref)
    await admin.reload({ waitUntil: "commit", timeout: 60000 })
    await admin.waitForTimeout(2000)
    const leftoverRoles = await admin.locator("div.bg-card").filter({ hasText: "Promotion moderator" }).count()
    check("Cleanup: promotion_moderator revoked", leftoverRoles === 0)

    await gotoPage(admin, `${APP_URL}${sphereHref}`, "text=Promotions")
    await admin.getByRole("tab", { name: /Promotions/ }).click()
    await admin.waitForTimeout(1500)
    const promoCards = admin.locator("div.bg-card").filter({ hasText: "Payment flow E2E" })
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
    console.log(`  NOTE: cleanup hiccup (${err.message.slice(0, 80)}) — retried by the next run's start-clean step.`)
  }

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
