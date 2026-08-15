// End-to-end live verification of the Sphere chat realtime flow (11 checks).
//
// Provisions two test users through the REAL app signup form (email
// confirmation must be disabled in the Supabase project, or the users must
// already exist — then the script just logs in), then verifies:
//   1. User A can sign up / login
//   2. User B can sign up / login
//   3. Both belong to the same ITS Engineering College Sphere
//   4. A's message appears immediately for A (optimistic send)
//   5. B receives it without refreshing (realtime INSERT)
//   6. B replies and A receives it without refreshing
//   7. No duplicate messages in either session
//   8. Reload/reconnect does not duplicate messages
//   9. Admin can see the Sphere chat in the admin Social tab
//  10. Admin deletion propagates as "Message deleted by admin"
//  11. Sphere isolation: cross-Sphere write/read rejected by RLS
//
// Run: node scripts/chat-realtime-browser.mjs
// Optional env: APP_URL (default http://localhost:3000),
//               RT_USER_A_EMAIL/PASSWORD, RT_USER_B_EMAIL/PASSWORD (fixed creds;
//               defaults are used otherwise).

import { readFileSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const COLLEGE = "ITS Engineering College"

function env() {
  const out = { ...process.env }
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
    if (m && !out[m[1]]) out[m[1]] = m[2].trim()
  }
  return out
}

const e = env()
const PASSWORD = "CodebuffRt!2026"
const A = { email: process.env.RT_USER_A_EMAIL || "codebuff.rt.a@example.com", password: process.env.RT_USER_A_PASSWORD || PASSWORD }
const B = { email: process.env.RT_USER_B_EMAIL || "codebuff.rt.b@example.com", password: process.env.RT_USER_B_PASSWORD || PASSWORD }

const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

async function apiSession(user) {
  const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password: user.password })
  if (error) return null
  return data
}

async function apiUser(user) {
  const session = await apiSession(user)
  if (!session) return null
  const { data: us } = await sb
    .from("user_spheres")
    .select("sphere_id, anonymous_handle, spheres(name)")
    .eq("user_id", session.user.id)
    .maybeSingle()
  const { data: profile } = await sb.from("profiles").select("role").eq("id", session.user.id).maybeSingle()
  return {
    id: session.user.id,
    session: session.session,
    sphereId: us?.sphere_id ?? null,
    sphereName: Array.isArray(us?.spheres) ? us.spheres[0]?.name : us?.spheres?.name,
    handle: us?.anonymous_handle ?? null,
    role: profile?.role ?? null,
  }
}

// React 19 controlled inputs: type real keys after hydration settles, verify
// the value reached React state (inputValue + retry). fill() can race with
// hydration and leave React state empty even when the DOM value sticks.
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

async function signupViaUI(page, user) {
  await page.goto(`${APP_URL}/auth/sign-up`, { waitUntil: "networkidle" })
  // Let React hydrate before typing.
  await page.getByRole("button", { name: "Continue" }).waitFor({ state: "visible" })
  await page.waitForTimeout(600)
  // Step 1 — identity
  await typeControlled(page, "#realName", `Codebuff RT ${user.email.startsWith("codebuff.rt.a") ? "A" : "B"}`)
  await typeControlled(page, "#phone", user.email.startsWith("codebuff.rt.a") ? "9999900001" : "9999900002")
  await page.getByRole("button", { name: "Continue" }).click()
  // Step 2 — campus (college autocomplete). If a validation error appears,
  // surface it instead of timing out on the missing input.
  await page
    .waitForSelector("#college", { state: "visible", timeout: 8000 })
    .catch(async () => {
      const alert = await page.locator("[role=alert]").allTextContents()
      throw new Error(`Step 1 did not advance — form error: ${alert.join(" | ") || "(none)"}`)
    })
  await typeControlled(page, "#college", "ITS")
  await page.locator("#college-results li").filter({ hasText: COLLEGE }).first().waitFor({ state: "visible", timeout: 15000 })
  await page.locator("#college-results li").filter({ hasText: COLLEGE }).first().click()
  // Selected state replaces the input with a chip.
  await page.getByText(COLLEGE, { exact: true }).waitFor({ state: "visible", timeout: 5000 })
  await page.getByRole("button", { name: "Continue" }).click()
  // Step 3 — credentials
  await typeControlled(page, "#email", user.email)
  await typeControlled(page, "#password", user.password)
  await typeControlled(page, "#confirmPassword", user.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await page.waitForURL("**/auth/sign-up-success**", { timeout: 20000 })
}

async function login(page, user) {
  await page.goto(`${APP_URL}/auth/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(user.email)
  await page.locator('input[name="password"]').fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/dashboard**", { timeout: 20000 })
}

async function ensureUser(browser, user) {
  // If the account already exists (confirmed), just log in.
  const probe = await apiSession(user)
  if (probe) {
    console.log(`  ${user.email}: existing account → login`)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await login(page, user)
    return { ctx, page }
  }
  console.log(`  ${user.email}: signing up through the app form…`)
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signupViaUI(page, user)
  // Confirmation is disabled, so the session is live — go straight to the app.
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" })
  await page.waitForURL("**/dashboard**", { timeout: 15000 })
  return { ctx, page }
}

async function openChat(page) {
  await page.goto(`${APP_URL}/dashboard/chat`, { waitUntil: "domcontentloaded" })
  await page.locator("textarea[placeholder^='Message ']").waitFor({ state: "visible", timeout: 20000 })
}

function countExact(page, text) {
  return page.locator(`div:text-is("${text}")`).count()
}

async function waitForCount(page, text, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await countExact(page, text)) === expected) return true
    await page.waitForTimeout(150)
  }
  return (await countExact(page, text)) === expected
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  // ---------- Provision the two users ----------
  console.log("Provisioning User A…")
  const aCtx = await ensureUser(browser, A)
  const pageA = aCtx.page
  console.log("Provisioning User B…")
  const bCtx = await ensureUser(browser, B)
  const pageB = bCtx.page

  // Check 1 & 2 — signup/login succeeded (page is on /dashboard)
  check("User A can sign up / login", pageA.url().includes("/dashboard"), pageA.url())
  check("User B can sign up / login", pageB.url().includes("/dashboard"), pageB.url())

  // Check 3 — same Sphere via the DB (authoritative)
  const ua = await apiUser(A)
  const ub = await apiUser(B)
  check("A and B belong to the same Sphere", Boolean(ua && ub && ua.sphereId && ua.sphereId === ub.sphereId), `sphere=${ua?.sphereId}`)
  check(
    "Sphere is ITS Engineering College",
    Boolean(ua?.sphereName) && ua.sphereName.toLowerCase() === COLLEGE.toLowerCase(),
    `${ua?.sphereName}`,
  )
  const sphereId = ua?.sphereId
  const isAAdmin = ua?.role === "admin"
  console.log(`  A role=${ua?.role} (admin=${isAAdmin}) handle=${ua?.handle}; B handle=${ub?.handle}`)

  // ---------- Check 11 — Sphere isolation at the RLS layer ----------
  {
    const otherSphere = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    const { error: insertErr } = await sb
      .from("chat_messages")
      .insert({ sphere_id: otherSphere, author_id: ub.id, body: "cross-sphere attempt" })
    const { data: crossRead, error: readErr } = await sb
      .from("chat_messages")
      .select("id")
      .eq("sphere_id", otherSphere)
    check("Cross-Sphere WRITE blocked by RLS", Boolean(insertErr), insertErr?.message ?? "no error")
    check("Cross-Sphere READ returns nothing", !readErr && (crossRead ?? []).length === 0)
  }

  // ---------- Open chat in both sessions ----------
  console.log("Opening Sphere chat for both users…")
  await openChat(pageA)
  await openChat(pageB)

  // Check 4 & 5 — A sends, sees immediately; B receives via realtime
  const msg1 = `rt-a-${Date.now()}`
  const t0 = Date.now()
  await pageA.locator("textarea[placeholder^='Message ']").fill(msg1)
  await pageA.locator("textarea[placeholder^='Message ']").press("Enter")
  const aImmediate = await waitForCount(pageA, msg1, 1, 1500)
  check("A sees their message immediately (optimistic)", aImmediate, `${Date.now() - t0}ms`)
  const bReceived = await waitForCount(pageB, msg1, 1, 12000)
  check("B receives A's message without refreshing (realtime)", bReceived, `${Date.now() - t0}ms`)

  // Check 6 — B replies, A receives without refreshing
  const msg2 = `rt-b-${Date.now()}`
  const t1 = Date.now()
  await pageB.locator("textarea[placeholder^='Message ']").fill(msg2)
  await pageB.locator("textarea[placeholder^='Message ']").press("Enter")
  const bImmediate = await waitForCount(pageB, msg2, 1, 1500)
  check("B sees their reply immediately", bImmediate)
  const aGotReply = await waitForCount(pageA, msg2, 1, 12000)
  check("A receives B's reply without refreshing (realtime)", aGotReply, `${Date.now() - t1}ms`)

  // Check 7 — no duplicates after settling
  await pageA.waitForTimeout(2500)
  await pageB.waitForTimeout(2500)
  check("No duplicate messages (A)", (await countExact(pageA, msg1)) === 1 && (await countExact(pageA, msg2)) === 1, `msg1=${await countExact(pageA, msg1)} msg2=${await countExact(pageA, msg2)}`)
  check("No duplicate messages (B)", (await countExact(pageB, msg1)) === 1 && (await countExact(pageB, msg2)) === 1, `msg1=${await countExact(pageB, msg1)} msg2=${await countExact(pageB, msg2)}`)

  // Check 8 — reload (reconnect + refetch) does not duplicate; new message still arrives once
  await pageB.reload({ waitUntil: "domcontentloaded" })
  await openChat(pageB)
  check("Reload keeps history unique (B)", (await countExact(pageB, msg1)) === 1 && (await countExact(pageB, msg2)) === 1, `msg1=${await countExact(pageB, msg1)} msg2=${await countExact(pageB, msg2)}`)
  const msg3 = `rt-a2-${Date.now()}`
  await pageA.locator("textarea[placeholder^='Message ']").fill(msg3)
  await pageA.locator("textarea[placeholder^='Message ']").press("Enter")
  const bGotMsg3 = await waitForCount(pageB, msg3, 1, 12000)
  await pageB.waitForTimeout(2500)
  check("Realtime works after reconnect, once (B)", bGotMsg3 && (await countExact(pageB, msg3)) === 1)

  // Checks 9 & 10 — admin moderation
  if (sphereId) {
    console.log("Admin moderation: opening the Sphere admin Social tab…")
    await pageA.goto(`${APP_URL}/admin/spheres/${sphereId}`, { waitUntil: "domcontentloaded" })
    await pageA.getByRole("tab", { name: /^Social/ }).click()
    await pageA.getByText(msg1, { exact: true }).waitFor({ state: "visible", timeout: 15000 })
    const seesMsg2 = await waitForCount(pageA, msg2, 1, 8000)
    check("Admin sees the Sphere chat in the Social tab (live)", seesMsg2, "msg1 & msg2 visible")

    // Admin deletes B's message (msg2) from the admin panel.
    const msg2Row = pageA.getByText(msg2, { exact: true }).locator("..").locator("..")
    await msg2Row.getByRole("button", { name: "Delete" }).click()
    const bSawDelete = await waitForCount(pageB, "Message deleted by admin", 1, 10000)
    await pageB.waitForTimeout(2000)
    check("Admin deletion propagates as 'Message deleted by admin' (B)", bSawDelete && (await countExact(pageB, "Message deleted by admin")) === 1, `B deleted-rows=${await countExact(pageB, "Message deleted by admin")}`)
    check("Deleted message no longer shows its body to B", (await countExact(pageB, msg2)) === 0)
  } else {
    check("Admin can see/moderate the Sphere chat", false, "no sphereId resolved")
    check("Admin deletion propagates", false, "skipped — no sphereId")
  }

  await aCtx.ctx.close()
  await bCtx.ctx.close()
} catch (err) {
  console.log(`\nSCRIPT ERROR: ${err.message}`)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
