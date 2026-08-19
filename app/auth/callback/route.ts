import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"
  const type = searchParams.get("type")
  const errorDescription = searchParams.get("error_description")

  // If Supabase returned an error (e.g. expired token, invalid redirect URL),
  // show the error page with a helpful message.
  if (errorDescription) {
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  // Password recovery links from Supabase come as:
  //   /auth/callback?code=...&type=recovery
  // In newer Supabase versions, the `type` param may NOT be present in the
  // redirect URL — only the PKCE code is passed. Handle both cases.
  const isRecovery = type === "recovery"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // For recovery: always go to the reset-password page.
      // For other flows (signup, magic link): go to the next param or dashboard.
      if (isRecovery || next === "/auth/reset-password") {
        return NextResponse.redirect(`${origin}/auth/reset-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
    // Code exchange failed — could be expired or already used.
    // For recovery, still redirect to reset-password which shows a helpful
    // "link expired" message. For other flows, go to the error page.
    if (isRecovery || next === "/auth/reset-password") {
      return NextResponse.redirect(`${origin}/auth/reset-password`)
    }
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  // No code at all — if this was a recovery flow, send to reset-password
  // (which handles the case gracefully). Otherwise, error page.
  if (isRecovery || next === "/auth/reset-password") {
    return NextResponse.redirect(`${origin}/auth/reset-password`)
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
