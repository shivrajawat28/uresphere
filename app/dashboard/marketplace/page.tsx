import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { fetchLiveAds } from "@/lib/ads"
import { MarketplaceTabs } from "./marketplace-tabs"

export const dynamic = "force-dynamic"

export type Listing = {
  id: string
  title: string
  description: string
  price_cents: number
  category: string
  condition: string
  image_urls: string[]
  status: "active" | "sold" | "removed"
  seller_id: string
  sphere_id: string
  created_at: string
}

export type ShopProduct = {
  id: string
  name: string
  description: string
  category: string
  price_cents: number
  image_urls: string[]
  availability: string
  delivery_info: string
  payment_info: string
  active: boolean
}

export type Order = {
  id: string
  listing_id: string
  buyer_id: string
  seller_id: string
  buyer_name: string
  buyer_phone: string
  address: string
  delivery_date: string | null
  price_cents: number
  fee_cents: number
  settlement_cents: number
  status: "pending" | "accepted" | "in_progress" | "delivered" | "cancelled"
  created_at: string
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  in_progress: "In progress",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export default async function MarketplacePage() {
  const member = await requireMember()
  const supabase = await createClient()

  const [{ data: listings }, { data: products }, { data: orders }, ads] = await Promise.all([
    supabase
      .from("marketplace_listings")
      .select("id, title, description, price_cents, category, condition, image_urls, status, seller_id, sphere_id, created_at")
      .eq("sphere_id", member.sphereId)
      .neq("status", "removed")
      .order("created_at", { ascending: false }),
    supabase
      .from("shop_products")
      .select("id, name, description, category, price_cents, image_urls, availability, delivery_info, payment_info, active")
      .eq("sphere_id", member.sphereId)
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("marketplace_orders")
      .select("id, listing_id, buyer_id, seller_id, buyer_name, buyer_phone, address, delivery_date, price_cents, fee_cents, settlement_cents, status, created_at")
      .or(`buyer_id.eq.${member.userId},seller_id.eq.${member.userId}`)
      .order("created_at", { ascending: false })
      .limit(20),
    // Live marketplace placement only — filtered in the database.
    fetchLiveAds(supabase, "marketplace", 2),
  ])

  return (
    <MarketplaceTabs
      listings={(listings ?? []) as Listing[]}
      products={(products ?? []) as ShopProduct[]}
      orders={(orders ?? []) as Order[]}
      orderStatusLabels={ORDER_STATUS_LABELS}
      currentUserId={member.userId}
      sphereName={member.sphereName}
      ads={ads}
    />
  )
}
