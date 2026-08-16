import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  computeScrollAnchor,
  deletedMessageLabel,
  mergeChatMessages,
  replaceOptimisticMessage,
  selectInitialWindow,
  shouldSendOnEnter,
} from "@/lib/chat"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { sendMessageAction, deleteMessageAction } from "@/lib/actions/chat"

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

  it("carries reply + deletion metadata through merges", () => {
    const next = mergeChatMessages([], [
      msg("m1", "2026-01-01T10:00:00Z", {
        replyToMessageId: "orig-1",
        isDeleted: true,
        deletedByRole: "admin",
      }),
    ])
    expect(next[0].replyToMessageId).toBe("orig-1")
    expect(next[0].deletedByRole).toBe("admin")
  })
})

describe("deletedMessageLabel", () => {
  it("returns null for non-deleted messages", () => {
    expect(deletedMessageLabel(false, null)).toBeNull()
    expect(deletedMessageLabel(false, "admin")).toBeNull()
  })

  it("attributes user deletions to the user", () => {
    expect(deletedMessageLabel(true, "user")).toBe("Message deleted by user")
    expect(deletedMessageLabel(true, null)).toBe("Message deleted by user")
  })

  it("attributes admin deletions to the admin", () => {
    expect(deletedMessageLabel(true, "admin")).toBe("Message deleted by admin")
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

  it("keeps reply metadata on the server-acknowledged message", () => {
    const withReply = { ...server, replyToMessageId: "orig-1" }
    const next = replaceOptimisticMessage([optimistic], optimistic.id, withReply)
    expect(next[0].replyToMessageId).toBe("orig-1")
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

describe("shouldSendOnEnter", () => {
  function ev(overrides: Partial<Parameters<typeof shouldSendOnEnter>[0]> = {}) {
    return { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, ...overrides }
  }

  it("sends on a bare Enter", () => {
    expect(shouldSendOnEnter(ev())).toBe(true)
  })

  it("inserts a newline on Shift+Enter", () => {
    expect(shouldSendOnEnter(ev({ shiftKey: true }))).toBe(false)
  })

  it("never sends mid-IME composition", () => {
    expect(shouldSendOnEnter(ev({ isComposing: true }))).toBe(false)
  })

  it("never sends on the legacy keyCode 229 some IMEs / virtual keyboards emit", () => {
    expect(shouldSendOnEnter(ev({ keyCode: 229 }))).toBe(false)
    // even when isComposing is not reported
    expect(shouldSendOnEnter(ev({ keyCode: 229, isComposing: false }))).toBe(false)
  })

  it("ignores every other key (typing is unaffected)", () => {
    expect(shouldSendOnEnter(ev({ key: "a" }))).toBe(false)
    expect(shouldSendOnEnter(ev({ key: "Backspace" }))).toBe(false)
    expect(shouldSendOnEnter(ev({ key: "Tab", shiftKey: true }))).toBe(false)
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

  /**
   * Flexible chat_messages chain: every builder call returns the chain, and
   * maybeSingle() returns the row matching the columns the query selected.
   */
  function makeSupabaseMock({
    isMember = true,
    lastMessage = null,
    insertedRow = { id: "m-new", created_at: "2026-01-01T10:05:00Z" },
    replyTarget = null,
  }: {
    isMember?: boolean
    lastMessage?: { created_at: string } | null
    insertedRow?: { id: string; created_at: string }
    replyTarget?: { id: string; sphere_id: string; is_deleted: boolean } | null
  } = {}) {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: insertedRow, error: null }) }),
    })
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const from = vi.fn((table: string) => {
      let selectedCols = ""
      const chain = {
        select: vi.fn((cols?: string) => {
          selectedCols = String(cols ?? "")
          return chain
        }),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        insert,
        maybeSingle: vi.fn(async () => {
          if (table === "user_spheres") {
            return { data: isMember ? { sphere_id: "s1" } : null, error: null }
          }
          if (table === "profiles") {
            return { data: { role: "user", account_status: "active" }, error: null }
          }
          if (selectedCols === "id, sphere_id, is_deleted") {
            return { data: replyTarget, error: null }
          }
          if (selectedCols === "author_id, sphere_id") {
            return { data: replyTarget, error: null }
          }
          return { data: lastMessage, error: null }
        }),
      }
      return chain
    })
    return {
      from,
      insert,
      rpc,
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

  it("persists a reply reference to a same-Sphere message", async () => {
    const mock = makeSupabaseMock({
      replyTarget: { id: "orig-1", sphere_id: "s1", is_deleted: false },
    })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const formData = new FormData()
    formData.set("body", "yes it starts at 10am")
    formData.set("sphereId", "s1")
    formData.set("replyToMessageId", "orig-1")

    const result = await sendMessageAction(formData)
    expect(result.error).toBeNull()
    expect(mock.insert.mock.calls[0][0]).toMatchObject({ reply_to_message_id: "orig-1" })
  })

  it("rejects a reply whose target belongs to another Sphere", async () => {
    const mock = makeSupabaseMock({
      replyTarget: { id: "orig-1", sphere_id: "s-other", is_deleted: false },
    })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const formData = new FormData()
    formData.set("body", "cross-sphere reply")
    formData.set("sphereId", "s1")
    formData.set("replyToMessageId", "orig-1")

    const result = await sendMessageAction(formData)
    expect(result.error).toMatch(/only reply to messages in this Sphere/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("rejects a reply to a deleted message", async () => {
    const mock = makeSupabaseMock({
      replyTarget: { id: "orig-1", sphere_id: "s1", is_deleted: true },
    })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const formData = new FormData()
    formData.set("body", "reply to deleted")
    formData.set("sphereId", "s1")
    formData.set("replyToMessageId", "orig-1")

    const result = await sendMessageAction(formData)
    expect(result.error).toMatch(/deleted message/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("rejects a reply to a message that no longer exists", async () => {
    const mock = makeSupabaseMock({ replyTarget: null })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const formData = new FormData()
    formData.set("body", "reply to ghost")
    formData.set("sphereId", "s1")
    formData.set("replyToMessageId", "ghost-id")

    const result = await sendMessageAction(formData)
    expect(result.error).toMatch(/no longer exists/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })
})

describe("deleteMessageAction", () => {
  const memberUser = { id: "u1", email: "a@b.c" }

  function makeSupabaseMock({
    message = null,
    isAdminProfile = false,
    rpcError = null,
  }: {
    message?: { author_id: string; sphere_id: string } | null
    isAdminProfile?: boolean
    rpcError?: { message: string } | null
  } = {}) {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError })
    const from = vi.fn((table: string) => {
      let selectedCols = ""
      const chain = {
        select: vi.fn((cols?: string) => {
          selectedCols = String(cols ?? "")
          return chain
        }),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === "user_spheres") {
            return { data: isAdminProfile ? { sphere_id: "s1" } : null, error: null }
          }
          if (table === "profiles") {
            return {
              data: isAdminProfile ? { role: "admin", account_status: "active" } : { role: "user", account_status: "active" },
              error: null,
            }
          }
          if (selectedCols === "author_id, sphere_id") {
            return { data: message, error: null }
          }
          return { data: null, error: null }
        }),
      }
      return chain
    })
    return {
      from,
      rpc,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: memberUser }, error: null }) },
    }
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it("lets the message owner delete their own message and reports deletedByRole 'user'", async () => {
    const mock = makeSupabaseMock({ message: { author_id: "u1", sphere_id: "s1" } })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await deleteMessageAction("m1")
    expect(result.error).toBeNull()
    expect(result.deletedByRole).toBe("user")
    expect(mock.rpc).toHaveBeenCalledWith("delete_chat_message", { p_message_id: "m1" })
  })

  it("lets an admin delete another user's message and reports deletedByRole 'admin'", async () => {
    const mock = makeSupabaseMock({ message: { author_id: "u2", sphere_id: "s1" }, isAdminProfile: true })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await deleteMessageAction("m1")
    expect(result.error).toBeNull()
    expect(result.deletedByRole).toBe("admin")
    expect(mock.rpc).toHaveBeenCalledWith("delete_chat_message", { p_message_id: "m1" })
  })

  it("denies a plain user deleting another user's message", async () => {
    const mock = makeSupabaseMock({ message: { author_id: "u2", sphere_id: "s1" }, isAdminProfile: false })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await deleteMessageAction("m1")
    expect(result.error).toMatch(/only delete your own/i)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("denies deleting a message that does not exist", async () => {
    const mock = makeSupabaseMock({ message: null })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await deleteMessageAction("ghost")
    expect(result.error).toMatch(/not found/i)
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("surfaces RPC failures instead of silently succeeding", async () => {
    const mock = makeSupabaseMock({
      message: { author_id: "u1", sphere_id: "s1" },
      rpcError: { message: "boom" },
    })
    vi.mocked(createClient).mockReturnValue(mock as never)

    const result = await deleteMessageAction("m1")
    expect(result.error).toBeTruthy()
  })
})
