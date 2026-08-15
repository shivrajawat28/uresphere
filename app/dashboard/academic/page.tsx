import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { fetchLiveAds } from "@/lib/ads"
import { AcademicClient } from "./academic-client"
import type { CurrentMember } from "@/lib/data/session"

export const dynamic = "force-dynamic"

export default async function AcademicPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const [{ data: subjects }, { data: resources }, { data: calendar }, { data: units }, ads] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, code, degree, year, branch")
      .eq("sphere_id", member.sphereId)
      .order("degree", { ascending: true })
      .order("year", { ascending: true })
      .order("branch", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("academic_resources")
      .select("id, title, type, url, subject_id, unit_id, created_at")
      .eq("sphere_id", member.sphereId)
      .order("created_at", { ascending: false }),
    supabase
      .from("academic_calendar")
      .select("id, title, event_date, description")
      .eq("sphere_id", member.sphereId)
      .order("event_date", { ascending: false })
      .limit(20),
    supabase
      .from("academic_units")
      .select("id, subject_id, name")
      .eq("sphere_id", member.sphereId)
      .order("display_order", { ascending: true }),
    // Live Academic placement only — filtered in the database.
    fetchLiveAds(supabase, "academic", 2),
  ])

  const subjectMap = new Map((subjects ?? []).map((s) => [s.id, s.name]))
  const unitMap = new Map((units ?? []).map((u) => [u.id, u.name]))

  const resourcesWithSubject = (resources ?? []).map((r) => ({
    ...r,
    subjectName: r.subject_id ? subjectMap.get(r.subject_id) ?? "General" : "General",
    unitName: r.unit_id ? unitMap.get(r.unit_id) ?? null : null,
  }))

  return (
    <AcademicClient
      member={
        {
          role: member.role,
          sphereId: member.sphereId,
        } as Pick<CurrentMember, "role" | "sphereId">
      }
      subjects={subjects ?? []}
      units={units ?? []}
      resources={resourcesWithSubject}
      calendar={calendar ?? []}
      ads={ads}
    />
  )
}
