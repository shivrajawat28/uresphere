import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { GlobalListingsAdminClient } from "@/components/dashboard/global-listings-admin-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Global Listings Admin",
  robots: { index: false, follow: false },
}

export default async function GlobalListingsAdminPage() {
  const member = await requireMember()
  const supabase = await createClient()

  // Super admins always; otherwise a listing_manager role assignment unlocks
  // the management page (any Sphere — global listings are platform-level).
  let canManage = member.role === "super_admin"
  if (!canManage) {
    const { data: assignment } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("user_id", member.userId)
      .eq("role", "listing_manager")
      .limit(1)
      .maybeSingle()
    canManage = Boolean(assignment)
  }
  if (!canManage) redirect("/dashboard/global-listings")

  const { data: listings } = await supabase
    .from("global_listings")
    .select("id, title, description, category, price_cents, address, city, contact, image_urls, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200)

  return (
    <GlobalListingsAdminClient
      listings={(listings ?? []).map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description ?? "",
        category: l.category,
        price_cents: l.price_cents,
        address: l.address ?? "",
        city: l.city ?? "",
        contact: l.contact ?? "",
        image_urls: l.image_urls ?? [],
        status: l.status,
        created_at: l.created_at,
      }))}
    />
  )
}
