"use server"

import { createClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isValidEmail, mapAuthError, normalizeEmail, normalizeIndianPhone, validateLogin, validateSignup } from "@/lib/validation"

async function getRedirectUrl() {
  // The dev override exists so a tunneled/local Supabase project can receive
  // auth redirects during development. Never use it in production — a stray
  // env var must not send production auth flows to localhost.
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL) {
    return process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
  }
  const h = await headers()
  const origin = h.get("origin") ?? `https://${h.get("host")}`
  return `${origin}/auth/callback`
}

export type ActionResult = { error: string | null }
export type SignUpResult = { error: string | null; needsEmailConfirmation: boolean }

export async function signUpAction(formData: FormData): Promise<SignUpResult> {
  const realName = String(formData.get("realName") || "").trim()
  const phone = String(formData.get("phone") || "").trim()
  const collegeInput = String(formData.get("college") || "").trim()
  const collegeId = String(formData.get("collegeId") || "").trim()
  const collegeYear = String(formData.get("collegeYear") || "").trim()
  const email = normalizeEmail(String(formData.get("email") || ""))
  const password = String(formData.get("password") || "")
  const confirmPassword = String(formData.get("confirmPassword") || "")

  const validationError = validateSignup({
    realName,
    phone,
    college: collegeInput,
    email,
    password,
    confirmPassword,
  })
  if (validationError) return { error: validationError, needsEmailConfirmation: false }

  // Phone is profile information only — no SMS/OTP verification is required.
  // It is stored in the profile so admins can reach the member, and the
  // partial unique index still enforces one phone = one account.
  const normalizedPhone = normalizeIndianPhone(phone)
  if (!normalizedPhone) return { error: "Enter a valid 10-digit Indian phone number.", needsEmailConfirmation: false }

  const supabase = await createClient()
  const emailRedirectTo = await getRedirectUrl()

  // The college must come from the admin-managed directory. Free text never
  // creates a Sphere; unknown colleges go through /request-college instead.
  // Never trust a browser-supplied college_id: verify the college exists, is
  // active, and is joinable before passing it to the signup trigger.
  let resolvedCollegeId: string | null = null
  if (collegeId) {
    const { data: college } = await supabase
      .from("colleges")
      .select("id, status")
      .eq("id", collegeId)
      .maybeSingle()
    if (college && college.status === "active") resolvedCollegeId = college.id
  }
  if (!resolvedCollegeId) {
    return { error: "Select your college from the directory. Can't find it? Request your college first.", needsEmailConfirmation: false }
  }

  if (collegeYear && !["1", "2", "3", "4", "other"].includes(collegeYear)) {
    return { error: "Pick your current year.", needsEmailConfirmation: false }
  }

  // ONE PHONE = ONE ACCOUNT. The DB has a partial unique index on
  // profiles.phone; this server-side check gives a friendly error first and
  // the index is the hard backstop against races.
  const { data: existingPhone } = await supabase.from("profiles").select("id").eq("phone", normalizedPhone).maybeSingle()
  if (existingPhone) {
    return { error: "This phone number is already linked to an account. Try signing in.", needsEmailConfirmation: false }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        real_name: realName,
        phone: normalizedPhone,
        college_input: collegeInput,
        college_id: resolvedCollegeId,
        college_year: collegeYear,
      },
    },
  })

  if (error) {
    return { error: mapAuthError(error.message), needsEmailConfirmation: false }
  }

  // With email confirmation DISABLED, signUp returns a session immediately —
  // the user is signed in and goes straight to the app (no "check your
  // inbox" step). With confirmation enabled, we show the confirmation page.
  const needsEmailConfirmation = !data.session

  return { error: null, needsEmailConfirmation }
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const identifier = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  const validationError = validateLogin(identifier, password)
  if (validationError) return { error: validationError }

  const supabase = await createClient()

  // Login is email-based. (Phone is profile information only — see the signup
  // flow — and a phone→email lookup here would require exposing private
  // profile data to unauthenticated requests, so it is deliberately not done.)
  const email = normalizeEmail(identifier)
  if (!email || !isValidEmail(email)) return { error: "We couldn't find an account with those details." }

  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: mapAuthError(error.message) }
  }

  // Super admins are platform-global: after a successful login they go straight
  // to /admin — never to onboarding, regardless of college membership. The role
  // is read from the DB profile (authoritative, server-side), never the client.
  if (signInData?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", signInData.user.id)
      .maybeSingle()
    if (profile?.role === "super_admin") {
      redirect("/admin")
    }
  }

  return { error: null }
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/auth/login")
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim()
  if (!email) return { error: "Please enter your email address." }
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." }

  const supabase = await createClient()

  // Supabase's native email reset flow. The recovery link points at the auth
  // callback (exchanging the PKCE code server-side) and then lands on
  // /auth/reset-password. redirectTo must be present in the project's
  // "Allowed Redirect URLs" (see the manual settings report).
  const redirectTo = `${await getRedirectUrl()}?next=/auth/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    return { error: mapAuthError(error.message) }
  }

  // Unknown emails also return success here (Supabase deliberately does not
  // reveal whether an account exists) — the page shows the neutral
  // "if an account exists…" message either way.
  return { error: null }
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") || "")
  const confirmPassword = String(formData.get("confirmPassword") || "")
  if (password.length < 8) return { error: "Password must be at least 8 characters." }
  if (password !== confirmPassword) return { error: "Passwords don't match." }

  const supabase = await createClient()

  // A password reset requires a valid Supabase recovery session — the one
  // issued when the user clicked the emailed reset link (never a custom token
  // stored in our database). Without it, the link was invalid, expired, or
  // already used.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "This password reset link is invalid or has expired. Please request a new one." }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("session") || msg.includes("expired") || msg.includes("user")) {
      return { error: "This password reset link is invalid or has expired. Please request a new one." }
    }
    return { error: mapAuthError(error.message) }
  }

  return { error: null }
}
