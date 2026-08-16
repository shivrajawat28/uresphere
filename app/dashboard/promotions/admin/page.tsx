import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireMember } from "@/lib/data/session"
import { loadAssignedSectionAdmin } from "@/lib/data/section-admin"
import { createClient } from "@/lib/supabase/server"
import { PromotionsAdminClient } from "@/components/dashboard/promotions-admin-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Promotions Admin",
  robots: { index: false, follow: false },
}

export default async function PromotionsAdminPage() {
  const member = await requireMember()
  const workspace = await loadAssignedSectionAdmin(member, "promotion_moderator")
  if (!workspace) redirect("/dashboard/promotions")

  const supabase = await createClient()

  const [{ data: promotions }, { data: config }] = await Promise.all([
    supabase
      .from("promotions")
      .select("id, title, url, status, fee_status, utr, user_id, created_at, reviewed_at, paid_at")
      .eq("sphere_id", workspace.sphereId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("platform_config").select("value").eq("key", "promotion_payment").maybeSingle(),
  ])

  // Resolve anonymous handles for requesters (same-Sphere only).
  const userIds = Array.from(new Set((promotions ?? []).map((p) => p.user_id)))
  const { data: handleRows } = userIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", userIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }
  const handleById = new Map((handleRows ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  const fee = Number((config?.value as { price_inr?: number } | undefined)?.price_inr ?? 10)

  return (
    <PromotionsAdminClient
      sphereName={workspace.sphereName}
      feeInr={fee}
      promotions={(promotions ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        url: p.url,
        status: p.status,
        fee_status: p.fee_status,
        utr: p.utr ?? null,
        publisher: handleById.get(p.user_id) ?? "Unknown",
        created_at: p.created_at,
        reviewed_at: p.reviewed_at,
        paid_at: p.paid_at,
      }))}
    />
  )
}
