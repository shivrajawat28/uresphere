import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"
  const type = searchParams.get("type")

  // Password recovery links from Supabase come as:
  //   /auth/callback?code=...&type=recovery#access_token=...&refresh_token=...
  // The hash fragment tokens must be processed client-side (browser only),
  // so we redirect with the full original URL (including hash) preserved.
  if (type === "recovery") {
    if (code) {
      const supabase = await createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        // The server-side session was established. Redirect to the
        // reset-password page. The hash fragment is NOT sent to the server
        // (it is a browser-only concept), so the client-side Supabase
        // library will rely on the cookies set by exchangeCodeForSession.
        return NextResponse.redirect(`${origin}/auth/reset-password`)
      }
    }

    // If the code exchange failed (or there was no code), still redirect to
    // the reset-password page — the client-side recovery handler will pick
    // up the hash fragment tokens and establish the session.
    return NextResponse.redirect(`${origin}/auth/reset-password`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
