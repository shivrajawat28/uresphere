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

export default async function ClubsAdminPage() {
  const member = await requireMember()
  const workspace = await loadAssignedSectionAdmin(member, "club_manager")
  if (!workspace) redirect("/dashboard/clubs")

  const supabase = await createClient()
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, description, logo_url, club_members(user_id)")
    .eq("sphere_id", workspace.sphereId)
    .order("created_at", { ascending: false })
    .limit(200)

  // Resolve member handles for the member-management views (same-Sphere
  // anonymous handles only — private profile fields never leave the server).
  const memberIds = Array.from(
    new Set((clubs ?? []).flatMap((c) => (Array.isArray(c.club_members) ? c.club_members.map((m) => m.user_id) : []))),
  )
  const { data: handles } = memberIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", memberIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }
  const handleByUser = new Map((handles ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  return (
    <ClubsAdminClient
      sphereId={workspace.sphereId}
      sphereName={workspace.sphereName}
      clubs={(clubs ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        logo_url: c.logo_url,
        members: (Array.isArray(c.club_members) ? c.club_members : [])
          .map((m) => ({ userId: m.user_id, handle: handleByUser.get(m.user_id) ?? "Unknown" })),
      }))}
    />
  )
}
