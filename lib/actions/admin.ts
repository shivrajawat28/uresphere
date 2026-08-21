"use server"

import { revalidatePath } from "next/cache"
import { del } from "@vercel/blob"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin, requireMember, type CurrentMember } from "@/lib/data/session"
import { scopeCovers, type ScopeFilter } from "@/lib/validation"

type ActionResult = { error: string | null }

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

type Gate = { ok: true; member: CurrentMember } | { ok: false; error: string }

/**
 * Server-side authorization gate for a sphere-scoped admin action.
 * The caller must be able to administer `sphereId` AND (when a permission is
 * given) hold that permission there:
 * - super_admin → any Sphere, any permission;
 * - Sphere admin (profile role, active member of the Sphere) → full Sphere;
 * - `sphere_admin` role assignment → full Sphere;
 * - scoped manager → only if their assignment grants `permission`, and the
 *   optional `scope` (degree/year/branch) is inside their assigned scope.
 */
export async function requireSphereAction(
  sphereId: string,
  permission?: string,
  scope?: ScopeFilter,
): Promise<Gate> {
  const member = await requireMember()
  if (member.role === "super_admin") return { ok: true, member }

  const supabase = await createClient()

  if (member.role === "admin") {
    const { data: membership } = await supabase
      .from("user_spheres")
      .select("user_id")
      .eq("user_id", member.userId)
      .eq("sphere_id", sphereId)
      .eq("membership_status", "active")
      .maybeSingle()
    if (membership) return { ok: true, member }
  }

  // A user may hold several role assignments in one Sphere (unique per role).
  // Mirror public.has_permission(): ANY assignment granting the permission and
  // covering the target scope authorizes the action — never just one row. The
  // previous .maybeSingle() here failed outright for multi-role managers
  // (PostgREST errors when the query returns >1 row), so a legitimate scoped
  // manager holding e.g. academic_manager + listing_manager could never upload
  // academic content — "You don't have access to that Sphere." on every action.
  const { data: assignments } = await supabase
    .from("role_assignments")
    .select("role, scope")
    .eq("user_id", member.userId)
    .eq("sphere_id", sphereId)
  if (!assignments || assignments.length === 0) return { ok: false, error: "You don't have access to that Sphere." }

  if (assignments.some((a) => a.role === "sphere_admin")) return { ok: true, member }
  if (!permission) return { ok: false, error: "You don't have permission to do that." }

  const holders = assignments.filter((a) =>
    Array.isArray(a.scope?.permissions) && (a.scope.permissions as string[]).includes(permission),
  )
  if (holders.length === 0) return { ok: false, error: "You don't have permission to do that." }

  if (scope && !holders.some((a) => scopeCovers(a.scope as ScopeFilter | undefined, scope))) {
    return { ok: false, error: "This is outside your assigned scope." }
  }
  return { ok: true, member }
}

function spherePaths(sphereId: string): string[] {
  return ["/admin", `/admin/spheres/${sphereId}`]
}


export async function updateDegreeAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const sphereId = String(formData.get("sphereId") ?? "")
  const oldDegree = String(formData.get("oldDegree") ?? "").trim()
  const newDegree = String(formData.get("newDegree") ?? "").trim()
  if (!sphereId || !oldDegree || !newDegree) return { error: "Missing required fields." }

  const gate = await requireSphereAction(sphereId, "academic.update", { degree: oldDegree, year: "", branch: "" })
  if (!gate.ok) return gate
  const gateNew = await requireSphereAction(sphereId, "academic.update", { degree: newDegree, year: "", branch: "" })
  if (!gateNew.ok) return gateNew

  const { error } = await supabase.from("subjects").update({ degree: newDegree }).eq("sphere_id", sphereId).eq("degree", oldDegree)
  if (error) return { error: "Couldn't update degree." }

  await logAudit(supabase, gate.member.userId, sphereId, "degree_updated", "academic", undefined, { oldDegree, newDegree })
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function updateYearAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const sphereId = String(formData.get("sphereId") ?? "")
  const degree = String(formData.get("degree") ?? "").trim()
  const oldYear = String(formData.get("oldYear") ?? "").trim()
  const newYear = String(formData.get("newYear") ?? "").trim()
  if (!sphereId || !degree || !oldYear || !newYear) return { error: "Missing required fields." }

  const gate = await requireSphereAction(sphereId, "academic.update", { degree, year: oldYear, branch: "" })
  if (!gate.ok) return gate
  const gateNew = await requireSphereAction(sphereId, "academic.update", { degree, year: newYear, branch: "" })
  if (!gateNew.ok) return gateNew

  const { error } = await supabase.from("subjects").update({ year: newYear }).eq("sphere_id", sphereId).eq("degree", degree).eq("year", oldYear)
  if (error) return { error: "Couldn't update year." }

  await logAudit(supabase, gate.member.userId, sphereId, "year_updated", "academic", undefined, { degree, oldYear, newYear })
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function updateBranchAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const sphereId = String(formData.get("sphereId") ?? "")
  const degree = String(formData.get("degree") ?? "").trim()
  const year = String(formData.get("year") ?? "").trim()
  const oldBranch = String(formData.get("oldBranch") ?? "").trim()
  const newBranch = String(formData.get("newBranch") ?? "").trim()
  if (!sphereId || !degree || !year || !oldBranch || !newBranch) return { error: "Missing required fields." }

  const gate = await requireSphereAction(sphereId, "academic.update", { degree, year, branch: oldBranch })
  if (!gate.ok) return gate
  const gateNew = await requireSphereAction(sphereId, "academic.update", { degree, year, branch: newBranch })
  if (!gateNew.ok) return gateNew

  const { error } = await supabase.from("subjects").update({ branch: newBranch }).eq("sphere_id", sphereId).eq("degree", degree).eq("year", year).eq("branch", oldBranch)
  if (error) return { error: "Couldn't update branch." }

  await logAudit(supabase, gate.member.userId, sphereId, "branch_updated", "academic", undefined, { degree, year, oldBranch, newBranch })
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function updateUnitAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  if (!id || !name) return { error: "Unit ID and name are required." }

  const { data: unit } = await supabase.from("academic_units").select("id, sphere_id, subject_id").eq("id", id).maybeSingle()
  if (!unit) return { error: "Unit not found." }

  const { data: subject } = await supabase.from("subjects").select("id, degree, year, branch").eq("id", unit.subject_id).maybeSingle()
  const gate = await requireSphereAction(unit.sphere_id, "academic.update", { degree: subject?.degree, year: subject?.year, branch: subject?.branch })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_units").update({ name }).eq("id", id)
  if (error) return { error: "Couldn't update unit." }

  await logAudit(supabase, gate.member.userId, unit.sphere_id, "unit_updated", "unit", id)
  for (const p of spherePaths(unit.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function createChapterAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const unitId = String(formData.get("unitId") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  if (!unitId || name.length < 1) return { error: "Unit ID and chapter name are required." }

  const { data: unit } = await supabase.from("academic_units").select("id, sphere_id, subject_id").eq("id", unitId).maybeSingle()
  if (!unit) return { error: "Unit not found." }
  
  const { data: subject } = await supabase.from("subjects").select("id, degree, year, branch").eq("id", unit.subject_id).maybeSingle()
  const gate = await requireSphereAction(unit.sphere_id, "academic.create", { degree: subject?.degree, year: subject?.year, branch: subject?.branch })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_chapters").insert({ sphere_id: unit.sphere_id, unit_id: unitId, name })
  if (error) return { error: "Couldn't create the chapter." }

  await logAudit(supabase, gate.member.userId, unit.sphere_id, "chapter_created", "chapter")
  for (const p of spherePaths(unit.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function updateChapterAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  if (!id || !name) return { error: "Chapter ID and name are required." }

  const { data: chapter } = await supabase.from("academic_chapters").select("id, sphere_id, unit_id").eq("id", id).maybeSingle()
  if (!chapter) return { error: "Chapter not found." }

  const { data: unit } = await supabase.from("academic_units").select("id, subject_id").eq("id", chapter.unit_id).maybeSingle()
  const { data: subject } = unit ? await supabase.from("subjects").select("id, degree, year, branch").eq("id", unit.subject_id).maybeSingle() : { data: null }
  
  const gate = await requireSphereAction(chapter.sphere_id, "academic.update", { degree: subject?.degree, year: subject?.year, branch: subject?.branch })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_chapters").update({ name }).eq("id", id)
  if (error) return { error: "Couldn't update chapter." }

  await logAudit(supabase, gate.member.userId, chapter.sphere_id, "chapter_updated", "chapter", id)
  for (const p of spherePaths(chapter.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function deleteChapterAction(chapterId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: chapter } = await supabase.from("academic_chapters").select("id, sphere_id, unit_id").eq("id", chapterId).maybeSingle()
  if (!chapter) return { error: "Chapter not found." }

  const { data: unit } = await supabase.from("academic_units").select("id, subject_id").eq("id", chapter.unit_id).maybeSingle()
  const { data: subject } = unit ? await supabase.from("subjects").select("id, degree, year, branch").eq("id", unit.subject_id).maybeSingle() : { data: null }

  const gate = await requireSphereAction(chapter.sphere_id, "academic.delete", { degree: subject?.degree, year: subject?.year, branch: subject?.branch })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_chapters").delete().eq("id", chapterId)
  if (error) return { error: "Couldn't delete the chapter." }

  await logAudit(supabase, gate.member.userId, chapter.sphere_id, "chapter_deleted", "chapter", chapterId)
  for (const p of spherePaths(chapter.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function updateCalendarEntryAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const entryId = String(formData.get("id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const dateStr = String(formData.get("date") ?? "")
  const pdfUrl = String(formData.get("pdfUrl") ?? "").trim()
  const externalUrl = String(formData.get("externalUrl") ?? "").trim()

  if (!entryId || !title || !dateStr) return { error: "Missing required fields." }

  const { data: entry } = await supabase.from("academic_calendar").select("sphere_id, degree, year").eq("id", entryId).maybeSingle()
  if (!entry) return { error: "Entry not found." }

  const gate = await requireSphereAction(entry.sphere_id, "academic.update", { degree: entry.degree, year: entry.year, branch: "" })
  if (!gate.ok) return gate

  const { error } = await supabase
    .from("academic_calendar")
    .update({
      title,
      description: description || null,
      event_date: dateStr,
      pdf_url: pdfUrl || null,
      external_url: externalUrl || null,
    })
    .eq("id", entryId)
  if (error) return { error: "Couldn't update the calendar entry." }

  await logAudit(supabase, gate.member.userId, entry.sphere_id, "calendar_entry_updated", "calendar", entryId)
  for (const p of spherePaths(entry.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function createCalendarEntryAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const sphereId = String(formData.get("sphereId") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const dateStr = String(formData.get("date") ?? "")
  const pdfUrl = String(formData.get("pdfUrl") ?? "").trim()
  const externalUrl = String(formData.get("externalUrl") ?? "").trim()
  const degree = String(formData.get("degree") ?? "").trim()
  const year = String(formData.get("year") ?? "").trim()

  if (!sphereId || !title || !dateStr) return { error: "Title and date are required." }

  const gate = await requireSphereAction(sphereId, "academic.create", { degree, year, branch: "" })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_calendar").insert({
    sphere_id: sphereId,
    degree,
    year,
    title,
    description: description || null,
    event_date: dateStr,
    pdf_url: pdfUrl || null,
    external_url: externalUrl || null,
  })
  if (error) return { error: "Couldn't add the calendar entry." }

  await logAudit(supabase, gate.member.userId, sphereId, "calendar_entry_created", "calendar")
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  return { error: null }
}

export async function createSyllabusAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const sphereId = String(formData.get("sphereId") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const degree = String(formData.get("degree") ?? "").trim()
  const year = String(formData.get("year") ?? "").trim()
  const branch = String(formData.get("branch") ?? "").trim()
  const pdfUrl = String(formData.get("pdfUrl") ?? "").trim() || null
  const externalUrl = String(formData.get("externalUrl") ?? "").trim() || null

  if (!sphereId || title.length < 1 || !degree || !year) return { error: "Missing required fields." }

  const gate = await requireSphereAction(sphereId, "academic.create", { degree, year, branch })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_syllabuses").insert({ sphere_id: sphereId, degree, year, branch, title, pdf_url: pdfUrl, external_url: externalUrl, created_by: gate.member.userId })
  if (error) return { error: "Couldn't add the syllabus." }

  await logAudit(supabase, gate.member.userId, sphereId, "syllabus_created", "academic")
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function updateSyllabusAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const pdfUrl = String(formData.get("pdfUrl") ?? "").trim() || null
  const externalUrl = String(formData.get("externalUrl") ?? "").trim() || null

  if (!id || title.length < 1) return { error: "ID and title are required." }

  const { data: syllabus } = await supabase.from("academic_syllabuses").select("id, sphere_id, degree, year, branch").eq("id", id).maybeSingle()
  if (!syllabus) return { error: "Syllabus not found." }

  const gate = await requireSphereAction(syllabus.sphere_id, "academic.update", { degree: syllabus.degree, year: syllabus.year, branch: syllabus.branch })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_syllabuses").update({ title, pdf_url: pdfUrl, external_url: externalUrl }).eq("id", id)
  if (error) return { error: "Couldn't update the syllabus." }

  await logAudit(supabase, gate.member.userId, syllabus.sphere_id, "syllabus_updated", "academic", id)
  for (const p of spherePaths(syllabus.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function deleteSyllabusAction(syllabusId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: syllabus } = await supabase.from("academic_syllabuses").select("id, sphere_id, degree, year, branch").eq("id", syllabusId).maybeSingle()
  if (!syllabus) return { error: "Syllabus not found." }

  const gate = await requireSphereAction(syllabus.sphere_id, "academic.delete", { degree: syllabus.degree, year: syllabus.year, branch: syllabus.branch })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_syllabuses").delete().eq("id", syllabusId)
  if (error) return { error: "Couldn't delete the syllabus." }

  await logAudit(supabase, gate.member.userId, syllabus.sphere_id, "syllabus_deleted", "academic", syllabusId)
  for (const p of spherePaths(syllabus.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

// ---------------------------------------------------------------------------
// User management (administrators only)
// ---------------------------------------------------------------------------

export async function setUserStatusAction(userId: string, status: "active" | "suspended"): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()

  if (userId === admin.userId) return { error: "You can't change your own status." }

  const { data: target } = await supabase
    .from("user_spheres")
    .select("user_id, sphere_id")
    .eq("user_id", userId)
    .eq("membership_status", "active")
    .maybeSingle()
  if (!target) return { error: "No member found." }

  // Only administrators (super / sphere admin / sphere_admin assignment) may
  // suspend members; scoped managers never receive users.manage.
  const gate = await requireSphereAction(target.sphere_id, "users.manage")
  if (!gate.ok) return gate

  const { error } = await supabase.from("profiles").update({ account_status: status }).eq("id", userId)
  if (error) return { error: "Couldn't update the member." }

  await logAudit(supabase, gate.member.userId, target.sphere_id, `user_${status}`, "user", userId, { status })
  for (const p of spherePaths(target.sphere_id)) revalidatePath(p)
  return { error: null }
}

// ---------------------------------------------------------------------------
// Moderation — reports (Social)
// ---------------------------------------------------------------------------

export async function resolveReportAction(
  reportId: string,
  resolution: "resolved" | "rejected",
  note: string,
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: report } = await supabase.from("reports").select("id, sphere_id").eq("id", reportId).maybeSingle()
  if (!report) return { error: "Report not found." }

  const gate = await requireSphereAction(report.sphere_id, "social.moderate")
  if (!gate.ok) return gate

  const { error } = await supabase
    .from("reports")
    .update({
      status: resolution,
      resolution: note.trim().slice(0, 500) || null,
      resolved_by: gate.member.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reportId)
  if (error) return { error: "Couldn't update the report." }

  await logAudit(supabase, gate.member.userId, report.sphere_id, `report_${resolution}`, "report", reportId, { note })
  for (const p of spherePaths(report.sphere_id)) revalidatePath(p)
  return { error: null }
}

// ---------------------------------------------------------------------------
// Promotions (promotion_moderator)
// ---------------------------------------------------------------------------

export async function reviewPromotionAction(promotionId: string, status: "approved" | "rejected"): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: promo } = await supabase
    .from("promotions")
    .select("id, sphere_id, fee_status, user_id")
    .eq("id", promotionId)
    .maybeSingle()
  if (!promo) return { error: "Promotion not found." }

  const gate = await requireSphereAction(promo.sphere_id, "promotions.approve")
  if (!gate.ok) return gate

  // An admin can never accidentally approve a paid promotion without the
  // payment: approving requires the fee to be settled (verified or free).
  // A submitted UTR is settled at approval time.
  if (status === "approved" && promo.fee_status === "due") {
    return { error: "Payment not received — verify the UTR before approving." }
  }

  const update: Record<string, string | null> = {
    status,
    reviewed_by: gate.member.userId,
    reviewed_at: new Date().toISOString(),
  }
  if (status === "approved" && promo.fee_status === "payment_pending") update.fee_status = "paid"
  if (status === "rejected") update.fee_status = promo.fee_status === "payment_pending" ? "due" : promo.fee_status

  const { error } = await supabase.from("promotions").update(update).eq("id", promotionId)
  if (error) return { error: "Couldn't review the promotion." }

  await logAudit(supabase, gate.member.userId, promo.sphere_id, `promotion_${status}`, "promotion", promotionId)
  await supabase.rpc("notify_user", {
    p_user_id: promo.user_id,
    p_type: status === "approved" ? "promotion_approved" : "promotion_rejected",
    p_title: status === "approved" ? "Promotion approved" : "Promotion rejected",
    p_body:
      status === "approved"
        ? "Your promotion is live in your Sphere."
        : "Your promotion was rejected. You can submit a new one.",
    p_link: "/dashboard/promotions",
  })
  for (const p of spherePaths(promo.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/promotions")
  revalidatePath("/dashboard/promotions/admin")
  return { error: null }
}

export async function updateEventAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const id = String(formData.get("id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const date = String(formData.get("date") ?? "")
  const time = String(formData.get("time") ?? "") || null
  const venue = String(formData.get("venue") ?? "").trim()
  const organizer = String(formData.get("organizer") ?? "").trim()
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null

  if (!id) return { error: "Missing event." }
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1–120 characters." }
  if (!date) return { error: "Pick a date." }

  const { data: event } = await supabase.from("events").select("id, sphere_id").eq("id", id).maybeSingle()
  if (!event) return { error: "Event not found." }

  const gate = await requireSphereAction(event.sphere_id, "events.update")
  if (!gate.ok) return gate

  const { error } = await supabase
    .from("events")
    .update({ title, description, event_date: date, event_time: time, venue, organizer, image_url: imageUrl })
    .eq("id", id)
  if (error) return { error: "Couldn't update the event." }

  await logAudit(supabase, gate.member.userId, event.sphere_id, "event_updated", "event", id)
  for (const p of spherePaths(event.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/events")
  revalidatePath("/dashboard/events/admin")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Marketplace moderation — listings (listing_manager)
// ---------------------------------------------------------------------------

export async function removeListingAction(listingId: string, imageUrls: string[]): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id, sphere_id")
    .eq("id", listingId)
    .maybeSingle()
  if (!listing) return { error: "Listing not found." }

  const gate = await requireSphereAction(listing.sphere_id, "listings.delete")
  if (!gate.ok) return gate

  const { error } = await supabase.from("marketplace_listings").delete().eq("id", listingId)
  if (error) return { error: "Couldn't remove the listing." }

  if (imageUrls.length > 0) {
    try {
      await del(imageUrls)
    } catch {
      // Orphaned blob is acceptable; the listing itself is gone.
    }
  }

  await logAudit(supabase, gate.member.userId, listing.sphere_id, "listing_removed", "listing", listingId)
  for (const p of spherePaths(listing.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/marketplace")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Global listings (super admin only — platform level)
// ---------------------------------------------------------------------------

const GLOBAL_CATEGORIES = ["hostel", "pg", "cafe", "restaurant", "gym", "services", "business", "other"] as const

/**
 * Global listings are managed by the super admin OR any user holding a
 * listing_manager role assignment (platform-level per the spec). Checked
 * server-side and enforced by RLS via is_listing_manager().
 */
async function canManageGlobalListings(
  member: CurrentMember,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  if (member.role === "super_admin") return true
  const { data: assignment } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("user_id", member.userId)
    .eq("role", "listing_manager")
    .limit(1)
    .maybeSingle()
  return Boolean(assignment)
}

export async function upsertGlobalListingAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  if (!(await canManageGlobalListings(admin, supabase))) {
    return { error: "Only platform admins or listing managers can manage global listings." }
  }

  const id = String(formData.get("id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const category = String(formData.get("category") ?? "other")
  const priceRaw = String(formData.get("price") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const contact = String(formData.get("contact") ?? "").trim()
  const imageUrlsRaw = String(formData.get("imageUrls") ?? "[]")

  if (title.length < 1 || title.length > 120) return { error: "Title must be 1–120 characters." }
  if (description.length > 2000) return { error: "Description is too long." }
  if (!GLOBAL_CATEGORIES.includes(category as (typeof GLOBAL_CATEGORIES)[number])) {
    return { error: "Invalid category." }
  }

  let priceCents: number | null = null
  if (priceRaw) {
    const p = Number.parseFloat(priceRaw)
    if (!Number.isFinite(p) || p < 0) return { error: "Enter a valid, non-negative price." }
    priceCents = Math.round(p * 100)
  }

  let imageUrls: string[] = []
  try {
    const parsed = JSON.parse(imageUrlsRaw)
    if (Array.isArray(parsed)) imageUrls = parsed.filter((u) => typeof u === "string").slice(0, 6)
  } catch {
    imageUrls = []
  }

  const status = String(formData.get("status") ?? "active") === "active" ? "active" : "hidden"

  const payload = {
    title,
    description,
    category,
    price_cents: priceCents,
    address,
    city,
    contact,
    image_urls: imageUrls,
    status,
  }

  if (id) {
    const { error } = await supabase.from("global_listings").update(payload).eq("id", id)
    if (error) return { error: "Couldn't update the listing." }
    await logAudit(supabase, admin.userId, null, "global_listing_updated", "global_listing", id)
  } else {
    const { data, error } = await supabase
      .from("global_listings")
      .insert({ ...payload, created_by: admin.userId })
      .select("id")
      .single()
    if (error || !data) return { error: "Couldn't create the listing." }
    await logAudit(supabase, admin.userId, null, "global_listing_created", "global_listing", data.id)
  }

  revalidatePath("/admin")
  revalidatePath("/dashboard/global-listings")
  revalidatePath("/dashboard/global-listings/admin")
  return { error: null }
}

/** Publish / unpublish toggle (active = visible to all users). */
export async function setGlobalListingStatusAction(listingId: string, status: "active" | "hidden"): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  if (!(await canManageGlobalListings(admin, supabase))) {
    return { error: "Only platform admins or listing managers can manage global listings." }
  }

  const { error } = await supabase.from("global_listings").update({ status }).eq("id", listingId)
  if (error) return { error: "Couldn't update the listing status." }

  await logAudit(supabase, admin.userId, null, `global_listing_${status}`, "global_listing", listingId)
  revalidatePath("/admin")
  revalidatePath("/dashboard/global-listings")
  revalidatePath("/dashboard/global-listings/admin")
  return { error: null }
}

export async function deleteGlobalListingAction(listingId: string, imageUrls: string[]): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()
  if (!(await canManageGlobalListings(admin, supabase))) {
    return { error: "Only platform admins or listing managers can manage global listings." }
  }

  const { error } = await supabase.from("global_listings").delete().eq("id", listingId)
  if (error) return { error: "Couldn't delete the listing." }

  if (imageUrls.length > 0) {
    try {
      await del(imageUrls)
    } catch {
      // ignore
    }
  }

  await logAudit(supabase, admin.userId, null, "global_listing_deleted", "global_listing", listingId)
  revalidatePath("/admin")
  revalidatePath("/dashboard/global-listings")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Events (event_manager)
// ---------------------------------------------------------------------------

export async function createEventAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const sphereId = String(formData.get("sphereId") ?? "")

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const date = String(formData.get("date") ?? "")
  const time = String(formData.get("time") ?? "") || null
  const venue = String(formData.get("venue") ?? "").trim()
  const organizer = String(formData.get("organizer") ?? "").trim()
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null

  if (!sphereId) return { error: "Missing Sphere." }
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1–120 characters." }
  if (!date) return { error: "Pick a date." }

  const gate = await requireSphereAction(sphereId, "events.create")
  if (!gate.ok) return gate

  const { error } = await supabase.from("events").insert({
    sphere_id: sphereId,
    title,
    description,
    event_date: date,
    event_time: time,
    venue,
    organizer,
    image_url: imageUrl,
    created_by: gate.member.userId,
  })
  if (error) return { error: "Couldn't create the event." }

  await logAudit(supabase, gate.member.userId, sphereId, "event_created", "event")
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/events")
  return { error: null }
}

export async function deleteEventAction(eventId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: event } = await supabase.from("events").select("id, sphere_id").eq("id", eventId).maybeSingle()
  if (!event) return { error: "Event not found." }

  const gate = await requireSphereAction(event.sphere_id, "events.delete")
  if (!gate.ok) return gate

  const { error } = await supabase.from("events").delete().eq("id", eventId)
  if (error) return { error: "Couldn't delete the event." }

  await logAudit(supabase, gate.member.userId, event.sphere_id, "event_deleted", "event", eventId)
  for (const p of spherePaths(event.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/events")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Clubs (club_manager)
// ---------------------------------------------------------------------------

export async function createClubAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const sphereId = String(formData.get("sphereId") ?? "")

  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null
  const category = String(formData.get("category") ?? "other").trim()
  const tagline = String(formData.get("tagline") ?? "").trim()
  const contactInfo = String(formData.get("contactInfo") ?? "").trim()

  if (!sphereId) return { error: "Missing Sphere." }
  if (name.length < 1 || name.length > 120) return { error: "Club name must be 1–120 characters." }

  const gate = await requireSphereAction(sphereId, "clubs.create")
  if (!gate.ok) return gate

  const { error } = await supabase.from("clubs").insert({
    sphere_id: sphereId,
    name,
    description,
    president_id: null,
    logo_url: imageUrl,
    category,
    tagline,
    contact_info: contactInfo,
    created_by: gate.member.userId,
  })
  if (error) return { error: "Couldn't create the club." }

  await logAudit(supabase, gate.member.userId, sphereId, "club_created", "club")
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

export async function updateClubAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null
  const category = String(formData.get("category") ?? "other").trim()
  const tagline = String(formData.get("tagline") ?? "").trim()
  const contactInfo = String(formData.get("contactInfo") ?? "").trim()

  if (!id) return { error: "Missing club." }
  if (name.length < 1 || name.length > 120) return { error: "Club name must be 1–120 characters." }

  const { data: club } = await supabase.from("clubs").select("id, sphere_id").eq("id", id).maybeSingle()
  if (!club) return { error: "Club not found." }

  const gate = await requireSphereAction(club.sphere_id, "clubs.update")
  if (!gate.ok) return gate

  const { error } = await supabase
    .from("clubs")
    .update({ name, description, logo_url: imageUrl, category, tagline, contact_info: contactInfo })
    .eq("id", id)
  if (error) return { error: "Couldn't update the club." }

  await logAudit(supabase, gate.member.userId, club.sphere_id, "club_updated", "club", id)
  for (const p of spherePaths(club.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  revalidatePath("/dashboard/clubs/admin")
  return { error: null }
}

export async function removeClubMemberAction(clubId: string, userId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: club } = await supabase.from("clubs").select("id, sphere_id").eq("id", clubId).maybeSingle()
  if (!club) return { error: "Club not found." }

  const gate = await requireSphereAction(club.sphere_id, "clubs.update")
  if (!gate.ok) return gate
  if (userId === gate.member.userId) return { error: "You can't remove yourself." }

  const { error } = await supabase.from("club_members").delete().eq("club_id", clubId).eq("user_id", userId)
  if (error) return { error: "Couldn't remove the member." }

  await logAudit(supabase, gate.member.userId, club.sphere_id, "club_member_removed", "club", clubId, { user_id: userId })
  for (const p of spherePaths(club.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  revalidatePath("/dashboard/clubs/admin")
  return { error: null }
}

export async function deleteClubAction(clubId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: club } = await supabase.from("clubs").select("id, sphere_id").eq("id", clubId).maybeSingle()
  if (!club) return { error: "Club not found." }

  const gate = await requireSphereAction(club.sphere_id, "clubs.delete")
  if (!gate.ok) return gate

  const { error } = await supabase.from("clubs").delete().eq("id", clubId)
  if (error) return { error: "Couldn't delete the club." }

  await logAudit(supabase, gate.member.userId, club.sphere_id, "club_deleted", "club", clubId)
  for (const p of spherePaths(club.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Club Activities
// ---------------------------------------------------------------------------

export async function createClubActivityAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const clubId = String(formData.get("clubId") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const category = String(formData.get("category") ?? "other").trim()
  const date = String(formData.get("date") ?? "") || null
  const time = String(formData.get("time") ?? "") || null
  const venue = String(formData.get("venue") ?? "").trim()
  const organizer = String(formData.get("organizer") ?? "").trim()
  const thumbnailUrl = String(formData.get("thumbnailUrl") ?? "").trim() || null

  if (!clubId) return { error: "Missing club." }
  if (title.length < 1 || title.length > 200) return { error: "Title must be 1–200 characters." }

  const { data: club } = await supabase.from("clubs").select("id, sphere_id").eq("id", clubId).maybeSingle()
  if (!club) return { error: "Club not found." }

  const gate = await requireSphereAction(club.sphere_id, "clubs.update")
  if (!gate.ok) return gate

  const { error } = await supabase.from("club_activities").insert({
    club_id: clubId,
    title,
    description,
    category,
    event_date: date,
    event_time: time,
    venue,
    organizer,
    thumbnail_url: thumbnailUrl,
    created_by: gate.member.userId,
  })
  if (error) return { error: "Couldn't create the activity." }

  for (const p of spherePaths(club.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

export async function deleteClubActivityAction(activityId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: activity } = await supabase.from("club_activities").select("id, club_id, clubs(sphere_id)").eq("id", activityId).maybeSingle()
  if (!activity) return { error: "Activity not found." }

  const sphereId = Array.isArray(activity.clubs)
    ? (activity.clubs[0] as { sphere_id?: string })?.sphere_id
    : (activity.clubs as { sphere_id?: string })?.sphere_id
  if (!sphereId) return { error: "Club not found." }

  const gate = await requireSphereAction(sphereId, "clubs.update")
  if (!gate.ok) return gate

  const { error } = await supabase.from("club_activities").delete().eq("id", activityId)
  if (error) return { error: "Couldn't delete the activity." }

  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Club Events
// ---------------------------------------------------------------------------

export async function createClubEventAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const clubId = String(formData.get("clubId") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const date = String(formData.get("date") ?? "") || null
  const time = String(formData.get("time") ?? "") || null
  const venue = String(formData.get("venue") ?? "").trim()
  const organizer = String(formData.get("organizer") ?? "").trim()
  const contactName = String(formData.get("contactName") ?? "").trim()
  const contactPhone = String(formData.get("contactPhone") ?? "").trim()
  const contactEmail = String(formData.get("contactEmail") ?? "").trim()
  const registrationUrl = String(formData.get("registrationUrl") ?? "").trim()
  const registrationDeadline = String(formData.get("registrationDeadline") ?? "") || null
  const thumbnailUrl = String(formData.get("thumbnailUrl") ?? "").trim() || null

  if (!clubId) return { error: "Missing club." }
  if (title.length < 1 || title.length > 200) return { error: "Title must be 1–200 characters." }

  const { data: club } = await supabase.from("clubs").select("id, sphere_id").eq("id", clubId).maybeSingle()
  if (!club) return { error: "Club not found." }

  const gate = await requireSphereAction(club.sphere_id, "events.create")
  if (!gate.ok) return gate

  const { error } = await supabase.from("club_events").insert({
    club_id: clubId,
    title,
    description,
    event_date: date,
    event_time: time,
    venue,
    organizer,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    registration_url: registrationUrl,
    registration_deadline: registrationDeadline,
    thumbnail_url: thumbnailUrl,
    created_by: gate.member.userId,
  })
  if (error) return { error: "Couldn't create the club event." }

  for (const p of spherePaths(club.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

export async function deleteClubEventAction(eventId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: event } = await supabase.from("club_events").select("id, club_id, clubs(sphere_id)").eq("id", eventId).maybeSingle()
  if (!event) return { error: "Event not found." }

  const sphereId = Array.isArray(event.clubs)
    ? (event.clubs[0] as { sphere_id?: string })?.sphere_id
    : (event.clubs as { sphere_id?: string })?.sphere_id
  if (!sphereId) return { error: "Club not found." }

  const gate = await requireSphereAction(sphereId, "events.delete")
  if (!gate.ok) return gate

  const { error } = await supabase.from("club_events").delete().eq("id", eventId)
  if (error) return { error: "Couldn't delete the club event." }

  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Event / Club Event Registration
// ---------------------------------------------------------------------------

export async function registerForEventAction(eventId: string, formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()
  const fullName = String(formData.get("fullName") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const section = String(formData.get("section") ?? "").trim()
  const branch = String(formData.get("branch") ?? "").trim()
  const year = String(formData.get("year") ?? "").trim()

  if (fullName.length < 2) return { error: "Please enter your full name." }
  if (phone.length < 7) return { error: "Please enter a valid phone number." }

  // Check if it's a college event or club event
  const { data: collegeEvent } = await supabase.from("events").select("id, sphere_id").eq("id", eventId).maybeSingle()
  if (collegeEvent) {
    if (collegeEvent.sphere_id !== member.sphereId) return { error: "Event not found." }
    const { error } = await supabase.from("event_registrations").upsert({
      event_id: eventId,
      user_id: member.userId,
      full_name: fullName,
      phone_number: phone,
      section,
      branch,
      year,
    }, { onConflict: "event_id,user_id" })
    if (error) return { error: "Couldn't register. You may already be registered." }
    revalidatePath("/dashboard/events")
    return { error: null }
  }

  const { data: clubEvent } = await supabase.from("club_events").select("id, club_id, clubs(sphere_id)").eq("id", eventId).maybeSingle()
  if (clubEvent) {
    const sphereId = Array.isArray(clubEvent.clubs)
      ? (clubEvent.clubs[0] as { sphere_id?: string })?.sphere_id
      : (clubEvent.clubs as { sphere_id?: string })?.sphere_id
    if (sphereId !== member.sphereId) return { error: "Event not found." }
    const { error } = await supabase.from("club_event_registrations").upsert({
      club_event_id: eventId,
      user_id: member.userId,
      full_name: fullName,
      phone_number: phone,
      section,
      branch,
      year,
    }, { onConflict: "club_event_id,user_id" })
    if (error) return { error: "Couldn't register. You may already be registered." }
    revalidatePath("/dashboard/clubs")
    return { error: null }
  }

  return { error: "Event not found." }
}

export async function cancelEventRegistrationAction(eventId: string): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  // Try college event first
  const { data: collegeEvent } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle()
  if (collegeEvent) {
    await supabase.from("event_registrations").delete().eq("event_id", eventId).eq("user_id", member.userId)
    revalidatePath("/dashboard/events")
    return { error: null }
  }

  // Try club event
  await supabase.from("club_event_registrations").delete().eq("club_event_id", eventId).eq("user_id", member.userId)
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Event Gallery Management
// ---------------------------------------------------------------------------

export async function addEventGalleryItemAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const eventId = String(formData.get("eventId") ?? "")
  const itemType = String(formData.get("itemType") ?? "photo")
  const url = String(formData.get("url") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const source = String(formData.get("source") ?? "college") // "college" | "club" | "activity"

  if (!eventId) return { error: "Missing event." }
  if (!url) return { error: "URL is required." }
  if (!["photo", "link"].includes(itemType)) return { error: "Invalid item type." }

  let table: string
  let fkColumn: string
  if (source === "activity") {
    table = "club_activity_gallery"
    fkColumn = "activity_id"
  } else if (source === "club") {
    table = "club_event_gallery"
    fkColumn = "club_event_id"
  } else {
    table = "event_gallery"
    fkColumn = "event_id"
  }

  const { error } = await supabase.from(table).insert({
    [fkColumn]: eventId,
    item_type: itemType,
    url,
    title,
  })
  if (error) return { error: "Couldn't add gallery item." }

  revalidatePath("/dashboard/events")
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

export async function deleteEventGalleryItemAction(itemId: string, source: "college" | "club" | "activity"): Promise<ActionResult> {
  const supabase = await createClient()
  const table = source === "activity" ? "club_activity_gallery" : source === "club" ? "club_event_gallery" : "event_gallery"
  const { error } = await supabase.from(table).delete().eq("id", itemId)
  if (error) return { error: "Couldn't delete gallery item." }

  revalidatePath("/dashboard/events")
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Club Gallery Management
// ---------------------------------------------------------------------------

export async function addClubGalleryItemAction(clubId: string, url: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: club } = await supabase.from("clubs").select("id, sphere_id").eq("id", clubId).maybeSingle()
  if (!club) return { error: "Club not found." }

  const gate = await requireSphereAction(club.sphere_id, "clubs.update")
  if (!gate.ok) return gate

  const { error } = await supabase.from("club_gallery").insert({
    club_id: clubId,
    url,
  })
  if (error) return { error: "Couldn't add gallery item." }

  for (const p of spherePaths(club.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/clubs")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Academic (academic_manager, degree/year/branch scoped)
// ---------------------------------------------------------------------------

export async function createSubjectAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
  const sphereId = String(formData.get("sphereId") ?? "")

  const name = String(formData.get("name") ?? "").trim()
  const code = String(formData.get("code") ?? "").trim()
  const degree = String(formData.get("degree") ?? "").trim()
  const year = String(formData.get("year") ?? "").trim()
  const branch = String(formData.get("branch") ?? "").trim()
  if (!sphereId) return { error: "Missing Sphere." }
  if (name.length < 1) return { error: "Subject name is required." }

  const gate = await requireSphereAction(sphereId, "academic.create", { degree, year, branch })
  if (!gate.ok) return gate

  const { error } = await supabase.from("subjects").insert({
    sphere_id: sphereId,
    name,
    code,
    degree,
    year,
    branch,
    created_by: gate.member.userId,
  })
  if (error) return { error: "Couldn't create the subject." }

  await logAudit(supabase, gate.member.userId, sphereId, "subject_created", "subject", undefined, { degree, year, branch })
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  return { error: null }
}

export async function createUnitAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const subjectId = String(formData.get("subjectId") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  if (!subjectId || name.length < 1) return { error: "Unit name and subject are required." }

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, sphere_id, degree, year, branch")
    .eq("id", subjectId)
    .maybeSingle()
  if (!subject) return { error: "Subject not found." }

  const gate = await requireSphereAction(subject.sphere_id, "academic.create", {
    degree: subject.degree,
    year: subject.year,
    branch: subject.branch,
  })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_units").insert({
    sphere_id: subject.sphere_id,
    subject_id: subjectId,
    name,
  })
  if (error) return { error: "Couldn't create the unit." }

  await logAudit(supabase, gate.member.userId, subject.sphere_id, "unit_created", "unit")
  for (const p of spherePaths(subject.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  return { error: null }
}

export async function updateSubjectAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const code = String(formData.get("code") ?? "").trim()
  const degree = String(formData.get("degree") ?? "").trim()
  const year = String(formData.get("year") ?? "").trim()
  const branch = String(formData.get("branch") ?? "").trim()
  if (!id || name.length < 1) return { error: "Subject name is required." }

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, sphere_id, degree, year, branch")
    .eq("id", id)
    .maybeSingle()
  if (!subject) return { error: "Subject not found." }

  // Moving a subject across sections is a write on both sides of the move: the
  // manager must cover the section the subject currently lives in AND the
  // section it is moving into.
  const oldScope = { degree: subject.degree, year: subject.year, branch: subject.branch }
  const newScope = { degree, year, branch }
  const gateOld = await requireSphereAction(subject.sphere_id, "academic.update", oldScope)
  if (!gateOld.ok) return gateOld
  const gateNew = await requireSphereAction(subject.sphere_id, "academic.update", newScope)
  if (!gateNew.ok) return gateNew

  const { error } = await supabase
    .from("subjects")
    .update({ name, code, degree, year, branch })
    .eq("id", id)
  if (error) return { error: "Couldn't update the subject." }

  await logAudit(supabase, gateOld.member.userId, subject.sphere_id, "subject_updated", "subject", id, { degree, year, branch })
  for (const p of spherePaths(subject.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function deleteUnitAction(unitId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: unit } = await supabase
    .from("academic_units")
    .select("id, sphere_id, subject_id")
    .eq("id", unitId)
    .maybeSingle()
  if (!unit) return { error: "Unit not found." }

  const { data: subject } = unit.subject_id
    ? await supabase.from("subjects").select("id, degree, year, branch").eq("id", unit.subject_id).maybeSingle()
    : { data: null }
  const gate = await requireSphereAction(unit.sphere_id, "academic.delete", {
    degree: subject?.degree,
    year: subject?.year,
    branch: subject?.branch,
  })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_units").delete().eq("id", unitId)
  if (error) return { error: "Couldn't delete the unit." }

  await logAudit(supabase, gate.member.userId, unit.sphere_id, "unit_deleted", "unit", unitId)
  for (const p of spherePaths(unit.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  return { error: null }
}

export async function deleteSubjectAction(subjectId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, sphere_id, degree, year, branch")
    .eq("id", subjectId)
    .maybeSingle()
  if (!subject) return { error: "Subject not found." }

  const gate = await requireSphereAction(subject.sphere_id, "academic.delete", {
    degree: subject.degree,
    year: subject.year,
    branch: subject.branch,
  })
  if (!gate.ok) return gate

  const { error } = await supabase.from("subjects").delete().eq("id", subjectId)
  if (error) return { error: "Couldn't delete the subject." }

  await logAudit(supabase, gate.member.userId, subject.sphere_id, "subject_deleted", "subject", subjectId)
  for (const p of spherePaths(subject.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  return { error: null }
}

export async function uploadResourceAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const title = String(formData.get("title") ?? "").trim()
  const subjectId = String(formData.get("subjectId") ?? "") || null
  const chapterId = String(formData.get("chapterId") ?? "") || null
  const type = String(formData.get("type") ?? "notes")
  const url = String(formData.get("url") ?? "").trim()

  if (title.length < 1) return { error: "Resource title is required." }
  if (!url) return { error: "Resource URL is required." }

  const { data: subject } = subjectId
    ? await supabase.from("subjects").select("id, sphere_id, degree, year, branch").eq("id", subjectId).maybeSingle()
    : { data: null }
  const sphereId = subject?.sphere_id ?? String(formData.get("sphereId") ?? "")
  if (!sphereId) return { error: "Missing Sphere." }

  const gate = await requireSphereAction(sphereId, "academic.create", {
    degree: subject?.degree,
    year: subject?.year,
    branch: subject?.branch,
  })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_resources").insert({
    sphere_id: sphereId,
    subject_id: subjectId,
    chapter_id: chapterId,
    title,
    type,
    url,
    uploaded_by: gate.member.userId,
  })
  if (error) return { error: "Couldn't upload the resource." }

  await logAudit(supabase, gate.member.userId, sphereId, "resource_uploaded", "resource")
  for (const p of spherePaths(sphereId)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  return { error: null }
}

export async function updateResourceAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const id = String(formData.get("id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const subjectId = String(formData.get("subjectId") ?? "") || null
  const chapterId = String(formData.get("chapterId") ?? "") || null
  const type = String(formData.get("type") ?? "notes")
  const url = String(formData.get("url") ?? "").trim()
  if (!id || title.length < 1 || !url) return { error: "Title and URL are required." }

  const { data: resource } = await supabase
    .from("academic_resources")
    .select("id, sphere_id, subject_id")
    .eq("id", id)
    .maybeSingle()
  if (!resource) return { error: "Resource not found." }

  const [oldSubject, newSubject] = await Promise.all([
    resource.subject_id
      ? supabase.from("subjects").select("id, degree, year, branch").eq("id", resource.subject_id).maybeSingle()
      : Promise.resolve({ data: null }),
    subjectId
      ? supabase.from("subjects").select("id, degree, year, branch").eq("id", subjectId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const oldScope = {
    degree: oldSubject.data?.degree,
    year: oldSubject.data?.year,
    branch: oldSubject.data?.branch,
  }
  const newScope = {
    degree: newSubject.data?.degree,
    year: newSubject.data?.year,
    branch: newSubject.data?.branch,
  }
  const gateOld = await requireSphereAction(resource.sphere_id, "academic.update", oldScope)
  if (!gateOld.ok) return gateOld
  const gateNew = await requireSphereAction(resource.sphere_id, "academic.update", newScope)
  if (!gateNew.ok) return gateNew

  const { error } = await supabase
    .from("academic_resources")
    .update({ title, subject_id: subjectId, chapter_id: chapterId, type, url })
    .eq("id", id)
  if (error) return { error: "Couldn't update the resource." }

  await logAudit(supabase, gateOld.member.userId, resource.sphere_id, "resource_updated", "resource", id)
  for (const p of spherePaths(resource.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function deleteResourceAction(resourceId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: resource } = await supabase
    .from("academic_resources")
    .select("id, sphere_id, subject_id")
    .eq("id", resourceId)
    .maybeSingle()
  if (!resource) return { error: "Resource not found." }

  const { data: subject } = resource.subject_id
    ? await supabase.from("subjects").select("id, degree, year, branch").eq("id", resource.subject_id).maybeSingle()
    : { data: null }
  const gate = await requireSphereAction(resource.sphere_id, "academic.delete", {
    degree: subject?.degree,
    year: subject?.year,
    branch: subject?.branch,
  })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_resources").delete().eq("id", resourceId)
  if (error) return { error: "Couldn't delete the resource." }

  await logAudit(supabase, gate.member.userId, resource.sphere_id, "resource_deleted", "resource", resourceId)
  for (const p of spherePaths(resource.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}

export async function deleteCalendarEntryAction(entryId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: entry } = await supabase.from("academic_calendar").select("sphere_id, degree, year").eq("id", entryId).maybeSingle()
  if (!entry) return { error: "Entry not found." }

  const gate = await requireSphereAction(entry.sphere_id, "academic.delete", { degree: entry.degree, year: entry.year, branch: "" })
  if (!gate.ok) return gate

  const { error } = await supabase.from("academic_calendar").delete().eq("id", entryId)
  if (error) return { error: "Couldn't delete the calendar entry." }

  await logAudit(supabase, gate.member.userId, entry.sphere_id, "calendar_entry_deleted", "calendar", entryId)
  for (const p of spherePaths(entry.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/academic")
  revalidatePath("/dashboard/academic/admin")
  return { error: null }
}


// ---------------------------------------------------------------------------
// Chat moderation (social_moderator)
// ---------------------------------------------------------------------------

export async function adminDeleteChatMessageAction(messageId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: message } = await supabase
    .from("chat_messages")
    .select("id, sphere_id")
    .eq("id", messageId)
    .maybeSingle()
  if (!message) return { error: "Message not found." }

  const gate = await requireSphereAction(message.sphere_id, "social.delete_message")
  if (!gate.ok) return gate

  // Deletion flows through the SECURITY DEFINER RPC so the original content
  // is archived for moderation and the actor is resolved server-side (the
  // RPC will classify this as an admin delete).
  const { error } = await supabase.rpc("delete_chat_message", { p_message_id: messageId })
  if (error) return { error: "Couldn't delete the message." }

  await logAudit(supabase, gate.member.userId, message.sphere_id, "message_removed", "chat_message", messageId)
  for (const p of spherePaths(message.sphere_id)) revalidatePath(p)
  revalidatePath("/dashboard/chat")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Event Registrations — admin read
// ---------------------------------------------------------------------------

type RegistrationRow = {
  id: string
  full_name: string
  phone_number: string
  section: string
  branch: string
  year: string
  created_at: string
}

export type EventRegistrationsResult = {
  registrations: RegistrationRow[]
  count: number
  error: string | null
}

/**
 * Fetches registrations for a college or club event. Only admins/club-admins
 * may call this; enforced server-side.
 */
export async function getEventRegistrations(
  eventId: string,
  source: "college" | "club",
): Promise<EventRegistrationsResult> {
  await requireMember()
  const supabase = await createClient()

  if (source === "college") {
    const { data: event } = await supabase
      .from("events")
      .select("id, sphere_id")
      .eq("id", eventId)
      .maybeSingle()
    if (!event) return { registrations: [], count: 0, error: "Event not found." }

    const gate = await requireSphereAction(event.sphere_id, "events.read")
    if (!gate.ok) return { registrations: [], count: 0, error: gate.error }

    const { data } = await supabase
      .from("event_registrations")
      .select("id, full_name, phone_number, section, branch, year, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })

    return { registrations: data ?? [], count: (data ?? []).length, error: null }
  }

  // Club event
  const { data: clubEvent } = await supabase
    .from("club_events")
    .select("id, club_id, clubs(sphere_id)")
    .eq("id", eventId)
    .maybeSingle()
  if (!clubEvent) return { registrations: [], count: 0, error: "Event not found." }

  const sphereId = Array.isArray(clubEvent.clubs)
    ? (clubEvent.clubs[0] as { sphere_id?: string })?.sphere_id
    : (clubEvent.clubs as { sphere_id?: string })?.sphere_id
  if (!sphereId) return { registrations: [], count: 0, error: "Event not found." }

  const gate = await requireSphereAction(sphereId, "events.read")
  if (!gate.ok) return { registrations: [], count: 0, error: gate.error }

  const { data } = await supabase
    .from("club_event_registrations")
    .select("id, full_name, phone_number, section, branch, year, created_at")
    .eq("club_event_id", eventId)
    .order("created_at", { ascending: true })

  return { registrations: data ?? [], count: (data ?? []).length, error: null }
}

// ---------------------------------------------------------------------------
// Event Gallery — fetch items
// ---------------------------------------------------------------------------

type GalleryItemRow = {
  id: string
  item_type: "photo" | "link"
  url: string
  title: string
}

export async function getEventGalleryItems(
  eventId: string,
  source: "college" | "club" | "activity",
): Promise<{ items: GalleryItemRow[]; error: string | null }> {
  let table: string
  let fkColumn: string
  if (source === "activity") {
    table = "club_activity_gallery"
    fkColumn = "activity_id"
  } else if (source === "club") {
    table = "club_event_gallery"
    fkColumn = "club_event_id"
  } else {
    table = "event_gallery"
    fkColumn = "event_id"
  }
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(table)
    .select("id, item_type, url, title")
    .eq(fkColumn, eventId)
    .order("display_order", { ascending: true })

  if (error) return { items: [], error: error.message }
  return { items: (data ?? []) as GalleryItemRow[], error: null }
}
