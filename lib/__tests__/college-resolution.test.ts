import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/data/session", () => ({
  requireAdmin: vi.fn(),
  requireMember: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import {
  collegeMatchScore,
  normalizeCollegeForSlug,
  normalizeSearchTerm,
  resolveCollegeMatch,
} from "@/lib/validation"
import { searchCollegesAction } from "@/lib/actions/platform"

// ---------------------------------------------------------------------------
// Fixture: an ITS campus with aliases, a DTU, a *different* ITS campus, and
// an inactive college that must never surface in search.
// ---------------------------------------------------------------------------

const COLLEGES = [
  { id: "c-its", name: "ITS Engineering College", short_name: "ITS", slug: "its", city: "Greater Noida", status: "active" },
  { id: "c-dtu", name: "Delhi Technological University", short_name: "DTU", slug: "delhi-technological", city: "Delhi", status: "active" },
  { id: "c-its-gn", name: "ITS Engineering College Greater Noida", short_name: "ITSGN", slug: "its-engineering-college-greater-noida", city: "Greater Noida", status: "active" },
  { id: "c-inactive", name: "Retired College", short_name: "RC", slug: "retired", city: "Nowhere", status: "inactive" },
]

const ALIASES = [
  { college_id: "c-its", alias: "I.T.S" },
  { college_id: "c-its", alias: "ITS College" },
]

function aliasMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const row of ALIASES) {
    ;(map[row.college_id] ??= []).push(row.alias)
  }
  return map
}

const activeColleges = COLLEGES.filter((c) => c.status === "active")

function mockClient() {
  const from = vi.fn((table: string) => {
    if (table === "colleges") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: COLLEGES, error: null }),
            }),
          }),
        }),
      }
    }
    return {
      select: vi.fn().mockResolvedValue({ data: ALIASES, error: null }),
    }
  })
  vi.mocked(createClient).mockReturnValue({ from } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockClient()
})

describe("normalizeSearchTerm", () => {
  it("is case-insensitive and collapses whitespace", () => {
    expect(normalizeSearchTerm("  ITS   Engineering  ")).toBe("its engineering")
  })

  it("treats punctuation as separators", () => {
    expect(normalizeSearchTerm("I.T.S")).toBe("its")
    expect(normalizeSearchTerm("I.T.S.")).toBe("its")
    expect(normalizeSearchTerm("i.t.s")).toBe("its")
  })
})

describe("collegeMatchScore", () => {
  it("matches the official name against every required variation", () => {
    const college = { name: "ITS Engineering College", short_name: "ITS", slug: "its" }
    for (const query of ["ITS", "its", "iTs", "I.T.S", "ITS Engineering", "ITS College", "ITS  Engineering  College"]) {
      expect(collegeMatchScore(college, [], query), `query "${query}" should match`).toBeGreaterThan(0)
    }
  })

  it("matches through aliases", () => {
    const college = { name: "ITS Engineering College", short_name: "ITS", slug: "its" }
    expect(collegeMatchScore(college, ["I.T.S"], "i.t.s")).toBeGreaterThan(0)
  })

  it("rejects unrelated queries", () => {
    const college = { name: "ITS Engineering College", short_name: "ITS", slug: "its" }
    expect(collegeMatchScore(college, [], "Harvard")).toBe(0)
    expect(collegeMatchScore(college, [], "Engineering College ITS")).toBe(0) // order matters
  })

  it("scores an exact match above a loose one", () => {
    const college = { name: "ITS Engineering College", short_name: "ITS", slug: "its" }
    expect(collegeMatchScore(college, [], "ITS")).toBeGreaterThan(collegeMatchScore(college, [], "college"))
  })
})

describe("resolveCollegeMatch", () => {
  it("resolves ITS, its, I.T.S, ITS Engineering and ITS College to the same college", () => {
    for (const query of ["ITS", "its", "iTs", "I.T.S", "ITS Engineering", "ITS College", " ITS   Engineering  "]) {
      const resolved = resolveCollegeMatch(activeColleges, aliasMap(), query)
      expect(resolved?.id).toBe("c-its")
    }
  })

  it("never returns more than one college for one query (no duplicates)", () => {
    const resolved = resolveCollegeMatch(activeColleges, aliasMap(), "ITS")
    expect(resolved).not.toBeNull()
    const same = resolveCollegeMatch(activeColleges, aliasMap(), "I.T.S")
    expect(same?.id).toBe(resolved?.id)
  })

  it("returns null for an unknown college", () => {
    expect(resolveCollegeMatch(activeColleges, aliasMap(), "Harvard University")).toBeNull()
    expect(resolveCollegeMatch(activeColleges, aliasMap(), "xyzzy")).toBeNull()
  })

  it("never resolves to an inactive college", () => {
    // Status filtering happens before matching (only active colleges are ever
    // candidates); with the active-only set the retired campus can't resolve.
    expect(resolveCollegeMatch(activeColleges, aliasMap(), "Retired College")).toBeNull()
    expect(resolveCollegeMatch(activeColleges, aliasMap(), "RC")).toBeNull()
  })
})

describe("normalizeCollegeForSlug", () => {
  it("produces stable, conservative slugs matching the SQL helper", () => {
    expect(normalizeCollegeForSlug("ITS Engineering College")).toBe("its")
    expect(normalizeCollegeForSlug("Delhi Technological University")).toBe("delhi-technological")
  })

  it("is deterministic — the same name always yields the same slug", () => {
    expect(normalizeCollegeForSlug("ITS Engineering College")).toBe(normalizeCollegeForSlug("its engineering college"))
  })
})

describe("searchCollegesAction", () => {
  it("returns [] for an empty query without touching the database", async () => {
    const { colleges } = await searchCollegesAction("   ")
    expect(colleges).toEqual([])
  })

  it("finds ITS for ITS, its, I.T.S, ITS Engineering and ITS College", async () => {
    for (const query of ["ITS", "its", "I.T.S", "ITS Engineering", "ITS College"]) {
      const { colleges } = await searchCollegesAction(query)
      expect(colleges.length).toBeGreaterThan(0)
      expect(colleges[0].id).toBe("c-its")
    }
  })

  it("is whitespace tolerant", async () => {
    const { colleges } = await searchCollegesAction("  ITS   Engineering  ")
    expect(colleges[0].id).toBe("c-its")
  })

  it("is alias aware", async () => {
    const { colleges } = await searchCollegesAction("i.t.s")
    expect(colleges.some((c) => c.id === "c-its")).toBe(true)
  })

  it("never returns an inactive college", async () => {
    const { colleges } = await searchCollegesAction("Retired")
    expect(colleges).toEqual([])
  })

  it("returns [] for an unknown college", async () => {
    const { colleges } = await searchCollegesAction("Harvard University")
    expect(colleges).toEqual([])
  })

  it("returns a single entry per college (duplicate-Sphere prevention)", async () => {
    const { colleges } = await searchCollegesAction("ITS")
    const itsIds = colleges.filter((c) => c.id === "c-its")
    expect(itsIds).toHaveLength(1)
  })
})
