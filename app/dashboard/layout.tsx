import type { Metadata } from "next"
import type { ReactNode } from "react"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { loadAssignedSectionRoles } from "@/lib/data/section-admin"
import { DashboardNav } from "@/components/dashboard/dashboard-nav"
import { NotificationCenter } from "@/components/dashboard/notification-center"
import { PushNotificationManager } from "@/components/dashboard/push-notification-manager"

// Private area: never indexable, even if a crawler ignores robots.txt.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const member = await requireMember()

  // Cheap, index-backed unread count (notifications_user_idx) so the sidebar
  // badge is right on first paint; live updates come via realtime in the nav.
  const supabase = await createClient()
  const [unreadResult, sectionRoles, listingManager] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", member.userId).eq("read", false),
    // Section-admin assignments in the member's own Sphere — the user's own
    // rows are readable thanks to the role_assignments_select_own policy. This
    // drives the Academic Admin / Promotions Admin / Events Admin / Social
    // Admin / Clubs Admin nav entries from real server-side assignment data.
    loadAssignedSectionRoles(member),
    // Listing Manager is a platform-level role (global listings) — the nav
    // entry appears when the member holds the assignment in any Sphere.
    supabase.from("role_assignments").select("id").eq("user_id", member.userId).eq("role", "listing_manager").limit(1).maybeSingle(),
  ])
  const sectionAdmins = {
    academic: sectionRoles.includes("academic_manager"),
    promotions: sectionRoles.includes("promotion_moderator"),
    events: sectionRoles.includes("event_manager"),
    social: sectionRoles.includes("social_moderator"),
    clubs: sectionRoles.includes("club_manager"),
    globalListings: Boolean(listingManager) || member.role === "super_admin",
  }

  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      <DashboardNav member={member} initialUnread={unreadResult.count ?? 0} sectionAdmins={sectionAdmins} />
      {/* pb-24 reserves room for the fixed mobile bottom nav; desktop has none. */}
      <main className="min-w-0 flex-1 overflow-x-hidden pb-24 md:pb-0">
        {/* Notification bell — positioned top-right on desktop, fixed on mobile */}
        <div className="sticky top-0 z-30 flex justify-end px-4 pt-3 md:hidden">
          <NotificationCenter userId={member.userId} initialUnread={unreadResult.count ?? 0} />
        </div>
        <div className="hidden md:block fixed right-6 top-4 z-30">
          <NotificationCenter userId={member.userId} initialUnread={unreadResult.count ?? 0} />
        </div>
        <PushNotificationManager />
        {children}
      </main>
    </div>
  )
}
