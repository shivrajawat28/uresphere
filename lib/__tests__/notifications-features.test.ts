import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/data/session", () => ({
  requireMember: vi.fn(),
}))

vi.mock("@/lib/actions/admin", () => ({
  requireSphereAction: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { requireSphereAction } from "@/lib/actions/admin"
import { markAllNotificationsReadAction, markNotificationReadAction, updateNotificationPreferencesAction, getNotificationPreferences } from "@/lib/actions/notifications"
import { getGroupInspectionData, toggleGroupMuteAction, getGroupMuteStatus } from "@/lib/actions/groups"
import { sniffImageTypeFromBytes, ALLOWED_IMAGE_TYPES } from "@/lib/uploads"
import { reviewListingAction } from "@/lib/actions/marketplace"

const MEMBER = {
  userId: "u1",
  email: "user@uresphere.app",
  role: "user",
  accountStatus: "active",
  sphereId: "sphere-1",
  sphereName: "Test Sphere",
  anonymousHandle: "@TestUser123",
  realName: "Test User",
  avatarUrl: null,
}

const ADMIN_MEMBER = {
  ...MEMBER,
  userId: "admin1",
  role: "super_admin",
  anonymousHandle: "@Admin",
}

function makeFrom(tableBehaviors: Record<string, () => unknown>) {
  return vi.fn((table: string) => tableBehaviors[table]?.() ?? { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Notifications — mark read actions
// ---------------------------------------------------------------------------

function makeUpdateChain(result: unknown = { error: null }) {
  const eq2 = vi.fn().mockResolvedValue(result)
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const update = vi.fn().mockReturnValue({ eq: eq1 })
  return { update, eq1, eq2 }
}

describe("markAllNotificationsReadAction", () => {
  it("marks all unread notifications as read for the current user", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const { update } = makeUpdateChain()
    const chain = { update }
    const from = vi.fn(() => chain)
    vi.mocked(createClient).mockReturnValue({ from, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } } as never)

    const result = await markAllNotificationsReadAction()
    expect(result.error).toBeNull()
  })

  it("returns error when not authenticated", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } } as never)

    const result = await markAllNotificationsReadAction()
    expect(result.error).toBe("Not signed in.")
  })
})

describe("markNotificationReadAction", () => {
  it("marks a single notification as read", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const { update } = makeUpdateChain()
    const chain = { update }
    const from = vi.fn(() => chain)
    vi.mocked(createClient).mockReturnValue({ from, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } } as never)

    const result = await markNotificationReadAction("notif-1")
    expect(result.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

describe("getNotificationPreferences", () => {
  it("returns default preferences when no row exists", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const maybeSingle = vi.fn().mockResolvedValue({ data: null })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = makeFrom({ notification_preferences: () => ({ select }) })
    vi.mocked(createClient).mockReturnValue({ from, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } } as never)

    const result = await getNotificationPreferences()
    expect(result.error).toBeNull()
    expect(result.preferences).toEqual({
      pushEnabled: true,
      chatNotifications: true,
      groupNotifications: true,
    })
  })

  it("returns stored preferences when a row exists", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { push_enabled: false, chat_notifications: true, group_notifications: false },
    })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = makeFrom({ notification_preferences: () => ({ select }) })
    vi.mocked(createClient).mockReturnValue({ from, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } } as never)

    const result = await getNotificationPreferences()
    expect(result.error).toBeNull()
    expect(result.preferences).toEqual({
      pushEnabled: false,
      chatNotifications: true,
      groupNotifications: false,
    })
  })
})

describe("updateNotificationPreferencesAction", () => {
  it("upserts notification preferences", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = makeFrom({ notification_preferences: () => ({ upsert }) })
    vi.mocked(createClient).mockReturnValue({ from, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } } as never)

    const result = await updateNotificationPreferencesAction({ pushEnabled: false })
    expect(result.error).toBeNull()
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Group Admin Inspection
// ---------------------------------------------------------------------------

describe("getGroupInspectionData", () => {
  function makeSupabaseMock(groupData: { id: string; sphere_id: string } | null) {
    const eqChain = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(groupData ? { data: groupData } : { data: null }),
    })
    const selectGroup = vi.fn().mockReturnValue({ eq: eqChain })

    const from = vi.fn((table: string) => {
      if (table === "groups") return { select: selectGroup }
      // For all other tables, return a passthrough chain
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
          in: vi.fn().mockResolvedValue({ data: [] }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          head: vi.fn().mockReturnThis(),
        }),
      }
    })
    return { from }
  }

  it("rejects non-existent groups", async () => {
    vi.mocked(requireMember).mockResolvedValue(ADMIN_MEMBER as never)
    vi.mocked(createClient).mockReturnValue(makeSupabaseMock(null) as never)

    const result = await getGroupInspectionData("nonexistent")
    expect(result.error).toBe("Group not found.")
    // requireSphereAction should NOT be called for non-existent groups
    expect(requireSphereAction).not.toHaveBeenCalled()
  })

  it("calls requireSphereAction with social.manage_groups for existing groups", async () => {
    vi.mocked(requireMember).mockResolvedValue(ADMIN_MEMBER as never)
    vi.mocked(requireSphereAction).mockResolvedValue({ ok: false, error: "No permission" })
    vi.mocked(createClient).mockReturnValue(makeSupabaseMock({ id: "g1", sphere_id: "sphere-1" }) as never)

    const result = await getGroupInspectionData("g1")
    expect(result.error).toBe("No permission")
    expect(requireSphereAction).toHaveBeenCalledWith("sphere-1", "social.manage_groups")
  })

  it("rejects when requireSphereAction returns not-ok", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    vi.mocked(requireSphereAction).mockResolvedValue({
      ok: false,
      error: "This is outside your assigned scope.",
    })
    vi.mocked(createClient).mockReturnValue(makeSupabaseMock({ id: "g1", sphere_id: "sphere-1" }) as never)

    const result = await getGroupInspectionData("g1")
    expect(result.error).toBe("This is outside your assigned scope.")
  })
})

// ---------------------------------------------------------------------------
// Group Mute
// ---------------------------------------------------------------------------

describe("toggleGroupMuteAction", () => {
  function makeChainable(result: unknown = null) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: result }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }
    return chain
  }

  it("mutes notifications for a group", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const membershipChain = makeChainable({ group_id: "g1" })
    const prefChain = makeChainable()
    prefChain.upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === "group_members") return membershipChain
      if (table === "group_notification_preferences") return prefChain
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await toggleGroupMuteAction("g1", true)
    expect(result.error).toBeNull()
    expect(prefChain.upsert).toHaveBeenCalledTimes(1)
  })

  it("rejects mute toggle for non-members", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const membershipChain = makeChainable(null)
    const from = vi.fn((table: string) => {
      if (table === "group_members") return membershipChain
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await toggleGroupMuteAction("g1", true)
    expect(result.error).toBe("You're not a member of this group.")
  })
})

describe("getGroupMuteStatus", () => {
  function makeChainable(result: unknown = null) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: result }),
    }
    return chain
  }

  it("returns muted: false when no preference exists", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const chain = makeChainable(null)
    const from = vi.fn((table: string) => {
      if (table === "group_notification_preferences") return chain
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await getGroupMuteStatus("g1")
    expect(result.error).toBeNull()
    expect(result.muted).toBe(false)
  })

  it("returns the stored mute status", async () => {
    vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
    const chain = makeChainable({ muted: true })
    const from = vi.fn((table: string) => {
      if (table === "group_notification_preferences") return chain
      return {}
    })
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await getGroupMuteStatus("g1")
    expect(result.error).toBeNull()
    expect(result.muted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Image Upload — AVIF support + MIME type detection
// ---------------------------------------------------------------------------

describe("AVIF image type detection", () => {
  it("detects AVIF files by magic bytes", () => {
    // AVIF: offset 4 = 'ftyp', offset 8-11 = 'avif'
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x1c, // box size
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x61, 0x76, 0x69, 0x66, // 'avif'
      0x00, 0x00, 0x00, 0x01,
    ])
    const result = sniffImageTypeFromBytes(bytes)
    expect(result).toBe("image/avif")
  })

  it("detects AVIF images with 'avis' brand", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x1c,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x61, 0x76, 0x69, 0x73, // 'avis'
      0x00, 0x00, 0x00, 0x01,
    ])
    const result = sniffImageTypeFromBytes(bytes)
    expect(result).toBe("image/avif")
  })

  it("does not false-positive on non-AVIF ftyp boxes", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x1c,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x6d, 0x70, 0x34, 0x31, // 'mp41' (not AVIF)
      0x00, 0x00, 0x00, 0x01,
    ])
    const result = sniffImageTypeFromBytes(bytes)
    expect(result).toBeNull()
  })

  it("detects JPEG files", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
    expect(sniffImageTypeFromBytes(bytes)).toBe("image/jpeg")
  })

  it("detects PNG files", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
    expect(sniffImageTypeFromBytes(bytes)).toBe("image/png")
  })

  it("detects GIF files", () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00])
    expect(sniffImageTypeFromBytes(bytes)).toBe("image/gif")
  })

  it("detects WebP files", () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    expect(sniffImageTypeFromBytes(bytes)).toBe("image/webp")
  })

  it("returns null for unknown file types", () => {
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(sniffImageTypeFromBytes(bytes)).toBeNull()
  })

  it("detects HEIC files by magic bytes (heic brand)", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x1c, // box size
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x68, 0x65, 0x69, 0x63, // 'heic'
      0x00, 0x00, 0x00, 0x01,
    ])
    expect(sniffImageTypeFromBytes(bytes)).toBe("image/heic")
  })

  it("detects HEIC files with heix brand", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x1c,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x68, 0x65, 0x69, 0x78, // 'heix'
      0x00, 0x00, 0x00, 0x01,
    ])
    expect(sniffImageTypeFromBytes(bytes)).toBe("image/heic")
  })

  it("detects HEIF files with mif1 brand", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x1c,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x6d, 0x69, 0x66, 0x31, // 'mif1'
      0x00, 0x00, 0x00, 0x01,
    ])
    expect(sniffImageTypeFromBytes(bytes)).toBe("image/heic")
  })
})

describe("ALLOWED_IMAGE_TYPES includes AVIF and HEIC", () => {
  it("includes all standard image types plus AVIF and HEIC", () => {
    expect(ALLOWED_IMAGE_TYPES.has("image/jpeg")).toBe(true)
    expect(ALLOWED_IMAGE_TYPES.has("image/png")).toBe(true)
    expect(ALLOWED_IMAGE_TYPES.has("image/webp")).toBe(true)
    expect(ALLOWED_IMAGE_TYPES.has("image/gif")).toBe(true)
    expect(ALLOWED_IMAGE_TYPES.has("image/avif")).toBe(true)
    expect(ALLOWED_IMAGE_TYPES.has("image/heic")).toBe(true)
    expect(ALLOWED_IMAGE_TYPES.has("image/heif")).toBe(true)
  })

  it("does not include non-image types", () => {
    expect(ALLOWED_IMAGE_TYPES.has("application/pdf")).toBe(false)
    expect(ALLOWED_IMAGE_TYPES.has("image/svg+xml")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Server-side authorization — group inspection requires permission
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Marketplace — self-review prevention
// ---------------------------------------------------------------------------

describe("reviewListingAction — self-review prevention", () => {
  it("rejects when admin tries to review their own listing", async () => {
    vi.mocked(requireSphereAction).mockResolvedValue({ ok: true, member: ADMIN_MEMBER as never })

    const listing = { id: "l1", sphere_id: "sphere-1", status: "pending", seller_id: "admin1", title: "Test" }
    const from = vi.fn((table: string) => {
      if (table === "marketplace_listings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: listing }),
          update: vi.fn().mockReturnThis(),
        }
      }
      return { from: vi.fn() }
    })
    vi.mocked(createClient).mockReturnValue({ from, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin1" } } }) } } as never)

    const result = await reviewListingAction("l1", "approve", "", "")
    expect(result.error).toBe("You cannot review your own listing.")
  })

  it("allows a different admin to review a listing", async () => {
    vi.mocked(requireSphereAction).mockResolvedValue({ ok: true, member: { ...ADMIN_MEMBER, userId: "admin2" } as never })

    const listing = { id: "l1", sphere_id: "sphere-1", status: "pending", seller_id: "user-seller", title: "Test" }
    const eqAfterUpdate = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: eqAfterUpdate })
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === "marketplace_listings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: listing }),
          update,
        }
      }
      return { }
    })
    vi.mocked(createClient).mockReturnValue({ from, rpc, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin2" } } }) } } as never)

    const result = await reviewListingAction("l1", "approve", "", "")
    expect(result.error).toBeNull()
    expect(update).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Server-side authorization — group inspection requires permission
// ---------------------------------------------------------------------------

describe("Group admin inspection full data flow", () => {
  it("returns structured data when authorized", async () => {
    vi.mocked(requireMember).mockResolvedValue(ADMIN_MEMBER as never)
    vi.mocked(requireSphereAction).mockResolvedValue({ ok: true, member: ADMIN_MEMBER as never })

    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "g1", name: "Test", description: "", created_by: "u2", created_at: "2026-01-01T00:00:00Z", sphere_id: "sphere-1" } }),
      in: vi.fn().mockResolvedValue({ data: [] }),
    }
    // Second select for group_messages count also returns chainable
    const from = vi.fn(() => ({ ...chainable }))
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const result = await getGroupInspectionData("g1")
    expect(result.error).toBeNull()
    expect(result.group).toBeDefined()
    expect(result.group?.id).toBe("g1")
    expect(result.group?.name).toBe("Test")
  })
})
