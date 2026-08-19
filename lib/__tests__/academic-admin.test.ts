import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

vi.mock("@/lib/data/session", () => ({
  requireMember: vi.fn(),
  requireAdmin: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { updateSubjectAction, deleteCalendarEntryAction, deleteUnitAction } from "@/lib/actions/admin"
import { assignRoleAction } from "@/lib/actions/platform"
import {
  academicSectionsOfScope,
  academicSectionKey,
  academicSectionFromKey,
  academicSectionAllowed,
  academicSectionLabel,
  academicSectionsEqual,
} from "@/lib/academic"
import { scopeCovers } from "@/lib/validation"

const MEMBER = {
  userId: "u1",
  email: "manager@uresphere.app",
  role: "user",
  accountStatus: "active",
  sphereId: "s-its",
  sphereName: "ITS",
  anonymousHandle: "@Manager",
  realName: "Test Manager",
  avatarUrl: null,
}

const MANAGER_SCOPE = {
  permissions: ["academic.read", "academic.create", "academic.update", "academic.delete"],
  sections: [
    { degree: "", year: "First Year", branch: "" },
    { degree: "B.Tech", year: "Second Year", branch: "CSE" },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
})

// ---------------------------------------------------------------------------
// Pure scope helpers
// ---------------------------------------------------------------------------

describe("academicSectionsOfScope", () => {
  it("normalizes the sections array (dedupes identical sections)", () => {
    const sections = academicSectionsOfScope({
      sections: [
        { degree: "B.Tech", year: "First Year", branch: "CSE" },
        { degree: "b.tech", year: "First Year", branch: "CSE" },
        { degree: "", year: "Second Year", branch: "" },
      ],
    })
    expect(sections).toHaveLength(2)
    expect(sections[0]).toEqual({ degree: "B.Tech", year: "First Year", branch: "CSE" })
    expect(sections[1]).toEqual({ degree: "", year: "Second Year", branch: "" })
  })

  it("falls back to the legacy scalar degree/year/branch fields", () => {
    expect(academicSectionsOfScope({ degree: "B.Tech", year: "1", branch: "CSE" })).toEqual([
      { degree: "B.Tech", year: "1", branch: "CSE" },
    ])
  })

  it("returns [] for an empty or absent scope", () => {
    expect(academicSectionsOfScope(null)).toEqual([])
    expect(academicSectionsOfScope({})).toEqual([])
    expect(academicSectionsOfScope({ sections: [{ degree: "", year: "", branch: "" }] })).toEqual([])
  })
})

describe("academicSectionKey / FromKey roundtrip", () => {
  it("round-trips a section with blank fields", () => {
    const s = { degree: "", year: "First Year", branch: "" }
    expect(academicSectionFromKey(academicSectionKey(s))).toEqual(s)
  })

  it("round-trips a fully-populated section (URL-encodes special chars)", () => {
    const s = { degree: "B.Tech", year: "Second Year", branch: "CSE (AI/ML)" }
    expect(academicSectionFromKey(academicSectionKey(s))).toEqual(s)
  })

  it("rejects malformed keys", () => {
    expect(academicSectionFromKey("")).toBeNull()
    expect(academicSectionFromKey("a~b")).toBeNull()
    expect(academicSectionFromKey("a~b~c~d")).toBeNull()
  })
})

describe("academicSectionAllowed — strict section authorization", () => {
  it("allows a section inside an authorized wildcard section", () => {
    expect(academicSectionAllowed([{ degree: "", year: "First Year", branch: "" }], { degree: "B.Tech", year: "First Year", branch: "CSE" })).toBe(true)
  })

  it("denies an unauthorized section (Second Year not assigned)", () => {
    expect(academicSectionAllowed([{ degree: "", year: "First Year", branch: "" }], { degree: "", year: "Second Year", branch: "" })).toBe(false)
  })

  it("denies the same year in another degree when degree is pinned", () => {
    expect(academicSectionAllowed([{ degree: "B.Tech", year: "First Year", branch: "" }], { degree: "MBA", year: "First Year", branch: "" })).toBe(false)
  })

  it("requires exact equality for fully-specified authorized sections", () => {
    const authorized = [{ degree: "B.Tech", year: "Second Year", branch: "CSE" }]
    expect(academicSectionAllowed(authorized, { degree: "B.Tech", year: "Second Year", branch: "CSE" })).toBe(true)
    expect(academicSectionAllowed(authorized, { degree: "B.Tech", year: "Second Year", branch: "ECE" })).toBe(false)
  })

  it("treats a blank target field as a literal (must equal another blank)", () => {
    // Authorized {year: 'First Year'} must not match a target that specifies
    // degree 'B.Tech' only and no year — the year is required to match.
    expect(academicSectionAllowed([{ degree: "", year: "First Year", branch: "" }], { degree: "B.Tech", year: "", branch: "" })).toBe(false)
  })
})

describe("scopeCovers — sections array in the server-action gate", () => {
  const assignment = { sections: MANAGER_SCOPE.sections }

  it("covers First Year of any degree/branch (wildcard)", () => {
    expect(scopeCovers(assignment, { degree: "B.Tech", year: "First Year", branch: "ECE" })).toBe(true)
    expect(scopeCovers(assignment, { degree: "MBA", year: "First Year", branch: "" })).toBe(true)
  })

  it("covers the exact B.Tech Second Year CSE section", () => {
    expect(scopeCovers(assignment, { degree: "B.Tech", year: "Second Year", branch: "CSE" })).toBe(true)
  })

  it("denies Second Year outside the pinned degree/branch", () => {
    expect(scopeCovers(assignment, { degree: "MBA", year: "Second Year", branch: "" })).toBe(false)
  })

  it("denies a section in no assignment at all", () => {
    expect(scopeCovers(assignment, { degree: "", year: "Third Year", branch: "" })).toBe(false)
  })

  it("keeps the legacy scalar behavior when there is no sections array", () => {
    expect(scopeCovers({ degree: "btech", year: "1", branch: "cse" }, { degree: "btech", year: "1", branch: "cse" })).toBe(true)
    expect(scopeCovers({ degree: "btech", year: "1", branch: "cse" }, { degree: "mba", year: "1", branch: "cse" })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Server-action authorization (CASE B / C / D / H)
// ---------------------------------------------------------------------------

function makeClient({
  subject = null,
  entry = null,
  assignment = null,
  assignmentSphere = "s-its",
}: {
  subject?: { id: string; sphere_id: string; degree: string; year: string; branch: string } | null
  entry?: { id: string; sphere_id: string } | null
  assignment?: { role: string; scope: Record<string, unknown> } | null
  assignmentSphere?: string
}) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const auditInsert = vi.fn().mockResolvedValue({ error: null })

  // role_assignments lookup is sphere-scoped: the assignment is only returned
  // when the requested Sphere matches, so cross-Sphere calls are denied.
  // requireSphereAction now awaits the query chain directly and expects a row
  // array (any-assignment semantics) — resolve a thenable instead of maybeSingle.
  const raEq2 = vi.fn((col: string, val: string) => ({
    then: (resolve: (v: unknown) => unknown) =>
      resolve({
        data: col === "sphere_id" && val !== assignmentSphere ? [] : assignment ? [assignment] : [],
        error: null,
      }),
  }))

  const from = vi.fn((table: string) => {
    if (table === "subjects") {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: subject, error: null }) }) }),
        update,
      }
    }
    if (table === "academic_calendar") {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: entry, error: null }) }) }),
        delete: del,
      }
    }
    if (table === "user_spheres") {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
    }
    if (table === "role_assignments") {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: raEq2 }) }) }
    }
    if (table === "audit_logs") {
      return { insert: auditInsert }
    }
    return {}
  })
  vi.mocked(createClient).mockReturnValue({ from } as never)
  return { update, del, auditInsert }
}

describe("updateSubjectAction — section-scoped academic manager", () => {
  it("allows editing a subject inside an assigned section (CASE B)", async () => {
    const mock = makeClient({
      subject: { id: "sub-1", sphere_id: "s-its", degree: "B.Tech", year: "First Year", branch: "CSE" },
      assignment: { role: "academic_manager", scope: MANAGER_SCOPE },
    })

    const fd = new FormData()
    fd.set("id", "sub-1")
    fd.set("name", "Data Structures (updated)")
    fd.set("code", "CS-203")
    fd.set("degree", "B.Tech")
    fd.set("year", "First Year")
    fd.set("branch", "CSE")

    const result = await updateSubjectAction(fd)
    expect(result.error).toBeNull()
    expect(mock.update).toHaveBeenCalledTimes(1)
    expect(mock.update.mock.calls[0][0]).toMatchObject({ name: "Data Structures (updated)" })
  })

  it("denies editing a subject in a section the manager was not assigned (CASE C)", async () => {
    const mock = makeClient({
      subject: { id: "sub-2", sphere_id: "s-its", degree: "B.Tech", year: "Second Year", branch: "ECE" },
      assignment: { role: "academic_manager", scope: MANAGER_SCOPE },
    })

    const fd = new FormData()
    fd.set("id", "sub-2")
    fd.set("name", "Signals")
    fd.set("degree", "B.Tech")
    fd.set("year", "Second Year")
    fd.set("branch", "ECE")

    const result = await updateSubjectAction(fd)
    expect(result.error).toMatch(/scope/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("denies editing a subject in another Sphere even with a matching section (CASE D)", async () => {
    const mock = makeClient({
      subject: { id: "sub-3", sphere_id: "s-sharda", degree: "B.Tech", year: "First Year", branch: "CSE" },
      assignment: { role: "academic_manager", scope: MANAGER_SCOPE },
      assignmentSphere: "s-its",
    })

    const fd = new FormData()
    fd.set("id", "sub-3")
    fd.set("name", "Sneaky")
    fd.set("degree", "B.Tech")
    fd.set("year", "First Year")
    fd.set("branch", "CSE")

    const result = await updateSubjectAction(fd)
    expect(result.error).toMatch(/access|scope/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("denies a plain member with no assignment (CASE A / forged call)", async () => {
    const mock = makeClient({
      subject: { id: "sub-1", sphere_id: "s-its", degree: "B.Tech", year: "First Year", branch: "CSE" },
      assignment: null,
    })

    const fd = new FormData()
    fd.set("id", "sub-1")
    fd.set("name", "Nope")
    fd.set("degree", "B.Tech")
    fd.set("year", "First Year")
    fd.set("branch", "CSE")

    const result = await updateSubjectAction(fd)
    expect(result.error).not.toBeNull()
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("requires coverage of BOTH the old and the new section when moving a subject (CASE H)", async () => {
    const mock = makeClient({
      subject: { id: "sub-4", sphere_id: "s-its", degree: "B.Tech", year: "First Year", branch: "CSE" },
      assignment: { role: "academic_manager", scope: MANAGER_SCOPE },
    })

    // Move the subject from First Year (assigned) into Second Year ECE (not
    // assigned — the assignment only covers B.Tech Second Year CSE).
    const fd = new FormData()
    fd.set("id", "sub-4")
    fd.set("name", "Move me")
    fd.set("degree", "B.Tech")
    fd.set("year", "Second Year")
    fd.set("branch", "ECE")

    const result = await updateSubjectAction(fd)
    expect(result.error).toMatch(/scope/i)
    expect(mock.update).not.toHaveBeenCalled()
  })
})

describe("deleteCalendarEntryAction — sphere-wide academic manager", () => {
  it("lets an assigned academic manager delete a calendar entry in their Sphere", async () => {
    const mock = makeClient({
      entry: { id: "cal-1", sphere_id: "s-its" },
      assignment: { role: "academic_manager", scope: MANAGER_SCOPE },
    })
    const result = await deleteCalendarEntryAction("cal-1")
    expect(result.error).toBeNull()
    expect(mock.del).toHaveBeenCalledTimes(1)
  })

  it("denies a member with no academic assignment", async () => {
    const mock = makeClient({ entry: { id: "cal-1", sphere_id: "s-its" }, assignment: null })
    const result = await deleteCalendarEntryAction("cal-1")
    expect(result.error).not.toBeNull()
    expect(mock.del).not.toHaveBeenCalled()
  })
})

describe("deleteUnitAction — section derived from the linked subject", () => {
  it("denies deleting a unit whose subject is outside the assigned section", async () => {
    // deleteUnitAction reads academic_units then subjects (degree/year/branch).
    const unitSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "u1", sphere_id: "s-its", subject_id: "sub-x" }, error: null }) }),
    })
    const subjectSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "sub-x", degree: "B.Tech", year: "Third Year", branch: "CSE" }, error: null }) }),
    })
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const from = vi.fn((table: string) => {
      if (table === "academic_units") return { select: unitSelect, delete: del }
      if (table === "subjects") return { select: subjectSelect }
      if (table === "user_spheres") return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
      if (table === "role_assignments") return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ then: (resolve: (v: unknown) => unknown) => resolve({ data: [{ role: "academic_manager", scope: MANAGER_SCOPE }], error: null }) }) }) }) }
      if (table === "audit_logs") return { insert: vi.fn().mockResolvedValue({ error: null }) }
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await deleteUnitAction("u1")
    expect(result.error).toMatch(/scope/i)
    expect(del).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// assignRoleAction — section assignment persistence
// ---------------------------------------------------------------------------

describe("assignRoleAction — academic_manager sections", () => {
  it("persists multiple sections for an academic_manager", async () => {
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, role: "super_admin" } as never)
    const upsert = vi.fn().mockResolvedValue({ error: null })
    // The code now checks for existing assignments before upserting (merge logic).
    const existingSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    })
    const from = vi.fn((table: string) => {
      if (table === "role_assignments") return { upsert, select: existingSelect }
      if (table === "spheres") {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: "ITS" }, error: null }) }) }) }
      }
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from, rpc: vi.fn().mockResolvedValue({ error: null }) } as never)

    const fd = new FormData()
    fd.set("userId", "u9")
    fd.set("sphereId", "s-its")
    fd.set("role", "academic_manager")
    fd.set("permissions", "academic.read,academic.create,academic.update,academic.delete")
    fd.set("sections", JSON.stringify([{ degree: "", year: "First Year", branch: "" }, { degree: "B.Tech", year: "Second Year", branch: "CSE" }]))

    const result = await assignRoleAction(fd)
    expect(result.error).toBeNull()
    expect(upsert).toHaveBeenCalledTimes(1)
    const [payload] = upsert.mock.calls[0]
    expect(payload.scope.sections).toEqual([
      { degree: "", year: "First Year", branch: "" },
      { degree: "B.Tech", year: "Second Year", branch: "CSE" },
    ])
    // Legacy scalars = first section for backward compatibility.
    expect(payload.scope.year).toBe("First Year")
  })

  it("merges new sections with existing ones (additive assignment)", async () => {
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, role: "super_admin" } as never)
    const upsert = vi.fn().mockResolvedValue({ error: null })
    // Simulate existing assignment with one section already stored.
    const existingSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                scope: {
                  sections: [{ degree: "", year: "Second Year", branch: "CSE" }],
                  permissions: ["academic.read", "academic.create"],
                },
              },
            }),
          }),
        }),
      }),
    })
    const from = vi.fn((table: string) => {
      if (table === "role_assignments") return { upsert, select: existingSelect }
      if (table === "spheres") {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: "ITS" }, error: null }) }) }) }
      }
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from, rpc: vi.fn().mockResolvedValue({ error: null }) } as never)

    // Assign a NEW section — should merge with the existing CSE section.
    const fd = new FormData()
    fd.set("userId", "u9")
    fd.set("sphereId", "s-its")
    fd.set("role", "academic_manager")
    fd.set("permissions", "academic.read,academic.create")
    fd.set("sections", JSON.stringify([{ degree: "", year: "Second Year", branch: "ECE" }]))

    const result = await assignRoleAction(fd)
    expect(result.error).toBeNull()
    const [payload] = upsert.mock.calls[0]
    // Must contain BOTH the existing CSE and the new ECE.
    expect(payload.scope.sections).toEqual([
      { degree: "", year: "Second Year", branch: "CSE" },
      { degree: "", year: "Second Year", branch: "ECE" },
    ])
  })

  it("deduplicates sections when assigning the same section twice", async () => {
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, role: "super_admin" } as never)
    const upsert = vi.fn().mockResolvedValue({ error: null })
    // Existing has CSE already.
    const existingSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                scope: {
                  sections: [{ degree: "", year: "2", branch: "CSE" }],
                  permissions: ["academic.read"],
                },
              },
            }),
          }),
        }),
      }),
    })
    const from = vi.fn((table: string) => {
      if (table === "role_assignments") return { upsert, select: existingSelect }
      if (table === "spheres") {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: "ITS" }, error: null }) }) }) }
      }
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from, rpc: vi.fn().mockResolvedValue({ error: null }) } as never)

    // Assign the SAME CSE section again — should not duplicate.
    const fd = new FormData()
    fd.set("userId", "u9")
    fd.set("sphereId", "s-its")
    fd.set("role", "academic_manager")
    fd.set("permissions", "academic.read")
    fd.set("sections", JSON.stringify([{ degree: "", year: "2", branch: "CSE" }]))

    const result = await assignRoleAction(fd)
    expect(result.error).toBeNull()
    const [payload] = upsert.mock.calls[0]
    expect(payload.scope.sections).toHaveLength(1)
    expect(payload.scope.sections[0].branch).toBe("CSE")
  })

  it("ignores sections for non-academic roles (no scope leakage)", async () => {
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, role: "super_admin" } as never)
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === "role_assignments") return { upsert }
      if (table === "spheres") {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: "ITS" }, error: null }) }) }) }
      }
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from, rpc: vi.fn().mockResolvedValue({ error: null }) } as never)

    const fd = new FormData()
    fd.set("userId", "u9")
    fd.set("sphereId", "s-its")
    fd.set("role", "event_manager")
    fd.set("permissions", "events.create")
    fd.set("sections", JSON.stringify([{ degree: "", year: "First Year", branch: "" }]))

    const result = await assignRoleAction(fd)
    expect(result.error).toBeNull()
    expect(upsert.mock.calls[0][0].scope.sections).toBeUndefined()
  })
})

describe("academicSectionLabel", () => {
  it("joins non-blank fields and falls back for a fully blank section", () => {
    expect(academicSectionLabel({ degree: "B.Tech", year: "First Year", branch: "CSE" })).toBe("B.Tech · First Year · CSE")
    expect(academicSectionLabel({ degree: "", year: "First Year", branch: "" })).toBe("First Year")
    expect(academicSectionLabel({ degree: "", year: "", branch: "" })).toBe("All academic content")
  })
})

describe("academicSectionsEqual", () => {
  it("is case-insensitive and blank-strict", () => {
    expect(academicSectionsEqual({ degree: "B.Tech", year: "1", branch: "CSE" }, { degree: "b.tech", year: "1", branch: "cse" })).toBe(true)
    expect(academicSectionsEqual({ degree: "", year: "First Year", branch: "" }, { degree: "B.Tech", year: "First Year", branch: "" })).toBe(false)
  })
})
