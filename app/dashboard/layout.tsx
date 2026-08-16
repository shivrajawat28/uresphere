import type { Metadata } from "next"
import type { ReactNode } from "react"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { loadAssignedSectionRoles } from "@/lib/data/section-admin"
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
  const [unreadResult, sectionRoles] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", member.userId).eq("read", false),
    // Section-admin assignments in the member's own Sphere — the user's own
    // rows are readable thanks to the role_assignments_select_own policy. This
    // drives the Academic Admin / Promotions Admin / Events Admin / Social
    // Admin nav entries from real server-side assignment data.
    loadAssignedSectionRoles(member),
  ])
  const sectionAdmins = {
    academic: sectionRoles.includes("academic_manager"),
    promotions: sectionRoles.includes("promotion_moderator"),
    events: sectionRoles.includes("event_manager"),
    social: sectionRoles.includes("social_moderator"),
  }

  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      <DashboardNav member={member} initialUnread={unreadResult.count ?? 0} sectionAdmins={sectionAdmins} />
      {/* pb-24 reserves room for the fixed mobile bottom nav; desktop has none. */}
      <main className="min-w-0 flex-1 overflow-x-hidden pb-24 md:pb-0">{children}</main>
    </div>
  )
}
