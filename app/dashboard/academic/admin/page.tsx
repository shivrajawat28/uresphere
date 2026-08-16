import type { Metadata } from "next"
import Link from "next/link"
import { requireMember } from "@/lib/data/session"
import { loadAssignedAcademicSections } from "@/lib/data/academic-admin"
import { academicSectionKey, academicSectionLabel } from "@/lib/academic"
import { GraduationCap, ChevronRight } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Academic Admin",
  robots: { index: false, follow: false },
}

export default async function AcademicAdminPage() {
  const member = await requireMember()
  const workspace = await loadAssignedAcademicSections(member)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <GraduationCap className="size-3.5" />
          Academic Admin
        </p>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{workspace?.sphereName ?? member.sphereName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the academic content for the sections assigned to you — subjects, units, resources and the calendar.
        </p>
      </div>

      {!workspace ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">You don&apos;t manage any academic sections yet.</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            A Sphere administrator can assign you academic sections from the admin panel.
          </p>
          <Link
            href="/dashboard/academic"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Browse Academic
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-medium text-foreground">Your assigned sections</h2>
          {workspace.sections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No sections assigned yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {workspace.sections.map((section) => (
                <Link
                  key={academicSectionKey(section)}
                  href={`/dashboard/academic/admin/${academicSectionKey(section)}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-serif text-lg text-foreground group-hover:text-primary">
                      {academicSectionLabel(section)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Manage academic content →</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
