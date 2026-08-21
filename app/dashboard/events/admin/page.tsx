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

export default async function EventsAdminPage(
  props: { searchParams: Promise<{ sphereId?: string }> }
) {
  const searchParams = await props.searchParams
  const member = await requireMember()
  let workspace = await loadAssignedSectionAdmin(member, "event_manager")

  // Super-admin / admin users don't need a role_assignments row — they have
  // implicit full access. Build a synthetic workspace so the rest of the page
  // works unchanged.
  const targetSphereId = searchParams.sphereId ?? member.sphereId
  if (!workspace && (member.role === "super_admin" || member.role === "admin") && targetSphereId) {
    let targetSphereName = member.sphereName
    if (targetSphereId !== member.sphereId) {
      const supabase = await createClient()
      const { data: s } = await supabase.from("spheres").select("name").eq("id", targetSphereId).maybeSingle()
      if (s) targetSphereName = s.name
    }

    workspace = {
      role: "event_manager" as const,
      sphereId: targetSphereId,
      sphereName: targetSphereName,
      permissions: ["events.read", "events.create", "events.update", "events.delete"],
    }
  }

  if (!workspace) redirect("/dashboard/events")

  const supabase = await createClient()
  const { data: events } = await supabase
    .from("events")
    .select("id, title, description, event_date, event_time, venue, organizer, image_url, contact_name, contact_phone, contact_email, registration_url, registration_deadline")
    .eq("sphere_id", workspace.sphereId)
    .order("event_date", { ascending: false, nullsFirst: false })
    .limit(200)

  const today = new Date().toISOString().slice(0, 10)

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
        contact_name: e.contact_name ?? "",
        contact_phone: e.contact_phone ?? "",
        contact_email: e.contact_email ?? "",
        registration_url: e.registration_url ?? "",
        registration_deadline: e.registration_deadline ?? null,
        status: !e.event_date ? "coming_soon" as const : e.event_date >= today ? "upcoming" as const : "past" as const,
      }))}
    />
  )
}
