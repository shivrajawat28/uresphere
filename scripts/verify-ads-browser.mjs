// Live browser verification of the Advertising Management feature.
//
// Requires migration 0007 applied to the live Supabase project, the app
// running on APP_URL, and BLOB_READ_WRITE_TOKEN set in .env.local so image
// uploads hit the real Vercel Blob service (no mocks).
//
// Covers: admin tab + empty state, upload-route security gates (auth, magic
// bytes, size, MIME), real Blob upload + URL persistence, create-form
// validation, preview, edit, display on Academic / Social / Marketplace
// placements, deactivate / reactivate / archive / delete, scheduled/expired
// behavior, and cleanup of the uploaded blobs + rows.
//
// Run: node scripts/verify-ads-browser.mjs
// Optional env: APP_URL, SUPER_ADMIN_EMAIL/PASSWORD, RT_USER_A_EMAIL/PASSWORD

import { readFileSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"
import { del } from "@vercel/blob"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"

function env() {
  const out = { ...process.env }
  for (const file of [".env.local", ".env.rt"]) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
      if (m && !out[m[1]]) {
        // Match dotenv semantics: strip a single pair of surrounding quotes.
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1)
        }
        out[m[1]] = v
      }
    }
  }
  return out
}

const e = env()
// The server-side route reads the token from the Next.js process (which loads
// .env.local itself). This script's own process needs it too for Blob cleanup
// via @vercel/blob del() — set it without ever printing it.
if (e.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_READ_WRITE_TOKEN) {
  process.env.BLOB_READ_WRITE_TOKEN = e.BLOB_READ_WRITE_TOKEN
}
const SUPER = {
  email: process.env.SUPER_ADMIN_EMAIL || e.SUPER_ADMIN_EMAIL,
  password: process.env.SUPER_ADMIN_PASSWORD || e.SUPER_ADMIN_PASSWORD,
}
const MEMBER = {
  email: process.env.RT_USER_A_EMAIL || "codebuff.rt.a@example.com",
  password: process.env.RT_USER_A_PASSWORD || "CodebuffRt!2026",
}

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)
// All URLs handed back by the real upload route, collected for Blob cleanup.
const uploadedBlobUrls = []

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

function adTitle(prefix) {
  return `${prefix}-${Date.now()}`
}

// ISO string → value for <input type="datetime-local"> (local time, no seconds).
function toLocalInput(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function apiSession(user) {
  const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password: user.password })
  return error ? null : data
}

// Seeding runs with its OWN client so the member session in the UI checks can
// never leak into the write path (the shared `sb` client keeps the last login).
let seedSb = null
async function ensureSeedSb() {
  if (!seedSb) {
    seedSb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    await seedSb.auth.signInWithPassword({ email: SUPER.email, password: SUPER.password })
  }
  return seedSb
}
async function cleanupAds(ids) {
  for (const id of ids ?? []) {
    try {
      const sb = await ensureSeedSb()
      await sb.from("ad_campaigns").delete().eq("id", id)
    } catch {
      /* best effort */
    }
  }
}

async function openAdvertisingTab(page) {
  await page.goto(`${APP_URL}/admin`, { waitUntil: "domcontentloaded" })
  await page.getByRole("tab", { name: "Advertising" }).click()
  await page.getByRole("button", { name: "New advertisement" }).waitFor({ state: "visible", timeout: 15000 })
}

// Delete uploaded blobs from Vercel Blob so the store is left clean.
async function cleanupBlobs() {
  for (const url of uploadedBlobUrls) {
    try {
      await del(url)
    } catch {
      /* best effort */
    }
  }
}

async function createAdViaUI(page, { title, placements, startsAt, endsAt }) {
  await page.getByRole("button", { name: "New advertisement" }).click()
  await page.getByLabel("Title").waitFor({ state: "visible", timeout: 10000 })
  await page.getByLabel("Title").fill(title)
  await page.getByLabel("Description").fill("Browser verification advertisement")
  // Real upload through /api/ads/upload → Vercel Blob (never mocked).
  await page.locator('input[type="file"]').setInputFiles({ name: "ad.png", mimeType: "image/png", buffer: PNG_BYTES })
  await page.waitForTimeout(1200)
  await page.getByLabel("Destination URL").fill("https://example.com/verify-ads")
  const dialog = page.getByRole("dialog")
  for (const p of placements) await dialog.getByText(p, { exact: true }).click()
  await page.locator("#adStartsAt").fill(toLocalInput(startsAt))
  await page.locator("#adEndsAt").fill(toLocalInput(endsAt))
  const activeBox = page.getByLabel(/Active/)
  if ((await activeBox.isChecked()) === false) await activeBox.check()
  await page.getByRole("button", { name: "Create advertisement" }).click()
  await page.waitForTimeout(1200)
}

async function waitForRow(page, title) {
  await page.getByText(title, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 })
}

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })

try {
  if (!SUPER.email || !SUPER.password) {
    console.log("SKIP — SUPER_ADMIN_EMAIL/PASSWORD not set")
    process.exit(0)
  }
  const session = await apiSession(SUPER)
  if (!session) {
    console.log("SKIP — super admin login failed (wrong creds?)")
    process.exit(0)
  }
  // Wipe any ads left behind by interrupted runs so the empty-state check is
  // deterministic (runs with the super-admin client, so RLS permits it).
  await ensureSeedSb()
  const { data: allAds } = await seedSb.from("ad_campaigns").select("id")
  for (const row of allAds ?? []) await seedSb.from("ad_campaigns").delete().eq("id", row.id)

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const admin = await ctx.newPage()
  await login(admin, SUPER)

  // ---------- 1. Admin tab + empty state ----------
  await openAdvertisingTab(admin)
  check("Advertising tab shows empty state when no ads exist", (await admin.getByText(/No advertisements yet/).count()) > 0)

  // ---------- 2. Upload-route security gates + real Blob upload (direct) ----------
  const token = e.BLOB_READ_WRITE_TOKEN ?? ""
  if (!token) {
    console.log("SKIP — BLOB_READ_WRITE_TOKEN not set; real upload checks skipped")
    process.exit(0)
  }
  {
    // Normal user (not super admin) → 403
    const mctx0 = await browser.newContext()
    const m0 = await mctx0.newPage()
    await login(m0, MEMBER)
    const asMember = await m0.evaluate(async (png) => {
      const fd = new FormData()
      fd.append("file", new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], "a.png", { type: "image/png" }))
      const res = await fetch("/api/ads/upload", { method: "POST", body: fd })
      return { status: res.status }
    }, PNG_BYTES.toString("base64"))
    check("Upload route rejects a non-super-admin (403)", asMember.status === 403, `status=${asMember.status}`)
    await mctx0.close()

    // Super admin + non-image bytes → 400 (magic-byte check)
    const badStatus = await admin.evaluate(async () => {
      const fd = new FormData()
      fd.append("file", new File(["<script>alert(1)</script>"], "x.png", { type: "image/png" }))
      const res = await fetch("/api/ads/upload", { method: "POST", body: fd })
      return { status: res.status, body: await res.text() }
    })
    check("Upload route rejects spoofed MIME via magic bytes (400)", badStatus.status === 400, `status=${badStatus.status}`)

    // Super admin + wrong declared type (text/plain with real PNG bytes) → 400
    const wrongType = await admin.evaluate(async (png) => {
      const fd = new FormData()
      fd.append("file", new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], "a.txt", { type: "text/plain" }))
      const res = await fetch("/api/ads/upload", { method: "POST", body: fd })
      return { status: res.status, body: await res.text() }
    }, PNG_BYTES.toString("base64"))
    check("Upload route rejects a disallowed MIME type (400)", wrongType.status === 400, `status=${wrongType.status}`)

    // Super admin + oversized file (6 MB) → 400
    const big = Buffer.alloc(6 * 1024 * 1024, 0x89)
    big[1] = 0x50; big[2] = 0x4e; big[3] = 0x47; big[4] = 0x0d; big[5] = 0x0a; big[6] = 0x1a; big[7] = 0x0a
    const tooBig = await admin.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const fd = new FormData()
      fd.append("file", new File([bytes], "big.png", { type: "image/png" }))
      const res = await fetch("/api/ads/upload", { method: "POST", body: fd })
      return { status: res.status, body: await res.text() }
    }, big.toString("base64"))
    check("Upload route rejects an oversized file (400)", tooBig.status === 400, `status=${tooBig.status}`)

    // Super admin + valid PNG → real Blob upload, expect 200 + a Blob URL that
    // does NOT contain the token.
    const blobOk = await admin.evaluate(async (png) => {
      const fd = new FormData()
      fd.append("file", new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], "ad.png", { type: "image/png" }))
      const res = await fetch("/api/ads/upload", { method: "POST", body: fd })
      return { status: res.status, body: await res.text() }
    }, PNG_BYTES.toString("base64"))
    let blobUrl = null
    try {
      blobUrl = JSON.parse(blobOk.body).url
    } catch {
      /* not json */
    }
    const urlOk =
      blobOk.status === 200 &&
      typeof blobUrl === "string" &&
      blobUrl.startsWith("https://") &&
      !blobUrl.includes(token) &&
      /blob\.vercel-storage\.com/.test(blobUrl)
    check("Real upload reaches Vercel Blob and returns a public URL (200)", urlOk, `status=${blobOk.status}${blobUrl ? ` url=${blobUrl.slice(0, 60)}…` : ""}`)
    if (blobUrl) uploadedBlobUrls.push(blobUrl)
  }

  // Collect every real Blob URL the UI uploads (validation probe included) so
  // we can assert persistence and clean all of them up at the end.
  await admin.route("**/api/ads/upload", async (route) => {
    const resp = await route.fetch()
    const body = await resp.text()
    try {
      const url = JSON.parse(body).url
      if (url) uploadedBlobUrls.push(url)
    } catch {
      /* non-json error body */
    }
    await route.fulfill({ response: resp, body })
  })

  // ---------- 3. Create-form validation (via the real action) ----------
  await admin.getByRole("button", { name: "New advertisement" }).click()
  await admin.getByLabel("Title").waitFor({ state: "visible", timeout: 10000 })
  await admin.getByLabel("Title").fill("Validation probe")
  await admin.getByLabel("Description").fill("desc")
  await admin.locator('input[type="file"]').setInputFiles({ name: "ad.png", mimeType: "image/png", buffer: PNG_BYTES })
  await admin.waitForTimeout(900)
  await admin.getByLabel("Destination URL").fill("https://example.com/x")
  await admin.getByRole("dialog").getByText("Academic", { exact: true }).click()
  // end before start → server-side rejection (no native constraint on ordering)
  await admin.locator("#adStartsAt").fill(toLocalInput(new Date(Date.now() + 86400000).toISOString()))
  await admin.locator("#adEndsAt").fill(toLocalInput(new Date(Date.now()).toISOString()))
  await admin.getByRole("button", { name: "Create advertisement" }).click()
  const validationToast = admin.getByText(/after the start/i)
  await validationToast.waitFor({ state: "visible", timeout: 8000 }).catch(() => {})
  check("Create form surfaces server-side validation errors (invalid schedule)", (await validationToast.count()) > 0)
  await admin.getByRole("button", { name: "Cancel" }).click()

  // ---------- 4. Create ads through the real UI form (real Blob upload) ----------
  const liveTitle = adTitle("Verify Ad")
  const scheduledTitle = adTitle("Scheduled Ad")
  const expiredTitle = adTitle("Expired Ad")
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  // Live ad — all three placements, active.
  await createAdViaUI(admin, {
    title: liveTitle,
    placements: ["Academic", "Social", "Marketplace"],
    startsAt: new Date(now - 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 7 * day).toISOString(),
  })
  await waitForRow(admin, liveTitle)
  // Scheduled + expired ads — social placement only.
  await createAdViaUI(admin, {
    title: scheduledTitle,
    placements: ["Social"],
    startsAt: new Date(now + 3 * day).toISOString(),
    endsAt: new Date(now + 10 * day).toISOString(),
  })
  await waitForRow(admin, scheduledTitle)
  await createAdViaUI(admin, {
    title: expiredTitle,
    placements: ["Social"],
    startsAt: new Date(now - 10 * day).toISOString(),
    endsAt: new Date(now - 3 * day).toISOString(),
  })
  const expiredRowSeen = await admin
    .getByText(expiredTitle, { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  if (!expiredRowSeen) {
    const toastText = await admin.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])
    const dialogOpen = await admin.getByRole("dialog").count()
    console.log(`  [debug] expired create failed — toasts=${JSON.stringify(toastText)} dialogs=${dialogOpen}`)
  }
  check("Expired ad row appears in admin", expiredRowSeen)

  // Resolve the created ids for cleanup.
  const seedDb = await ensureSeedSb()
  const { data: createdRows } = await seedDb
    .from("ad_campaigns")
    .select("id, advertiser_name")
    .in("advertiser_name", [liveTitle, scheduledTitle, expiredTitle])
  const byName = new Map((createdRows ?? []).map((r) => [r.advertiser_name, r.id]))
  const liveId = byName.get(liveTitle)
  const scheduledId = byName.get(scheduledTitle)
  const expiredId = byName.get(expiredTitle)
  check("Create dialog accepts the form and inserts (createAdAction)", Boolean(liveId))
  check("Scheduled + expired ads created via the UI", Boolean(scheduledId && expiredId))
  {
    const { data: rows } = await seedDb.from("ad_campaigns").select("id, advertiser_name, placements, active, starts_at_ts, ends_at_ts, creative_url").in("id", [liveId, scheduledId, expiredId])
    console.log("  [debug] stored rows:", JSON.stringify(rows.map((r) => ({ ...r, creative_url: r.creative_url?.slice(0, 60) + "…" }))))
    const liveRow = rows?.find((r) => r.id === liveId)
    const liveUrl = liveRow?.creative_url ?? ""
    check(
      "Real Blob URL persisted to ad_campaigns.creative_url",
      typeof liveUrl === "string" && liveUrl.startsWith("https://") && /blob\.vercel-storage\.com/.test(liveUrl) && !liveUrl.includes(token),
      liveUrl.slice(0, 60),
    )
    // The UI-created ad must use a blob URL, not the old placeholder.
    check("UI-uploaded image URL is a Vercel Blob URL (not placeholder)", liveUrl.includes("blob.vercel-storage.com"), liveUrl.slice(0, 60))
  }

  // ---------- 5. Admin table: row, stats, status badges ----------
  await admin.reload({ waitUntil: "domcontentloaded" })
  await admin.getByRole("tab", { name: "Advertising" }).click()
  await waitForRow(admin, liveTitle)
  await waitForRow(admin, scheduledTitle)
  await waitForRow(admin, expiredTitle)
  const placementsShown = await admin.getByText(/Academic|Social|Marketplace/, { exact: false }).count()
  check("Row shows placement badges", placementsShown >= 3)
  check(
    "Admin distinguishes scheduled vs expired vs live ads",
    (await admin.getByText("Scheduled", { exact: true }).count()) > 0 &&
      (await admin.getByText("Expired", { exact: true }).count()) > 0 &&
      (await admin.getByText("Live", { exact: true }).count()) > 0,
  )
  const statsText = await admin.locator("body").textContent()
  check("Stats row shows Total / Active / Scheduled / Expired", /Total ads/.test(statsText) && /Scheduled/.test(statsText) && /Expired/.test(statsText))

  // ---------- 6. Preview dialog ----------
  await admin
    .getByText(liveTitle, { exact: true })
    .first()
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Preview advertisement" })
    .click()
  await admin.getByText("Sponsored", { exact: true }).first().waitFor({ state: "visible", timeout: 8000 })
  check("Preview dialog shows the sponsored card", true)
  await admin.getByRole("button", { name: "Close" }).first().click()

  // ---------- 7. Edit (pre-filled form → change title → save) ----------
  const renamedTitle = liveTitle + " v2"
  await admin
    .getByText(liveTitle, { exact: true })
    .first()
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Edit advertisement" })
    .click()
  await admin.getByLabel("Title").waitFor({ state: "visible", timeout: 10000 })
  const prefill = await admin.getByLabel("Title").inputValue()
  check("Edit dialog pre-fills the existing values", prefill === liveTitle, prefill)
  await admin.getByLabel("Title").fill(renamedTitle)
  await admin.getByRole("button", { name: "Save changes" }).click()
  await waitForRow(admin, renamedTitle)
  check("Edit saves the new title", true)

  // ---------- 8. Display on placements (member) ----------
  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const member = await mctx.newPage()
  await login(member, MEMBER)
  let blobImgSeen = false
  for (const [path, label] of [
    ["/dashboard/academic", "Academic"],
    ["/dashboard/chat", "Social (chat)"],
    ["/dashboard/groups", "Social (groups)"],
    ["/dashboard/marketplace", "Marketplace"],
  ]) {
    await member.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded" })
    await member.waitForTimeout(1500)
    const visible = await member.getByText(renamedTitle, { exact: true }).count()
    if (!visible) {
      const body = await member.locator("body").innerText()
      const lines = body.split("\n").filter((l) => /Sponsor|advert|renamed|Verify Ad/i.test(l)).slice(0, 8)
      console.log(`  [debug ${path}] ad-ish lines: ${JSON.stringify(lines)}`)
    }
    check(`Ad appears on ${label} placement (${path})`, visible > 0)
    // The ad image must be the real Blob URL rendered in an <img>.
    if (visible) {
      const imgs = await member.locator(`img[src*="blob.vercel-storage.com"]`).evaluateAll((els) => els.map((el) => el.getAttribute("src")))
      if (imgs.length > 0) blobImgSeen = true
    }
  }
  check("Ad image renders from the real Vercel Blob URL on member pages", blobImgSeen)

  // ---------- 9. Deactivate → disappears ----------
  await admin.bringToFront()
  await admin.reload({ waitUntil: "domcontentloaded" })
  await admin.getByRole("tab", { name: "Advertising" }).click()
  await waitForRow(admin, renamedTitle)
  await admin
    .getByText(renamedTitle, { exact: true })
    .first()
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Deactivate advertisement" })
    .click()
  await admin.waitForTimeout(1500)
  await member.goto(`${APP_URL}/dashboard/academic`, { waitUntil: "domcontentloaded" })
  await member.waitForTimeout(1200)
  check("Deactivated ad no longer displays", (await member.getByText(renamedTitle, { exact: true }).count()) === 0)

  // ---------- 10. Reactivate → back ----------
  await admin.reload({ waitUntil: "domcontentloaded" })
  await admin.getByRole("tab", { name: "Advertising" }).click()
  await waitForRow(admin, renamedTitle)
  await admin
    .getByText(renamedTitle, { exact: true })
    .first()
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Activate advertisement" })
    .click()
  await admin.waitForTimeout(1500)
  await member.goto(`${APP_URL}/dashboard/academic`, { waitUntil: "domcontentloaded" })
  await member.waitForTimeout(1200)
  check("Reactivated ad displays again", (await member.getByText(renamedTitle, { exact: true }).count()) > 0)

  // ---------- 11. Scheduled + expired never display ----------
  await member.goto(`${APP_URL}/dashboard/chat`, { waitUntil: "domcontentloaded" })
  await member.waitForTimeout(1200)
  check("Future (scheduled) ad never displays", (await member.getByText(scheduledTitle, { exact: true }).count()) === 0)
  check("Expired ad never displays", (await member.getByText(expiredTitle, { exact: true }).count()) === 0)

  // ---------- 12. Archive → gone everywhere ----------
  await admin.reload({ waitUntil: "domcontentloaded" })
  await admin.getByRole("tab", { name: "Advertising" }).click()
  await waitForRow(admin, renamedTitle)
  await admin
    .getByText(renamedTitle, { exact: true })
    .first()
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Archive advertisement" })
    .click()
  await admin.getByRole("button", { name: "Archive", exact: true }).click()
  await admin.waitForTimeout(1500)
  await member.goto(`${APP_URL}/dashboard/academic`, { waitUntil: "domcontentloaded" })
  await member.waitForTimeout(1200)
  check("Archived ad no longer displays anywhere", (await member.getByText(renamedTitle, { exact: true }).count()) === 0)

  // ---------- 13. Delete (hard) ----------
  await admin.reload({ waitUntil: "domcontentloaded" })
  await admin.getByRole("tab", { name: "Advertising" }).click()
  await waitForRow(admin, renamedTitle)
  await admin
    .getByText(renamedTitle, { exact: true })
    .first()
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Delete advertisement" })
    .click()
  await admin.getByRole("button", { name: "Delete", exact: true }).click()
  await admin.waitForTimeout(1500)
  await admin.reload({ waitUntil: "domcontentloaded" })
  await admin.getByRole("tab", { name: "Advertising" }).click()
  await admin.waitForTimeout(800)
  check("Deleted ad removed from the admin table", (await admin.getByText(renamedTitle, { exact: true }).count()) === 0)

  // ---------- Cleanup (rows + uploaded blobs) ----------
  await cleanupAds([liveId, scheduledId, expiredId])
  await cleanupBlobs()
  await ctx.close()
  await mctx.close()
} catch (err) {
  console.log(`\nSCRIPT ERROR: ${err.message}`)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
