import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { sanitizeRedirectPath } from "@/lib/validation"

const PROTECTED_PREFIXES = ["/dashboard", "/chat", "/marketplace", "/admin", "/onboarding", "/settings"]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {

      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  // Do not run code between createServerClient and supabase.auth.getUser().
  // IMPORTANT: getUser() automatically refreshes the session if the access
  // token is expired but the refresh token is still valid. This is what
  // keeps users logged in after closing and reopening the browser — the
  // refresh token (stored in a persistent cookie with maxAge=1 year) is
  // exchanged for a new access token, and the updated tokens are written
  // back to cookies via the setAll callback above.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtected = PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    url.searchParams.set("next", path)
    return NextResponse.redirect(url)
  }

  // Already-authenticated user visiting login page should go straight to dashboard
  if (path === "/auth/login" && user) {
    const rawNext = request.nextUrl.searchParams.get("next")
    const next = rawNext ? sanitizeRedirectPath(rawNext, "/dashboard") : "/dashboard"
    const target = next === "/auth/login" ? "/dashboard" : next
    const url = request.nextUrl.clone()
    url.pathname = target
    url.search = ""
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  return supabaseResponse
}
