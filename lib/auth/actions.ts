"use server"

import { createClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { mapAuthError, normalizeEmail, normalizeIndianPhone, validateLogin, validateSignup } from "@/lib/validation"

async function getRedirectUrl() {
  if (process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL) {
    return process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
  }
  const h = await headers()
  const origin = h.get("origin") ?? `https://${h.get("host")}`
  return `${origin}/auth/callback`
}

export type ActionResult = { error: string | null }
export type SignUpResult = { error: string | null; needsEmailConfirmation: boolean }

// ---------------------------------------------------------------------------
// Phone helpers (Parts 16–17)
// ---------------------------------------------------------------------------

/**
 * In-memory OTP rate limiter (per process). Supabase additionally enforces a
 * per-number cooldown (default 60s) and token expiry server-side; this is a
 * cheap first line so a single user can't hammer the SMS provider.
 */
const otpSentAt = new Map<string, number>()
const OTP_COOLDOWN_MS = 60_000

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "")
}

/**
 * Sends a signup OTP to an (as yet unregistered) phone number. The account is
 * created only AFTER the OTP is verified and the rest of the form is valid.
 * Requires Supabase phone auth + an SMS provider (see the manual settings
 * report). Errors are surfaced as-is — never logged.
 */
export async function sendSignupOtpAction(rawPhone: string): Promise<{ error: string | null }> {
  const phone = normalizeIndianPhone(rawPhone)
  if (!phone) return { error: "Enter a valid 10-digit Indian phone number." }

  const supabase = await createClient()
  const key = phoneKey(phone)

  // Duplicate-phone check (defense in depth behind the DB unique index).
  const { data: existing } = await supabase.from("profiles").select("id").eq("phone", phone).maybeSingle()
  if (existing) return { error: "This phone number is already linked to an account. Try signing in." }

  const last = otpSentAt.get(key)
  if (last && Date.now() - last < OTP_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_COOLDOWN_MS - (Date.now() - last)) / 1000)
    return { error: `Please wait ${wait}s before requesting another code.` }
  }

  // Never create a phone-only account at OTP-send time: the account is only
  // created after the OTP is verified AND the rest of the signup form is
  // valid. shouldCreateUser:false sends the code without registering the
  // number (GoTrue would otherwise auto-create a user for unregistered
  // phones, racing our email+password signup and tripping the one-phone
  // uniqueness guarantee).
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } })
  if (error) {
    // Never log OTPs. Surface a friendly version of provider errors.
    const msg = error.message.toLowerCase()
    if (msg.includes("sms") || msg.includes("otp") || msg.includes("provider") || msg.includes("enabled")) {
      return { error: "SMS verification isn't configured for this app yet. Contact support." }
    }
    return { error: mapAuthError(error.message) }
  }

  otpSentAt.set(key, Date.now())
  return { error: null }
}

/**
 * Verifies the OTP for a phone number. Success means the number is real and
 * owned by the person filling the form; the final signup records it.
 */
export async function verifySignupOtpAction(rawPhone: string, token: string): Promise<{ error: string | null }> {
  const phone = normalizeIndianPhone(rawPhone)
  if (!phone) return { error: "Enter a valid 10-digit Indian phone number." }
  const cleanToken = token.trim()
  if (!/^\d{6}$/.test(cleanToken)) return { error: "Enter the 6-digit code you received." }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ phone, token: cleanToken, type: "sms" })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("expired")) return { error: "This code expired. Request a new one." }
    if (msg.includes("invalid") || msg.includes("token")) return { error: "That code isn't right. Check it and try again." }
    if (msg.includes("rate")) return { error: "Too many attempts. Please wait and try again." }
    return { error: mapAuthError(error.message) }
  }
  return { error: null }
}

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

  // Phone must be a real Indian number, and — with phone verification enabled
  // on the project — it must have been OTP-verified during the signup flow.
  const normalizedPhone = normalizeIndianPhone(phone)
  if (!normalizedPhone) return { error: "Enter a valid 10-digit Indian phone number.", needsEmailConfirmation: false }
  const phoneVerified = String(formData.get("phoneVerified") || "") === "true"

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

  // ONE VERIFIED PHONE = ONE ACCOUNT. The DB has a partial unique index on
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
        phone_verified: phoneVerified,
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

  // Users may sign in with email OR phone. If the identifier isn't an email,
  // resolve it to the registered email via the private profile table.
  let email = identifier.includes("@") ? normalizeEmail(identifier) : null
  if (!email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("phone", identifier)
      .maybeSingle()
    email = profile?.email || null
  }
  if (!email) return { error: "We couldn't find an account with those details." }

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

  const supabase = await createClient()
  const redirectTo = `${await getRedirectUrl()}?next=/auth/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    return { error: mapAuthError(error.message) }
  }

  return { error: null }
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") || "")
  if (!password || password.length < 8) return { error: "Password must be at least 8 characters." }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: mapAuthError(error.message) }
  }

  return { error: null }
}
