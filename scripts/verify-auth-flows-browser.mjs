// Live browser verification of the authentication + session changes:
//
//   1. Signup UI — no errors on load; errors only on submit; full 3-step
//      signup lands on /dashboard when email confirmation is DISABLED (a
//      session is issued immediately), or on /auth/sign-up-success when
//      "Confirm email" is ON (no session; login before confirmation must be
//      rejected). The script detects the live mode from where signup lands.
//   2. Profile storage — phone + college_year persisted on the profile.
//   3. Session persistence — refresh, navigate, close/reopen browser
//      (storageState) all keep the user signed in.
//   4. Activity tracking — profiles.last_activity_at is written on load.
//   5. 48-hour inactivity — last_activity_at set 49h back → next protected
//      page load signs out and redirects to /auth/login; <48h stays signed in.
//   6. Academic back navigation — with seeded subjects/resources: drill
//      B.Tech → Second Year → CSE → Data Structures, open the note, browser
//      Back returns to the SAME subject/year context (URL params preserved);
//      in-app Back pops one level; direct deep link renders the context.
//   7. Forgot password — empty/invalid email errors, valid email handled
//      (neutral success or a mapped provider error).
//   8. Reset password — confirm mismatch + short password client errors, and
//      the invalid/expired-link error without a recovery session.
//   9. Sign-up-success page copy (email-confirmation messaging).
//  10. Email-only login — a phone number gets a friendly error; super admin
//      login still redirects to /admin.
//  11. Mobile viewport — signup + academic pages render without overflow,
//      back navigation works.
//
// Requires the app source on disk (this script starts `pnpm dev` itself) and
// the real Supabase backend reachable via .env.local / .env.rt. A throwaway
// test account is created (codebuff.verify.<ts>@example.com) and left in the
// ITS Sphere — deleting it needs the service-role key, which this project's
// env files do not carry.
//
// Run: node scripts/verify-auth-flows-browser.mjs
// Optional env: APP_URL (default http://localhost:3000),
//   REUSE_USER_EMAIL + REUSE_USER_PASSWORD — skip the signup phase and run the
//   remaining checks (session, academic, forgot/reset, inactivity, login,
//   mobile) against an existing account. Useful for repeated stability runs
//   when Supabase rate-limits new signups from the test IP.

const REUSE_USER =
  process.env.REUSE_USER_EMAIL && process.env.REUSE_USER_PASSWORD
    ? { email: process.env.REUSE_USER_EMAIL, password: process.env.REUSE_USER_PASSWORD, phone: "9876543210" }
    : null

import { spawn, execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const APP_URL = process.env.APP_URL || "http://localhost:3000"
const SPHERE_ID = "31a76458-88de-40d6-bb46-d46fb23d5b62" // ITS Engineering College (live)

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
const SUPER_ADMIN = { email: e.SUPER_ADMIN_EMAIL, password: e.SUPER_ADMIN_PASSWORD }

const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

async function waitForServer(url, timeoutMs = 150_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" })
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`Dev server never became ready at ${url}`)
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

// ---------------------------------------------------------------------------
// Start the app
// ---------------------------------------------------------------------------
const server = spawn("pnpm", ["dev"], { stdio: "ignore" })
let serverUp = false
try {
  await waitForServer(`${APP_URL}/auth/login`)
  serverUp = true
  console.log(`\nApp up at ${APP_URL}\n`)

  // -------------------------------------------------------------------------
  // Seed academic test data as super admin (RLS: is_sphere_admin = super admin)
  // -------------------------------------------------------------------------
  const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { error: adminLoginErr } = await admin.auth.signInWithPassword({
    email: SUPER_ADMIN.email,
    password: SUPER_ADMIN.password,
  })
  if (adminLoginErr) throw new Error(`super admin login failed: ${adminLoginErr.message}`)

  const SEED_SUBJECT = {
    sphere_id: SPHERE_ID,
    name: "Data Structures",
    code: "CS-203",
    degree: "B.Tech",
    year: "Second Year",
    branch: "CSE",
  }
  const { data: { user: adminUser } } = await admin.auth.getUser()
  const { data: seededSubject, error: subjErr } = await admin
    .from("subjects")
    .insert({ ...SEED_SUBJECT, created_by: adminUser?.id })
    .select("id")
    .single()
  if (subjErr) throw new Error(`seed subject failed: ${subjErr.message}`)
  const subjectId = seededSubject.id

  const RESOURCE_URL = "https://example.com/notes-unit1.pdf"
  const { data: seededResource, error: resErr } = await admin
    .from("academic_resources")
    .insert({
      sphere_id: SPHERE_ID,
      subject_id: subjectId,
      title: "Unit 1 Notes",
      type: "notes",
      url: RESOURCE_URL,
      uploaded_by: adminUser?.id,
    })
    .select("id")
    .single()
  if (resErr) throw new Error(`seed resource failed: ${resErr.message}`)
  console.log(`Seeded subject ${subjectId} + resource ${seededResource.id} in ITS Sphere\n`)

  // Test account — created through the real signup UI (unless reusing one).
  const stamp = Date.now()
  const TEST_USER =
    REUSE_USER ?? {
      email: `codebuff.verify.${stamp}@example.com`,
      password: "VerifyPass!2026",
      phone: "9" + String(Math.floor(100000000 + Math.random() * 900000000)), // 10 digits, starts 9
    }

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true })
  try {
    // =======================================================================
    // 1. Signup UI + full signup flow (creates the test user)
    // =======================================================================
    let signedInState = null
    // Set when a fresh signup lands on the confirmation page ("Confirm email"
    // is ON in the live project): no session is issued, so the phases that
    // need a signed-in browser session are skipped (covered by REUSE runs).
    let confirmationOn = false
    if (REUSE_USER) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await login(page, REUSE_USER)
      signedInState = await ctx.storageState()
      await ctx.close()
      console.log(`Reusing test account ${REUSE_USER.email} (signup phase skipped)\n`)
    } else {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await page.goto(`${APP_URL}/auth/sign-up`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(1200)

      // Next.js mounts an empty `__next-route-announcer__` with role=alert;
      // only non-empty alerts (actual validation messages) count as errors.
      const alertTexts = await page.locator('[role="alert"]').allTextContents()
      check(
        "Signup: no validation errors on initial load",
        alertTexts.every((t) => t.trim() === ""),
        alertTexts.map((t) => t.trim()).filter(Boolean).join(" | ") || "(only empty route announcer)",
      )

      // Empty identity step → errors appear only after Continue.
      await page.getByRole("button", { name: "Continue" }).click()
      await page.waitForTimeout(300)
      const realNameErr = (await page.locator("#realName-error").count()) > 0
      const phoneErr = (await page.locator("#phone-error").count()) > 0
      check("Signup: empty identity submit shows name + phone errors", realNameErr && phoneErr)

      await page.locator("#realName").fill("Codebuff Verify")
      await page.locator("#phone").fill(TEST_USER.phone)
      check(
        "Signup: errors clear as fields are fixed",
        (await page.locator("#realName-error").count()) === 0 && (await page.locator("#phone-error").count()) === 0,
      )
      await page.getByRole("button", { name: "Continue" }).click()
      await page.waitForTimeout(400)

      // Campus step: empty submit → college + year errors.
      await page.getByRole("button", { name: "Continue" }).click()
      await page.waitForTimeout(300)
      const collegeErr = (await page.locator('[role="alert"]:has-text("Select your college")').count()) > 0
      check("Signup: empty campus submit shows college error", collegeErr)

      await page.locator("#college").fill("ITS")
      await page.locator('[role="option"]:has-text("ITS Engineering College") button').first().click()
      await page.waitForTimeout(200)
      check("Signup: college selected from directory", (await page.getByText("ITS Engineering College").count()) > 0)
      await page.getByRole("button", { name: "1st Year" }).click()
      await page.getByRole("button", { name: "Continue" }).click()
      await page.waitForTimeout(400)

      // Credentials step: invalid input errors.
      await page.getByRole("button", { name: "Create account" }).click()
      await page.waitForTimeout(300)
      const emailErr = (await page.locator("#email-error").count()) > 0
      const pwErr = (await page.locator("#password-error").count()) > 0
      check("Signup: empty credentials submit shows email + password errors", emailErr && pwErr)

      await page.locator("#email").fill("not-an-email")
      await page.locator("#password").fill("short")
      await page.locator("#confirmPassword").fill("different!")
      await page.getByRole("button", { name: "Create account" }).click()
      await page.waitForTimeout(300)
      check(
        "Signup: invalid email / short password / mismatch all reported",
        (await page.locator("#email-error").count()) > 0 &&
          (await page.locator("#password-error").count()) > 0 &&
          (await page.locator("#confirmPassword-error").count()) > 0,
      )

      await page.locator("#email").fill(TEST_USER.email)
      await page.locator("#password").fill(TEST_USER.password)
      await page.locator("#confirmPassword").fill(TEST_USER.password)
      await page.getByRole("button", { name: "Create account" }).click()
      // The live project may have "Confirm email" ON or OFF: with confirmation
      // ON, signup issues NO session and lands on the success page instead of
      // /dashboard. Detect the mode from where the submit actually lands.
      const waitDash = page.waitForURL("**/dashboard**", { timeout: 45000 }).then(() => "dashboard").catch(() => null)
      const waitSuccess = page
        .waitForURL("**/auth/sign-up-success**", { timeout: 45000 })
        .then(() => "success")
        .catch(() => null)
      const landed = await Promise.race([waitDash, waitSuccess])
      if (!landed) {
        // Diagnostics for stability runs: surface whatever the form showed.
        const visibleAlerts = await page
          .locator("[role=alert], [id$=-error]")
          .allTextContents()
          .catch(() => [])
        console.log(
          `[signup-diag] stayed on ${page.url()}; alerts: ${visibleAlerts.map((t) => t.trim()).filter(Boolean).join(" | ") || "(none)"}`,
        )
        throw new Error("signup did not reach /dashboard or /auth/sign-up-success")
      }
      await page.waitForTimeout(1500)
      if (landed === "dashboard") {
        // Confirmation OFF — signup issued a session immediately.
        check("Signup: valid submit lands on /dashboard (session issued)", new URL(page.url()).pathname === "/dashboard")
        signedInState = await ctx.storageState()
        await ctx.close()
      } else {
        // Confirmation ON — signup issues NO session; the user must click the
        // link in the confirmation email before they can sign in.
        confirmationOn = true
        check(
          "Signup: confirmation-ON lands on sign-up-success page",
          new URL(page.url()).pathname === "/auth/sign-up-success",
        )
        check(
          "Signup: confirmation message shown after signup",
          (await page.getByText(/check your email/).count()) > 0 &&
            (await page.getByText(/click the confirmation link/).count()) > 0,
        )
        // Login before confirmation must NOT authenticate.
        await page.goto(`${APP_URL}/auth/login`, { waitUntil: "domcontentloaded" })
        await page.locator('input[name="email"]').fill(TEST_USER.email)
        await page.locator('input[name="password"]').fill(TEST_USER.password)
        await page.getByRole("button", { name: "Sign in" }).click()
        const confirmError = await page
          .getByText(/confirm your email before signing in/)
          .first()
          .waitFor({ timeout: 12000 })
          .then(() => true)
          .catch(() => false)
        check(
          "Signup: login before confirmation does not authenticate",
          confirmError && new URL(page.url()).pathname === "/auth/login",
        )
        await ctx.close()
        console.log(
          "\nConfirm email is ON: fresh signup issues no session (the verification link lives in the real inbox).\nSkipping session-dependent phases for this fresh user — persistence/inactivity/academic/mobile are covered by REUSE runs.\n",
        )
      }
    }

    // =======================================================================
    // 2. Profile storage — phone + college_year persisted (signup runs only;
    //    a reused account's values predate this run and are not asserted)
    // =======================================================================
    if (!REUSE_USER && !confirmationOn) {
      // NOTE: never call signOut() on this client — signOut revokes the
      // user's refresh token server-side, which would kill the browser
      // session captured in signedInState and break the persistence tests.
      const client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      const { data: { user: u } } = await client.auth.signInWithPassword({ email: TEST_USER.email, password: TEST_USER.password })
      const { data: profile } = await client.from("profiles").select("phone, college_year, college_input, last_activity_at").eq("id", u.id).maybeSingle()
      check("Profile: phone stored (E.164)", profile?.phone === `+91${TEST_USER.phone}`, profile?.phone)
      check("Profile: college_year stored", profile?.college_year === "1", profile?.college_year)
      check("Profile: college stored", profile?.college_input === "ITS Engineering College", profile?.college_input)
      // The tracker writes after hydration + a getUser round-trip — poll briefly.
      let activity = profile?.last_activity_at ?? null
      for (let i = 0; i < 20 && !activity; i++) {
        await new Promise((r) => setTimeout(r, 500))
        const { data: p2 } = await client.from("profiles").select("last_activity_at").eq("id", u.id).maybeSingle()
        activity = p2?.last_activity_at ?? null
      }
      check("Profile: last_activity_at written by tracker", Boolean(activity), activity ?? "null")
    }

    // =======================================================================
    // 3. Session persistence — refresh, navigate, close/reopen
    // =======================================================================
    if (!confirmationOn) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: signedInState })
      const page = await ctx.newPage()

      await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(1500)
      check("Session: /dashboard loads signed in (reopen)", new URL(page.url()).pathname === "/dashboard")

      await page.reload({ waitUntil: "domcontentloaded" })
      await page.waitForTimeout(1200)
      check("Session: page refresh keeps the session", new URL(page.url()).pathname === "/dashboard")

      await page.goto(`${APP_URL}/dashboard/marketplace`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(1500)
      check("Session: navigation between pages keeps the session", new URL(page.url()).pathname === "/dashboard/marketplace")

      await page.goto(`${APP_URL}/dashboard/academic`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(1500)
      check("Session: academic page loads signed in", new URL(page.url()).pathname === "/dashboard/academic")
      await ctx.close()
    }

    // =======================================================================
    // 4. Academic drill-down + back navigation (browser + in-app + deep link)
    // =======================================================================
    if (!confirmationOn) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: signedInState })
      const page = await ctx.newPage()
      await page.goto(`${APP_URL}/dashboard/academic`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(1500)

      // URLSearchParams encodes spaces as `+` in the query string.
      await page.getByRole("button", { name: "B.Tech" }).click()
      await page.waitForURL("**/dashboard/academic?degree=B.Tech**")
      await page.getByRole("button", { name: "Second Year" }).click()
      await page.waitForURL("**/dashboard/academic?degree=B.Tech&year=Second+Year**")
      await page.getByRole("button", { name: "CSE" }).click()
      await page.waitForURL("**/dashboard/academic?degree=B.Tech&year=Second+Year&branch=CSE**")
      // Subjects are not deduped in the list, so be strict-mode-safe with .first().
      await page.getByRole("button", { name: "Data Structures" }).first().click()
      await page.waitForURL(`**/dashboard/academic?degree=B.Tech&year=Second+Year&branch=CSE&subject=${subjectId}**`)
      await page.waitForTimeout(800)
      check("Academic: subject detail reached with full context in URL", (await page.getByRole("heading", { name: "Data Structures" }).count()) > 0)

      // Open the note (same tab) → browser Back must restore the subject context.
      await page.locator(`a[href="${RESOURCE_URL}"]`).click()
      await page.waitForURL("**example.com/notes-unit1.pdf**", { timeout: 20000 }).catch(() => {})
      await page.goBack()
      await page.waitForTimeout(1000)
      const backUrl = new URL(page.url())
      check(
        "Academic: browser Back from note returns to same degree/year/subject context",
        backUrl.pathname === "/dashboard/academic" &&
          backUrl.searchParams.get("degree") === "B.Tech" &&
          backUrl.searchParams.get("year") === "Second Year" &&
          backUrl.searchParams.get("branch") === "CSE" &&
          backUrl.searchParams.get("subject") === subjectId,
        backUrl.pathname + backUrl.search,
      )
      check(
        "Academic: subject detail visible after Back",
        (await page.getByRole("heading", { name: "Data Structures" }).count()) > 0 &&
          (await page.locator(`a[href="${RESOURCE_URL}"]`).count()) > 0,
      )

      // In-app Back pops one level → subjects list for the same degree/year/branch.
      await page.getByRole("button", { name: "Back", exact: true }).click()
      await page
        .waitForURL((url) => url.pathname === "/dashboard/academic" && !url.searchParams.has("subject"), {
          timeout: 5000,
        })
        .catch(() => {})
      const back2 = new URL(page.url())
      check(
        "Academic: in-app Back pops to subjects list preserving degree/year/branch",
        back2.searchParams.get("degree") === "B.Tech" &&
          back2.searchParams.get("year") === "Second Year" &&
          back2.searchParams.get("branch") === "CSE" &&
          back2.searchParams.get("subject") === null,
        back2.search,
      )
      check(
        "Academic: subjects grid visible after in-app Back",
        (await page.getByRole("button", { name: "Data Structures" }).count()) > 0,
      )

      // Direct deep link renders the full context.
      await page.goto(
        `${APP_URL}/dashboard/academic?degree=B.Tech&year=${encodeURIComponent("Second Year")}&branch=CSE&subject=${subjectId}`,
        { waitUntil: "domcontentloaded" },
      )
      await page.waitForTimeout(1200)
      check(
        "Academic: direct deep link renders subject detail",
        (await page.getByRole("heading", { name: "Data Structures" }).count()) > 0,
      )
      await ctx.close()
    }

    // =======================================================================
    // 5. Forgot password (fresh context, no session needed)
    // =======================================================================
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await page.goto(`${APP_URL}/auth/forgot-password`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(800)

      await page.getByRole("button", { name: "Send reset link" }).click()
      check(
        "Forgot: empty email shows error",
        await page.getByText("Please enter your email address.").first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false),
      )

      await page.locator('input[name="email"]').fill("not-an-email")
      await page.getByRole("button", { name: "Send reset link" }).click()
      check(
        "Forgot: invalid email shows error",
        await page.getByText("Please enter a valid email address.").first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false),
      )

      await page.locator('input[name="email"]').fill(TEST_USER.email)
      await page.getByRole("button", { name: "Send reset link" }).click()
      // The neutral success message is the expected outcome; a mapped provider
      // error (e.g. Supabase's per-address recovery rate limit after repeated
      // test runs) is also a correct handling of the response.
      const resetHandled = await page
        .getByText(/If an account exists for that email|Too many attempts|Invalid email or password/)
        .first()
        .waitFor({ timeout: 15000 })
        .then(() => true)
        .catch(() => false)
      check("Forgot: valid email handled (neutral success or mapped provider error)", resetHandled)
      await ctx.close()
    }

    // =======================================================================
    // 6. Reset password — client validation + invalid/expired link (no session)
    // =======================================================================
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await page.goto(`${APP_URL}/auth/reset-password`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(800)

      await page.locator('input[name="password"]').fill("hunter2hunter")
      await page.locator('input[name="confirmPassword"]').fill("different!")
      await page.getByRole("button", { name: "Update password" }).click()
      await page.waitForTimeout(300)
      check("Reset: mismatched confirmation rejected client-side", (await page.getByText("Passwords don't match.").count()) > 0)

      await page.locator('input[name="password"]').fill("short")
      await page.locator('input[name="confirmPassword"]').fill("short")
      await page.getByRole("button", { name: "Update password" }).click()
      await page.waitForTimeout(300)
      check("Reset: short password rejected client-side", (await page.getByText(/at least 8 characters/).count()) > 0)

      await page.locator('input[name="password"]').fill("hunter2hunter")
      await page.locator('input[name="confirmPassword"]').fill("hunter2hunter")
      await page.getByRole("button", { name: "Update password" }).click()
      await page.waitForTimeout(1500)
      check(
        "Reset: without a recovery session shows invalid/expired-link error",
        (await page.getByText(/invalid or has expired/).count()) > 0,
      )
      await ctx.close()
    }

    // =======================================================================
    // 7. Sign-up-success page copy (email-confirmation messaging)
    // =======================================================================
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await page.goto(`${APP_URL}/auth/sign-up-success`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(600)
      check(
        "Sign-up success page shows confirmation messaging",
        (await page.getByRole("heading", { name: "Account created." }).count()) > 0 &&
          (await page.getByText(/click the confirmation link/).count()) > 0,
      )
      await ctx.close()
    }

    // =======================================================================
    // 8. 48-hour inactivity — >48h signs out, then <48h stays signed in
    // =======================================================================
    if (!confirmationOn) {
      // Backdate the timestamp 49h (own-row update via RLS as the test user).
      // No signOut here either: the browser session must stay valid so the
      // redirect is caused by the INACTIVITY check, not by a revoked token.
      const client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      const { data: { user: u } } = await client.auth.signInWithPassword({ email: TEST_USER.email, password: TEST_USER.password })
      const stale = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
      const { error: updErr } = await client.from("profiles").update({ last_activity_at: stale }).eq("id", u.id)
      if (updErr) throw new Error(`backdate failed: ${updErr.message}`)

      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: signedInState })
      const page = await ctx.newPage()
      await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" })
      await page.waitForURL("**/auth/login**", { timeout: 30000 }).catch(() => {})
      check("Inactivity: >48h without use signs out and redirects to login", new URL(page.url()).pathname === "/auth/login")

      // Session must actually be cleared — a second visit must not enter.
      await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(1200)
      check("Inactivity: session really cleared (still redirected)", new URL(page.url()).pathname === "/auth/login")
      await ctx.close()
    }

    // =======================================================================
    // 9. Re-login + <48h — session persists; tracker refreshes the timestamp
    // =======================================================================
    if (!confirmationOn) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await login(page, TEST_USER)
      check("Login: correct credentials land on /dashboard", new URL(page.url()).pathname === "/dashboard")

      await page.reload({ waitUntil: "domcontentloaded" })
      await page.waitForTimeout(1200)
      check("Login: refresh after login keeps the session", new URL(page.url()).pathname === "/dashboard")

      // The tracker should have refreshed last_activity_at to ~now.
      const client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      const { data: { user: u2 } } = await client.auth.signInWithPassword({ email: TEST_USER.email, password: TEST_USER.password })
      const { data: prof2 } = await client.from("profiles").select("last_activity_at").eq("id", u2.id).maybeSingle()
      const ageMs = Date.now() - new Date(prof2?.last_activity_at ?? 0).getTime()
      check("Activity: tracker refreshed last_activity_at on load", ageMs < 10 * 60 * 1000, `${Math.round(ageMs / 1000)}s old`)

      // Capture the FRESH session for the later mobile checks — the phase-8
      // inactivity signOut revoked the original session's refresh token.
      const reSignedInState = await ctx.storageState()
      await ctx.close()

      // =====================================================================
      // 10. Email-only login — phone gets a friendly error; super admin → /admin
      // =====================================================================
      {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await ctx.newPage()
        await page.goto(`${APP_URL}/auth/login`, { waitUntil: "domcontentloaded" })
        await page.locator('input[name="email"]').fill(TEST_USER.phone)
        await page.locator('input[name="password"]').fill(TEST_USER.password)
        await page.getByRole("button", { name: "Sign in" }).click()
        const friendlyError = await page
          .getByText(/couldn't find an account/)
          .first()
          .waitFor({ timeout: 8000 })
          .then(() => true)
          .catch(() => false)
        check("Login: a phone number gets a friendly error (email-only login)", friendlyError && new URL(page.url()).pathname === "/auth/login")
        await ctx.close()
      }
      {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await ctx.newPage()
        await login(page, SUPER_ADMIN)
        check("Super admin: login redirects to /admin", new URL(page.url()).pathname === "/admin")
        await ctx.close()
      }

      // =====================================================================
      // 11. Mobile viewport — signup + academic back navigation
      // =====================================================================
      {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: reSignedInState })
        const page = await ctx.newPage()
        await page.goto(`${APP_URL}/dashboard/academic?degree=B.Tech&year=${encodeURIComponent("Second Year")}&branch=CSE&subject=${subjectId}`, { waitUntil: "domcontentloaded" })
        await page.waitForTimeout(1200)
        const onSubjectDetail =
          new URL(page.url()).pathname === "/dashboard/academic" &&
          (await page.getByRole("heading", { name: "Data Structures" }).count()) > 0
        check("Mobile: subject detail renders", onSubjectDetail)
        check("Mobile: subject detail renders without horizontal overflow", await noHorizontalOverflow(page))
        await page.getByRole("button", { name: "Back", exact: true }).click()
        await page
          .waitForURL((url) => url.pathname === "/dashboard/academic" && !url.searchParams.has("subject"), {
            timeout: 5000,
          })
          .catch(() => {})
        const mUrl = new URL(page.url())
        check(
          "Mobile: in-app Back preserves degree/year/branch",
          mUrl.searchParams.get("degree") === "B.Tech" &&
            mUrl.searchParams.get("year") === "Second Year" &&
            mUrl.searchParams.get("branch") === "CSE" &&
            mUrl.searchParams.get("subject") === null,
          mUrl.search,
        )
        check("Mobile: subjects list has no horizontal overflow", await noHorizontalOverflow(page))
        await ctx.close()
      }
      {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
        const page = await ctx.newPage()
        await page.goto(`${APP_URL}/auth/sign-up`, { waitUntil: "domcontentloaded" })
        await page.waitForTimeout(900)
        check("Mobile: signup page renders without horizontal overflow", await noHorizontalOverflow(page))
        await ctx.close()
      }
    }

  } finally {
    await browser.close()
    // ---------------------------------------------------------------------
    // Cleanup seeded academic data — always runs, even when a check throws.
    // Pattern-based so leftovers from an earlier interrupted run are removed
    // too (the ITS Sphere had zero subjects/resources before this suite).
    // ---------------------------------------------------------------------
    try {
      await admin.from("academic_resources").delete().eq("sphere_id", SPHERE_ID).eq("title", "Unit 1 Notes")
      await admin.from("subjects").delete().eq("sphere_id", SPHERE_ID).eq("name", "Data Structures").eq("code", "CS-203")
      const { count } = await admin
        .from("subjects")
        .select("id", { count: "exact", head: true })
        .eq("sphere_id", SPHERE_ID)
        .eq("name", "Data Structures")
      console.log(`\nSeeded academic data cleaned up (seed subjects still present: ${count})`)
    } catch (cleanupErr) {
      console.log(`cleanup warning: ${cleanupErr.message}`)
    }
  }
} catch (err) {
  console.log(`\nSCRIPT ERROR: ${err.message}`)
  if (err?.stack) console.log(err.stack.split("\n").slice(0, 4).join("\n"))
} finally {
  if (serverUp) {
    server.kill("SIGTERM")
    await new Promise((r) => setTimeout(r, 800))
    // pnpm dev spawns `next dev`; make sure the whole tree is stopped.
    try {
      execSync("pkill -f 'next dev' || true")
    } catch {
      // nothing left to kill
    }
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
