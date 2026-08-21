"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireSphereAction } from "./admin"
import type { ActionResult } from "./marketplace"

export async function upsertShopProfileAction(sphereId: string, formData: FormData): Promise<ActionResult> {
  const member = await requireSphereAction(sphereId, "shop.update")

  const shopName = String(formData.get("shopName") ?? "").trim()
  if (shopName.length < 2) return { error: "Shop name must be at least 2 characters." }

  const supabase = await createClient()

  // Find if profile already exists for this user in this sphere
  const { data: existing } = await supabase
    .from("shop_profiles")
    .select("id")
    .eq("sphere_id", sphereId)
    .eq("user_id", member.userId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from("shop_profiles")
      .update({ shop_name: shopName, updated_at: new Date().toISOString() })
      .eq("id", existing.id)

    if (error) return { error: "Failed to update shop profile." }
  } else {
    const { error } = await supabase
      .from("shop_profiles")
      .insert({
        user_id: member.userId,
        sphere_id: sphereId,
        shop_name: shopName,
      })

    if (error) return { error: "Failed to create shop profile." }
  }

  revalidatePath(`/admin/spheres/${sphereId}`)
  return { error: null }
}
