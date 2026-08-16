"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin, requireMember } from "@/lib/data/session"
import { requireSphereAction } from "@/lib/actions/admin"
import {
  collegeMatchScore,
  isValidEmail,
  normalizeCollegeForSlug,
  normalizeEmail,
  type ScopeFilter,
} from "@/lib/validation"
import { ASSIGNABLE_ROLES, ROLE_PERMISSION_PRESETS, type AssignableRole } from "@/lib/roles"

type ActionResult = { error: string | null }

/** True when the caller is a Sphere admin (profile role) actively in `sphereId`. */
async function isSphereAdminMember(
  member: Awaited<ReturnType<typeof requireMember>>,
  sphereId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  if (member.role !== "admin") return false
  const { data } = await supabase
    .from("user_spheres")
    .select("user_id")
    .eq("user_id", member.userId)
    .eq("sphere_id", sphereId)
    .eq("membership_status", "active")
    .maybeSingle()
  return Boolean(data)
}

async function logAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  sphereId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  details: Record<string, unknown> = {},
) {
  try {
    await supabase.from("audit_logs").insert({
      admin_id: adminId,
      sphere_id: sphereId,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      details,
    })
  } catch {
    // Auditing must never break the primary action.
  }
}

// ---------------------------------------------------------------------------
// RBAC helper — permission check (mirrors public.has_permission in SQL)
// ---------------------------------------------------------------------------

/**
 * Server-side permission gate. `permission` may be a simple string
 * (e.g. "events.create") or "resource:permission" — in the latter case the
 * resource part is only used for audit labels.
 */
export async function requirePermission(
  permission: string,
  scope?: ScopeFilter,
): Promise<{ ok: true; member: Awaited<ReturnType<typeof requireMember>> } | { ok: false; error: string }> {
  const member = await requireMember()
  if (member.role === "admin" || member.role === "super_admin") return { ok: true, member }

  const supabase = await createClient()
  // A user may hold several assignments in one Sphere (unique per role); only
  // the most recent is consulted for a permission decision.
  const { data: assignment, error } = await supabase
    .from("role_assignments")
    .select("role, scope")
    .eq("user_id", member.userId)
    .eq("sphere_id", member.sphereId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !assignment) return { ok: false, error: "You don't have permission to do that." }

  // sphere_admin role assignment = full administrative access in the Sphere.
  if (assignment.role === "sphere_admin") return { ok: true, member }

  const perms: string[] = Array.isArray(assignment.scope?.permissions)
    ? (assignment.scope.permissions as string[])
    : []
  if (!perms.includes(permission)) return { ok: false, error: "You don't have permission to do that." }

  if (scope) {
    const s = assignment.scope ?? {}
    if (scope.degree && s.degree !== scope.degree) return { ok: false, error: "This is outside your assigned scope." }
    if (scope.year && s.year !== scope.year) return { ok: false, error: "This is outside your assigned scope." }
    if (scope.branch && s.branch !== scope.branch) return { ok: false, error: "This is outside your assigned scope." }
  }

  return { ok: true, member }
}

// ---------------------------------------------------------------------------
// College directory
// ---------------------------------------------------------------------------

export type CollegeSearchResult = {
  id: string
  name: string
  short_name: string
  city: string
  slug: string
}

export type CollegeRow = CollegeSearchResult & {
  status: string
  sphere_id: string | null
  sphere_name: string
  aliases: string[]
}

function parseAliases(raw: string): string[] {
  return raw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    .slice(0, 20)
}

/**
 * Creates a college and its matching Sphere (one college == one Sphere) and
 * attaches the alias list. Shared by the admin create form and the
 * "approve request → add to directory" flow so both stay consistent.
 */
async function createCollegeWithSphere(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  input: { name: string; shortName?: string; city?: string; state?: string; country?: string; description?: string; aliases?: string[]; logoUrl?: string | null; coverUrl?: string | null },
): Promise<{ error: string | null }> {
  const name = input.name.trim()
  const slug = normalizeCollegeForSlug(name)
  if (name.length < 2 || name.length > 120) return { error: "College name must be 2–120 characters." }
  if (!slug) return { error: "College name must include letters or numbers." }

  // Refuse silently colliding on the unique slug — a very similar name almost
  // certainly means the college already exists.
  const { data: existing } = await supabase.from("colleges").select("id").eq("slug", slug).maybeSingle()
  if (existing) return { error: "A college with this name (or a very similar one) already exists in the directory." }

  const { data: college, error } = await supabase
    .from("colleges")
    .insert({
      name,
      short_name: input.shortName?.trim() ?? "",
      slug,
      city: input.city?.trim() ?? "",
      state: input.state?.trim() ?? "",
      country: input.country?.trim() || "India",
      description: input.description?.trim() ?? "",
      status: "active",
      logo_url: input.logoUrl || null,
      cover_url: input.coverUrl || null,
      created_by: adminId,
    })
    .select("id, slug, name")
    .single()
  if (error || !college) return { error: "Couldn't create the college." }

  // One college == one Sphere. Create the Sphere eagerly so admins can
  // manage it before the first member signs up.
  const { data: sphere } = await supabase
    .from("spheres")
    .insert({ name: college.name, slug: college.slug })
    .select("id")
    .single()
  if (sphere) {
    await supabase.from("colleges").update({ sphere_id: sphere.id }).eq("id", college.id)
  }

  if (input.aliases && input.aliases.length > 0) {
    await supabase.from("college_aliases").insert(input.aliases.map((alias) => ({ college_id: college.id, alias })))
  }

  return { error: null }
}

export async function upsertCollegeAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  if (admin.role !== "super_admin") return { error: "Only super admins can manage colleges." }

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const shortName = String(formData.get("shortName") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const state = String(formData.get("state") ?? "").trim()
  const country = String(formData.get("country") ?? "India").trim() || "India"
  const description = String(formData.get("description") ?? "").trim()
  const aliases = parseAliases(String(formData.get("aliases") ?? ""))
  const status = String(formData.get("status") ?? "active") === "active" ? "active" : "inactive"
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null
  const coverUrl = String(formData.get("coverUrl") ?? "").trim() || null

  if (name.length < 2 || name.length > 120) return { error: "College name must be 2–120 characters." }
  const slug = normalizeCollegeForSlug(name)
  if (!slug) return { error: "College name must include letters or numbers." }

  if (id) {
    // Edit: keep the original slug + Sphere stable, replace aliases wholesale
    // (covers add / edit / delete in one operation).
    const { data: existing } = await supabase.from("colleges").select("id").eq("id", id).maybeSingle()
    if (!existing) return { error: "College not found." }

    const { error } = await supabase
      .from("colleges")
      .update({ name, short_name: shortName, city, state, country, description, status, logo_url: logoUrl, cover_url: coverUrl })
      .eq("id", id)
    if (error) return { error: "Couldn't update the college." }

    await supabase.from("college_aliases").delete().eq("college_id", id)
    if (aliases.length > 0) {
      const { error: aliasError } = await supabase
        .from("college_aliases")
        .insert(aliases.map((alias) => ({ college_id: id, alias })))
      if (aliasError) return { error: "Couldn't save the aliases." }
    }
  } else {
    const result = await createCollegeWithSphere(supabase, admin.userId, {
      name,
      shortName,
      city,
      state,
      country,
      description,
      aliases,
      logoUrl,
      coverUrl,
    })
    if (result.error) return result
  }

  await logAudit(supabase, admin.userId, null, id ? "college_updated" : "college_created", "college", id || undefined, { name, slug, status })
  revalidatePath("/admin")
  revalidatePath("/auth/sign-up")
  return { error: null }
}

/** One-click activate/deactivate from the admin directory. */
export async function setCollegeStatusAction(collegeId: string, status: "active" | "inactive"): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  if (admin.role !== "super_admin") return { error: "Only super admins can manage colleges." }

  const { data: college } = await supabase.from("colleges").select("id, name").eq("id", collegeId).maybeSingle()
  if (!college) return { error: "College not found." }

  const { error } = await supabase.from("colleges").update({ status }).eq("id", collegeId)
  if (error) return { error: "Couldn't update the college status." }

  await logAudit(supabase, admin.userId, null, `college_${status}`, "college", collegeId, { name: college.name })
  revalidatePath("/admin")
  revalidatePath("/auth/sign-up")
  return { error: null }
}

/**
 * Approves a college request by adding the college (and its Sphere) to the
 * directory, then marking the request approved.
 */
export async function createCollegeFromRequestAction(requestId: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  if (admin.role !== "super_admin") return { error: "Only super admins can manage colleges." }

  const { data: request } = await supabase
    .from("college_requests")
    .select("id, name, city, status")
    .eq("id", requestId)
    .maybeSingle()
  if (!request) return { error: "Request not found." }
  if (request.status !== "pending" && request.status !== "approved") return { error: "This request can't be added to the directory." }

  const result = await createCollegeWithSphere(supabase, admin.userId, {
    name: request.name,
    city: request.city,
  })
  if (result.error) return result

  const { error } = await supabase.from("college_requests").update({ status: "approved" }).eq("id", requestId)
  if (error) return { error: "College added, but couldn't mark the request approved." }

  await logAudit(supabase, admin.userId, null, "college_created_from_request", "college_request", requestId, { name: request.name })
  revalidatePath("/admin")
  revalidatePath("/auth/sign-up")
  return { error: null }
}

export async function searchCollegesAction(query: string): Promise<{ colleges: CollegeSearchResult[] }> {
  const supabase = await createClient()
  const q = query.trim()
  if (!q) return { colleges: [] }

  const [{ data: colleges }, { data: aliasRows }] = await Promise.all([
    supabase
      .from("colleges")
      .select("id, name, short_name, slug, city, status")
      .eq("status", "active")
      .order("name")
      .limit(300),
    supabase.from("college_aliases").select("college_id, alias"),
  ])

  const aliasesByCollegeId: Record<string, string[]> = {}
  for (const row of aliasRows ?? []) {
    ;(aliasesByCollegeId[row.college_id] ??= []).push(row.alias)
  }

  // SQL filters active colleges; keep a JS-side check too so a stale row can
  // never leak into the signup autocomplete (defense in depth).
  const active = (colleges ?? []).filter((c) => c.status === "active")
  const matched = active
    .map((c) => ({ c, score: collegeMatchScore(c, aliasesByCollegeId[c.id] ?? [], q) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, 8)
    .map((m) => m.c)

  return {
    colleges: matched.map(({ id, name, short_name, city, slug }) => ({ id, name, short_name, city, slug })),
  }
}

export async function reviewCollegeRequestAction(requestId: string, status: "approved" | "rejected"): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  if (admin.role !== "super_admin") return { error: "Only super admins can review college requests." }

  const { error } = await supabase.from("college_requests").update({ status }).eq("id", requestId)
  if (error) return { error: "Couldn't update the request." }

  await logAudit(supabase, admin.userId, null, `college_request_${status}`, "college_request", requestId)
  revalidatePath("/admin")
  return { error: null }
}

export async function findMemberByHandleAction(handle: string, sphereId?: string): Promise<{ userId: string | null }> {
  const member = await requireMember()
  const supabase = await createClient()
  const clean = handle.trim().startsWith("@") ? handle.trim() : `@${handle.trim()}`
  // The caller must have access to the Sphere before resolving a handle inside
  // it — a handle is only ever resolved within an authorized Sphere context.
  const targetSphere = sphereId ?? member.sphereId
  if (!targetSphere) return { userId: null }
  if (sphereId) {
    const gate = await requireSphereAction(sphereId)
    if (!gate.ok) return { userId: null }
  }
  const { data } = await supabase
    .from("user_spheres")
    .select("user_id")
    .eq("anonymous_handle", clean)
    .eq("sphere_id", targetSphere)
    .eq("membership_status", "active")
    .maybeSingle()
  return { userId: data?.user_id ?? null }
}

export async function submitCollegeRequestAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const contactName = String(formData.get("contactName") ?? "").trim()
  const contactEmail = normalizeEmail(String(formData.get("contactEmail") ?? ""))
  const contactPhone = String(formData.get("contactPhone") ?? "").trim()
  const note = String(formData.get("note") ?? "").trim()

  if (name.length < 2 || name.length > 120) return { error: "Please enter the college name (2–120 characters)." }
  if (contactEmail && !isValidEmail(contactEmail)) return { error: "Please enter a valid email." }

  const { error } = await supabase.from("college_requests").insert({
    name,
    city,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    note,
  })
  if (error) return { error: "Couldn't submit your request. Try again." }
  return { error: null }
}

// ---------------------------------------------------------------------------
// Plans ("Help shape what's coming next") + feedback
// ---------------------------------------------------------------------------

export async function upsertPlanAction(formData: FormData): Promise<ActionResult> {
  const gate = await requirePermission("feedback.manage")
  if (!gate.ok) return { error: gate.error }
  const supabase = await createClient()

  const id = String(formData.get("id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const displayOrder = Number.parseInt(String(formData.get("displayOrder") ?? "0"), 10) || 0
  const active = String(formData.get("active") ?? "on") === "on"

  if (title.length < 1 || title.length > 160) return { error: "Title must be 1–160 characters." }

  const payload = { title, description, display_order: displayOrder, active }
  let planId = id
  if (id) {
    const { error } = await supabase.from("platform_plans").update(payload).eq("id", id)
    if (error) return { error: "Couldn't update the plan." }
  } else {
    const { data, error } = await supabase.from("platform_plans").insert(payload).select("id").single()
    if (error || !data) return { error: "Couldn't create the plan." }
    planId = data.id
  }

  // Publishing (or re-publishing) a plan notifies every active member. The
  // RPC is idempotent per plan — editing an already-published plan never
  // duplicates notifications.
  if (active && planId) {
    await supabase.rpc("notify_plan_published", { p_plan_id: planId })
  }

  revalidatePath("/")
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/roadmap")
  revalidatePath("/admin")
  return { error: null }
}

export async function deletePlanAction(planId: string): Promise<ActionResult> {
  const gate = await requirePermission("feedback.manage")
  if (!gate.ok) return { error: gate.error }
  const supabase = await createClient()

  const { error } = await supabase.from("platform_plans").delete().eq("id", planId)
  if (error) return { error: "Couldn't delete the plan." }

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/dashboard/roadmap")
  return { error: null }
}

export async function submitPlanFeedbackAction(
  planId: string,
  rating: number,
  comment: string,
): Promise<ActionResult> {
  const member = await requireMember()
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Pick a rating from 1 to 5." }
  const cleanComment = comment.trim().slice(0, 600)

  const supabase = await createClient()
  // Only published plans accept feedback. Drafts / deleted plans are invisible
  // to members (RLS only exposes active rows) and must never be ratable — this
  // is the server-side backstop for the UI + RLS.
  const { data: plan } = await supabase
    .from("platform_plans")
    .select("id")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle()
  if (!plan) return { error: "This plan isn't accepting feedback right now." }

  const { error } = await supabase.from("plan_feedback").upsert(
    { plan_id: planId, user_id: member.userId, rating, comment: cleanComment, updated_at: new Date().toISOString() },
    { onConflict: "plan_id,user_id" },
  )
  if (error) return { error: "Couldn't save your feedback." }

  revalidatePath("/")
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/roadmap")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Team members (About page)
// ---------------------------------------------------------------------------

export async function upsertTeamMemberAction(formData: FormData): Promise<ActionResult> {
  const gate = await requirePermission("team.manage")
  if (!gate.ok) return { error: gate.error }
  const supabase = await createClient()

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const role = String(formData.get("role") ?? "Member")
  const photoUrl = String(formData.get("photoUrl") ?? "").trim() || null
  const shortBio = String(formData.get("shortBio") ?? "").trim()
  const bio = String(formData.get("bio") ?? "").trim()
  const displayOrder = Number.parseInt(String(formData.get("displayOrder") ?? "0"), 10) || 0
  const active = String(formData.get("active") ?? "on") === "on"

  if (name.length < 1 || name.length > 120) return { error: "Name must be 1–120 characters." }
  if (!["Founder", "Co-Founder", "Member", "Advisor"].includes(role)) return { error: "Invalid role." }

  const payload = { name, role, photo_url: photoUrl, short_bio: shortBio, bio, display_order: displayOrder, active }
  if (id) {
    const { error } = await supabase.from("team_members").update(payload).eq("id", id)
    if (error) return { error: "Couldn't update the team member." }
  } else {
    const { error } = await supabase.from("team_members").insert(payload)
    if (error) return { error: "Couldn't add the team member." }
  }

  revalidatePath("/about")
  revalidatePath("/admin")
  return { error: null }
}

export async function deleteTeamMemberAction(memberId: string): Promise<ActionResult> {
  const gate = await requirePermission("team.manage")
  if (!gate.ok) return { error: gate.error }
  const supabase = await createClient()

  const { error } = await supabase.from("team_members").delete().eq("id", memberId)
  if (error) return { error: "Couldn't delete the team member." }

  revalidatePath("/about")
  revalidatePath("/admin")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Work with us
// ---------------------------------------------------------------------------

export async function submitWorkWithUsAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const fullName = String(formData.get("fullName") ?? "").trim()
  const email = normalizeEmail(String(formData.get("email") ?? ""))
  const phone = String(formData.get("phone") ?? "").trim()
  const college = String(formData.get("college") ?? "").trim()
  const year = String(formData.get("year") ?? "").trim()
  const skills = String(formData.get("skills") ?? "").trim()
  const experience = String(formData.get("experience") ?? "").trim()
  const portfolio = String(formData.get("portfolio") ?? "").trim()
  const motivation = String(formData.get("motivation") ?? "").trim()
  const links = String(formData.get("links") ?? "").trim()
  const resumeUrl = String(formData.get("resumeUrl") ?? "").trim() || null

  if (fullName.length < 2) return { error: "Please enter your full name." }
  if (!isValidEmail(email)) return { error: "Please enter a valid email." }
  if (motivation.length < 10) return { error: "Tell us a bit more about why you want to work with UreSphere (min 10 characters)." }

  const { error } = await supabase.from("work_with_us_applications").insert({
    full_name: fullName,
    email,
    phone,
    college,
    year,
    skills,
    experience,
    portfolio,
    motivation,
    links,
    resume_url: resumeUrl,
  })
  if (error) return { error: "Couldn't submit your application. Try again." }
  return { error: null }
}

export async function updateApplicationStatusAction(
  applicationId: string,
  status: "new" | "reviewed" | "shortlisted" | "rejected",
  adminNote: string,
): Promise<ActionResult> {
  const gate = await requirePermission("work_with_us.manage")
  if (!gate.ok) return { error: gate.error }
  const supabase = await createClient()

  const { error } = await supabase
    .from("work_with_us_applications")
    .update({ status, admin_note: adminNote.trim().slice(0, 500) })
    .eq("id", applicationId)
  if (error) return { error: "Couldn't update the application." }

  revalidatePath("/admin")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Advertising contact config
// ---------------------------------------------------------------------------

export async function updateAdvertisingConfigAction(formData: FormData): Promise<ActionResult> {
  const gate = await requirePermission("advertising.manage")
  if (!gate.ok) return { error: gate.error }
  const supabase = await createClient()

  const phone = String(formData.get("phone") ?? "").trim()
  const email = normalizeEmail(String(formData.get("email") ?? ""))

  const { error } = await supabase
    .from("advertising_config")
    .update({ contact_phone: phone, contact_email: email, updated_at: new Date().toISOString() })
    .eq("id", 1)
  if (error) return { error: "Couldn't update the contact details." }

  revalidatePath("/about")
  revalidatePath("/admin")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Event questions ("Ask about this event")
// ---------------------------------------------------------------------------

export async function askEventQuestionAction(eventId: string, question: string): Promise<ActionResult> {
  const member = await requireMember()
  const clean = question.trim()
  if (clean.length < 1 || clean.length > 500) return { error: "Question must be 1–500 characters." }

  const supabase = await createClient()
  const { data: event } = await supabase.from("events").select("id, sphere_id").eq("id", eventId).maybeSingle()
  if (!event || event.sphere_id !== member.sphereId) return { error: "Event not found in your Sphere." }

  const { error } = await supabase.from("event_questions").insert({
    event_id: eventId,
    user_id: member.userId,
    question: clean,
  })
  if (error) return { error: "Couldn't submit your question." }

  revalidatePath("/dashboard/events")
  return { error: null }
}

export async function answerEventQuestionAction(questionId: string, answer: string): Promise<ActionResult> {
  const member = await requireMember()
  const clean = answer.trim()
  if (clean.length < 1 || clean.length > 500) return { error: "Answer must be 1–500 characters." }

  const supabase = await createClient()
  const { data: question } = await supabase
    .from("event_questions")
    .select("id, event_id, events(sphere_id)")
    .eq("id", questionId)
    .maybeSingle()
  if (!question) return { error: "Question not found." }

  const sphereId = Array.isArray(question.events)
    ? (question.events[0] as { sphere_id?: string } | null)?.sphere_id
    : (question.events as { sphere_id?: string } | null)?.sphere_id
  if (!sphereId || sphereId !== member.sphereId) return { error: "Question not found in your Sphere." }

  const { error } = await supabase
    .from("event_questions")
    .update({ answer: clean, answered_by: member.userId, answered_at: new Date().toISOString() })
    .eq("id", questionId)
  if (error) return { error: "Couldn't save your answer." }

  revalidatePath("/dashboard/events")
  revalidatePath("/admin")
  return { error: null }
}

// ---------------------------------------------------------------------------
// UreSphere Shop (admin-managed products)
// ---------------------------------------------------------------------------

const SHOP_CATEGORIES = ["food", "stationery", "essentials", "other"] as const

export async function upsertShopProductAction(formData: FormData): Promise<ActionResult> {
  const gate = await requirePermission("marketplace.review")
  if (!gate.ok) return { error: gate.error }
  const supabase = await createClient()

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const category = String(formData.get("category") ?? "essentials")
  const priceRaw = String(formData.get("price") ?? "").trim()
  const imageUrlsRaw = String(formData.get("imageUrls") ?? "[]")
  const availability = String(formData.get("availability") ?? "in_stock")
  const deliveryInfo = String(formData.get("deliveryInfo") ?? "").trim()
  const paymentInfo = String(formData.get("paymentInfo") ?? "").trim()
  const active = String(formData.get("active") ?? "on") === "on"

  if (name.length < 1 || name.length > 120) return { error: "Product name must be 1–120 characters." }
  if (!SHOP_CATEGORIES.includes(category as (typeof SHOP_CATEGORIES)[number])) return { error: "Invalid category." }
  const price = Number.parseFloat(priceRaw)
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a valid non-negative price." }

  let imageUrls: string[] = []
  try {
    const parsed = JSON.parse(imageUrlsRaw)
    if (Array.isArray(parsed)) imageUrls = parsed.filter((u) => typeof u === "string").slice(0, 6)
  } catch {
    imageUrls = []
  }

  const payload = {
    name,
    description,
    category,
    price_cents: Math.round(price * 100),
    image_urls: imageUrls,
    availability,
    delivery_info: deliveryInfo,
    payment_info: paymentInfo,
    active,
  }

  if (id) {
    const { error } = await supabase.from("shop_products").update(payload).eq("id", id)
    if (error) return { error: "Couldn't update the product." }
  } else {
    const { error } = await supabase.from("shop_products").insert({
      ...payload,
      sphere_id: gate.member.sphereId,
      created_by: gate.member.userId,
    })
    if (error) return { error: "Couldn't create the product." }
  }

  revalidatePath("/dashboard/marketplace")
  revalidatePath("/admin")
  return { error: null }
}

export async function deleteShopProductAction(productId: string): Promise<ActionResult> {
  const gate = await requirePermission("marketplace.review")
  if (!gate.ok) return { error: gate.error }
  const supabase = await createClient()

  const { data: product } = await supabase.from("shop_products").select("id, sphere_id").eq("id", productId).maybeSingle()
  if (!product || product.sphere_id !== gate.member.sphereId) return { error: "Product not found in your Sphere." }

  const { error } = await supabase.from("shop_products").delete().eq("id", productId)
  if (error) return { error: "Couldn't delete the product." }

  revalidatePath("/dashboard/marketplace")
  revalidatePath("/admin")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Marketplace orders (buy-now requests; fee/settlement stored, no gateway)
// ---------------------------------------------------------------------------

export async function createOrderAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const listingId = String(formData.get("listingId") ?? "")
  const buyerName = String(formData.get("buyerName") ?? "").trim()
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const deliveryDate = String(formData.get("deliveryDate") ?? "") || null

  if (!listingId) return { error: "Missing listing." }
  if (buyerName.length < 2) return { error: "Please enter your name." }
  if (buyerPhone.length < 7) return { error: "Please enter a valid phone number." }
  if (address.length < 5) return { error: "Please enter a delivery address." }

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id, sphere_id, seller_id, price_cents")
    .eq("id", listingId)
    .eq("sphere_id", member.sphereId)
    .eq("status", "active")
    .maybeSingle()
  if (!listing) return { error: "Listing not found in your Sphere." }
  if (listing.seller_id === member.userId) return { error: "You can't buy your own listing." }

  // Platform fee is modeled (5%) and stored for display — no payment gateway.
  const fee = Math.round(listing.price_cents * 0.05)
  const settlement = listing.price_cents - fee

  const { error } = await supabase.from("marketplace_orders").insert({
    listing_id: listingId,
    buyer_id: member.userId,
    seller_id: listing.seller_id,
    sphere_id: listing.sphere_id,
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    address,
    delivery_date: deliveryDate,
    price_cents: listing.price_cents,
    fee_cents: fee,
    settlement_cents: settlement,
    status: "pending",
  })
  if (error) return { error: "Couldn't place your order." }

  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

export async function updateOrderStatusAction(
  orderId: string,
  status: "pending" | "accepted" | "in_progress" | "delivered" | "cancelled",
): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: order } = await supabase
    .from("marketplace_orders")
    .select("id, seller_id, sphere_id")
    .eq("id", orderId)
    .maybeSingle()
  if (!order) return { error: "Order not found." }

  // The seller updates their own order from the marketplace UI…
  if (order.seller_id === member.userId) {
    const { error } = await supabase.from("marketplace_orders").update({ status }).eq("id", orderId)
    if (error) return { error: "Couldn't update the order." }
    revalidatePath("/dashboard/marketplace")
    return { error: null }
  }

  // …otherwise this is a Sphere-admin action (marketplace_moderator or above).
  const gate = await requireSphereAction(order.sphere_id, "marketplace.manage_orders")
  if (!gate.ok) return gate

  const { error } = await supabase.from("marketplace_orders").update({ status }).eq("id", orderId)
  if (error) return { error: "Couldn't update the order." }

  revalidatePath("/dashboard/marketplace")
  revalidatePath("/admin")
  revalidatePath(`/admin/spheres/${order.sphere_id}`)
  return { error: null }
}

// ---------------------------------------------------------------------------
// RBAC — role assignment management (admin)
// ---------------------------------------------------------------------------

export async function assignRoleAction(formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const targetUserId = String(formData.get("userId") ?? "")
  const sphereId = String(formData.get("sphereId") ?? "")
  const role = String(formData.get("role") ?? "")
  const permissionsRaw = String(formData.get("permissions") ?? "")
  const degree = String(formData.get("degree") ?? "").trim()
  const year = String(formData.get("year") ?? "").trim()
  const branch = String(formData.get("branch") ?? "").trim()

  if (!sphereId) return { error: "Missing Sphere." }
  if (!ASSIGNABLE_ROLES.includes(role as AssignableRole)) return { error: "Invalid role." }
  if (!targetUserId) return { error: "Select a member." }

  // Only super admins or Sphere administrators may assign roles. Scoped
  // managers can never escalate themselves or others.
  if (member.role !== "super_admin") {
    const gate = await requireSphereAction(sphereId)
    if (!gate.ok) return gate
    const isAdmin = member.role === "admin" && (await isSphereAdminMember(member, sphereId, supabase))
    const { data: own } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("user_id", member.userId)
      .eq("sphere_id", sphereId)
      .eq("role", "sphere_admin")
      .maybeSingle()
    if (!isAdmin && !own) return { error: "Only Sphere administrators can assign roles." }
  }

  const permissions = permissionsRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  const fallback = ROLE_PERMISSION_PRESETS[role as AssignableRole]
  const effectivePermissions = permissions.length > 0 ? permissions : fallback

  const scope: Record<string, unknown> = { permissions: effectivePermissions }
  if (degree) scope.degree = degree
  if (year) scope.year = year
  if (branch) scope.branch = branch

  const { error } = await supabase.from("role_assignments").upsert(
    {
      user_id: targetUserId,
      sphere_id: sphereId,
      role,
      scope,
      granted_by: member.userId,
    },
    { onConflict: "user_id,sphere_id,role" },
  )
  if (error) return { error: "Couldn't assign the role." }

  await logAudit(supabase, member.userId, sphereId, `role_assigned_${role}`, "role_assignment", targetUserId, { permissions: effectivePermissions, scope })
  revalidatePath("/admin")
  revalidatePath(`/admin/spheres/${sphereId}`)
  revalidatePath(`/admin/spheres/${sphereId}/roles`)
  return { error: null }
}

export async function removeRoleAction(assignmentId: string): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: assignment } = await supabase
    .from("role_assignments")
    .select("id, sphere_id")
    .eq("id", assignmentId)
    .maybeSingle()
  if (!assignment) return { error: "Assignment not found." }

  if (member.role !== "super_admin") {
    const gate = await requireSphereAction(assignment.sphere_id)
    if (!gate.ok) return gate
    const isAdmin = member.role === "admin" && (await isSphereAdminMember(member, assignment.sphere_id, supabase))
    const { data: own } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("user_id", member.userId)
      .eq("sphere_id", assignment.sphere_id)
      .eq("role", "sphere_admin")
      .maybeSingle()
    if (!isAdmin && !own) return { error: "Only Sphere administrators can remove roles." }
  }

  const { error } = await supabase.from("role_assignments").delete().eq("id", assignmentId)
  if (error) return { error: "Couldn't remove the role." }

  await logAudit(supabase, member.userId, assignment.sphere_id, "role_removed", "role_assignment", assignmentId)
  revalidatePath("/admin")
  revalidatePath(`/admin/spheres/${assignment.sphere_id}`)
  revalidatePath(`/admin/spheres/${assignment.sphere_id}/roles`)
  return { error: null }
}

// ---------------------------------------------------------------------------
// Promotion payment (QR/UTR) — user side
// ---------------------------------------------------------------------------

export async function submitPromotionPaymentAction(promotionId: string, utr: string): Promise<ActionResult> {
  const member = await requireMember()
  const cleanUtr = utr.trim()
  if (cleanUtr.length < 4 || cleanUtr.length > 40) return { error: "Enter the UTR/reference number (4–40 characters)." }

  const supabase = await createClient()
  const { data: promo } = await supabase
    .from("promotions")
    .select("id, user_id, fee_status")
    .eq("id", promotionId)
    .eq("user_id", member.userId)
    .maybeSingle()
  if (!promo) return { error: "Promotion not found." }

  const { error } = await supabase
    .from("promotions")
    .update({ utr: cleanUtr, fee_status: "payment_pending", paid_at: new Date().toISOString() })
    .eq("id", promotionId)
  if (error) return { error: "Couldn't record your payment." }

  revalidatePath("/dashboard/promotions")
  return { error: null }
}
