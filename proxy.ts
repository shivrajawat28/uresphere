import { updateSession } from "@/lib/supabase/proxy"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  // Canonical host enforcement: redirect www.uresphere.in to apex uresphere.in
  // to avoid host-only cookie splitting and lost sessions across domains.
  const host = request.headers.get("host")?.toLowerCase()
  if (host === "www.uresphere.in") {
    const url = new URL(request.url)
    url.hostname = "uresphere.in"
    url.port = ""
    return NextResponse.redirect(url.toString(), 301)
  }

  // Without Supabase credentials there is no session to manage — skip the
  // auth proxy so public pages still render (misconfiguration fails loudly
  // on protected routes instead of crashing the whole site).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request })
  }
  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
