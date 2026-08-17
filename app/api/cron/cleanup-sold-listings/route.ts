import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * One-hour sold-listing cleanup, callable from a Vercel Cron.
 *
 * The marketplace page already runs the same idempotent cleanup lazily on
 * every visit (public.cleanup_sold_listings), so listings never linger even if
 * the cron is not configured. This route exists so the cleanup also happens
 * when nobody visits the page, and uses the service-role key (server-only)
 * because a cron request carries no user session.
 *
 * Configure in vercel.json:
 *   { "crons": [{ "path": "/api/cron/cleanup-sold-listings", "schedule": "0 * * * *" }] }
 * Requires SUPABASE_SERVICE_ROLE_KEY and (recommended) CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = request.headers.get("authorization") ?? ""
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured — set it in Vercel env (the app-side lazy cleanup still runs)" },
      { status: 503 },
    )
  }

  const supabase = createSupabaseClient(url, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await supabase.rpc("cleanup_sold_listings")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ removed: data ?? 0 })
}
