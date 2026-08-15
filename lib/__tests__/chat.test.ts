import { beforeEach, describe, expect, it, vi } from "vitest"
import { computeScrollAnchor, mergeChatMessages, replaceOptimisticMessage, selectInitialWindow } from "@/lib/chat"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { sendMessageAction } from "@/lib/actions/chat"

function msg(id: string, createdAt: string, extra: Partial<Parameters<typeof mergeChatMessages>[0][number]> = {}) {
  return { id, body: "hello", authorId: "u2", createdAt, isDeleted: false, authorHandle: "@Other", ...extra }
}

describe("mergeChatMessages", () => {
  it("appends a realtime message to the existing list", () => {
    const existing = [msg("m1", "2026-01-01T10:00:00Z")]
    const next = mergeChatMessages(existing, [msg("m2", "2026-01-01T10:01:00Z")])
    expect(next.map((m) => m.id)).toEqual(["m1", "m2"])
  })

  it("never duplicates a message id (duplicate realtime events / reconnect)", () => {
    const existing = [msg("m1", "2026-01-01T10:00:00Z")]
    const afterEcho = mergeChatMessages(existing, [msg("m1", "2026-01-01T10:00:00Z")])
    const afterSecondEcho = mergeChatMessages(afterEcho, [msg("m1", "2026-01-01T10:00:00Z")])
    expect(afterSecondEcho).toHaveLength(1)
    expect(afterSecondEcho[0].id).toBe("m1")
  })

  it("keeps the list sorted oldest → newest regardless of arrival order", () => {
    const existing = [msg("m1", "2026-01-01T10:00:00Z")]
    const next = mergeChatMessages(existing, [
      msg("m3", "2026-01-01T10:02:00Z"),
      msg("m2", "2026-01-01T10:01:00Z"),
    ])
    expect(next.map((m) => m.id)).toEqual(["m1", "m2", "m3"])
  })
})

describe("replaceOptimisticMessage", () => {
  const optimistic = msg("optimistic-1", "2026-01-01T10:00:00Z", { authorId: "me", authorHandle: "@Me" })
  const server = msg("real-1", "2026-01-01T10:00:01Z", { authorId: "me", authorHandle: "@Me" })

  it("swaps the optimistic bubble for the server-acknowledged message (immediate send)", () => {
    const next = replaceOptimisticMessage([optimistic], optimistic.id, server)
    expect(next.map((m) => m.id)).toEqual(["real-1"])
    expect(next).toHaveLength(1)
  })

  it("drops the optimistic copy when realtime already delivered the server message", () => {
    // Realtime beat the action response: the real message is already present.
    const next = replaceOptimisticMessage([optimistic, server], optimistic.id, server)
    expect(next.map((m) => m.id)).toEqual(["real-1"])
    expect(next).toHaveLength(1)
  })
})

describe("selectInitialWindow", () => {
  const all = [
    msg("m1", "2026-01-01T10:00:00Z"),
    msg("m2", "2026-01-01T10:01:00Z"),
    msg("m3", "2026-01-01T10:02:00Z"),
    msg("m4", "2026-01-01T10:03:00Z"),
  ]

  it("returns the newest window in oldest→newest order and flags hasMore", () => {
    const { messages, hasMore, oldestCreatedAt } = selectInitialWindow(all, 2)
    expect(messages.map((m) => m.id)).toEqual(["m3", "m4"]) // newest 2, reversed for display
    expect(hasMore).toBe(true)
    expect(oldestCreatedAt).toBe("2026-01-01T10:02:00Z")
  })

  it("returns everything when the window covers the whole history", () => {
    const { messages, hasMore } = selectInitialWindow(all, 10)
    expect(messages).toHaveLength(4)
    expect(hasMore).toBe(false)
  })
})

describe("computeScrollAnchor", () => {
  it("stays at the bottom when the user was already near the bottom", () => {
    // Older messages prepended: height grew 1000 → 1400. A user at the bottom
    // must remain at the bottom (newest message still visible).
    const anchor = computeScrollAnchor({
      wasNearBottom: true,
      prevScrollTop: 800,
      prevScrollHeight: 1000,
      nextScrollHeight: 1400,
    })
    expect(anchor).toBe(1400)
  })

  it("keeps the same messages in view when reading history (no jump)", () => {
    // User is 200px above the bottom reading older messages; prepending adds
    // 400px above, so the same content is now 400px lower.
    const anchor = computeScrollAnchor({
      wasNearBottom: false,
      prevScrollTop: 400,
      prevScrollHeight: 1000,
      nextScrollHeight: 1400,
    })
    expect(anchor).toBe(800)
  })

  it("returns the original offset when nothing was prepended", () => {
    const anchor = computeScrollAnchor({
      wasNearBottom: false,
      prevScrollTop: 250,
      prevScrollHeight: 1000,
      nextScrollHeight: 1000,
    })
    expect(anchor).toBe(250)
  })
})

describe("sendMessageAction", () => {
  const memberUser = { id: "u1", email: "a@b.c" }

  function makeSupabaseMock({
    isMember = true,
    lastMessage = null,
    insertedRow = { id: "m-new", created_at: "2026-01-01T10:05:00Z" },
  }: {
    isMember?: boolean
    lastMessage?: { created_at: string } | null
    insertedRow?: { id: string; created_at: string }
  } = {}) {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: insertedRow, error: null }) }),
    })
    const from = vi.fn((table: string) => {
      if (table === "user_spheres") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: isMember ? { sphere_id: "s1" } : null, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: lastMessage, error: null }) }),
              }),
            }),
          }),
        }),
        insert,
      }
    })
    return {
      from,
      insert,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: memberUser }, error: null }) },
    }
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it("persists the message and returns the inserted row for optimistic reconciliation", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    const formData = new FormData()
    formData.set("body", "hello")
    formData.set("sphereId", "s1")

    const result = await sendMessageAction(formData)
    expect(result.error).toBeNull()
    expect(result.message).toEqual({ id: "m-new", createdAt: "2026-01-01T10:05:00Z" })
    expect(mock.insert).toHaveBeenCalledTimes(1)
    expect(mock.insert.mock.calls[0][0]).toMatchObject({ sphere_id: "s1", author_id: "u1", body: "hello" })
  })

  it("rejects a message from a non-member (Sphere isolation)", async () => {
    const mock = makeSupabaseMock({ isMember: false })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const formData = new FormData()
    formData.set("body", "hello")
    formData.set("sphereId", "s-other")

    const result = await sendMessageAction(formData)
    expect(result.error).toMatch(/not a member/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("rejects empty bodies without touching the database", async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createClient).mockReturnValue(mock as never)

    const formData = new FormData()
    formData.set("body", "   ")
    formData.set("sphereId", "s1")

    const result = await sendMessageAction(formData)
    expect(result.error).toBeTruthy()
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("rate-limits rapid sends", async () => {
    const mock = makeSupabaseMock({ lastMessage: { created_at: new Date().toISOString() } })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const formData = new FormData()
    formData.set("body", "hello")
    formData.set("sphereId", "s1")

    const result = await sendMessageAction(formData)
    expect(result.error).toMatch(/too quickly/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })
})
