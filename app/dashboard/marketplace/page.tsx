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
  status: "pending" | "active" | "sold" | "removed"
  seller_id: string
  sphere_id: string
  rejection_reason: string
  admin_price_cents: number | null
  created_at: string
}

export type ShopProduct = {
  id: string
  name: string
  shop_name: string
  description: string
  category: string
  price_cents: number
  image_urls: string[]
  availability: string
  delivery_info: string
  payment_info: string
  active: boolean
}

export type OrderItem = {
  id: string
  title: string
  quantity: number
  unit_price_cents: number
  listing_id: string | null
  shop_product_id: string | null
  item_type: "listing" | "shop"
}

export type Order = {
  id: string
  listing_id: string | null
  buyer_id: string
  seller_id: string
  buyer_name: string
  buyer_phone: string
  address: string
  delivery_date: string | null
  delivery_time: string
  price_cents: number
  fee_cents: number
  settlement_cents: number
  total_cents: number
  status: "pending" | "accepted" | "in_progress" | "delivered" | "cancelled"
  created_at: string
  items: OrderItem[]
}

export type CartItem = {
  id: string
  listing_id: string | null
  shop_product_id: string | null
  quantity: number
  title: string
  price_cents: number
  image_url: string | null
  seller_id: string
  status: string
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

  // One-hour sold-listing cleanup, lazily on every marketplace visit (also run
  // by the Vercel Cron). Idempotent — hidden listings are already 'removed'.
  await supabase.rpc("cleanup_sold_listings")

  const [{ data: listings }, { data: products }, { data: orders }, { data: cart }, ads] = await Promise.all([
    supabase
      .from("marketplace_listings")
      .select(
        "id, title, description, price_cents, category, condition, image_urls, status, seller_id, sphere_id, rejection_reason, admin_price_cents, created_at",
      )
      .eq("sphere_id", member.sphereId)
      .in("status", ["active", "sold"])
      .order("created_at", { ascending: false }),
    supabase
      .from("shop_products")
      .select("id, name, shop_name, description, category, price_cents, image_urls, availability, delivery_info, payment_info, active, created_by")
      .eq("sphere_id", member.sphereId)
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("marketplace_orders")
      .select(
        "id, listing_id, buyer_id, seller_id, buyer_name, buyer_phone, address, delivery_date, delivery_time, price_cents, fee_cents, settlement_cents, total_cents, status, created_at",
      )
      .or(`buyer_id.eq.${member.userId},seller_id.eq.${member.userId}`)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("cart_items")
      .select("id, listing_id, shop_product_id, quantity")
      .eq("user_id", member.userId)
      .order("created_at", { ascending: false }),
    // Live marketplace placement only — filtered in the database.
    fetchLiveAds(supabase, "marketplace", 2),
  ])

  // The seller's own listings in ANY status (pending review / rejected) —
  // merged with the public active+sold set so the seller can track review.
  const { data: ownListings } = await supabase
    .from("marketplace_listings")
    .select(
      "id, title, description, price_cents, category, condition, image_urls, status, seller_id, sphere_id, rejection_reason, admin_price_cents, created_at",
    )
    .eq("sphere_id", member.sphereId)
    .eq("seller_id", member.userId)
    .in("status", ["pending", "removed"])

  const listingById = new Map<string, Listing>()
  for (const l of [...(listings ?? []), ...(ownListings ?? [])]) {
    listingById.set(l.id, l as Listing)
  }

  // Can the caller review listings in this Sphere? Profile-role admins and
  // super admins always can; listing managers / marketplace moderators / a
  // sphere_admin assignment also unlock the review queue.
  let canReviewListings = member.role === "admin" || member.role === "super_admin"
  if (!canReviewListings && member.sphereId) {
    const { data: assignment } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", member.userId)
      .eq("sphere_id", member.sphereId)
      .in("role", ["listing_manager", "marketplace_moderator", "sphere_admin"])
      .limit(1)
      .maybeSingle()
    canReviewListings = Boolean(assignment)
  }

  // Pending queue for admins (all sellers, resolved handles).
  let pendingListings: (Listing & { sellerHandle: string })[] = []
  if (canReviewListings) {
    const { data: pending } = await supabase
      .from("marketplace_listings")
      .select(
        "id, title, description, price_cents, category, condition, image_urls, status, seller_id, sphere_id, rejection_reason, admin_price_cents, created_at",
      )
      .eq("sphere_id", member.sphereId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100)
    const sellerIds = Array.from(new Set((pending ?? []).map((p) => p.seller_id)))
    const { data: handles } = sellerIds.length
      ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", sellerIds)
      : { data: [] as { user_id: string; anonymous_handle: string }[] }
    const handleByUser = new Map((handles ?? []).map((h) => [h.user_id, h.anonymous_handle]))
    pendingListings = (pending ?? []).map((p) => ({
      ...(p as Listing),
      sellerHandle: handleByUser.get(p.seller_id) ?? "Unknown",
    }))
  }

  // Order items (per-order snapshots) + cart titles/prices.
  const orderIds = (orders ?? []).map((o) => o.id)
  const { data: orderItems } = orderIds.length
    ? await supabase.from("order_items").select("id, order_id, listing_id, shop_product_id, item_type, title, quantity, unit_price_cents").in("order_id", orderIds)
    : { data: [] as { order_id: string; id: string; listing_id: string | null; shop_product_id: string | null; item_type: string; title: string; quantity: number; unit_price_cents: number }[] }
  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const row of orderItems ?? []) {
    const list = itemsByOrder.get(row.order_id) ?? []
    list.push({
      id: row.id,
      title: row.title,
      quantity: row.quantity,
      unit_price_cents: row.unit_price_cents,
      listing_id: row.listing_id,
      shop_product_id: row.shop_product_id,
      item_type: row.item_type as OrderItem["item_type"],
    })
    itemsByOrder.set(row.order_id, list)
  }

  // Resolve cart titles + prices from the live DB (server-side, never the
  // client). Cart rows are own-rows via RLS; only active listings can be
  // purchased, so sold/pending lines are filtered out below.
  const cartListingIds = (cart ?? []).map((c) => c.listing_id).filter(Boolean) as string[]
  const cartShopIds = (cart ?? []).map((c) => c.shop_product_id).filter(Boolean) as string[]
  const [{ data: cartListings }, { data: cartProducts }] = await Promise.all([
    cartListingIds.length
      ? supabase.from("marketplace_listings").select("id, title, price_cents, image_urls, seller_id, status").in("id", cartListingIds)
      : Promise.resolve({ data: [] as { id: string; title: string; price_cents: number; image_urls: string[]; seller_id: string; status: string }[] }),
    cartShopIds.length
      ? supabase.from("shop_products").select("id, name, price_cents, image_urls, availability, active").in("id", cartShopIds)
      : Promise.resolve({ data: [] as { id: string; name: string; price_cents: number; image_urls: string[]; availability: string; active: boolean }[] }),
  ])
  const listingInfo = new Map((cartListings ?? []).map((l) => [l.id, l]))
  const shopInfo = new Map((cartProducts ?? []).map((p) => [p.id, p]))

  const cartItems: CartItem[] = (cart ?? []).flatMap((c) => {
    if (c.listing_id) {
      const l = listingInfo.get(c.listing_id)
      if (!l || l.status !== "active") return []
      return [
        {
          id: c.id,
          listing_id: c.listing_id,
          shop_product_id: null,
          quantity: c.quantity,
          title: l.title,
          price_cents: l.price_cents,
          image_url: l.image_urls[0] ?? null,
          seller_id: l.seller_id,
          status: "listing",
        } as CartItem,
      ]
    }
    if (c.shop_product_id) {
      const p = shopInfo.get(c.shop_product_id)
      if (!p || !p.active || p.availability !== "in_stock") return []
      return [
        {
          id: c.id,
          listing_id: null,
          shop_product_id: c.shop_product_id,
          quantity: c.quantity,
          title: p.name,
          price_cents: p.price_cents,
          image_url: p.image_urls[0] ?? null,
          seller_id: "",
          status: "shop",
        } as CartItem,
      ]
    }
    return []
  })

  return (
    <MarketplaceTabs
      listings={Array.from(listingById.values()) as Listing[]}
      products={products as ShopProduct[]}
      orders={(orders ?? []).map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })) as Order[]}
      cartItems={cartItems}
      pendingListings={pendingListings}
      canReviewListings={canReviewListings}
      orderStatusLabels={ORDER_STATUS_LABELS}
      currentUserId={member.userId}
      sphereName={member.sphereName}
      ads={ads}
    />
  )
}
