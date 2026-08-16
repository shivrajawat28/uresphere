"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { validateMessageBody } from "@/lib/validation"

const MIN_INTERVAL_MS = 1500

async function isSphereMember(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, sphereId: string) {
  const { data } = await supabase
    .from("user_spheres")
    .select("sphere_id")
    .eq("user_id", userId)
    .eq("sphere_id", sphereId)
    .eq("membership_status", "active")
    .maybeSingle()
  return data !== null
}

async function isSphereAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, sphereId: string) {
  const { data: profile } = await supabase.from("profiles").select("role, account_status").eq("id", userId).maybeSingle()
  if (!profile || profile.account_status !== "active") return false
  // Platform owner moderates every Sphere, with or without a membership row.
  if (profile.role === "super_admin") return true
  // Sphere admin (profile role) must actually be inside the Sphere.
  if (profile.role === "admin") return isSphereMember(supabase, userId, sphereId)
  return false
}

export type SentMessage = { id: string; createdAt: string }

export async function sendMessageAction(formData: FormData): Promise<{ error: string | null; message?: SentMessage }> {
  const body = String(formData.get("body") || "").trim()
  const sphereId = String(formData.get("sphereId") || "")
  const replyToMessageId = String(formData.get("replyToMessageId") || "").trim() || null

  const bodyError = validateMessageBody(body)
  if (bodyError) return { error: bodyError }
  if (!sphereId) return { error: "Missing Sphere." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Not signed in." }

  // Never trust the client's sphereId alone — the user must actually be an
  // active member of this Sphere (defense in depth behind RLS).
  if (!(await isSphereMember(supabase, user.id, sphereId))) {
    return { error: "You're not a member of this Sphere." }
  }

  // Reply references are validated server-side: the target must exist, must
  // belong to THIS Sphere (never a cross-Sphere reference from a client id)
  // and must not be deleted. The DB trigger re-enforces the same-Sphere rule.
  if (replyToMessageId) {
    const { data: target } = await supabase
      .from("chat_messages")
      .select("id, sphere_id, is_deleted")
      .eq("id", replyToMessageId)
      .maybeSingle()
    if (!target) return { error: "The message you're replying to no longer exists." }
    if (target.sphere_id !== sphereId) return { error: "You can only reply to messages in this Sphere." }
    if (target.is_deleted) return { error: "You can't reply to a deleted message." }
  }

  // Basic server-side rate limiting: reject if the user's last message
  // in this Sphere was sent less than MIN_INTERVAL_MS ago.
  const { data: last } = await supabase
    .from("chat_messages")
    .select("created_at")
    .eq("author_id", user.id)
    .eq("sphere_id", sphereId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (last) {
    const elapsed = Date.now() - new Date(last.created_at).getTime()
    if (elapsed < MIN_INTERVAL_MS) {
      return { error: "You're sending messages too quickly — slow down a little." }
    }
  }

  const { data: inserted, error } = await supabase
    .from("chat_messages")
    .insert({
      sphere_id: sphereId,
      author_id: user.id,
      body,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    })
    .select("id, created_at")
    .single()

  if (error) {
    console.log("[v0] sendMessage error:", error.message)
    return { error: "Couldn't send your message. Please try again." }
  }

  revalidatePath("/dashboard/chat")
  // Return the persisted row so the sender can reconcile their optimistic
  // bubble immediately (no waiting on the realtime round-trip).
  return { error: null, message: { id: inserted.id, createdAt: inserted.created_at } }
}

export async function deleteMessageAction(
  messageId: string,
): Promise<{ error: string | null; deletedByRole?: "user" | "admin" }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Not signed in." }

  // Authors may delete their own messages; Sphere admins may remove any
  // message in their Sphere. Anything else is rejected server-side (and again
  // inside the SECURITY DEFINER RPC, which is the only writer of
  // deleted_by / deleted_by_role).
  const { data: message } = await supabase
    .from("chat_messages")
    .select("author_id, sphere_id")
    .eq("id", messageId)
    .maybeSingle()

  if (!message) return { error: "Message not found." }

  const isAuthor = message.author_id === user.id
  const isAdmin = await isSphereAdmin(supabase, user.id, message.sphere_id)
  if (!isAuthor && !isAdmin) return { error: "You can only delete your own messages." }

  // Deletion runs through the RPC: it archives the original content for
  // admins, blanks the public body, and resolves the actor server-side.
  const { error } = await supabase.rpc("delete_chat_message", { p_message_id: messageId })

  if (error) {
    console.log("[v0] deleteMessage error:", error.message)
    return { error: "Couldn't delete this message." }
  }

  revalidatePath("/dashboard/chat")
  // Mirror the RPC's actor resolution so the sender's UI updates instantly:
  // message owner → "user" (even if they're also an admin), otherwise admin.
  return { error: null, deletedByRole: isAuthor ? "user" : "admin" }
}

export async function reportMessageAction(formData: FormData): Promise<{ error: string | null }> {
  const messageId = String(formData.get("messageId") || "")
  const sphereId = String(formData.get("sphereId") || "")
  const reason = String(formData.get("reason") || "").trim()

  if (!messageId || !reason) return { error: "Please describe why you're reporting this message." }
  if (reason.length > 500) return { error: "Report reason is too long." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Not signed in." }

  // The target message must exist inside the Sphere the reporter claims,
  // and the reporter must be a member of that Sphere (defense in depth
  // behind RLS — prevents cross-Sphere reports and spoofed sphere_ids).
  if (!sphereId) return { error: "Missing Sphere." }
  if (!(await isSphereMember(supabase, user.id, sphereId))) {
    return { error: "You're not a member of this Sphere." }
  }

  const { data: target } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("id", messageId)
    .eq("sphere_id", sphereId)
    .maybeSingle()
  if (!target) return { error: "Message not found in your Sphere." }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: "chat_message",
    target_id: messageId,
    sphere_id: sphereId,
    reason,
  })

  if (error) {
    console.log("[v0] reportMessage error:", error.message)
    return { error: "Couldn't submit your report." }
  }

  return { error: null }
}
