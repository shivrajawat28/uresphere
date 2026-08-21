import { createClient } from "@/lib/supabase/server"
import type { CurrentMember } from "@/lib/data/session"

// Section-manager roles that get a dedicated dashboard admin workspace. The
// assignment lives in role_assignments (role + scope.permissions); the
// "section" IS the role itself (no degree/year/branch taxonomy), scoped to the
// member's own Sphere by construction (member.sphereId).
export const SECTION_ADMIN_ROLES = [
  "academic_manager",
  "promotion_moderator",
  "event_manager",
  "social_moderator",
  "club_manager",
  "club_admin",
  "shop_admin",
] as const

export type SectionAdminRole = (typeof SECTION_ADMIN_ROLES)[number]

export type SectionAdminWorkspace = {
  role: SectionAdminRole
  sphereId: string
  sphereName: string
  permissions: string[]
  clubId?: string
}

/**
 * Resolves the section-admin workspace a member holds for `role` in their own
 * Sphere (RLS-gated to their own role_assignments rows). Returns null when the
 * member has no assignment — the dashboard then hides the admin entry and any
 * direct route access redirects away.
 */
export async function loadAssignedSectionAdmin(
  member: CurrentMember,
  role: SectionAdminRole,
): Promise<SectionAdminWorkspace | null> {
  if (!member.sphereId) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from("role_assignments")
    .select("role, scope")
    .eq("user_id", member.userId)
    .eq("sphere_id", member.sphereId)
    .eq("role", role)
    .maybeSingle()
  if (!data) return null

  const permissions: string[] = Array.isArray(data.scope?.permissions)
    ? (data.scope.permissions as string[])
    : []

  const clubId = typeof data.scope?.club_id === "string" ? (data.scope.club_id as string) : undefined

  return { role, sphereId: member.sphereId, sphereName: member.sphereName, permissions, clubId }
}

/** All section-admin roles the member holds (drives dashboard nav entries). */
export async function loadAssignedSectionRoles(member: CurrentMember): Promise<SectionAdminRole[]> {
  if (!member.sphereId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", member.userId)
    .eq("sphere_id", member.sphereId)
    .in("role", SECTION_ADMIN_ROLES)
  if (!data) return []
  return SECTION_ADMIN_ROLES.filter((r) => data.some((a) => a.role === r))
}
