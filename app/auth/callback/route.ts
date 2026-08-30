import { createClient } from "@/lib/supabase/server"
import { getSiteUrl } from "@/lib/site-url"
import { type EmailOtpType } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function sanitizeRedirectPath(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/dashboard"
  }
  return path
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = sanitizeRedirectPath(searchParams.get("next"))
  const errorParam = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const baseUrl = getSiteUrl()
  const isRecovery = type === "recovery" || next === "/auth/reset-password"

  // 1. If Supabase returned an explicit error in query params (e.g. expired link)
  if (errorDescription || errorParam) {
    const errCode = encodeURIComponent(errorParam || "auth_error")
    const errDesc = encodeURIComponent(errorDescription || "Authentication error occurred.")
    return NextResponse.redirect(`${baseUrl}/auth/error?error=${errCode}&error_description=${errDesc}`)
  }

  const supabase = await createClient()

  // 2. Direct token_hash verification (Supabase SSR recommended email flow)
  if (token_hash) {
    const otpType = (type as EmailOtpType | null) ?? (isRecovery ? "recovery" : "email")
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash,
    })

    if (!error) {
      if (isRecovery) {
        return NextResponse.redirect(`${baseUrl}/auth/reset-password`)
      }
      return NextResponse.redirect(`${baseUrl}${next}`)
    }

    const errCode = encodeURIComponent(error.code || "otp_expired")
    const errDesc = encodeURIComponent(error.message || "Verification link is invalid or has expired.")
    return NextResponse.redirect(`${baseUrl}/auth/error?error=${errCode}&error_description=${errDesc}`)
  }

  // 3. PKCE code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (isRecovery) {
        return NextResponse.redirect(`${baseUrl}/auth/reset-password`)
      }
      return NextResponse.redirect(`${baseUrl}${next}`)
    }

    // Code exchange failed (e.g. expired or used across devices without PKCE cookie).
    // If it was a password reset flow, take them to reset-password to show a friendly error.
    if (isRecovery) {
      return NextResponse.redirect(`${baseUrl}/auth/reset-password`)
    }

    const errCode = encodeURIComponent(error.code || "code_expired")
    const errDesc = encodeURIComponent(error.message || "Verification code is invalid or has expired.")
    return NextResponse.redirect(`${baseUrl}/auth/error?error=${errCode}&error_description=${errDesc}`)
  }

  // 4. Check if the user already has an active session (e.g. already logged in or refreshed)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    return NextResponse.redirect(`${baseUrl}${isRecovery ? "/auth/reset-password" : next}`)
  }

  // 5. Neither code nor token_hash in query string:
  // Supabase's default email template redirects to /auth/callback with tokens in the
  // URL hash fragment: #access_token=...&refresh_token=...&type=signup
  // Standard HTTP servers cannot see the URL hash, so we serve a client-side bridge
  // to extract the tokens and establish the session via /api/auth/session.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Verifying your account | UreSphere</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #0b0f17;
      color: #f3f4f6;
      padding: 1rem;
    }
    .card {
      max-width: 400px;
      width: 100%;
      text-align: center;
      padding: 2rem;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1.25rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
      color: #ffffff;
    }
    p {
      font-size: 0.875rem;
      color: #9ca3af;
      margin: 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" id="spinner"></div>
    <h1 id="title">Verifying your account...</h1>
    <p id="message">Please wait while we complete your verification.</p>
  </div>
  <script>
    (async function() {
      const rawHash = window.location.hash ? window.location.hash.substring(1) : "";
      const hashParams = new URLSearchParams(rawHash);

      const error = hashParams.get("error");
      const errorDescription = hashParams.get("error_description");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");
      const targetNext = ${JSON.stringify(next)};
      const isRecoveryFlow = ${JSON.stringify(isRecovery)} || type === "recovery";

      if (error || errorDescription) {
        const errParam = encodeURIComponent(error || "auth_error");
        const descParam = encodeURIComponent(errorDescription || "Verification link is invalid or has expired.");
        window.location.replace("/auth/error?error=" + errParam + "&error_description=" + descParam);
        return;
      }

      if (accessToken && refreshToken) {
        try {
          const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            if (isRecoveryFlow) {
              window.location.replace("/auth/reset-password");
            } else {
              window.location.replace(targetNext);
            }
            return;
          }
          const failDesc = encodeURIComponent(data.error || "Failed to establish session.");
          window.location.replace("/auth/error?error=session_failed&error_description=" + failDesc);
          return;
        } catch (e) {
          window.location.replace("/auth/error?error=network_error&error_description=" + encodeURIComponent("Network error connecting to verification service."));
          return;
        }
      }

      // If there are no tokens and no errors in the hash, this was an empty direct visit
      window.location.replace("/auth/error?error=missing_token&error_description=" + encodeURIComponent("That verification link is missing or has expired. Try signing in, or request a new link."));
    })();
  </script>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  })
}
