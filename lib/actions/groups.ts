"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { requireSphereAction } from "@/lib/actions/admin"

type ActionResult = { error: string | null }

export async function createGroupAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()

  if (name.length < 1 || name.length > 80) return { error: "Group name must be 1–80 characters." }
  if (description.length > 500) return { error: "Description is too long (max 500)." }

  const { data: group, error } = await supabase
    .from("groups")
    .insert({ sphere_id: member.sphereId, name, description, created_by: member.userId })
    .select("id")
    .single()

  if (error || !group) {
    return { error: "Couldn't create the group. Try again." }
  }

  // Creator becomes the group's first member + admin.
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: member.userId,
    role: "admin",
  })
  if (memberError) {
    return { error: "Couldn't create the group. Try again." }
  }

  revalidatePath("/dashboard/groups")
  return { error: null }
}

export async function inviteToGroupAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const groupId = String(formData.get("groupId") ?? "")
  let handle = String(formData.get("handle") ?? "").trim()
  if (!handle.startsWith("@")) handle = `@${handle}`

  if (!groupId || handle.length < 4) return { error: "Enter an anonymous handle to invite." }

  // The inviter must be a member of the group.
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", member.userId)
    .maybeSingle()
  if (!membership) return { error: "You must join the group before inviting others." }

  // The invitee must exist in the same Sphere (anonymous handle is
  // Sphere-scoped public identity — never expose it outside the Sphere).
  const { data: invitee } = await supabase
    .from("user_spheres")
    .select("user_id")
    .eq("anonymous_handle", handle)
    .eq("sphere_id", member.sphereId)
    .eq("membership_status", "active")
    .maybeSingle()
  if (!invitee) return { error: "No active member has that handle in your Sphere." }
  if (invitee.user_id === member.userId) return { error: "You can't invite yourself." }

  const { error } = await supabase.from("group_invites").insert({
    group_id: groupId,
    invited_by: member.userId,
    invitee_id: invitee.user_id,
  })

  if (error) {
    if (String(error.message).includes("duplicate")) {
      return { error: "That member is already invited or in the group." }
    }
    return { error: "Couldn't send the invite. Try again." }
  }

  revalidatePath("/dashboard/groups")
  return { error: null }
}

export async function respondToInviteAction(inviteId: string, accept: boolean): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: invite } = await supabase
    .from("group_invites")
    .select("id, group_id, status")
    .eq("id", inviteId)
    .eq("invitee_id", member.userId)
    .maybeSingle()
  if (!invite) return { error: "Invite not found." }
  if (invite.status !== "pending") return { error: "This invite was already handled." }

  const { error: updateError } = await supabase
    .from("group_invites")
    .update({ status: accept ? "accepted" : "rejected", responded_at: new Date().toISOString() })
    .eq("id", inviteId)
  if (updateError) return { error: "Couldn't update the invite." }

  if (accept) {
    const { error: joinError } = await supabase.from("group_members").insert({
      group_id: invite.group_id,
      user_id: member.userId,
      role: "member",
    })
    if (joinError) return { error: "Couldn't join the group." }
  }

  revalidatePath("/dashboard/groups")
  return { error: null }
}

export async function sendGroupMessageAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const groupId = String(formData.get("groupId") ?? "")
  const body = String(formData.get("body") ?? "").trim()

  if (!groupId || !body) return { error: "Message can't be empty." }
  if (body.length > 1000) return { error: "Message is too long (max 1000 characters)." }

  // Only accepted members may post in a group.
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", member.userId)
    .maybeSingle()
  if (!membership) return { error: "You must be a member of the group to chat." }

  const { error } = await supabase.from("group_messages").insert({
    group_id: groupId,
    author_id: member.userId,
    body,
  })
  if (error) return { error: "Couldn't send your message." }

  revalidatePath("/dashboard/groups")
  return { error: null }
}

export async function deleteGroupMessageAction(messageId: string): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: message } = await supabase
    .from("group_messages")
    .select("author_id, group_id")
    .eq("id", messageId)
    .maybeSingle()
  if (!message) return { error: "Message not found." }

  if (message.author_id !== member.userId) {
    const { data: group } = await supabase.from("groups").select("sphere_id").eq("id", message.group_id).maybeSingle()
    const isAdmin =
      group?.sphere_id === member.sphereId && (member.role === "admin" || member.role === "super_admin")
    if (!isAdmin) return { error: "You can only delete your own messages." }
  }

  const { error } = await supabase.from("group_messages").update({ is_deleted: true }).eq("id", messageId)
  if (error) return { error: "Couldn't delete the message." }

  revalidatePath("/dashboard/groups")
  return { error: null }
}

/**
 * Removes the caller from a group safely. Leaving deletes only the caller's
 * own membership row — messages and other members are untouched.
 * RLS (group_members_delete_self_or_admin) permits the self-delete; the
 * server re-checks membership before deleting.
 */
export async function leaveGroupAction(groupId: string): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", member.userId)
    .maybeSingle()
  if (!membership) return { error: "You're not a member of this group." }

  const { error } = await supabase.from("group_members").delete().eq("id", membership.id)
  if (error) return { error: "Couldn't leave the group." }

  revalidatePath("/dashboard/groups")
  return { error: null }
}

/**
 * Admin/owner action: delete a group inside the caller's Sphere (server-gated).
 * Allowed for the group creator, super admins, Sphere administrators, or
 * holders of the social.manage_groups permission in that Sphere. Normal
 * members can never delete a group. Destructive — the UI requires a
 * confirmation dialog.
 */
export async function adminDeleteGroupAction(groupId: string): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: group } = await supabase
    .from("groups")
    .select("id, sphere_id, created_by")
    .eq("id", groupId)
    .maybeSingle()
  if (!group) return { error: "Group not found." }

  // The creator may delete their own group (RLS allows it via migration 0013).
  if (group.created_by === member.userId) {
    const { error } = await supabase.from("groups").delete().eq("id", groupId)
    if (error) return { error: "Couldn't delete the group." }
    revalidatePath("/dashboard/groups")
    return { error: null }
  }

  const gate = await requireSphereAction(group.sphere_id, "social.manage_groups")
  if (!gate.ok) return gate

  const { error } = await supabase.from("groups").delete().eq("id", groupId)
  if (error) return { error: "Couldn't delete the group." }

  revalidatePath("/dashboard/groups")
  revalidatePath("/admin")
  revalidatePath(`/admin/spheres/${group.sphere_id}`)
  return { error: null }
}
