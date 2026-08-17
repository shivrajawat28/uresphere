import { Suspense } from "react"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { selectInitialWindow } from "@/lib/chat"
import { AdBanner } from "@/components/ads/ad-banner"
import { GroupsClient } from "./groups-client"

export const dynamic = "force-dynamic"

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>
}) {
  const member = await requireMember()
  const supabase = await createClient()
  const { group } = await searchParams

  const [groupsResult, invitesResult, messagesResult, groupResult, groupMembersResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, description, created_by, created_at, group_members(user_id), group_messages(id)")
      .eq("sphere_id", member.sphereId)
      .order("created_at", { ascending: false }),
    supabase
      .from("group_invites")
      .select("id, group_id, status, created_at, groups(name)")
      .eq("invitee_id", member.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    group
      ? supabase
          .from("group_messages")
          .select("id, group_id, author_id, body, created_at, is_deleted")
          .eq("group_id", group)
          // Newest window only — older messages are fetched on demand via
          // "Load earlier messages" (same pattern as Sphere chat), so busy
          // groups never start at message #1 and no full history is fetched.
          // WINDOW + 1 rows so `selectInitialWindow` can detect hasMore.
          .order("created_at", { ascending: false })
          .limit(51)
      : { data: null },
    group
      ? supabase.from("groups").select("id, name, created_by").eq("id", group).eq("sphere_id", member.sphereId).maybeSingle()
      : { data: null },
    group
      ? supabase.from("group_members").select("user_id").eq("group_id", group)
      : { data: null },
  ])

  // Resolve anonymous handles for message authors.
  let handleMap = new Map<string, string>()
  const authorIds = Array.from(new Set((messagesResult.data ?? []).map((m) => m.author_id)))
  if (authorIds.length > 0) {
    const { data: handles } = await supabase
      .from("user_spheres")
      .select("user_id, anonymous_handle")
      .in("user_id", authorIds)
    handleMap = new Map((handles ?? []).map((h) => [h.user_id, h.anonymous_handle]))
  }

  const groups = (groupsResult.data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    created_by: g.created_by,
    created_at: g.created_at,
    memberCount: Array.isArray(g.group_members) ? g.group_members.length : 0,
    isMember: Array.isArray(g.group_members) ? g.group_members.some((m: { user_id: string }) => m.user_id === member.userId) : false,
  }))

  const activeGroup = groupResult.data
    ? {
        id: groupResult.data.id,
        name: groupResult.data.name,
        created_by: groupResult.data.created_by,
        isMember: Array.isArray(groupMembersResult.data)
          ? groupMembersResult.data.some((m) => m.user_id === member.userId)
          : false,
      }
    : null

  const { messages: initialMessages, hasMore: initialHasMore, oldestCreatedAt: initialOldestCreatedAt } =
    selectInitialWindow(
      (messagesResult.data ?? []).map((m) => ({
        id: m.id,
        body: m.body,
        authorId: m.author_id,
        createdAt: m.created_at,
        isDeleted: m.is_deleted,
        authorHandle: handleMap.get(m.author_id) ?? "Unknown",
      })),
      50,
    )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Groups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private chat rooms for study groups, project teams, and friends — scoped to {member.sphereName}.
        </p>
      </div>

      {/* Sponsored banner — Social placement */}
      <div className="mb-6">
        <AdBanner placement="social" limit={1} />
      </div>

      <Suspense>
        <GroupsClient
          groups={groups}
          pendingInvites={(invitesResult.data ?? []).map((i) => ({
            id: i.id,
            groupId: i.group_id,
            groupName:
              (Array.isArray(i.groups) ? (i.groups[0] as { name?: string } | null)?.name : (i.groups as { name?: string } | null)?.name) ??
              "Unknown group",
          }))}
          activeGroup={activeGroup}
          initialMessages={initialMessages}
          initialHasMore={initialHasMore}
          initialOldestCreatedAt={initialOldestCreatedAt}
          currentUserId={member.userId}
          currentHandle={member.anonymousHandle}
          isAdmin={member.role === "admin" || member.role === "super_admin"}
        />
      </Suspense>
    </div>
  )
}
