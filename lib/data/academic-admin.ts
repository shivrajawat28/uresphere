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
  const supabase = await createClient()
  const { data } = await supabase
    .from("role_assignments")
    .select("scope")
    .eq("user_id", member.userId)
    .eq("sphere_id", member.sphereId)
    .eq("role", "academic_manager")
    .maybeSingle()
  if (!data) return null

  const sections = academicSectionsOfScope(data.scope as AcademicScope)
  if (sections.length === 0) return null
  return { sphereId: member.sphereId, sphereName: member.sphereName, sections }
}
