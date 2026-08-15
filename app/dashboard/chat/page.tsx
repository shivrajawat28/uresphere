import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { selectInitialWindow } from "@/lib/chat"
import { AdBanner } from "@/components/ads/ad-banner"
import { ChatRoom } from "@/components/chat/chat-room"

const WINDOW = 50

export default async function ChatPage() {
  const member = await requireMember()
  const supabase = await createClient()

  // Only the most recent window is loaded on page load; older messages are
  // fetched on demand via "Load earlier messages" (client-side, RLS-scoped).
  // Fetch WINDOW + 1 so `selectInitialWindow` can detect whether older
  // messages exist (hasMore) without loading the full history.
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, body, author_id, created_at, is_deleted")
    .eq("sphere_id", member.sphereId)
    .order("created_at", { ascending: false })
    .limit(WINDOW + 1)

  // Resolve author handles for the initial page load (self + others in-sphere).
  const authorIds = Array.from(new Set((messages ?? []).map((m) => m.author_id)))
  const { data: handles } = authorIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", authorIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }

  const handleMap = new Map((handles ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  const { messages: initialMessages, hasMore, oldestCreatedAt } = selectInitialWindow(
    (messages ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      authorId: m.author_id,
      createdAt: m.created_at,
      isDeleted: m.is_deleted,
      authorHandle: handleMap.get(m.author_id) ?? "Unknown",
    })),
    WINDOW,
  )

  return (
    <div className="flex h-[calc(100svh)] flex-col md:h-svh">
      {/* Sponsored banner — Social placement (slim strip above the chat). */}
      <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pt-3">
        <AdBanner placement="social" limit={1} />
      </div>
      <div className="min-h-0 flex-1">
        <ChatRoom
          sphereId={member.sphereId}
          sphereName={member.sphereName}
          currentUserId={member.userId}
          currentHandle={member.anonymousHandle}
          isAdmin={member.role === "admin" || member.role === "super_admin"}
          initialMessages={initialMessages}
          initialHasMore={hasMore}
          initialOldestCreatedAt={oldestCreatedAt}
        />
      </div>
    </div>
  )
}
