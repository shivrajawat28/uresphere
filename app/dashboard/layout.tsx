import type { Metadata } from "next"
import type { ReactNode } from "react"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { DashboardNav } from "@/components/dashboard/dashboard-nav"

// Private area: never indexable, even if a crawler ignores robots.txt.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const member = await requireMember()

  // Cheap, index-backed unread count (notifications_user_idx) so the sidebar
  // badge is right on first paint; live updates come via realtime in the nav.
  const supabase = await createClient()
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", member.userId)
    .eq("read", false)

  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      <DashboardNav member={member} initialUnread={count ?? 0} />
      {/* pb-24 reserves room for the fixed mobile bottom nav; desktop has none. */}
      <main className="min-w-0 flex-1 overflow-x-hidden pb-24 md:pb-0">{children}</main>
    </div>
  )
}
