"use server"

import { revalidatePath } from "next/cache"
import { del } from "@vercel/blob"
import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"

const CATEGORIES = ["books", "calculators", "cycles", "electronics", "college_supplies", "other"] as const
const CONDITIONS = ["new", "like_new", "used", "fair"] as const

export type ActionResult = { error: string | null }

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

  const { error } = await supabase.from("marketplace_listings").insert({
    sphere_id: member.sphereId,
    seller_id: member.userId,
    title,
    description,
    price_cents: priceCents,
    category,
    condition,
    image_urls: imageUrls,
  })

  if (error) {
    console.log("[v0] createListingAction error:", error.message)
    return { error: "Couldn't publish your listing — try again." }
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
