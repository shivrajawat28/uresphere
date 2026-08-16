import { createClient } from "@/lib/supabase/server"
import type { CurrentMember } from "@/lib/data/session"

export type FeedbackReplyRow = {
  id: string
  feedback_id: string
  author_user_id: string
  message: string
  created_at: string
}

export type FeedbackRow = {
  id: string
  user_id: string
  sphere_id: string
  category: string
  subject: string
  message: string
  status: string
  created_at: string
  updated_at: string
}

/**
 * Loads the member's own feedback (newest first) with their replies. RLS only
 * returns rows where user_id = auth.uid(), so another user's submissions can
 * never leak through this query — the filter is defensive, not the boundary.
 */
export async function loadMyFeedback(member: CurrentMember): Promise<FeedbackRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("feedback")
    .select("id, user_id, sphere_id, category, subject, message, status, created_at, updated_at")
    .eq("user_id", member.userId)
    .order("created_at", { ascending: false })
    .limit(100)
  return (data ?? []) as FeedbackRow[]
}

export type MyFeedbackItem = FeedbackRow & {
  replies: {
    id: string
    authorUserId: string
    message: string
    createdAt: string
  }[]
}

/**
 * Loads the member's feedback with their full threads in one call (RLS keeps
 * it strictly to the member's own submissions).
 */
export async function loadMyFeedbackWithReplies(member: CurrentMember): Promise<MyFeedbackItem[]> {
  const rows = await loadMyFeedback(member)
  const replies = await loadFeedbackReplies(rows.map((r) => r.id))
  const byFeedbackId = new Map<string, MyFeedbackItem["replies"]>()
  for (const r of replies) {
    const list = byFeedbackId.get(r.feedback_id) ?? []
    list.push({
      id: r.id,
      authorUserId: r.author_user_id,
      message: r.message,
      createdAt: r.created_at,
    })
    byFeedbackId.set(r.feedback_id, list)
  }
  return rows.map((r) => ({ ...r, replies: byFeedbackId.get(r.id) ?? [] }))
}

/** All replies for the given feedback ids, oldest first (thread order). */
export async function loadFeedbackReplies(feedbackIds: string[]): Promise<FeedbackReplyRow[]> {
  if (feedbackIds.length === 0) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from("feedback_replies")
    .select("id, feedback_id, author_user_id, message, created_at")
    .in("feedback_id", feedbackIds)
    .order("created_at", { ascending: true })
  return (data ?? []) as FeedbackReplyRow[]
}

export type AdminFeedbackItem = {
  id: string
  userId: string
  sphereId: string
  sphereName: string
  category: string
  subject: string
  message: string
  status: string
  createdAt: string
  updatedAt: string
  // Trusted identity from the profiles / user_spheres relationship — never
  // from anything the client sent.
  realName: string
  email: string | null
  handle: string
  replies: {
    id: string
    authorUserId: string
    authorRealName: string
    authorIsAdmin: boolean
    message: string
    createdAt: string
  }[]
}

/**
 * Loads every feedback submission the admin is authorized to see (RLS-scoped
 * to their own Spheres; super admins see all), joined client-side with the
 * trusted identity model used across the admin panel (profiles + user_spheres —
 * user_spheres -> profiles has no FK, so PostgREST cannot embed it).
 */
export async function loadAdminFeedback(): Promise<AdminFeedbackItem[]> {
  const supabase = await createClient()
  const { data: feedbackRows } = await supabase
    .from("feedback")
    .select("id, user_id, sphere_id, category, subject, message, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200)
  const rows = (feedbackRows ?? []) as FeedbackRow[]
  if (rows.length === 0) return []

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
  const sphereIds = Array.from(new Set(rows.map((r) => r.sphere_id)))

  const [profileResult, handleResult, sphereResult, repliesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, real_name, email")
      .in("id", userIds),
    supabase
      .from("user_spheres")
      .select("user_id, anonymous_handle")
      .in("user_id", userIds),
    supabase.from("spheres").select("id, name").in("id", sphereIds),
    loadFeedbackReplies(rows.map((r) => r.id)),
  ])

  const profileById = new Map((profileResult.data ?? []).map((p) => [p.id, p]))
  const handleByUserId = new Map((handleResult.data ?? []).map((h) => [h.user_id, h.anonymous_handle]))
  const sphereNameById = new Map((sphereResult.data ?? []).map((s) => [s.id, s.name]))

  // Reply author identities (admin names for admin replies).
  const replyAuthorIds = Array.from(new Set(repliesResult.map((r) => r.author_user_id)))
  const replyAuthorProfiles = replyAuthorIds.length
    ? await supabase.from("profiles").select("id, real_name").in("id", replyAuthorIds)
    : { data: [] as { id: string; real_name: string }[] }
  const replyAuthorNameById = new Map((replyAuthorProfiles.data ?? []).map((p) => [p.id, p.real_name]))

  // Who owns which thread — replies by the owner are user replies; everyone
  // else who can reply (RLS-gated) is a Sphere administrator.
  const ownerByFeedbackId = new Map(rows.map((r) => [r.id, r.user_id]))

  const repliesByFeedbackId = new Map<string, AdminFeedbackItem["replies"]>()
  for (const r of repliesResult) {
    const list = repliesByFeedbackId.get(r.feedback_id) ?? []
    const ownerId = ownerByFeedbackId.get(r.feedback_id)
    const isAdmin = r.author_user_id !== ownerId
    list.push({
      id: r.id,
      authorUserId: r.author_user_id,
      authorRealName: isAdmin
        ? replyAuthorNameById.get(r.author_user_id) ?? "Admin"
        : handleByUserId.get(r.author_user_id) ?? "Member",
      authorIsAdmin: isAdmin,
      message: r.message,
      createdAt: r.created_at,
    })
    repliesByFeedbackId.set(r.feedback_id, list)
  }

  return rows.map((r) => {
    const profile = profileById.get(r.user_id)
    return {
      id: r.id,
      userId: r.user_id,
      sphereId: r.sphere_id,
      sphereName: sphereNameById.get(r.sphere_id) ?? "Unknown Sphere",
      category: r.category,
      subject: r.subject,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      realName: profile?.real_name ?? "Unknown",
      email: profile?.email ?? null,
      handle: handleByUserId.get(r.user_id) ?? "Unknown",
      replies: repliesByFeedbackId.get(r.id) ?? [],
    }
  })
}
