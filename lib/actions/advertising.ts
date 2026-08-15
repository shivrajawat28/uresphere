"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/data/session"
import { validateAdInput } from "@/lib/ads"

type ActionResult = { error: string | null }

/**
 * Advertising is platform-wide, so management is restricted to super admins
 * (never Sphere admins or scoped managers, and never enforced by hiding UI
 * alone — every mutation re-checks server-side).
 */
async function requireAdAdmin(): Promise<
  | { ok: true; adminId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { ok: false, error: "Only super admins can manage advertisements." }
  const supabase = await createClient()
  return { ok: true, adminId: admin.userId, supabase }
}

async function logAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  action: string,
  adId?: string,
  details: Record<string, unknown> = {},
) {
  try {
    await supabase.from("audit_logs").insert({
      admin_id: adminId,
      sphere_id: null,
      action,
      entity_type: "ad_campaign",
      entity_id: adId ? String(adId) : null,
      details,
    })
  } catch {
    // Auditing must never break the primary action.
  }
}

export async function createAdAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdAdmin()
  if (!gate.ok) return gate

  const parsed = validateAdInput({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    destinationUrl: String(formData.get("destinationUrl") ?? ""),
    placements: formData.getAll("placements").map(String),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    active: String(formData.get("active") ?? "on") === "on",
  })
  if (!parsed.ok) return { error: parsed.error }
  const d = parsed.data

  const { data: created, error } = await gate.supabase
    .from("ad_campaigns")
    .insert({
      advertiser_name: d.title,
      description: d.description,
      creative_url: d.imageUrl,
      destination_url: d.destinationUrl,
      placements: d.placements,
      starts_at_ts: d.startsAt,
      ends_at_ts: d.endsAt,
      active: d.active,
      archived: false,
      created_by: gate.adminId,
    })
    .select("id")
    .single()

  if (error) return { error: "Couldn't create the advertisement." }
  await logAudit(gate.supabase, gate.adminId, "ad_created", created?.id, { title: d.title, placements: d.placements, active: d.active })
  revalidatePath("/admin")
  return { error: null }
}

export async function updateAdAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireAdAdmin()
  if (!gate.ok) return gate

  const id = String(formData.get("id") ?? "")
  if (!id) return { error: "Missing advertisement." }

  const parsed = validateAdInput({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    destinationUrl: String(formData.get("destinationUrl") ?? ""),
    placements: formData.getAll("placements").map(String),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    active: String(formData.get("active") ?? "on") === "on",
  })
  if (!parsed.ok) return { error: parsed.error }
  const d = parsed.data

  const { data: existing } = await gate.supabase.from("ad_campaigns").select("id").eq("id", id).maybeSingle()
  if (!existing) return { error: "Advertisement not found." }

  const { error } = await gate.supabase
    .from("ad_campaigns")
    .update({
      advertiser_name: d.title,
      description: d.description,
      creative_url: d.imageUrl,
      destination_url: d.destinationUrl,
      placements: d.placements,
      starts_at_ts: d.startsAt,
      ends_at_ts: d.endsAt,
      active: d.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) return { error: "Couldn't update the advertisement." }
  await logAudit(gate.supabase, gate.adminId, "ad_updated", id, { title: d.title, placements: d.placements, active: d.active })
  revalidatePath("/admin")
  return { error: null }
}

export async function setAdActiveAction(adId: string, active: boolean): Promise<ActionResult> {
  const gate = await requireAdAdmin()
  if (!gate.ok) return gate

  const { data: existing } = await gate.supabase.from("ad_campaigns").select("id").eq("id", adId).maybeSingle()
  if (!existing) return { error: "Advertisement not found." }

  const { error } = await gate.supabase
    .from("ad_campaigns")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", adId)
  if (error) return { error: "Couldn't update the advertisement status." }

  await logAudit(gate.supabase, gate.adminId, active ? "ad_activated" : "ad_deactivated", adId)
  revalidatePath("/admin")
  return { error: null }
}

/** Soft delete — archived ads stop displaying and are visually marked in admin. */
export async function archiveAdAction(adId: string): Promise<ActionResult> {
  const gate = await requireAdAdmin()
  if (!gate.ok) return gate

  const { data: existing } = await gate.supabase.from("ad_campaigns").select("id").eq("id", adId).maybeSingle()
  if (!existing) return { error: "Advertisement not found." }

  const { error } = await gate.supabase
    .from("ad_campaigns")
    .update({ archived: true, active: false, updated_at: new Date().toISOString() })
    .eq("id", adId)
  if (error) return { error: "Couldn't archive the advertisement." }

  await logAudit(gate.supabase, gate.adminId, "ad_archived", adId)
  revalidatePath("/admin")
  return { error: null }
}

/** Hard delete, admin-confirmed. */
export async function deleteAdAction(adId: string): Promise<ActionResult> {
  const gate = await requireAdAdmin()
  if (!gate.ok) return gate

  const { data: existing } = await gate.supabase.from("ad_campaigns").select("id").eq("id", adId).maybeSingle()
  if (!existing) return { error: "Advertisement not found." }

  const { error } = await gate.supabase.from("ad_campaigns").delete().eq("id", adId)
  if (error) return { error: "Couldn't delete the advertisement." }

  await logAudit(gate.supabase, gate.adminId, "ad_deleted", adId)
  revalidatePath("/admin")
  return { error: null }
}
