import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Event reminder cron — sends "Event tomorrow!" notifications to all sphere
 * members for events happening the next day.
 *
 * The send_event_reminders() SQL function handles deduplication (no duplicate
 * reminders within 2 days).
 *
 * Configure in vercel.json:
 *   { "crons": [{ "path": "/api/cron/event-reminders", "schedule": "0 20 * * *" }] }
 *
 * Runs daily at 8 PM UTC (approx 1:30 AM IST) so reminders go out the
 * evening before the event day.
 *
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
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 },
    )
  }

  const supabase = createSupabaseClient(url, serviceKey, { auth: { persistSession: false } })
  const { error } = await supabase.rpc("send_event_reminders")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
