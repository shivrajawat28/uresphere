import { notFound, redirect } from "next/navigation"
import { requireSphereAdmin } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { RolesClient } from "./roles-client"

export const dynamic = "force-dynamic"

export default async function SphereRolesPage({ params }: { params: Promise<{ sphereId: string }> }) {
  const { sphereId } = await params
  const access = await requireSphereAdmin(sphereId)

  // Only Sphere administrators (or the super admin) may manage roles. Scoped
  // managers get sent back to their Sphere overview.
  if (!access.isSuperAdmin && !access.isSphereAdministrator) {
    redirect(`/admin/spheres/${sphereId}`)
  }

  const supabase = await createClient()

  const { data: sphere } = await supabase
    .from("spheres")
    .select("id, name, slug, colleges(city, state)")
    .eq("id", sphereId)
    .maybeSingle()
  if (!sphere) notFound()

  const city = Array.isArray(sphere.colleges)
    ? (sphere.colleges[0] as { city?: string; state?: string } | null)?.city ?? ""
    : (sphere.colleges as { city?: string; state?: string } | null)?.city ?? ""
  const state = Array.isArray(sphere.colleges)
    ? (sphere.colleges[0] as { city?: string; state?: string } | null)?.state ?? ""
    : (sphere.colleges as { city?: string; state?: string } | null)?.state ?? ""

  const [usersResult, assignmentsResult] = await Promise.all([
    supabase
      .from("user_spheres")
      .select("user_id, anonymous_handle, membership_status, created_at")
      .eq("sphere_id", sphereId)
      .eq("membership_status", "active")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("role_assignments")
      .select("id, user_id, sphere_id, role, scope, granted_by, created_at")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(200),
  ])

  // user_spheres -> profiles has no FK; fetch profile details separately and
  // join client-side (RLS gates admin reads to the same Sphere).
  const memberIds = Array.from(new Set((usersResult.data ?? []).map((u) => u.user_id)))
  const { data: profileRows } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, real_name, role, account_status")
        .in("id", memberIds)
    : { data: [] as { id: string; email: string; real_name: string; role: string; account_status: string }[] }
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]))

  const users = (usersResult.data ?? []).map((u) => {
    const p = profileById.get(u.user_id)
    return {
      userId: u.user_id,
      handle: u.anonymous_handle,
      realName: p?.real_name || "—",
      email: p?.email || "—",
      role: p?.role || "user",
      accountStatus: p?.account_status || "active",
    }
  })

  return (
    <RolesClient
      sphereId={sphereId}
      sphereName={sphere.name}
      sphereCity={city}
      sphereState={state}
      users={users}
      assignments={(assignmentsResult.data ?? []).map((a) => ({
        id: a.id,
        user_id: a.user_id,
        role: a.role,
        scope: (a.scope ?? {}) as Record<string, unknown>,
        created_at: a.created_at,
      }))}
    />
  )
}
