import { requireAdminAccess } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { summarizePlanFeedback } from "@/lib/plans"
import { mapAdRow } from "@/lib/ads"
import { PlatformAdmin } from "./platform-admin"

export const dynamic = "force-dynamic"

type OverviewRow = {
  sphere_id: string
  name: string
  slug: string
  city: string
  state: string
  college_status: string
  member_count: number
  club_count: number
  upcoming_event_count: number
  listing_count: number
}

export default async function AdminPage() {
  const access = await requireAdminAccess()
  const supabase = await createClient()

  const { data: overview } = await supabase.rpc("admin_sphere_overview")

  const spheres: OverviewRow[] = ((overview ?? []) as OverviewRow[]).map((s) => ({
    sphere_id: String(s.sphere_id),
    name: String(s.name),
    slug: String(s.slug ?? ""),
    city: String(s.city ?? ""),
    state: String(s.state ?? ""),
    college_status: String(s.college_status ?? "active"),
    member_count: Number(s.member_count ?? 0),
    club_count: Number(s.club_count ?? 0),
    upcoming_event_count: Number(s.upcoming_event_count ?? 0),
    listing_count: Number(s.listing_count ?? 0),
  }))

  // Platform-wide sections are super-admin only. Sphere admins and scoped
  // managers get a pure sphere selector — platform content stays out of reach.
  let platform: Awaited<ReturnType<typeof loadPlatformData>> | null = null
  if (access.isSuperAdmin) {
    platform = await loadPlatformData()
  }

  return (
    <PlatformAdmin
      isSuperAdmin={access.isSuperAdmin}
      memberRole={access.member.role}
      spheres={spheres}
      platform={platform}
    />
  )
}

async function loadPlatformData() {
  const supabase = await createClient()
  const [collegesResult, aliasesResult, requestsResult, plansResult, feedbackResult, teamResult, applicationsResult, adConfigResult, adCampaignsResult, auditResult, promoConfigResult] =
    await Promise.all([
      supabase
        .from("colleges")
        .select("id, name, short_name, slug, city, status, sphere_id, spheres(name)")
        .order("name")
        .limit(200),
      supabase.from("college_aliases").select("college_id, alias"),
      supabase.from("college_requests").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("platform_plans").select("*").order("display_order").order("created_at").limit(100),
      supabase
        .from("plan_feedback")
        .select("plan_id, rating, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("team_members").select("*").order("display_order").order("created_at").limit(100),
      supabase.from("work_with_us_applications").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("advertising_config").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("ad_campaigns")
        .select("id, advertiser_name, description, creative_url, destination_url, placements, starts_at_ts, ends_at_ts, active, archived, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("audit_logs")
        .select("id, admin_id, action, entity_type, details, created_at")
        .is("sphere_id", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("platform_config").select("value").eq("key", "promotion_payment").maybeSingle(),
    ])

  const aliasesByCollegeId: Record<string, string[]> = {}
  for (const row of aliasesResult.data ?? []) {
    ;(aliasesByCollegeId[row.college_id] ??= []).push(row.alias)
  }

  return {
    colleges: (collegesResult.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      short_name: c.short_name,
      slug: c.slug,
      city: c.city,
      status: c.status,
      sphere_id: c.sphere_id,
      sphere_name:
        (Array.isArray(c.spheres)
          ? (c.spheres[0] as { name?: string } | null)?.name
          : (c.spheres as { name?: string } | null)?.name) ?? "",
      aliases: aliasesByCollegeId[c.id] ?? [],
    })),
    collegeRequests: (requestsResult.data ?? []) as {
      id: string
      name: string
      city: string
      contact_name: string
      contact_email: string
      contact_phone: string
      status: string
      created_at: string
    }[],
    plans: (() => {
      const plans = (plansResult.data ?? []) as {
        id: string
        title: string
        description: string
        display_order: number
        active: boolean
      }[]
      const summary = summarizePlanFeedback(plans, (feedbackResult.data ?? []) as { plan_id: string; rating: number }[])
      return plans.map((p) => ({ ...p, ...summary[p.id] }))
    })(),
    team: (teamResult.data ?? []) as { id: string; name: string; role: string; photo_url: string | null; short_bio: string; bio: string; display_order: number; active: boolean }[],
    applications: (applicationsResult.data ?? []) as {
      id: string
      full_name: string
      email: string
      phone: string
      college: string
      year: string
      skills: string
      experience: string
      portfolio: string
      motivation: string
      links: string
      resume_url: string | null
      status: string
      admin_note: string
      created_at: string
    }[],
    advertising: (adConfigResult.data as { contact_phone: string; contact_email: string } | null) ?? { contact_phone: "", contact_email: "" },
    promotionPayment: (() => {
      const v = (promoConfigResult.data?.value ?? {}) as Record<string, unknown>
      return {
        price_inr: Number(v.price_inr ?? 10),
        duration_days: Number(v.duration_days ?? 1),
        qr_image_url: typeof v.qr_image_url === "string" && v.qr_image_url ? v.qr_image_url : null,
        upi_id: typeof v.upi_id === "string" && v.upi_id ? v.upi_id : null,
        instructions: typeof v.instructions === "string" ? v.instructions : "",
      }
    })(),
    ads: (adCampaignsResult.data ?? []).map((row) => ({
      ...mapAdRow(row as Parameters<typeof mapAdRow>[0]),
      createdAt: row.created_at,
    })),
    auditLogs: (auditResult.data ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      entity_type: a.entity_type,
      details: a.details as Record<string, unknown>,
      created_at: a.created_at,
    })),
  }
}
