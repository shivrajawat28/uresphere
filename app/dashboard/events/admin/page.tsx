import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireMember } from "@/lib/data/session"
import { loadAssignedSectionAdmin } from "@/lib/data/section-admin"
import { createClient } from "@/lib/supabase/server"
import { EventsAdminClient } from "@/components/dashboard/events-admin-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Events Admin",
  robots: { index: false, follow: false },
}

export default async function EventsAdminPage() {
  const member = await requireMember()
  const workspace = await loadAssignedSectionAdmin(member, "event_manager")
  if (!workspace) redirect("/dashboard/events")

  const supabase = await createClient()
  const { data: events } = await supabase
    .from("events")
    .select("id, title, description, event_date, event_time, venue, organizer, image_url")
    .eq("sphere_id", workspace.sphereId)
    .order("event_date", { ascending: false })
    .limit(200)

  return (
    <EventsAdminClient
      sphereId={workspace.sphereId}
      sphereName={workspace.sphereName}
      events={(events ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description ?? "",
        event_date: e.event_date,
        event_time: e.event_time,
        venue: e.venue ?? "",
        organizer: e.organizer ?? "",
        image_url: e.image_url,
      }))}
    />
  )
}
