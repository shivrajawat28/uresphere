import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireMember } from "@/lib/data/session"
import { loadAssignedSectionAdmin } from "@/lib/data/section-admin"
import { createClient } from "@/lib/supabase/server"
import { ShopAdminSection } from "@/components/dashboard/shop-admin-section"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Shop Admin",
  robots: { index: false, follow: false },
}

export default async function ShopAdminPage(
  props: { searchParams: Promise<{ sphereId?: string }> }
) {
  const searchParams = await props.searchParams
  const member = await requireMember()
  
  let workspace = await loadAssignedSectionAdmin(member, "shop_admin")

  const targetSphereId = searchParams.sphereId ?? member.sphereId
  if (!workspace && targetSphereId) {
    const isGlobalAdmin = member.role === "super_admin" || member.role === "admin"
    let isSphereAdmin = false

    if (!isGlobalAdmin) {
      const supabase = await createClient()
      const { data: assignment } = await supabase
        .from("role_assignments")
        .select("id")
        .eq("user_id", member.userId)
        .eq("sphere_id", targetSphereId)
        .eq("role", "sphere_admin")
        .maybeSingle()
      if (assignment) isSphereAdmin = true
    }

    if (isGlobalAdmin || isSphereAdmin) {
      let targetSphereName = member.sphereName
      if (targetSphereId !== member.sphereId) {
        const supabase = await createClient()
        const { data: s } = await supabase.from("spheres").select("name").eq("id", targetSphereId).maybeSingle()
        if (s) targetSphereName = s.name
      }

      workspace = {
        role: "shop_admin",
        sphereId: targetSphereId,
        sphereName: targetSphereName,
        permissions: ["shop.read", "shop.update", "shop.products.read", "shop.products.create", "shop.products.update", "shop.products.delete", "shop.orders.read", "shop.orders.update"],
      }
    }
  }

  if (!workspace) {
    redirect("/dashboard/marketplace")
  }

  const supabase = await createClient()

  // For Shop Admins, products are strictly isolated to those created by them (using created_by).
  // Orders are strictly isolated to those where seller_id = member.userId.
  // Global/Sphere admins acting in this view will ALSO only see products/orders bound to their specific user ID.
  const [
    { data: shopProducts },
    { data: orders }
  ] = await Promise.all([
    supabase
      .from("shop_products")
      .select("id, name, shop_name, description, category, price_cents, image_urls, availability, delivery_info, payment_info, active")
      .eq("sphere_id", workspace.sphereId)
      .eq("created_by", member.userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("marketplace_orders")
      .select("id, listing_id, buyer_id, seller_id, buyer_name, buyer_phone, address, delivery_date, delivery_time, price_cents, fee_cents, settlement_cents, total_cents, status, created_at")
      .eq("seller_id", member.userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="mb-6">
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Shop Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage your shop products and incoming purchase requests in {workspace.sphereName}.
        </p>
      </div>
      <ShopAdminSection
        sphereId={workspace.sphereId}
        products={shopProducts ?? []}
        orders={orders ?? []}
        userId={member.userId}
      />
    </div>
  )
}
