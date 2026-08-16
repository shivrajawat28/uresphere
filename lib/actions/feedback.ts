"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { requireSphereAction } from "@/lib/actions/admin"
import {
  FEEDBACK_STATUSES,
  validateFeedbackInput,
  validateFeedbackReply,
  type FeedbackStatus,
} from "@/lib/feedback"

type ActionResult = { error: string | null }

// Users may keep replying to their own thread while it is open or in review;
// once an admin replies/resolves/closes it, the user thread is read-only.
const USER_REPLYABLE_STATUSES = ["open", "in_review"]

/**
 * Submits feedback on behalf of the authenticated member. The user_id and
 * sphere_id are derived ENTIRELY from the session — any client-provided user
 * or Sphere id is ignored — so nobody can file feedback as another user or
 * into another Sphere. Validates category/subject/message and persists with
 * the session identity, then notifies the Sphere's administrators.
 */
export async function submitFeedbackAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  if (!member.sphereId) return { error: "You must belong to a Sphere to send feedback." }

  const category = String(formData.get("category") ?? "")
  const subject = String(formData.get("subject") ?? "")
  const message = String(formData.get("message") ?? "")

  const invalid = validateFeedbackInput(category, subject, message)
  if (invalid) return { error: invalid }

  const supabase = await createClient()
  const { error } = await supabase.from("feedback").insert({
    user_id: member.userId,
    sphere_id: member.sphereId,
    category,
    subject: subject.trim(),
    message: message.trim(),
    status: "open",
  })
  if (error) return { error: "Couldn't send your feedback. Please try again." }

  // Alert the Sphere's administrators (existing notification infrastructure —
  // same RPC the promotion flow uses). The platform admin Feedback panel is
  // reached from /admin.
  await supabase.rpc("notify_sphere_admins", {
    p_sphere_id: member.sphereId,
    p_type: "feedback_submitted",
    p_title: "New feedback submitted",
    p_body: `${member.anonymousHandle} sent feedback about “${subject.trim()}”.`,
    p_link: "/admin",
  })

  revalidatePath("/dashboard/feedback")
  return { error: null }
}

/**
 * Adds a reply to a feedback thread. Authorized participants: the feedback
 * owner (while the thread is open/in_review) and Sphere administrators of the
 * feedback's Sphere (any time). The author_user_id always comes from the
 * session. When an admin replies, the thread is marked "replied" (unless it is
 * already resolved/closed) and the owner is notified.
 */
export async function replyToFeedbackAction(feedbackId: string, message: string): Promise<ActionResult> {
  const member = await requireMember()

  const invalid = validateFeedbackReply(message)
  if (invalid) return { error: invalid }

  const supabase = await createClient()
  const { data: feedback } = await supabase
    .from("feedback")
    .select("id, user_id, sphere_id, subject, status")
    .eq("id", feedbackId)
    .maybeSingle()
  if (!feedback) return { error: "Feedback not found." }

  const isOwner = feedback.user_id === member.userId
  if (!isOwner) {
    // Admins reply via the sphere-scoped admin gate (super_admin / sphere
    // admin / sphere_admin assignment in the feedback's Sphere).
    const gate = await requireSphereAction(feedback.sphere_id)
    if (!gate.ok) return gate
  } else if (!USER_REPLYABLE_STATUSES.includes(feedback.status)) {
    return { error: "This thread is no longer open for your replies." }
  }

  const { error } = await supabase.from("feedback_replies").insert({
    feedback_id: feedbackId,
    author_user_id: member.userId,
    message: message.trim(),
  })
  if (error) return { error: "Couldn't send your reply. Please try again." }

  if (!isOwner) {
    // An admin reply moves the thread to "replied" (never back from a
    // terminal state) so the owner's history reflects the update.
    if (feedback.status === "open" || feedback.status === "in_review") {
      await supabase
        .from("feedback")
        .update({ status: "replied", updated_at: new Date().toISOString() })
        .eq("id", feedbackId)
    }
    await supabase.rpc("notify_user", {
      p_user_id: feedback.user_id,
      p_type: "feedback_reply",
      p_title: "Your feedback got a reply",
      p_body: `An admin replied to “${feedback.subject ?? "your feedback"}”.`,
      p_link: "/dashboard/feedback",
    })
  }

  revalidatePath("/dashboard/feedback")
  revalidatePath("/admin")
  return { error: null }
}

/**
 * Changes a feedback thread's status. Sphere-admin gated (same authorization
 * model as every admin action); the owner is notified only when the status
 * actually changes, so repeated saves never spam duplicate notifications.
 */
export async function updateFeedbackStatusAction(
  feedbackId: string,
  status: string,
): Promise<ActionResult> {
  if (!FEEDBACK_STATUSES.includes(status as FeedbackStatus)) {
    return { error: "Invalid status." }
  }

  const supabase = await createClient()
  const { data: feedback } = await supabase
    .from("feedback")
    .select("id, user_id, sphere_id, status")
    .eq("id", feedbackId)
    .maybeSingle()
  if (!feedback) return { error: "Feedback not found." }

  const gate = await requireSphereAction(feedback.sphere_id)
  if (!gate.ok) return gate

  if (feedback.status === status) return { error: null }

  const { error } = await supabase
    .from("feedback")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", feedbackId)
  if (error) return { error: "Couldn't update the status." }

  await supabase.rpc("notify_user", {
    p_user_id: feedback.user_id,
    p_type: "feedback_status",
    p_title: "Feedback status updated",
    p_body: `Your feedback is now marked “${status.replace("_", " ")}”.`,
    p_link: "/dashboard/feedback",
  })

  revalidatePath("/dashboard/feedback")
  revalidatePath("/admin")
  return { error: null }
}
