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
}))

vi.mock("@/lib/actions/admin", () => ({
  requireSphereAction: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { requireSphereAction } from "@/lib/actions/admin"
import {
  submitFeedbackAction,
  replyToFeedbackAction,
  updateFeedbackStatusAction,
} from "@/lib/actions/feedback"
import { validateFeedbackInput, validateFeedbackReply } from "@/lib/feedback"

const MEMBER = {
  userId: "u1",
  email: "member@uresphere.app",
  role: "user",
  accountStatus: "active",
  sphereId: "s-its",
  sphereName: "ITS",
  anonymousHandle: "@QuietOtter994",
  realName: "Test Member",
  avatarUrl: null,
}

function feedbackRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fb-1",
    user_id: "u1",
    sphere_id: "s-its",
    subject: "Dark mode please",
    message: "Can we get dark mode on the dashboard?",
    status: "open",
    category: "feature",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireMember).mockResolvedValue(MEMBER as never)
  vi.mocked(requireSphereAction).mockResolvedValue({ ok: true, member: MEMBER } as never)
})

// ---------------------------------------------------------------------------
// Pure validation
// ---------------------------------------------------------------------------

describe("validateFeedbackInput", () => {
  it("accepts a valid submission", () => {
    expect(validateFeedbackInput("bug", "Broken link", "The link on the home page 404s.")).toBeNull()
  })

  it("rejects an unknown category", () => {
    expect(validateFeedbackInput("hacked", "Subject", "Body")).toMatch(/category/i)
  })

  it("rejects empty / whitespace-only subject and message", () => {
    expect(validateFeedbackInput("bug", "   ", "Body")).toMatch(/subject/i)
    expect(validateFeedbackInput("bug", "Subject", "   \n  ")).toMatch(/can't be empty/i)
  })

  it("enforces length limits", () => {
    expect(validateFeedbackInput("bug", "x".repeat(121), "Body")).toMatch(/too long/i)
    expect(validateFeedbackInput("bug", "Subject", "x".repeat(2001))).toMatch(/too long/i)
  })
})

describe("validateFeedbackReply", () => {
  it("accepts a non-empty reply", () => {
    expect(validateFeedbackReply("Thanks, we'll look into it.")).toBeNull()
  })

  it("rejects empty and over-long replies", () => {
    expect(validateFeedbackReply("   ")).toMatch(/empty/i)
    expect(validateFeedbackReply("x".repeat(2001))).toMatch(/too long/i)
  })
})

// ---------------------------------------------------------------------------
// submitFeedbackAction — user side
// ---------------------------------------------------------------------------

function submitClient({ insertError = null }: { insertError?: unknown } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) => (table === "feedback" ? { insert } : {}))
  vi.mocked(createClient).mockReturnValue({ from, rpc } as never)
  return { insert, rpc }
}

function submitForm(category: string, subject: string, message: string) {
  const fd = new FormData()
  fd.set("category", category)
  fd.set("subject", subject)
  fd.set("message", message)
  // A hostile client can stuff extra identity fields — they must be ignored.
  fd.set("user_id", "u-evil")
  fd.set("sphere_id", "s-evil")
  return fd
}

describe("submitFeedbackAction", () => {
  it("stores feedback with the session's user_id + sphere (never client-supplied ids) and notifies admins", async () => {
    const mock = submitClient()
    const result = await submitFeedbackAction(submitForm("feature", "Dark mode", "Please add dark mode!"))

    expect(result.error).toBeNull()
    expect(mock.insert).toHaveBeenCalledTimes(1)
    const [payload] = mock.insert.mock.calls[0]
    expect(payload).toMatchObject({
      user_id: "u1",
      sphere_id: "s-its",
      category: "feature",
      subject: "Dark mode",
      message: "Please add dark mode!",
      status: "open",
    })
    // The forged ids from the client never reach the database.
    expect(payload.user_id).not.toBe("u-evil")
    expect(payload.sphere_id).not.toBe("s-evil")
    expect(mock.rpc).toHaveBeenCalledWith("notify_sphere_admins", expect.objectContaining({ p_sphere_id: "s-its" }))
  })

  it("rejects a member with no Sphere (cannot file feedback anywhere)", async () => {
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, sphereId: null } as never)
    const mock = submitClient()
    const result = await submitFeedbackAction(submitForm("general", "Hi", "Hello"))
    expect(result.error).toMatch(/belong to a Sphere/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("redirects an unauthenticated caller before touching the database", async () => {
    vi.mocked(requireMember).mockRejectedValue(new Error("NEXT_REDIRECT:/auth/login"))
    const mock = submitClient()
    await expect(submitFeedbackAction(submitForm("general", "Hi", "Hello"))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("validates input server-side (whitespace-only subject never inserted)", async () => {
    const mock = submitClient()
    const result = await submitFeedbackAction(submitForm("bug", "   ", "Body"))
    expect(result.error).toMatch(/subject/i)
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("surfaces insert failures instead of pretending success", async () => {
    const mock = submitClient({ insertError: { message: "boom" } })
    const result = await submitFeedbackAction(submitForm("bug", "Subject", "Body"))
    expect(result.error).toBeTruthy()
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// replyToFeedbackAction — owner + admin
// ---------------------------------------------------------------------------

function replyClient({
  feedback = feedbackRow(),
  replyInsertError = null,
  updateError = null,
}: {
  feedback?: Record<string, unknown> | null
  replyInsertError?: unknown
  updateError?: unknown
} = {}) {
  const replyInsert = vi.fn().mockResolvedValue({ error: replyInsertError })
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) => {
    if (table === "feedback") {
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: feedback, error: null }) }) }),
        update,
      }
    }
    if (table === "feedback_replies") return { insert: replyInsert }
    return {}
  })
  vi.mocked(createClient).mockReturnValue({ from, rpc } as never)
  return { replyInsert, update, rpc }
}

describe("replyToFeedbackAction", () => {
  it("lets the owner reply to their own open thread (author from session)", async () => {
    const mock = replyClient()
    const result = await replyToFeedbackAction("fb-1", "Sure, here's more detail.")

    expect(result.error).toBeNull()
    expect(mock.replyInsert).toHaveBeenCalledTimes(1)
    const [payload] = mock.replyInsert.mock.calls[0]
    expect(payload).toMatchObject({
      feedback_id: "fb-1",
      author_user_id: "u1",
      message: "Sure, here's more detail.",
    })
    // A user reply never flips status and never notifies admins.
    expect(mock.update).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("blocks the owner from replying to a resolved/closed thread", async () => {
    const mock = replyClient({ feedback: feedbackRow({ status: "resolved" }) })
    const result = await replyToFeedbackAction("fb-1", "Wait, one more thing.")
    expect(result.error).toMatch(/no longer open/i)
    expect(mock.replyInsert).not.toHaveBeenCalled()
  })

  it("denies a plain user replying to someone else's feedback", async () => {
    const mock = replyClient({ feedback: feedbackRow({ user_id: "u2" }) })
    vi.mocked(requireSphereAction).mockResolvedValue({
      ok: false,
      error: "You don't have access to that Sphere.",
    } as never)
    const result = await replyToFeedbackAction("fb-1", "Let me reply for them.")
    expect(result.error).toMatch(/access/i)
    expect(mock.replyInsert).not.toHaveBeenCalled()
  })

  it("lets an admin reply, marks the thread 'replied' and notifies the owner", async () => {
    const mock = replyClient()
    // The admin is a DIFFERENT user from the owner (u1): the action derives
    // identity from the session (requireMember), not from the gate result.
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, userId: "u-admin", role: "admin" } as never)
    vi.mocked(requireSphereAction).mockResolvedValue({ ok: true, member: { ...MEMBER, userId: "u-admin" } } as never)
    const result = await replyToFeedbackAction("fb-1", "Thanks! We're looking into it.")

    expect(result.error).toBeNull()
    expect(mock.replyInsert).toHaveBeenCalledTimes(1)
    const [payload] = mock.replyInsert.mock.calls[0]
    expect(payload.author_user_id).toBe("u-admin") // session identity, not forged
    expect(mock.update).toHaveBeenCalledTimes(1)
    expect(mock.update.mock.calls[0][0]).toMatchObject({ status: "replied" })
    expect(mock.rpc).toHaveBeenCalledWith("notify_user", expect.objectContaining({ p_user_id: "u1", p_type: "feedback_reply" }))
  })

  it("keeps a resolved thread resolved when an admin replies (never reopens)", async () => {
    const mock = replyClient({ feedback: feedbackRow({ status: "resolved" }) })
    vi.mocked(requireMember).mockResolvedValue({ ...MEMBER, userId: "u-admin", role: "admin" } as never)
    vi.mocked(requireSphereAction).mockResolvedValue({ ok: true, member: { ...MEMBER, userId: "u-admin" } } as never)
    const result = await replyToFeedbackAction("fb-1", "Thanks! We're looking into it.")
    expect(result.error).toBeNull()
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("rejects an empty reply", async () => {
    const mock = replyClient()
    const result = await replyToFeedbackAction("fb-1", "   ")
    expect(result.error).toMatch(/empty/i)
    expect(mock.replyInsert).not.toHaveBeenCalled()
  })

  it("refuses to reply to feedback that does not exist", async () => {
    const mock = replyClient({ feedback: null })
    const result = await replyToFeedbackAction("ghost", "Hello?")
    expect(result.error).toMatch(/not found/i)
    expect(mock.replyInsert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// updateFeedbackStatusAction — admin only
// ---------------------------------------------------------------------------

function statusClient({ feedback = feedbackRow(), updateError = null }: { feedback?: Record<string, unknown> | null; updateError?: unknown } = {}) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((table: string) =>
    table === "feedback"
      ? {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: feedback, error: null }) }) }),
          update,
        }
      : {},
  )
  vi.mocked(createClient).mockReturnValue({ from, rpc } as never)
  return { update, rpc }
}

describe("updateFeedbackStatusAction", () => {
  it("rejects an unknown status before touching the database", async () => {
    const mock = statusClient()
    const result = await updateFeedbackStatusAction("fb-1", "super-duper")
    expect(result.error).toMatch(/invalid status/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("is sphere-admin gated — a plain user is denied", async () => {
    const mock = statusClient()
    vi.mocked(requireSphereAction).mockResolvedValue({
      ok: false,
      error: "You don't have access to that Sphere.",
    } as never)
    const result = await updateFeedbackStatusAction("fb-1", "resolved")
    expect(result.error).toMatch(/access/i)
    expect(mock.update).not.toHaveBeenCalled()
  })

  it("persists a status change and notifies the owner exactly once", async () => {
    const mock = statusClient()
    const result = await updateFeedbackStatusAction("fb-1", "resolved")

    expect(result.error).toBeNull()
    expect(mock.update).toHaveBeenCalledTimes(1)
    expect(mock.update.mock.calls[0][0]).toMatchObject({ status: "resolved" })
    expect(mock.rpc).toHaveBeenCalledWith("notify_user", expect.objectContaining({ p_user_id: "u1", p_type: "feedback_status" }))
  })

  it("does not notify (or update) when the status is unchanged — no duplicate notifications", async () => {
    const mock = statusClient({ feedback: feedbackRow({ status: "resolved" }) })
    const result = await updateFeedbackStatusAction("fb-1", "resolved")
    expect(result.error).toBeNull()
    expect(mock.update).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("refuses to update feedback that does not exist", async () => {
    const mock = statusClient({ feedback: null })
    const result = await updateFeedbackStatusAction("ghost", "resolved")
    expect(result.error).toMatch(/not found/i)
    expect(mock.update).not.toHaveBeenCalled()
  })
})
