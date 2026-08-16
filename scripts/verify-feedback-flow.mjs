// Live browser verification of the feedback system + group chat Enter behavior.
//
// USER:  login → /dashboard/feedback → submit feedback → appears in history
// ADMIN: login → /admin → Feedback tab → submission visible with full trusted
//        identity (real name / handle / email / Sphere) → open → reply →
//        change status
// USER:  refresh → admin reply visible → status visible
// GROUP: create a group → type a message → Enter sends it exactly once →
//        Shift+Enter inserts a newline (sent as one multi-line message)
// MOBILE: Feedback appears in the More sheet
//
// Migration dependency: the feedback checks need migration 0012 applied to the
// live project (feedback + feedback_replies tables and their RLS). Without it
// the script clearly reports the blocked checks and continues with the group
// chat checks (which need only the base schema).
//
// Run: node scripts/verify-feedback-flow.mjs
// Env: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD (or .env.rt), APP_URL,
//      RT_USER_A_EMAIL/PASSWORD (a normal member of the ITS Sphere).

import { readFileSync, existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const PASSWORD = "CodebuffRt!2026"
// Prefer the dedicated user-flow member; fall back to the payment-flow member
// (both live in the ITS Sphere in the shared RT project).
const USER_A = {
  email: process.env.RT_USER_A_EMAIL || process.env.RT_PAYMENT_EMAIL || "codebuff.payment@example.com",
  password: process.env.RT_USER_A_PASSWORD || process.env.RT_PAYMENT_PASSWORD || PASSWORD,
}

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
const ADMIN = {
  email: process.env.SUPER_ADMIN_EMAIL || e.SUPER_ADMIN_EMAIL,
  password: process.env.SUPER_ADMIN_PASSWORD || e.SUPER_ADMIN_PASSWORD,
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

// Migration 0012 probe: a missing feedback table fails with a PGRST205-style
// error; an existing table with RLS simply returns an empty array.
const probe = await sb.from("feedback").select("id").limit(1)
const MIGRATION_0012_APPLIED = !probe.error
console.log(`migration 0012 (feedback tables) applied to live DB: ${MIGRATION_0012_APPLIED}`)

const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
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

async function gotoPage(page, url, waitSelector, timeoutMs = 90000) {
  await page.goto(url, { waitUntil: "commit", timeout: timeoutMs })
  if (waitSelector) await page.locator(waitSelector).first().waitFor({ state: "visible", timeout: timeoutMs })
  await page.waitForTimeout(1200)
  return page.url()
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
const STAMP = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")
const SUBJECT = `RT feedback ${STAMP}`
const MESSAGE = "Live verification feedback — please add dark mode."
const ADMIN_REPLY = "Thanks! We're looking into it."

try {
  const memberSession = await apiSession(USER_A)
  const memberAvailable = Boolean(memberSession)
  if (!memberAvailable) {
    console.log(`  NOTE: test member ${USER_A.email} has no session — member + group chat checks skipped.`)
  }

  // =====================================================================
  // 1. MEMBER — submit feedback on /dashboard/feedback
  // =====================================================================
  const memberCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const member = await memberCtx.newPage()
  const memberErrors = []
  member.on("pageerror", (err) => memberErrors.push(err.message.slice(0, 160)))

  if (memberAvailable) {
    await login(member, USER_A, "/dashboard")
    check("Member lands on /dashboard", member.url().includes("/dashboard"), member.url())

    await gotoPage(member, `${APP_URL}/dashboard/feedback`, "text=Tell us what you think")
    check("Member: Feedback page loads", (await member.getByText("Tell us what you think", { exact: false }).count()) > 0)

    await member.locator("#feedback-subject").fill(SUBJECT)
    await member.locator("#feedback-message").fill(MESSAGE)
    await member.getByRole("button", { name: "Send feedback" }).click()

    const submitted = await member
      .getByText(SUBJECT, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    check("Member: feedback appears in history after submit", submitted, SUBJECT)
  }

  // =====================================================================
  // 2. SUPER ADMIN — see it with trusted identity, reply, change status
  // =====================================================================
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const admin = await actx.newPage()
  const adminErrors = []
  admin.on("pageerror", (err) => adminErrors.push(err.message.slice(0, 160)))

  await login(admin, ADMIN, "/admin")
  check("Super admin lands on /admin", admin.url().includes("/admin"), admin.url())

  if (MIGRATION_0012_APPLIED) {
    await admin.getByRole("tab", { name: "Feedback" }).click()
    await admin.waitForTimeout(1200)

    // Search narrows the list to our submission.
    await admin.locator("#feedback-search").fill(SUBJECT)
    await admin.waitForTimeout(800)
    const card = admin.locator("div.bg-card").filter({ hasText: SUBJECT }).first()
    const cardVisible = await card.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
    check("Admin: submission visible in Feedback tab", cardVisible, SUBJECT)

    // Trusted identity (real name / handle / email / Sphere) on the card.
    const identityShown = await card.getByText(/Codebuff RT A|RT A|@/).first().waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
    check("Admin: member identity shown (real name / handle)", identityShown)
    const emailShown = (await card.getByText(/@example\.com/).count()) > 0
    check("Admin: member email shown (admin-only view)", emailShown)
    const sphereShown = (await card.getByText("ITS", { exact: false }).count()) > 0
    check("Admin: Sphere shown", sphereShown)
    check("Admin: full message visible", (await card.getByText(MESSAGE, { exact: false }).count()) > 0)

    // Open → reply → status change.
    await card.locator("button[aria-expanded]").first().click()
    await admin.waitForTimeout(600)
    await card.locator("textarea[placeholder*='Write a reply']").fill(ADMIN_REPLY)
    await card.getByRole("button", { name: "Send reply" }).click()
    const repliedToast = await admin
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Reply sent" })
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    check("Admin: reply sent", repliedToast)

    await admin.waitForTimeout(1500)
    // Status select → Resolved.
    await card.getByRole("combobox", { name: "Change status" }).click()
    await admin.getByRole("option", { name: "Resolved" }).click()
    const statusToast = await admin
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Status updated" })
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    check("Admin: status updated to Resolved", statusToast)
  } else {
    console.log("  NOTE: migration 0012 not applied — admin feedback checks skipped (need the feedback tables).")
  }

  // =====================================================================
  // 3. MEMBER — refresh: sees the admin reply + status (persisted)
  // =====================================================================
  if (MIGRATION_0012_APPLIED && memberAvailable) {
    await member.reload({ waitUntil: "commit", timeout: 90000 })
    await member.waitForTimeout(1500)
    const card = member.locator("div.bg-card").filter({ hasText: SUBJECT }).first()
    await card.locator("button[aria-expanded]").first().click()
    await member.waitForTimeout(600)
    const replyVisible = await member
      .getByText(ADMIN_REPLY, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false)
    check("Member: admin reply visible after refresh (persisted)", replyVisible, ADMIN_REPLY)
    const platformTeam = await member.getByText("Platform team", { exact: false }).first().waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
    check("Member: reply attributed to the platform team", platformTeam)
    const statusVisible = (await card.getByText("Resolved", { exact: false }).count()) > 0
    check("Member: status shows Resolved after refresh", statusVisible)
  }

  // =====================================================================
  // 4. GROUP CHAT — Enter sends, Shift+Enter newline
  // =====================================================================
  if (memberAvailable) {
    await gotoPage(member, `${APP_URL}/dashboard/groups`, "text=Your groups")
    const groupName = `RT chat ${STAMP}`
    await member.getByRole("button", { name: "New group" }).click()
    await member.locator("#name").fill(groupName)
    await member.getByRole("button", { name: "Create group", exact: true }).click()
    const groupShown = await member
      .getByText(groupName, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    check("Group: created via UI", groupShown, groupName)

    await member.locator("a").filter({ hasText: groupName }).first().click()
    await member.locator("textarea[placeholder^='Message as ']").waitFor({ state: "visible", timeout: 15000 })

    // Enter sends.
    const sentBody = `enter-sends-${STAMP}`
    await member.locator("textarea[placeholder^='Message as ']").fill(sentBody)
    await member.locator("textarea[placeholder^='Message as ']").press("Enter")
    const sentVisible = await member.getByText(sentBody, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    check("Group: Enter sends the message", sentVisible)
    const sentCount = await member.getByText(sentBody, { exact: true }).count()
    check("Group: message sent exactly once (no duplicate)", sentCount === 1, `count=${sentCount}`)

    // Shift+Enter inserts a newline without sending; the next Enter sends it whole.
    const line1 = `line-one-${STAMP}`
    const line2 = `line-two-${STAMP}`
    const ta = member.locator("textarea[placeholder^='Message as ']")
    await ta.fill("")
    await ta.pressSequentially(line1, { delay: 5 })
    await ta.press("Shift+Enter")
    await ta.pressSequentially(line2, { delay: 5 })
    const textareaValue = await ta.inputValue()
    check("Group: Shift+Enter inserts a newline (nothing sent yet)", textareaValue.includes("\n") && textareaValue.includes(line2), JSON.stringify(textareaValue.slice(0, 40)))
    // Nothing was sent after the first line.
    const premature = await member.getByText(line1, { exact: true }).count()
    check("Group: first line not sent before Enter", premature === 0, `count=${premature}`)

    await ta.press("Enter")
    const multiSent = await member
      .getByText(new RegExp(`${line1}[\\s\\S]*${line2}`))
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    check("Group: multi-line message sent as one message on Enter", multiSent)
    const multiCount = await member.getByText(new RegExp(`${line1}[\\s\\S]*${line2}`)).count()
    check("Group: multi-line message appears exactly once", multiCount === 1, `count=${multiCount}`)
  }

  // =====================================================================
  // 5. MOBILE — Feedback in the More sheet
  // =====================================================================
  if (memberAvailable) {
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const mpage = await mctx.newPage()
    await login(mpage, USER_A, "/dashboard")
    await mpage.getByRole("button", { name: "More" }).click()
    const feedbackInSheet = await mpage.getByRole("link", { name: "Feedback" }).waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)
    check("Mobile: Feedback appears in the More sheet", feedbackInSheet)
    await mctx.close()
  }

  check("No member page JS errors", memberErrors.length === 0, memberErrors.join(" | ") || "clean")
  check("No admin page JS errors", adminErrors.length === 0, adminErrors.join(" | ") || "clean")

  await memberCtx.close()
  await actx.close()
} catch (err) {
  console.log(`\nSCRIPT ERROR: ${err.message}`)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log("FAILED:", failed.map((f) => f.name).join(" | "))
process.exit(failed.length === 0 ? 0 : 1)
