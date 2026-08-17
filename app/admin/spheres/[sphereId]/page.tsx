import { notFound } from "next/navigation"
import { requireSphereAdmin } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { SphereAdmin } from "./sphere-admin"

export const dynamic = "force-dynamic"

export default async function SphereAdminPage({ params }: { params: Promise<{ sphereId: string }> }) {
  const { sphereId } = await params
  const access = await requireSphereAdmin(sphereId)
  const supabase = await createClient()

  const { data: sphere } = await supabase
    .from("spheres")
    .select("id, name, slug, colleges(city, state)")
    .eq("id", sphereId)
    .maybeSingle()
  if (!sphere) notFound()

  const city = Array.isArray(sphere.colleges)
    ? (sphere.colleges[0] as { city?: string; state?: string } | null)?.city ?? ""
    : (sphere.colleges as { city?: string; state?: string } | null)?.city ?? ""
  const state = Array.isArray(sphere.colleges)
    ? (sphere.colleges[0] as { city?: string; state?: string } | null)?.state ?? ""
    : (sphere.colleges as { city?: string; state?: string } | null)?.state ?? ""

  const [
    { count: memberCount },
    { count: openReports },
    { count: pendingPromotions },
    usersResult,
    reportsResult,
    promotionsResult,
    listingsResult,
    eventsResult,
    clubsResult,
    subjectsResult,
    resourcesResult,
    ordersResult,
    shopProductsResult,
    auditResult,
    messagesResult,
    groupsResult,
    rolesResult,
    promoConfigResult,
  ] = await Promise.all([
    supabase
      .from("user_spheres")
      .select("*", { count: "exact", head: true })
      .eq("sphere_id", sphereId)
      .eq("membership_status", "active"),
    supabase.from("reports").select("*", { count: "exact", head: true }).eq("sphere_id", sphereId).eq("status", "open"),
    supabase
      .from("promotions")
      .select("*", { count: "exact", head: true })
      .eq("sphere_id", sphereId)
      .eq("status", "pending"),
    supabase
      .from("user_spheres")
      .select("user_id, anonymous_handle, membership_status, created_at")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("reports")
      .select("id, target_type, reason, status, created_at, reporter_id")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("promotions")
      .select("id, title, url, status, fee_status, utr, user_id, created_at, reviewed_at, paid_at")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("marketplace_listings")
      .select("id, title, price_cents, category, status, seller_id, created_at")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("events")
      .select("id, title, event_date, event_time, venue, organizer")
      .eq("sphere_id", sphereId)
      .order("event_date", { ascending: false })
      .limit(100),
    supabase
      .from("clubs")
      .select("id, name, description, logo_url")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("subjects")
      .select("id, name, code, degree, year, branch")
      .eq("sphere_id", sphereId)
      .order("degree")
      .order("year")
      .order("branch")
      .limit(300),
    supabase
      .from("academic_resources")
      .select("id, title, type")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("marketplace_orders")
      .select("id, listing_id, buyer_id, seller_id, buyer_name, buyer_phone, address, delivery_date, price_cents, fee_cents, settlement_cents, status, created_at")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("shop_products")
      .select("id, name, description, category, price_cents, image_urls, availability, active, delivery_info, payment_info")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("audit_logs")
      .select("id, admin_id, action, entity_type, details, created_at")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("chat_messages")
      .select("id, body, author_id, created_at, is_deleted, deleted_by_role, reply_to_message_id")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("groups")
      .select("id, name, description, created_by, created_at, group_members(count)")
      .eq("sphere_id", sphereId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("role_assignments")
      .select("user_id, role, scope")
      .eq("sphere_id", sphereId)
      .limit(300),
    supabase.from("platform_config").select("value").eq("key", "promotion_payment").maybeSingle(),
  ])

  const userRows = usersResult.data ?? []

  // user_spheres -> profiles has no FK, so PostgREST cannot embed it. Fetch
  // profile details separately and join client-side (same pattern as the
  // dashboard). RLS gates these reads to admins who share the Sphere.
  const memberIds = Array.from(new Set(userRows.map((u) => u.user_id)))
  const { data: profileRows } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, real_name, phone, college_year, role, account_status")
        .in("id", memberIds)
    : {
        data: [] as {
          id: string
          email: string
          real_name: string
          phone: string
          college_year: string
          role: string
          account_status: string
        }[],
      }
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]))

  const users = userRows.map((u) => {
    const p = profileById.get(u.user_id)
    return {
      userId: u.user_id,
      handle: u.anonymous_handle,
      membershipStatus: u.membership_status,
      joinedAt: u.created_at,
      realName: p?.real_name || "—",
      email: p?.email || "—",
      phone: p?.phone || "—",
      collegeYear: p?.college_year || "",
      role: p?.role || "user",
      accountStatus: p?.account_status || "active",
    }
  })

  // Admin-only identity map: real name per author (never sent to normal users).
  const realNameById = new Map(users.map((u) => [u.userId, u.realName]))

  // Anonymous handles for chat authors + group creators (same-Sphere only).
  const handleUserIds = Array.from(
    new Set([
      ...(messagesResult.data ?? []).map((m) => m.author_id),
      ...(groupsResult.data ?? []).map((g) => g.created_by),
    ]),
  )
  const { data: handleRows } = handleUserIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", handleUserIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }
  const handleById = new Map((handleRows ?? []).map((h) => [h.user_id, h.anonymous_handle]))
  const creatorHandle = new Map((handleRows ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  // Anonymous handles for promotion requesters (same-Sphere only).
  const promoUserIds = Array.from(new Set((promotionsResult.data ?? []).map((p) => p.user_id)))
  const { data: promoHandleRows } = promoUserIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", promoUserIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }
  const promoHandleById = new Map((promoHandleRows ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  const promotionPaymentConfig = (promoConfigResult.data?.value ?? {}) as {
    price_inr?: number
    duration_days?: number
  }

  // Original content of deleted messages lives in chat_message_archives
  // (RLS-gated to Sphere admins / super admins) — moderation-only.
  const deletedMessageIds = (messagesResult.data ?? []).filter((m) => m.is_deleted).map((m) => m.id)
  const { data: archiveRows } = deletedMessageIds.length
    ? await supabase
        .from("chat_message_archives")
        .select("message_id, body")
        .in("message_id", deletedMessageIds)
    : { data: [] as { message_id: string; body: string }[] }
  const archiveByMessageId = new Map((archiveRows ?? []).map((a) => [a.message_id, a.body]))

  // Member roles for the member-details modal (role_assignments are admin-scoped).
  const rolesByUser = new Map<string, { role: string; scope: Record<string, unknown> }[]>()
  for (const r of rolesResult.data ?? []) {
    const list = rolesByUser.get(r.user_id) ?? []
    list.push({ role: r.role, scope: (r.scope ?? {}) as Record<string, unknown> })
    rolesByUser.set(r.user_id, list)
  }

  return (
    <SphereAdmin
      sphereId={sphereId}
      sphereName={sphere.name}
      sphereCity={city}
      sphereState={state}
      isSphereAdministrator={access.isSphereAdministrator}
      isSuperAdmin={access.isSuperAdmin}
      permissions={access.permissions}
      stats={{
        memberCount: memberCount ?? 0,
        openReports: openReports ?? 0,
        pendingPromotions: pendingPromotions ?? 0,
      }}
      users={users}
      reports={(reportsResult.data ?? []).map((r) => ({
        id: r.id,
        target_type: r.target_type,
        reason: r.reason,
        status: r.status,
        created_at: r.created_at,
        reporter_id: r.reporter_id,
      }))}
      promotions={(promotionsResult.data ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        url: p.url,
        status: p.status,
        fee_status: p.fee_status,
        utr: p.utr ?? null,
        user_id: p.user_id,
        publisher: promoHandleById.get(p.user_id) ?? "Unknown",
        created_at: p.created_at,
        reviewed_at: p.reviewed_at,
        paid_at: p.paid_at,
      }))}
      promotionPriceInr={promotionPaymentConfig.price_inr ?? 10}
      listings={(listingsResult.data ?? []).map((l) => ({
        id: l.id,
        title: l.title,
        price_cents: l.price_cents,
        category: l.category,
        status: l.status,
        seller_id: l.seller_id,
      }))}
      events={(eventsResult.data ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        event_date: e.event_date,
        event_time: e.event_time,
        venue: e.venue,
        organizer: e.organizer,
      }))}
      clubs={(clubsResult.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        logo_url: c.logo_url,
      }))}
      subjects={(subjectsResult.data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        degree: s.degree,
        year: s.year,
        branch: s.branch,
      }))}
      resources={(resourcesResult.data ?? []).map((r) => ({ id: r.id, title: r.title, type: r.type }))}
      orders={(ordersResult.data ?? []).map((o) => ({
        id: o.id,
        listing_id: o.listing_id,
        buyer_id: o.buyer_id,
        seller_id: o.seller_id,
        buyer_name: o.buyer_name,
        buyer_phone: o.buyer_phone,
        address: o.address,
        delivery_date: o.delivery_date,
        price_cents: o.price_cents,
        fee_cents: o.fee_cents,
        settlement_cents: o.settlement_cents,
        status: o.status,
        created_at: o.created_at,
      }))}
      shopProducts={(shopProductsResult.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        price_cents: p.price_cents,
        image_urls: p.image_urls,
        availability: p.availability,
        active: p.active,
        delivery_info: p.delivery_info,
        payment_info: p.payment_info,
      }))}
      auditLogs={(auditResult.data ?? []).map((a) => ({
        id: a.id,
        action: a.action,
        entity_type: a.entity_type,
        details: a.details as Record<string, unknown>,
        created_at: a.created_at,
      }))}
      messages={(messagesResult.data ?? []).map((m) => ({
        id: m.id,
        body: m.body,
        authorId: m.author_id,
        authorHandle: handleById.get(m.author_id) ?? "Unknown",
        authorRealName: realNameById.get(m.author_id) ?? null,
        createdAt: m.created_at,
        isDeleted: m.is_deleted,
        deletedByRole: m.deleted_by_role === "admin" ? ("admin" as const) : ("user" as const),
        replyToMessageId: m.reply_to_message_id ?? null,
        originalBody: archiveByMessageId.get(m.id) ?? null,
      }))}
      groups={(groupsResult.data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        creatorHandle: creatorHandle.get(g.created_by) ?? "Unknown",
        memberCount:
          (Array.isArray(g.group_members) ? g.group_members[0] : g.group_members)?.count ?? 0,
        createdAt: g.created_at,
      }))}
      rolesByUser={Object.fromEntries(rolesByUser)}
    />
  )
}
