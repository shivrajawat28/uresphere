"use server"

import { revalidatePath } from "next/cache"
import { del } from "@vercel/blob"
import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { requireSphereAction } from "@/lib/actions/admin"

const CATEGORIES = ["books", "calculators", "cycles", "electronics", "college_supplies", "other"] as const
const CONDITIONS = ["new", "like_new", "used", "fair"] as const

export type ActionResult = { error: string | null }

/**
 * Creates a listing in the PENDING review queue. It only becomes visible to
 * other members after an admin approves it — a normal user's listing never
 * appears directly on the public Marketplace (Part 6).
 */
export async function createListingAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const priceRaw = String(formData.get("price") ?? "").trim()
  const category = String(formData.get("category") ?? "other")
  const condition = String(formData.get("condition") ?? "used")
  const imageUrlsRaw = String(formData.get("imageUrls") ?? "[]")

  if (title.length < 1 || title.length > 120) {
    return { error: "Title must be between 1 and 120 characters." }
  }
  if (description.length < 1 || description.length > 2000) {
    return { error: "Description must be between 1 and 2000 characters." }
  }

  const priceDollars = Number.parseFloat(priceRaw)
  if (!Number.isFinite(priceDollars) || priceDollars < 0) {
    return { error: "Enter a valid, non-negative price." }
  }
  const priceCents = Math.round(priceDollars * 100)

  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return { error: "Invalid category." }
  }
  if (!CONDITIONS.includes(condition as (typeof CONDITIONS)[number])) {
    return { error: "Invalid condition." }
  }

  let imageUrls: string[] = []
  try {
    const parsed = JSON.parse(imageUrlsRaw)
    if (Array.isArray(parsed)) imageUrls = parsed.filter((u) => typeof u === "string").slice(0, 6)
  } catch {
    imageUrls = []
  }

  const { data: inserted, error } = await supabase
    .from("marketplace_listings")
    .insert({
      sphere_id: member.sphereId,
      seller_id: member.userId,
      title,
      description,
      price_cents: priceCents,
      category,
      condition,
      image_urls: imageUrls,
      status: "pending",
    })
    .select("id")
    .single()

  if (error || !inserted) {
    console.log("[v0] createListingAction error:", error?.message)
    return { error: "Couldn't submit your listing — try again." }
  }

  // Tell the Sphere's administrators a listing is waiting for review.
  await supabase.rpc("notify_sphere_admins", {
    p_sphere_id: member.sphereId,
    p_type: "listing_submitted",
    p_title: "New marketplace listing to review",
    p_body: `${member.anonymousHandle} submitted “${title}” for review.`,
    p_link: "/dashboard/marketplace/admin",
  })

  revalidatePath("/dashboard/marketplace")
  revalidatePath("/dashboard/marketplace/admin")
  return { error: null }
}

/**
 * Admin review of a pending listing: approve (optionally with a final admin
 * price) or reject with a reason. Gated server-side — only Sphere admins,
 * listing managers and marketplace moderators may review; a client can never
 * approve its own listing.
 */
export async function reviewListingAction(
  listingId: string,
  decision: "approve" | "reject",
  adminPriceRaw: string,
  reason: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id, sphere_id, status, seller_id, title")
    .eq("id", listingId)
    .maybeSingle()
  if (!listing) return { error: "Listing not found." }
  if (listing.status !== "pending") return { error: "This listing was already reviewed." }

  // listing_manager / marketplace_moderator may review (listings.update +
  // marketplace.review permissions cover them; sphere admins pass through).
  let gate = await requireSphereAction(listing.sphere_id, "listings.update")
  if (!gate.ok) gate = await requireSphereAction(listing.sphere_id, "marketplace.review")
  if (!gate.ok) return gate

  // Server-side: a user must never moderate their own listing.
  if (listing.seller_id === gate.member.userId) {
    return { error: "You cannot review your own listing." }
  }

  let adminPriceCents: number | null = null
  if (decision === "approve" && adminPriceRaw.trim()) {
    const p = Number.parseFloat(adminPriceRaw.trim())
    if (!Number.isFinite(p) || p < 0) return { error: "Enter a valid, non-negative final price." }
    adminPriceCents = Math.round(p * 100)
  }

  if (decision === "approve") {
    const { error } = await supabase
      .from("marketplace_listings")
      .update({
        status: "active",
        reviewed_by: gate.member.userId,
        reviewed_at: new Date().toISOString(),
        admin_price_cents: adminPriceCents,
        rejection_reason: "",
      })
      .eq("id", listingId)
    if (error) return { error: "Couldn't approve the listing." }

    await supabase.rpc("notify_user", {
      p_user_id: listing.seller_id,
      p_type: "listing_approved",
      p_title: "Your listing is live",
      p_body: `“${listing.title}” was approved and is now visible in the Marketplace.`,
      p_link: "/dashboard/marketplace",
    })
  } else {
    const cleanReason = reason.trim().slice(0, 300)
    const { error } = await supabase
      .from("marketplace_listings")
      .update({
        status: "removed",
        reviewed_by: gate.member.userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: cleanReason || "Not approved",
      })
      .eq("id", listingId)
    if (error) return { error: "Couldn't reject the listing." }

    await supabase.rpc("notify_user", {
      p_user_id: listing.seller_id,
      p_type: "listing_rejected",
      p_title: "Your listing wasn't approved",
      p_body: cleanReason ? `Reason: ${cleanReason}` : "Your listing was rejected and won't be published.",
      p_link: "/dashboard/marketplace",
    })
  }

  revalidatePath("/dashboard/marketplace")
  revalidatePath("/dashboard/marketplace/admin")
  revalidatePath(`/admin/spheres/${listing.sphere_id}`)
  return { error: null }
}

// ---------------------------------------------------------------------------
// Cart (Part 7) — rows are RLS-scoped to the buyer; pricing is never trusted
// from the client (quantities only; prices are read from the DB at checkout).
// ---------------------------------------------------------------------------

export async function addToCartAction(listingId: string, quantity: number): Promise<ActionResult> {
  const member = await requireMember()
  const qty = Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 20) : 1
  if (!member.sphereId) return { error: "Not a member of a Sphere." }

  const supabase = await createClient()
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id, status, seller_id")
    .eq("id", listingId)
    .eq("sphere_id", member.sphereId)
    .maybeSingle()
  if (!listing) return { error: "Listing not found in your Sphere." }
  if (listing.status !== "active") return { error: "This item is no longer available." }
  if (listing.seller_id === member.userId) return { error: "You can't add your own listing to the cart." }

  const { error } = await supabase.from("cart_items").upsert(
    { user_id: member.userId, listing_id: listingId, quantity: qty },
    { onConflict: "user_id,listing_id" },
  )
  if (error) return { error: "Couldn't add the item to your cart." }

  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

export async function addShopProductToCartAction(shopProductId: string, quantity: number): Promise<ActionResult> {
  const member = await requireMember()
  const qty = Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, 20) : 1
  if (!member.sphereId) return { error: "Not a member of a Sphere." }

  const supabase = await createClient()
  const { data: product } = await supabase
    .from("shop_products")
    .select("id, active, created_by")
    .eq("id", shopProductId)
    .eq("sphere_id", member.sphereId)
    .maybeSingle()
  if (!product) return { error: "Shop product not found in your Sphere." }
  if (!product.active) return { error: "This item is no longer available." }
  if (product.created_by === member.userId) return { error: "You can't add your own shop product to the cart." }

  const { error } = await supabase.from("cart_items").upsert(
    { user_id: member.userId, shop_product_id: shopProductId, quantity: qty },
    { onConflict: "user_id,shop_product_id" },
  )
  if (error) return { error: "Couldn't add the item to your cart." }

  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

export async function updateCartQuantityAction(itemId: string, quantity: number): Promise<ActionResult> {
  const member = await requireMember()
  const qty = Number.isInteger(quantity) ? Math.max(1, Math.min(quantity, 20)) : 1
  const supabase = await createClient()

  // Own-row guard is enforced by RLS; double-check ownership server-side too.
  const { data: item } = await supabase.from("cart_items").select("id").eq("id", itemId).eq("user_id", member.userId).maybeSingle()
  if (!item) return { error: "Cart item not found." }

  const { error } = await supabase.from("cart_items").update({ quantity: qty }).eq("id", itemId)
  if (error) return { error: "Couldn't update the quantity." }
  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

export async function removeFromCartAction(itemId: string): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()
  const { data: item } = await supabase.from("cart_items").select("id").eq("id", itemId).eq("user_id", member.userId).maybeSingle()
  if (!item) return { error: "Cart item not found." }

  const { error } = await supabase.from("cart_items").delete().eq("id", itemId)
  if (error) return { error: "Couldn't remove the item." }
  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

/**
 * Checkout: reads the buyer's cart, then hands the listing ids + quantities
 * to the SECURITY DEFINER checkout_cart RPC which re-reads prices from the DB,
 * creates one order per seller, stores per-item snapshots, marks every
 * purchased listing sold atomically (duplicate-purchase safe), and rejects
 * unavailable items — the client can never change a price or buy a sold item.
 */
export async function checkoutCartAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  if (!member.sphereId) return { error: "Not a member of a Sphere." }

  const buyerName = String(formData.get("buyerName") ?? "").trim()
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const deliveryDate = String(formData.get("deliveryDate") ?? "") || null
  const deliveryTime = String(formData.get("deliveryTime") ?? "").trim()

  if (buyerName.length < 2) return { error: "Please enter your name." }
  if (buyerPhone.length < 7) return { error: "Please enter a valid phone number." }
  if (address.length < 5) return { error: "Please enter a delivery address." }
  if (deliveryTime.length > 200) return { error: "Delivery time is too long." }

  const supabase = await createClient()
  const { data: cart } = await supabase
    .from("cart_items")
    .select("listing_id, shop_product_id, quantity")
    .eq("user_id", member.userId)
  
  const listingLines = (cart ?? []).filter((c) => c.listing_id)
  const shopLines = (cart ?? []).filter((c) => c.shop_product_id)
  
  if (listingLines.length === 0 && shopLines.length === 0) return { error: "Your cart is empty." }

  const listingIds = listingLines.map((c) => c.listing_id as string)
  const listingQuantities = listingLines.map((c) => c.quantity)

  const shopProductIds = shopLines.map((c) => c.shop_product_id as string)
  const shopQuantities = shopLines.map((c) => c.quantity)

  const { data: rpcResult, error: rpcError } = await supabase.rpc("checkout_mixed_cart", {
    p_buyer_id: member.userId,
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone,
    p_address: address,
    p_delivery_date: deliveryDate,
    p_delivery_time: deliveryTime,
    p_listing_ids: listingIds,
    p_listing_quantities: listingQuantities,
    p_shop_product_ids: shopProductIds,
    p_shop_quantities: shopQuantities,
  })

  if (rpcError) return { error: "Couldn't place your order. Try again." }
  const first = Array.isArray(rpcResult) && rpcResult.length > 0 ? rpcResult[0] : null
  if (first?.error) return { error: first.error }
  if (!first?.order_id) return { error: "Couldn't place your order. Try again." }

  // Clear the purchased lines from the cart.
  if (listingIds.length > 0) {
    await supabase.from("cart_items").delete().eq("user_id", member.userId).in("listing_id", listingIds)
  }
  if (shopProductIds.length > 0) {
    await supabase.from("cart_items").delete().eq("user_id", member.userId).in("shop_product_id", shopProductIds)
  }

  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

type ManageResult =
  | { allowed: true; listing: { seller_id: string; sphere_id: string } }
  | { allowed: false }

async function canManageListing(
  listingId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ManageResult> {
  // Server-side ownership + Sphere-admin check (defense in depth behind RLS).
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("seller_id, sphere_id")
    .eq("id", listingId)
    .maybeSingle()

  if (!listing) return { allowed: false }

  const { data: membership } = await supabase
    .from("user_spheres")
    .select("sphere_id")
    .eq("user_id", userId)
    .eq("sphere_id", listing.sphere_id)
    .eq("membership_status", "active")
    .maybeSingle()

  if (!membership) return { allowed: false }

  if (listing.seller_id === userId) return { allowed: true, listing }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin"
  return isAdmin ? { allowed: true, listing } : { allowed: false }
}

export async function updateListingStatusAction(listingId: string, status: "active" | "sold" | "removed") {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const { allowed } = await canManageListing(listingId, user.id, supabase)
  if (!allowed) {
    return { error: "You can only manage your own listings." }
  }

  const { error } = await supabase.from("marketplace_listings").update({ status }).eq("id", listingId)

  if (error) {
    console.log("[v0] updateListingStatusAction error:", error.message)
    return { error: "Couldn't update listing." }
  }

  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

export async function deleteListingAction(listingId: string, imageUrls: string[]) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const { allowed } = await canManageListing(listingId, user.id, supabase)
  if (!allowed) {
    return { error: "You can only delete your own listings." }
  }

  const { error } = await supabase.from("marketplace_listings").delete().eq("id", listingId)

  if (error) {
    console.log("[v0] deleteListingAction error:", error.message)
    return { error: "Couldn't delete listing." }
  }

  if (imageUrls.length > 0) {
    try {
      await del(imageUrls)
    } catch (e) {
      console.log("[v0] failed to delete blob images:", e)
    }
  }

  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

export async function reportListingAction(listingId: string, sphereId: string, reason: string) {
  const member = await requireMember()
  const supabase = await createClient()

  const trimmed = reason.trim()
  if (trimmed.length < 1 || trimmed.length > 500) {
    return { error: "Please provide a reason (max 500 characters)." }
  }

  // Reports are only valid against listings inside the reporter's own Sphere.
  if (sphereId !== member.sphereId) {
    return { error: "You can only report listings inside your Sphere." }
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: member.userId,
    target_type: "listing",
    target_id: listingId,
    sphere_id: sphereId,
    reason: trimmed,
  })

  if (error) {
    console.log("[v0] reportListingAction error:", error.message)
    return { error: "Couldn't submit report." }
  }

  return { error: null }
}
