import { createClient } from "@/lib/supabase/server"
import { academicSectionsOfScope, type AcademicScope, type AcademicSection } from "@/lib/academic"
import type { CurrentMember } from "@/lib/data/session"

export type AcademicManagerWorkspace = {
  sphereId: string
  sphereName: string
  sections: AcademicSection[]
}

/**
 * Resolves the academic sections a member is authorized to manage: their
 * `academic_manager` role_assignment in their own Sphere (RLS-gated to their
 * own rows). Returns null when the member holds no academic_manager
 * assignment — the dashboard then hides the Academic Admin surface.
 */
export async function loadAssignedAcademicSections(
  member: CurrentMember,
): Promise<AcademicManagerWorkspace | null> {
  if (!member.sphereId) return null
  
  if (member.role === "super_admin") {
    return { sphereId: member.sphereId, sphereName: member.sphereName, sections: [{ degree: "", year: "", branch: "" }] }
  }

  const supabase = await createClient()

  if (member.role === "admin") {
    const { data: membership } = await supabase
      .from("user_spheres")
      .select("user_id")
      .eq("user_id", member.userId)
      .eq("sphere_id", member.sphereId)
      .eq("membership_status", "active")
      .maybeSingle()
    if (membership) return { sphereId: member.sphereId, sphereName: member.sphereName, sections: [{ degree: "", year: "", branch: "" }] }
  }

  const { data: assignments } = await supabase
    .from("role_assignments")
    .select("role, scope")
    .eq("user_id", member.userId)
    .eq("sphere_id", member.sphereId)

  if (!assignments || assignments.length === 0) return null

  if (assignments.some((a) => a.role === "sphere_admin")) {
    return { sphereId: member.sphereId, sphereName: member.sphereName, sections: [{ degree: "", year: "", branch: "" }] }
  }

  const managerAssignment = assignments.find((a) => a.role === "academic_manager")
  if (!managerAssignment) return null

  const sections = academicSectionsOfScope(managerAssignment.scope as AcademicScope)
  if (sections.length === 0) return null
  return { sphereId: member.sphereId, sphereName: member.sphereName, sections }
}
