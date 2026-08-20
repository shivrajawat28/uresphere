import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireMember } from "@/lib/data/session"
import { loadAssignedSectionAdmin } from "@/lib/data/section-admin"
import { createClient } from "@/lib/supabase/server"
import { ClubsAdminClient } from "@/components/dashboard/clubs-admin-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Clubs Admin",
  robots: { index: false, follow: false },
}

export default async function ClubsAdminPage(
  props: { searchParams: Promise<{ sphereId?: string; clubId?: string }> }
) {
  const searchParams = await props.searchParams
  const member = await requireMember()
  const workspace = await loadAssignedSectionAdmin(member, "club_manager")
  const clubAdminWorkspace = !workspace ? await loadAssignedSectionAdmin(member, "club_admin") : null
  let activeWorkspace = workspace ?? clubAdminWorkspace

  // Super-admin / admin users don't need a role_assignments row — they have
  // implicit full access. Build a synthetic workspace so the rest of the page
  // works unchanged.
  const targetSphereId = searchParams.sphereId ?? member.sphereId
  if (!activeWorkspace && (member.role === "super_admin" || member.role === "admin") && targetSphereId) {
    let targetSphereName = member.sphereName
    if (targetSphereId !== member.sphereId) {
      const supabase = await createClient()
      const { data: s } = await supabase.from("spheres").select("name").eq("id", targetSphereId).maybeSingle()
      if (s) targetSphereName = s.name
    }

    activeWorkspace = {
      role: "club_manager" as const,
      sphereId: targetSphereId,
      sphereName: targetSphereName,
      permissions: ["clubs.read", "clubs.create", "clubs.update", "clubs.delete"],
    }
  }

  if (!activeWorkspace) redirect("/dashboard/clubs")

  const supabase = await createClient()
  const isClubAdmin = activeWorkspace.role === "club_admin"

  let query = supabase
    .from("clubs")
    .select("id, name, description, logo_url, category, tagline, contact_info, club_members(user_id)")
    .eq("sphere_id", activeWorkspace.sphereId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (isClubAdmin && activeWorkspace.clubId) {
    query = query.eq("id", activeWorkspace.clubId)
  }

  const { data: clubs } = await query

  const memberIds = Array.from(
    new Set((clubs ?? []).flatMap((c) => (Array.isArray(c.club_members) ? c.club_members.map((m) => m.user_id) : []))),
  )
  const { data: handles } = memberIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", memberIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }
  const handleByUser = new Map((handles ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  // Fetch activities for all clubs
  const clubIds = (clubs ?? []).map((c) => c.id)
  const { data: activities } = clubIds.length
    ? await supabase
        .from("club_activities")
        .select("id, title, description, category, event_date, venue, organizer, thumbnail_url, club_id")
        .in("club_id", clubIds)
        .order("created_at", { ascending: false })
    : { data: [] }

  // Fetch club events for all clubs
  const { data: clubEvents } = clubIds.length
    ? await supabase
        .from("club_events")
        .select("id, title, description, event_date, event_time, venue, organizer, contact_name, contact_phone, contact_email, registration_url, thumbnail_url, club_id")
        .in("club_id", clubIds)
        .order("event_date", { ascending: true, nullsFirst: true })
    : { data: [] }

  return (
    <ClubsAdminClient
      sphereId={activeWorkspace.sphereId}
      sphereName={activeWorkspace.sphereName}
      isClubAdmin={isClubAdmin}
      clubs={(clubs ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        logo_url: c.logo_url,
        category: c.category ?? "other",
        tagline: c.tagline ?? "",
        contact_info: c.contact_info ?? "",
        members: (Array.isArray(c.club_members) ? c.club_members : [])
          .map((m) => ({ userId: m.user_id, handle: handleByUser.get(m.user_id) ?? "Unknown" })),
      }))}
      activities={(activities ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description ?? "",
        category: a.category ?? "other",
        event_date: a.event_date,
        venue: a.venue ?? "",
        organizer: a.organizer ?? "",
        thumbnail_url: a.thumbnail_url,
        club_id: a.club_id,
      }))}
      clubEvents={(clubEvents ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description ?? "",
        event_date: e.event_date,
        event_time: e.event_time,
        venue: e.venue ?? "",
        organizer: e.organizer ?? "",
        contact_name: e.contact_name ?? "",
        contact_phone: e.contact_phone ?? "",
        contact_email: e.contact_email ?? "",
        registration_url: e.registration_url ?? "",
        thumbnail_url: e.thumbnail_url,
        club_id: e.club_id,
      }))}
      initialExpandedClub={searchParams.clubId}
    />
  )
}
