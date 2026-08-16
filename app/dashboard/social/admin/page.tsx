import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireMember } from "@/lib/data/session"
import { loadAssignedSectionAdmin } from "@/lib/data/section-admin"
import { createClient } from "@/lib/supabase/server"
import { deletedMessageLabel } from "@/lib/chat"
import { SocialAdminClient } from "@/components/dashboard/social-admin-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Social Admin",
  robots: { index: false, follow: false },
}

export default async function SocialAdminPage() {
  const member = await requireMember()
  const workspace = await loadAssignedSectionAdmin(member, "social_moderator")
  if (!workspace) redirect("/dashboard/chat")

  const supabase = await createClient()

  const [{ data: messages }, { data: reports }, { data: groups }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, body, author_id, created_at, is_deleted, deleted_by_role")
      .eq("sphere_id", workspace.sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("reports")
      .select("id, target_type, reason, status, created_at")
      .eq("sphere_id", workspace.sphereId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("groups")
      .select("id, name, description, created_by, created_at, group_members(count)")
      .eq("sphere_id", workspace.sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  // Anonymous handles for authors + group creators (same-Sphere only).
  const userIds = Array.from(
    new Set([
      ...(messages ?? []).map((m) => m.author_id),
      ...(groups ?? []).map((g) => g.created_by),
    ]),
  )
  const { data: handleRows } = userIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", userIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }
  const handleById = new Map((handleRows ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  return (
    <SocialAdminClient
      sphereName={workspace.sphereName}
      messages={(messages ?? []).map((m) => ({
        id: m.id,
        body: m.body,
        authorHandle: handleById.get(m.author_id) ?? "Unknown",
        createdAt: m.created_at,
        isDeleted: m.is_deleted,
        deletedLabel: m.is_deleted
          ? deletedMessageLabel(true, (m.deleted_by_role as "admin" | "user" | null) ?? null) ?? "Message deleted"
          : "",
      }))}
      reports={(reports ?? []).map((r) => ({
        id: r.id,
        target_type: r.target_type,
        reason: r.reason,
        created_at: r.created_at,
      }))}
      groups={(groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        creatorHandle: handleById.get(g.created_by) ?? "Unknown",
        memberCount:
          (Array.isArray(g.group_members) ? g.group_members[0] : g.group_members)?.count ?? 0,
        createdAt: g.created_at,
      }))}
    />
  )
}
