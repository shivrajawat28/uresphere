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
  let syllabusesQuery = supabase.from("academic_syllabuses").select("id, title, degree, year, branch, pdf_url, external_url").eq("sphere_id", workspace.sphereId)
  if (section.degree) syllabusesQuery = syllabusesQuery.eq("degree", section.degree)
  if (section.year) syllabusesQuery = syllabusesQuery.eq("year", section.year)
  syllabusesQuery = syllabusesQuery.eq("branch", section.branch || "")

  let calendarQuery = supabase
    .from("academic_calendar")
    .select("id, title, event_date, description, pdf_url, external_url, degree, year")
    .eq("sphere_id", workspace.sphereId)
  if (section.degree) calendarQuery = calendarQuery.eq("degree", section.degree)
  if (section.year) calendarQuery = calendarQuery.eq("year", section.year)

  const [{ data: units }, { data: resources }, { data: calendar }, { data: syllabuses }] = await Promise.all([
    subjectIds.length > 0
      ? supabase.from("academic_units").select("id, subject_id, name").in("subject_id", subjectIds).order("display_order", { ascending: true }).order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
    subjectIds.length > 0
      ? supabase.from("academic_resources").select("id, title, type, url, subject_id, chapter_id, created_at").in("subject_id", subjectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    calendarQuery.order("event_date", { ascending: false }).limit(50),
    syllabusesQuery.order("created_at", { ascending: false }),
  ])

  const unitIds = (units ?? []).map((u) => u.id)
  const { data: chapters } = unitIds.length > 0 
    ? await supabase.from("academic_chapters").select("id, unit_id, name").in("unit_id", unitIds).order("display_order", { ascending: true }).order("name", { ascending: true })
    : { data: [] }

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
        chapter_id: r.chapter_id,
        subjectName: r.subject_id ? subjectNameMap.get(r.subject_id) ?? "General" : "General",
      }))}
      chapters={(chapters ?? []).map((c) => ({ id: c.id, unit_id: c.unit_id, name: c.name }))}
      calendar={(calendar ?? []).map((c) => ({ id: c.id, title: c.title, event_date: c.event_date, description: c.description, pdf_url: c.pdf_url, external_url: c.external_url, degree: c.degree, year: c.year }))}
      syllabuses={(syllabuses ?? []).map((s) => ({ id: s.id, title: s.title, degree: s.degree, year: s.year, branch: s.branch, pdf_url: s.pdf_url, external_url: s.external_url }))}
    />
  )
}
