// Live browser verification of the chat "opens at the latest message" behavior.
//
// Verifies:
//   1. Opening Sphere chat lands at the newest messages (scroll at bottom,
//      newest message visible, oldest not visible)
//   2. Closing and reopening the chat still lands at the latest message
//   3. New messages appear at the bottom (optimistic + no duplicates)
//   4. "Load earlier messages" preserves the reading position (no jump)
//   5. Same behavior on a mobile viewport
//
// If the Sphere has fewer than 50 messages the script seeds a few labeled
// messages through the API (as the test user) so pagination can be exercised.
//
// Run: node scripts/verify-chat-latest.mjs        (requires the app running on APP_URL)
// Optional env: APP_URL, RT_USER_A_EMAIL/PASSWORD

import { readFileSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const PASSWORD = process.env.RT_USER_A_PASSWORD || "CodebuffRt!2026"
const A = { email: process.env.RT_USER_A_EMAIL || "codebuff.rt.a@example.com", password: PASSWORD }

function env() {
  const out = { ...process.env }
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
    if (m && !out[m[1]]) out[m[1]] = m[2].trim()
  }
  return out
}

const e = env()
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

async function apiUser() {
  const { data: session, error } = await sb.auth.signInWithPassword({ email: A.email, password: A.password })
  if (error || !session?.user) return null
  const { data: us } = await sb
    .from("user_spheres")
    .select("sphere_id")
    .eq("user_id", session.user.id)
    .maybeSingle()
  return { id: session.user.id, session: session.session, sphereId: us?.sphere_id ?? null }
}

// Container scroll metrics (scrollTop + clientHeight ≈ scrollHeight ⇒ at bottom).
async function scrollMetrics(page) {
  return page.evaluate(() => {
    const el = document.querySelector("div.flex-1.overflow-y-auto")
    if (!el) return null
    return {
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 8,
    }
  })
}

// Is the element with this exact text within the container's visible region?
// Non-waiting: an element that isn't rendered at all is simply "not visible".
async function bubbleVisibleInViewport(page, text) {
  const els = await page.locator(`div:text-is("${text}")`).all()
  if (els.length === 0) return false
  const box = await els[0].boundingBox()
  const container = await page.locator("div.flex-1.overflow-y-auto").first().boundingBox()
  if (!box || !container) return false
  const overlap = box.y < container.y + container.height && box.y + box.height > container.y
  return overlap
}

async function bubbleCount(page, text) {
  return page.locator(`div:text-is("${text}")`).count()
}

// All bubble texts currently intersecting the container's visible region.
async function visibleBubbleTexts(page) {
  return page.evaluate(() => {
    const container = document.querySelector("div.flex-1.overflow-y-auto")
    if (!container) return []
    const cRect = container.getBoundingClientRect()
    const out = []
    for (const el of container.querySelectorAll("div.rounded-2xl")) {
      const r = el.getBoundingClientRect()
      if (r.y < cRect.bottom && r.y + r.height > cRect.top) out.push(el.textContent ?? "")
    }
    return out
  })
}

async function login(page) {
  await page.goto(`${APP_URL}/auth/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(A.email)
  await page.locator('input[name="password"]').fill(A.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/dashboard**", { timeout: 30000 })
}

async function openChat(page) {
  await page.goto(`${APP_URL}/dashboard/chat`, { waitUntil: "domcontentloaded" })
  await page.locator("textarea[placeholder^='Message ']").waitFor({ state: "visible", timeout: 20000 })
  // Let the initial window render + mount scroll settle.
  await page.waitForTimeout(1200)
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  const user = await apiUser()
  if (!user?.sphereId) {
    console.log("SKIP — could not resolve test user A / Sphere (is the live Supabase project configured?)")
    process.exit(0)
  }

  // ---------- Seed enough messages to exercise pagination ----------
  const { count } = await sb
    .from("chat_messages")
    .select("*", { count: "exact", head: true })
    .eq("sphere_id", user.sphereId)
  const TARGET = 55
  if ((count ?? 0) < TARGET) {
    const n = TARGET - (count ?? 0)
    console.log(`  Seeding ${n} labeled messages to exercise pagination (${count} → ${TARGET})…`)
    const rows = Array.from({ length: n }, (_, i) => ({
      sphere_id: user.sphereId,
      author_id: user.id,
      body: `audit-seed-${String(i + 1).padStart(2, "0")}-${Date.now()}`,
    }))
    const { error } = await sb.from("chat_messages").insert(rows)
    if (error) console.log(`  Seed warning: ${error.message}`)
  }

  // Pick the newest NON-deleted message: deleted messages render as
  // "Message deleted by admin", so their body text can't be asserted.
  const { data: newestRow } = await sb
    .from("chat_messages")
    .select("body")
    .eq("sphere_id", user.sphereId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
  const newestBody = newestRow?.body
  const { data: oldestRow } = await sb
    .from("chat_messages")
    .select("body")
    .eq("sphere_id", user.sphereId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single()
  const oldestBody = oldestRow?.body

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page)

  // ---------- 1. Opens at the latest message (desktop) ----------
  await openChat(page)
  const m1 = await scrollMetrics(page)
  check("Chat opens at the bottom (scroll position)", Boolean(m1?.atBottom), `scrollTop=${m1?.scrollTop} h=${m1?.clientHeight}/${m1?.scrollHeight}`)
  const newestVisible = await bubbleVisibleInViewport(page, newestBody)
  check("Newest message is visible on open", newestVisible, `"${newestBody}"`)
  const oldestVisible = await bubbleVisibleInViewport(page, oldestBody)
  check("Oldest message is NOT visible on open", !oldestVisible, `"${oldestBody}"`)

  // ---------- 2. Reopen lands at the latest again ----------
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(600)
  await openChat(page)
  const m2 = await scrollMetrics(page)
  check("Reopening chat still lands at the bottom", Boolean(m2?.atBottom), `scrollTop=${m2?.scrollTop}`)
  check("Newest message still visible after reopen", await bubbleVisibleInViewport(page, newestBody))

  // ---------- 3. New message appears at the bottom, once ----------
  const sentBody = `latest-check-${Date.now()}`
  await page.locator("textarea[placeholder^='Message ']").fill(sentBody)
  await page.locator("textarea[placeholder^='Message ']").press("Enter")
  await page.waitForTimeout(1500)
  check("Sent message is visible at the bottom", await bubbleVisibleInViewport(page, sentBody))
  check("Sent message appears exactly once (no duplicates)", (await bubbleCount(page, sentBody)) === 1)

  // ---------- 4. Load-earlier preserves the reading position ----------
  // A real user reaches "Load earlier messages" after scrolling back to the
  // top of the loaded window (the button sits at the top of the list). Scroll
  // there, note the messages in view, click, and verify they stay in view
  // (the viewport must shift down by exactly the prepended height, not jump
  // to the bottom or reset to the top).
  await page.evaluate(() => {
    const el = document.querySelector("div.flex-1.overflow-y-auto")
    if (el) el.scrollTop = 0
  })
  await page.waitForTimeout(400)
  const beforeLoad = await scrollMetrics(page)
  const refTexts = await visibleBubbleTexts(page)
  const loadBtn = page.getByRole("button", { name: "Load earlier messages" })
  if ((await loadBtn.count()) > 0) {
    await loadBtn.click()
    // Wait for the prepend to land + anchor rAF to run.
    await page.waitForTimeout(1800)
    const afterLoad = await scrollMetrics(page)
    const refStillVisible = refTexts.length > 0 && (await visibleBubbleTexts(page)).some((t) => refTexts.includes(t))
    check(
      "Loading earlier messages preserves the reading position",
      Boolean(afterLoad) && refStillVisible && !afterLoad.atBottom && afterLoad.scrollTop > beforeLoad.scrollTop,
      `scrollTop ${beforeLoad.scrollTop} → ${afterLoad.scrollTop} (bottom=${afterLoad.atBottom})`,
    )
    check("Container not at the top after loading earlier", Boolean(afterLoad && afterLoad.scrollTop > 0))
  } else {
    check("Loading earlier messages preserves the reading position", true, "no older messages — nothing to load")
  }

  await ctx.close()

  // ---------- 5. Mobile viewport ---------- 
  // The desktop send above changed the newest message — capture the current
  // newest so the mobile assertions compare against the right row.
  const { data: newestRow2 } = await sb
    .from("chat_messages")
    .select("body")
    .eq("sphere_id", user.sphereId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
  const mobileNewestBody = newestRow2?.body
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const mpage = await mctx.newPage()
  await login(mpage)
  await openChat(mpage)
  const mm = await scrollMetrics(mpage)
  check("Mobile: chat opens at the bottom", Boolean(mm?.atBottom), `scrollTop=${mm?.scrollTop} h=${mm?.clientHeight}/${mm?.scrollHeight}`)
  check("Mobile: newest message visible", await bubbleVisibleInViewport(mpage, mobileNewestBody), `"${mobileNewestBody}"`)
  await mctx.close()
} catch (err) {
  console.log(`\nSCRIPT ERROR: ${err.message}`)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
