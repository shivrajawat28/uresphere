// Pure helpers for platform plans ("What's coming next"). Dependency-free so
// they are unit-testable and shared by the dashboard and tests.

export type Plan = {
  id: string
  title: string
  description: string
  display_order: number
  active: boolean
  created_at: string
}

/**
 * Returns the single most recently published plan (active = true), newest by
 * creation time. Unpublished / draft plans are never candidates — the caller
 * must not show drafts to members. Returns null when nothing is published.
 */
export function latestPublishedPlan(plans: Plan[]): Plan | null {
  const published = plans.filter((p) => p.active)
  if (published.length === 0) return null
  return [...published].sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    return tb - ta || b.id.localeCompare(a.id)
  })[0]
}

/**
 * Stable link used by plan notification broadcasts — both the dedupe key in
 * notify_plan_published and the deep link users land on. Opens the exact plan
 * on the Dashboard Roadmap page (the page scrolls to + highlights it).
 */
export function planAnchor(planId: string): string {
  return `/dashboard/roadmap?plan=${planId}`
}

/**
 * Extracts the plan UUID from a roadmap deep link (e.g. a plan_published
 * notification's `link` column or the roadmap page's `?plan=` param). Returns
 * null when the href isn't a roadmap deep link. Keeps the notification → plan
 * routing contract in one dependency-free helper.
 */
export function planIdFromRoadmapHref(href: string | null | undefined): string | null {
  if (!href) return null
  const match = href.match(/\/dashboard\/roadmap\?plan=([0-9a-f-]{36})/i)
  return match ? match[1] : null
}

/**
 * Aggregates raw plan_feedback rows into per-plan counts + average rating.
 * Pure and dependency-free so the admin Plans tab can be unit-tested.
 */
export function summarizePlanFeedback(
  plans: Pick<Plan, "id">[],
  feedback: { plan_id: string; rating: number }[],
): Record<string, { feedbackCount: number; averageRating: number | null }> {
  const summary: Record<string, { feedbackCount: number; averageRating: number | null }> = {}
  for (const p of plans) {
    const rows = feedback.filter((f) => f.plan_id === p.id)
    const sum = rows.reduce((acc, f) => acc + Number(f.rating ?? 0), 0)
    summary[p.id] = {
      feedbackCount: rows.length,
      averageRating: rows.length > 0 ? sum / rows.length : null,
    }
  }
  return summary
}
