import { notFound, redirect } from "next/navigation"
import { requireMember } from "@/lib/data/session"
import { loadAssignedAcademicSections } from "@/lib/data/academic-admin"
import { createClient } from "@/lib/supabase/server"
import {
  academicSectionFromKey,
  academicSectionLabel,
  academicSectionsEqual,
} from "@/lib/academic"
import { AcademicAdminSectionClient } from "@/components/dashboard/academic-admin-section"

export const dynamic = "force-dynamic"

export default async function AcademicAdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section: sectionKey } = await params
  const member = await requireMember()
  const workspace = await loadAssignedAcademicSections(member)
  if (!workspace) redirect("/dashboard/academic/admin")

  const requested = academicSectionFromKey(sectionKey)
  if (!requested) notFound()

  // The section param is never trusted: it must be EXACTLY one of the sections
  // this manager is assigned to (server-side, from role_assignments).
  const section = workspace.sections.find((s) => academicSectionsEqual(s, requested))
  if (!section) redirect("/dashboard/academic/admin")

  const supabase = await createClient()

  // Section-scoped queries. Blank fields in the section act as wildcards, so a
  // "First Year" manager sees every First Year subject regardless of degree/branch.
  let subjectsQuery = supabase
    .from("subjects")
    .select("id, name, code, degree, year, branch")
    .eq("sphere_id", workspace.sphereId)
  if (section.degree) subjectsQuery = subjectsQuery.eq("degree", section.degree)
  if (section.year) subjectsQuery = subjectsQuery.eq("year", section.year)
  if (section.branch) subjectsQuery = subjectsQuery.eq("branch", section.branch)

  const { data: subjects } = await subjectsQuery.order("name", { ascending: true })

  const subjectIds = (subjects ?? []).map((s) => s.id)
  const [{ data: units }, { data: resources }, { data: calendar }] = await Promise.all([
    subjectIds.length > 0
      ? supabase.from("academic_units").select("id, subject_id, name").in("subject_id", subjectIds).order("display_order", { ascending: true }).order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
    subjectIds.length > 0
      ? supabase.from("academic_resources").select("id, title, type, url, subject_id, created_at").in("subject_id", subjectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("academic_calendar")
      .select("id, title, event_date, description")
      .eq("sphere_id", workspace.sphereId)
      .order("event_date", { ascending: false })
      .limit(50),
  ])

  const subjectNameMap = new Map((subjects ?? []).map((s) => [s.id, s.name]))

  return (
    <AcademicAdminSectionClient
      sphereId={workspace.sphereId}
      sphereName={workspace.sphereName}
      section={section}
      sectionLabel={academicSectionLabel(section)}
      subjects={(subjects ?? []).map((s) => ({ id: s.id, name: s.name, code: s.code, degree: s.degree, year: s.year, branch: s.branch }))}
      units={(units ?? []).map((u) => ({ id: u.id, subject_id: u.subject_id, name: u.name }))}
      resources={(resources ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        url: r.url,
        subject_id: r.subject_id,
        subjectName: r.subject_id ? subjectNameMap.get(r.subject_id) ?? "General" : "General",
      }))}
      calendar={(calendar ?? []).map((c) => ({ id: c.id, title: c.title, event_date: c.event_date, description: c.description }))}
    />
  )
}
