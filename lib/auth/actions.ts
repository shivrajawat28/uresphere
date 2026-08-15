"use server"

import { createClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { mapAuthError, normalizeEmail, validateLogin, validateSignup } from "@/lib/validation"

async function getRedirectUrl() {
  if (process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL) {
    return process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
  }
  const h = await headers()
  const origin = h.get("origin") ?? `https://${h.get("host")}`
  return `${origin}/auth/callback`
}

export type ActionResult = { error: string | null }


export async function signUpAction(formData: FormData): Promise<ActionResult> {
  const realName = String(formData.get("realName") || "").trim()
  const phone = String(formData.get("phone") || "").trim()
  const collegeInput = String(formData.get("college") || "").trim()
  const collegeId = String(formData.get("collegeId") || "").trim()
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
  if (validationError) return { error: validationError }

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
    return { error: "Select your college from the directory. Can't find it? Request your college first." }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        real_name: realName,
        phone,
        college_input: collegeInput,
        college_id: resolvedCollegeId,
      },
    },
  })

  if (error) {
    return { error: mapAuthError(error.message) }
  }

  return { error: null }
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
