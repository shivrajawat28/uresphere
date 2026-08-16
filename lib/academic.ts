// Pure helpers for academic_manager section scoping. Dependency-free so they
// are unit-testable and shared by the dashboard workspace, server actions,
// the admin roles UI, and tests.
//
// A manager's authorization lives in their `role_assignments.scope` jsonb:
//   { "permissions": [...], "sections": [{ degree, year, branch }, ...] }
// with the legacy scalar `degree` / `year` / `branch` fields kept as the
// first section for backward compatibility. A blank field inside a section
// acts as a wildcard ("First Year" with blank degree/branch = all First Year
// content in the Sphere, whatever the degree or branch).

export type AcademicSection = {
  degree: string
  year: string
  branch: string
}

export type AcademicScope = {
  permissions?: string[]
  degree?: string
  year?: string
  branch?: string
  sections?: AcademicSection[]
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function sectionOf(s: unknown): AcademicSection | null {
  if (!s || typeof s !== "object") return null
  const rec = s as Record<string, unknown>
  return { degree: clean(rec.degree), year: clean(rec.year), branch: clean(rec.branch) }
}

/** True when a section has at least one non-blank field. */
export function hasSectionFields(section: AcademicSection): boolean {
  return Boolean(section.degree || section.year || section.branch)
}

/** True when two sections are identical (case-insensitive, blank = blank). */
export function academicSectionsEqual(a: AcademicSection, b: AcademicSection): boolean {
  const norm = (v: string) => v.trim().toLowerCase()
  return norm(a.degree) === norm(b.degree) && norm(a.year) === norm(b.year) && norm(a.branch) === norm(b.branch)
}

/** Normalizes a scope into the list of sections the manager may administer. */
export function academicSectionsOfScope(scope: AcademicScope | null | undefined): AcademicSection[] {
  if (!scope) return []
  const out: AcademicSection[] = []
  if (Array.isArray(scope.sections)) {
    for (const raw of scope.sections) {
      const s = sectionOf(raw)
      if (s && hasSectionFields(s)) out.push(s)
    }
  }
  // Legacy scalar fields (degree/year/branch) — treated as one section.
  if (out.length === 0) {
    const legacy = { degree: clean(scope.degree), year: clean(scope.year), branch: clean(scope.branch) }
    if (hasSectionFields(legacy)) out.push(legacy)
  }
  // Dedupe so the same section can't be listed twice.
  return out.filter((s, i) => out.findIndex((o) => academicSectionsEqual(o, s)) === i)
}

/** Human label for a section, e.g. "B.Tech · First Year · CSE" or "First Year". */
export function academicSectionLabel(section: AcademicSection): string {
  const parts = [section.degree, section.year, section.branch].filter((p) => p.trim().length > 0)
  return parts.length > 0 ? parts.join(" · ") : "All academic content"
}

/**
 * URL-safe key for a section (used in the /dashboard/academic/admin/[section]
 * route). Encoded values are safe in a path segment (no slashes).
 */
export function academicSectionKey(section: AcademicSection): string {
  return [section.degree, section.year, section.branch].map(encodeURIComponent).join("~")
}

/** Parses a route key back into a section. Returns null on malformed input. */
export function academicSectionFromKey(key: string): AcademicSection | null {
  if (!key || key.length > 400) return null
  const parts = key.split("~")
  if (parts.length !== 3) return null
  try {
    return { degree: decodeURIComponent(parts[0]), year: decodeURIComponent(parts[1]), branch: decodeURIComponent(parts[2]) }
  } catch {
    return null
  }
}

/**
 * Whether a section target is inside the manager's authorized sections.
 * A blank field in the authorized section is a wildcard; a blank field in the
 * target is a literal value (matches only another blank).
 */
export function academicSectionAllowed(
  authorized: AcademicSection[],
  target: AcademicSection,
): boolean {
  return authorized.some((s) => {
    if (s.degree && s.degree.trim().toLowerCase() !== target.degree.trim().toLowerCase()) return false
    if (s.year && s.year.trim().toLowerCase() !== target.year.trim().toLowerCase()) return false
    if (s.branch && s.branch.trim().toLowerCase() !== target.branch.trim().toLowerCase()) return false
    return true
  })
}
