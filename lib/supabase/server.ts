import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ONE_YEAR,
      // Explicit path ensures the auth cookies are read consistently
      // across all routes, which is critical for session persistence
      // when the user returns after closing the browser.
      path: "/",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have proxy refreshing user sessions.
        }
      },
    },
  })
}
