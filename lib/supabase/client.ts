import { createBrowserClient } from "@supabase/ssr"

const ONE_YEAR = 60 * 60 * 24 * 365

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ONE_YEAR,
        // Explicit path ensures the auth cookies are sent on every request,
        // which is required for session persistence across browser restarts.
        path: "/",
      },
    },
  )
}
