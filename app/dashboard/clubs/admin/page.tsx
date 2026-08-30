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
  // implicit full access. Sphere admins also have implicit full access to clubs
  // in their assigned spheres. Build a synthetic workspace so the rest of the page
  // works unchanged.
  const targetSphereId = searchParams.sphereId ?? member.sphereId
  if (!activeWorkspace && targetSphereId) {
    const isGlobalAdmin = member.role === "super_admin" || member.role === "admin"
    let isSphereAdmin = false

    if (!isGlobalAdmin) {
      const supabase = await createClient()
      const { data: assignment } = await supabase
        .from("role_assignments")
        .select("id")
        .eq("user_id", member.userId)
        .eq("sphere_id", targetSphereId)
        .eq("role", "sphere_admin")
        .maybeSingle()
      if (assignment) isSphereAdmin = true
    }

    if (isGlobalAdmin || isSphereAdmin) {
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
  const { data: clubEventsData } = clubIds.length
    ? await supabase
        .from("club_events")
        .select("id, title, description, event_date, event_time, venue, organizer, contact_name, contact_phone, contact_email, registration_url, registration_deadline, thumbnail_url, club_id")
        .in("club_id", clubIds)
        .order("event_date", { ascending: true, nullsFirst: true })
    : { data: [] }

  // Fetch attached main events for these clubs
  const { data: attachedEventsData } = clubIds.length
    ? await supabase
        .from("events")
        .select("id, title, description, event_date, event_time, venue, organizer, contact_name, contact_phone, contact_email, registration_url, registration_deadline, image_url, club_id")
        .in("club_id", clubIds)
        .order("event_date", { ascending: true, nullsFirst: true })
    : { data: [] }

  type RawClubEvent = {
    id: string
    title: string
    description: string | null
    event_date: string | null
    event_time: string | null
    venue: string | null
    organizer: string | null
    contact_name: string | null
    contact_phone: string | null
    contact_email: string | null
    registration_url: string | null
    registration_deadline: string | null
    thumbnail_url: string | null
    club_id: string | null
    is_attached_event?: boolean
  }

  // Format attached events to match the club_events structure, adding a flag to identify them
  const formattedAttachedEvents: RawClubEvent[] = (attachedEventsData ?? []).map((e) => ({
    ...e,
    thumbnail_url: e.image_url,
    is_attached_event: true,
  }))

  const clubEvents: RawClubEvent[] = [...((clubEventsData ?? []) as RawClubEvent[]), ...formattedAttachedEvents].sort((a, b) => {
    if (!a.event_date) return -1
    if (!b.event_date) return 1
    return new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  })

  // Fetch eligible unlinked events for the sphere to allow attaching
  const today = new Date().toISOString().slice(0, 10)
  const { data: eligibleEventsData } = await supabase
    .from("events")
    .select("id, title, event_date, venue")
    .eq("sphere_id", activeWorkspace.sphereId)
    .is("club_id", null)
    .gte("event_date", today)
    .order("event_date", { ascending: true })

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
        club_id: a.club_id,
        title: a.title,
        description: a.description ?? "",
        category: a.category ?? "other",
        event_date: a.event_date,
        venue: a.venue ?? "",
        organizer: a.organizer ?? "",
        thumbnail_url: a.thumbnail_url,
      }))}
      clubEvents={clubEvents.map((e) => ({
        id: e.id,
        club_id: e.club_id ?? "",
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
        registration_deadline: e.registration_deadline,
        thumbnail_url: e.thumbnail_url,
        is_attached_event: e.is_attached_event ?? false,
      }))}
      eligibleEvents={eligibleEventsData ?? []}
      initialExpandedClub={searchParams.clubId}
    />
  )
}
