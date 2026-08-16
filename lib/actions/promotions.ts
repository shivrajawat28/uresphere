"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"
import { validatePromotionUrl } from "@/lib/validation"

type ActionResult = { error: string | null }

export async function submitPromotionAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const title = String(formData.get("title") ?? "").trim()
  const rawUrl = String(formData.get("url") ?? "").trim()

  if (title.length < 1 || title.length > 120) return { error: "Title must be 1–120 characters." }

  const url = validatePromotionUrl(rawUrl)
  if (!url) return { error: "Enter a valid http(s) URL." }
  if (url.length > 500) return { error: "URL is too long." }

  const { data: config } = await supabase
    .from("platform_config")
    .select("value")
    .eq("key", "promotion_payment")
    .maybeSingle()
  const price = Number(config?.value?.price_inr ?? 10)

  const { data: inserted, error } = await supabase
    .from("promotions")
    .insert({
      sphere_id: member.sphereId,
      user_id: member.userId,
      url,
      title,
      status: "pending",
      fee_status: price > 0 ? "due" : "free",
    })
    .select("id")
    .single()

  if (error || !inserted) {
    return { error: "Couldn't submit your promotion. Try again." }
  }

  // Alert the Sphere's administrators so the request gets reviewed.
  await supabase.rpc("notify_sphere_admins", {
    p_sphere_id: member.sphereId,
    p_type: "promotion_submitted",
    p_title: "New promotion submitted",
    p_body: `${member.anonymousHandle} submitted “${title}” for review${price > 0 ? " — payment required" : ""}.`,
    p_link: "/dashboard/promotions/admin",
  })

  revalidatePath("/dashboard/promotions")
  return { error: null }
}
