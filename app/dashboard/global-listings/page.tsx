import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { GlobalListingsClient } from "./global-listings-client"
import type { CurrentMember } from "@/lib/data/session"

export const dynamic = "force-dynamic"

export type GlobalListing = {
  id: string
  title: string
  description: string
  category: string
  price_cents: number | null
  address: string
  city: string
  contact: string
  image_urls: string[]
  status: "active" | "hidden"
  created_at: string
}

export default async function GlobalListingsPage() {
  const member = await requireMember()
  const supabase = await createClient()

  // Server-side: determine if the user can manage global listings.
  // This is checked BOTH here (for UI visibility) AND in the server
  // actions (for authorization). The server-side check is authoritative;
  // this flag only controls what the client component renders.
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

  const { data: listings } = await supabase
    .from("global_listings")
    .select(
      "id, title, description, category, price_cents, address, city, contact, image_urls, status, created_at",
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })

  return (
    <GlobalListingsClient
      member={
        {
          role: member.role,
          canManageGlobalListings: canManage,
        } as Pick<CurrentMember, "role"> & { canManageGlobalListings: boolean }
      }
      listings={(listings ?? []) as GlobalListing[]}
    />
  )
}
