import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export type CurrentMember = {
  userId: string
  email: string | null
  role: "user" | "admin" | "super_admin"
  accountStatus: "active" | "suspended"
  // null only for global (super_admin) accounts with no college membership;
  // every sphere-scoped query treats null as "no Sphere" (is.null) and every
  // sphere-scoped insert is rejected by the DB — never weakening isolation.
  sphereId: string | null
  sphereName: string
  anonymousHandle: string
  // The member's own real/display name (profiles.real_name). Private — only
  // ever rendered to the member themselves or to authorized admins.
  realName: string
  avatarUrl: string | null
}

/**
 * Loads the authenticated user's profile + Sphere membership.
 * Redirects to login if unauthenticated, and to onboarding if the
 * signup trigger hasn't finished provisioning a Sphere yet.
 */
export async function requireMember(): Promise<CurrentMember> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("role, account_status, real_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_spheres")
      .select("sphere_id, anonymous_handle, avatar_url, spheres(name)")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  // No profile row at all: the signup trigger should always create one.
  if (!profile) {
    redirect("/onboarding/pending")
  }

  // Suspension is enforced before anything else — including for super admins.
  if (profile.account_status === "suspended") {
    redirect("/auth/suspended")
  }

  // Super admins are platform-global and must never be blocked by onboarding.
  // A super admin created outside the signup flow (e.g. via the Supabase
  // dashboard) has a profile but no college membership — grant them access
  // with a placeholder member. sphereId is null, so every sphere-scoped query
  // returns nothing and no cross-sphere access is possible.
  if (!membership) {
    if (profile.role === "super_admin") {
      return {
        userId: user.id,
        email: user.email ?? null,
        role: "super_admin",
        accountStatus: profile.account_status,
        sphereId: null,
        sphereName: "Platform",
        anonymousHandle: "@Admin",
        realName: profile.real_name || "Platform Admin",
        avatarUrl: null,
      }
    }
    redirect("/onboarding/pending")
  }

  const sphereName = Array.isArray(membership.spheres)
    ? (membership.spheres[0] as { name?: string } | null)?.name
    : (membership.spheres as { name?: string } | null)?.name

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile.role,
    accountStatus: profile.account_status,
    sphereId: membership.sphere_id,
    sphereName: sphereName ?? "Your Sphere",
    anonymousHandle: membership.anonymous_handle,
    realName: profile.real_name || membership.anonymous_handle,
    avatarUrl: membership.avatar_url,
  }
}

export async function requireAdmin(): Promise<CurrentMember> {
  const member = await requireMember()
  if (member.role !== "admin" && member.role !== "super_admin") {
    redirect("/dashboard")
  }
  return member
}

export type AdminAccess = {
  member: CurrentMember
  isSuperAdmin: boolean
}

/**
 * Gate for any /admin route (Level 1 platform + Level 2 sphere admin).
 * Allows super admins, sphere admins (profile role) and users holding any
 * role assignment in some Sphere. Normal users are sent back to the app.
 */
export async function requireAdminAccess(): Promise<AdminAccess> {
  const member = await requireMember()
  if (member.role === "super_admin") return { member, isSuperAdmin: true }
  if (member.role === "admin") return { member, isSuperAdmin: false }

  const supabase = await createClient()
  const { data: assignment } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("user_id", member.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (assignment) return { member, isSuperAdmin: false }

  redirect("/dashboard")
}

/**
 * True when the caller may administer `sphereId` (used by server actions):
 * super admins (any Sphere), sphere admins (profile role) actively in that
 * Sphere, or holders of any role assignment in that Sphere.
 */
export async function canAccessSphere(sphereId: string): Promise<boolean> {
  const member = await requireMember()
  if (member.role === "super_admin") return true
  const supabase = await createClient()
  if (member.role === "admin") {
    const { data: membership } = await supabase
      .from("user_spheres")
      .select("user_id")
      .eq("user_id", member.userId)
      .eq("sphere_id", sphereId)
      .eq("membership_status", "active")
      .maybeSingle()
    if (membership) return true
  }
  const { data: assignment } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("user_id", member.userId)
    .eq("sphere_id", sphereId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return Boolean(assignment)
}

/**
 * True when the caller has full administrative powers inside `sphereId`:
 * super admin, sphere admin (profile role) in that Sphere, or a `sphere_admin`
 * role assignment. Scoped managers (academic_manager, …) are NOT administrators.
 */
export async function isSphereAdministrator(sphereId: string): Promise<boolean> {
  const member = await requireMember()
  if (member.role === "super_admin") return true
  if (member.role === "admin" && member.sphereId === sphereId) return true
  const supabase = await createClient()
  const { data: assignment } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("user_id", member.userId)
    .eq("sphere_id", sphereId)
    .eq("role", "sphere_admin")
    .limit(1)
    .maybeSingle()
  return Boolean(assignment)
}

export type SphereAdminAccess = {
  member: CurrentMember
  isSuperAdmin: boolean
  isSphereAdministrator: boolean
  permissions: string[]
}

/**
 * Gate for /admin/spheres/[sphereId] pages. Validates the requested Sphere
 * against the caller's permissions server-side — a sphere admin can never open
 * another Sphere by hand-editing the URL. Also returns what the caller may
 * manage inside the Sphere (used to scope the admin navigation).
 */
export async function requireSphereAdmin(sphereId: string): Promise<SphereAdminAccess> {
  const member = await requireMember()

  if (member.role === "super_admin") {
    return { member, isSuperAdmin: true, isSphereAdministrator: true, permissions: [] }
  }

  const supabase = await createClient()

  // Sphere admin (profile role) actively inside the requested Sphere.
  if (member.role === "admin") {
    const { data: membership } = await supabase
      .from("user_spheres")
      .select("sphere_id")
      .eq("user_id", member.userId)
      .eq("sphere_id", sphereId)
      .eq("membership_status", "active")
      .maybeSingle()
    if (membership) {
      return { member, isSuperAdmin: false, isSphereAdministrator: true, permissions: [] }
    }
  }

  // Scoped manager: needs a role assignment in the requested Sphere.
  const { data: assignment } = await supabase
    .from("role_assignments")
    .select("role, scope")
    .eq("user_id", member.userId)
    .eq("sphere_id", sphereId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!assignment) redirect("/admin")

  const isSphereAdministrator = assignment.role === "sphere_admin"
  const permissions: string[] = Array.isArray(assignment.scope?.permissions)
    ? (assignment.scope.permissions as string[])
    : []

  return { member, isSuperAdmin: false, isSphereAdministrator, permissions }
}
