import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const ALLOWED_ORIGIN_HOSTS = new Set(["uresphere.in", "www.uresphere.in", "localhost:3000", "127.0.0.1:3000"])

export async function POST(request: NextRequest) {
  // 1. Enforce HTTPS in production
  if (process.env.NODE_ENV === "production") {
    const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "")
    if (proto !== "https") {
      return NextResponse.json({ error: "HTTPS required." }, { status: 403 })
    }
  }

  // 2. Validate Origin to prevent cross-site request abuse
  const origin = request.headers.get("origin")
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase()
      if (!ALLOWED_ORIGIN_HOSTS.has(originHost)) {
        return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin header." }, { status: 400 })
    }
  }

  try {
    const body = await request.json()
    const accessToken = body.access_token
    const refreshToken = body.refresh_token

    // 3. Strict token type & length validation (prevent memory abuse / garbage input)
    if (
      typeof accessToken !== "string" ||
      typeof refreshToken !== "string" ||
      !accessToken.trim() ||
      !refreshToken.trim() ||
      accessToken.length > 8192 ||
      refreshToken.length > 8192
    ) {
      return NextResponse.json({ error: "Missing or invalid token parameters." }, { status: 400 })
    }

    // 4. Authenticate tokens against Supabase Auth GoTrue server
    // setSession cryptographically verifies the JWT signature and refresh token validity.
    // An arbitrary token cannot create a session; Supabase will reject it.
    const supabase = await createClient()
    const { data: sessionData, error } = await supabase.auth.setSession({
      access_token: accessToken.trim(),
      refresh_token: refreshToken.trim(),
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    if (sessionData?.user && typeof supabase.from === "function") {
      await supabase
        .from("profiles")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", sessionData.user.id)
    }

    // 5. Minimal success response — never expose tokens, user metadata, or auth secrets
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to establish session."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
