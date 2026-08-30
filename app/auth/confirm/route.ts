import { createClient } from "@/lib/supabase/server"
import { getSiteUrl } from "@/lib/site-url"
import { sanitizeRedirectPath } from "@/lib/validation"
import { type EmailOtpType } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const token_hash = searchParams.get("token_hash")
  const type = (searchParams.get("type") as EmailOtpType | null) ?? "email"
  const next = sanitizeRedirectPath(searchParams.get("next"))
  const errorDescription = searchParams.get("error_description")
  const baseUrl = getSiteUrl()

  if (errorDescription) {
    const errorParam = encodeURIComponent(searchParams.get("error") || "auth_error")
    const descParam = encodeURIComponent(errorDescription)
    return NextResponse.redirect(`${baseUrl}/auth/error?error=${errorParam}&error_description=${descParam}`)
  }

  if (token_hash) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      if (type === "recovery" || next === "/auth/reset-password") {
        return NextResponse.redirect(`${baseUrl}/auth/reset-password`)
      }
      return NextResponse.redirect(`${baseUrl}${next}`)
    }

    const desc = encodeURIComponent(error.message || "Verification link is invalid or has expired.")
    const code = encodeURIComponent(error.code || "otp_expired")
    return NextResponse.redirect(`${baseUrl}/auth/error?error=${code}&error_description=${desc}`)
  }

  return NextResponse.redirect(
    `${baseUrl}/auth/error?error=missing_token&error_description=${encodeURIComponent(
      "That verification link is missing or invalid. Please request a new link.",
    )}`,
  )
}
