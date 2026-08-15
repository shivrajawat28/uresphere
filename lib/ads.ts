// Advertising domain logic. Kept dependency-free (except validation) so the
// eligibility rules and input validation are unit-testable and shared between
// the server actions, the admin UI and the frontend display components.

import type { SupabaseClient } from "@supabase/supabase-js"
import { validatePromotionUrl } from "@/lib/validation"

export const AD_PLACEMENTS = ["academic", "social", "marketplace"] as const
export type AdPlacement = (typeof AD_PLACEMENTS)[number]

export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = {
  academic: "Academic",
  social: "Social",
  marketplace: "Marketplace",
}

export type AdCampaign = {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  destinationUrl: string
  placements: string[]
  startsAt: string | null
  endsAt: string | null
  active: boolean
  archived: boolean
}

/** Admin table row: a campaign plus its creation time. */
export type AdAdminRow = AdCampaign & { createdAt: string }

/** Maps a raw `ad_campaigns` row (snake_case columns) to the domain shape. */
export function mapAdRow(row: {
  id: string
  advertiser_name: string
  description: string | null
  creative_url: string | null
  destination_url: string
  placements: string[] | null
  starts_at_ts: string | null
  ends_at_ts: string | null
  active: boolean
  archived: boolean
}): AdCampaign {
  return {
    id: row.id,
    title: row.advertiser_name,
    description: row.description,
    imageUrl: row.creative_url,
    destinationUrl: row.destination_url,
    placements: Array.isArray(row.placements) ? row.placements : [],
    startsAt: row.starts_at_ts,
    endsAt: row.ends_at_ts,
    active: row.active,
    archived: row.archived,
  }
}

/**
 * Eligibility predicate — a single source of truth for "may this ad be shown?".
 * An ad is live only when it is active, not archived, has a full schedule, the
 * current time is inside the schedule window, and (when a placement is given)
 * it targets that placement.
 */
export function isAdLive(ad: Pick<AdCampaign, "active" | "archived" | "startsAt" | "endsAt" | "placements">, opts: { placement?: string; now?: Date } = {}): boolean {
  if (!ad.active || ad.archived) return false
  if (!ad.startsAt || !ad.endsAt) return false
  const now = (opts.now ?? new Date()).getTime()
  if (new Date(ad.startsAt).getTime() > now) return false
  if (new Date(ad.endsAt).getTime() < now) return false
  if (opts.placement && !ad.placements.includes(opts.placement)) return false
  return true
}

export type AdStatus = "live" | "scheduled" | "expired" | "inactive" | "archived"

/** Human-facing status used by the admin table (expired ads look distinct). */
export function adStatus(ad: Pick<AdCampaign, "active" | "archived" | "startsAt" | "endsAt">, now: Date = new Date()): AdStatus {
  if (ad.archived) return "archived"
  if (!ad.active) return "inactive"
  if (!ad.startsAt || !ad.endsAt) return "inactive"
  const t = now.getTime()
  if (new Date(ad.startsAt).getTime() > t) return "scheduled"
  if (new Date(ad.endsAt).getTime() < t) return "expired"
  return "live"
}

export type ValidatedAdInput = {
  title: string
  description: string
  imageUrl: string
  destinationUrl: string
  placements: AdPlacement[]
  startsAt: string
  endsAt: string
  active: boolean
}

/**
 * Validates raw form input for create/edit. Returns the normalized payload on
 * success, or a user-readable error. Enforces:
 *  - non-empty title (≤ 120 chars)
 *  - non-empty description (≤ 300 chars)
 *  - a non-empty image URL
 *  - a safe http(s) destination URL
 *  - at least one supported placement
 *  - a valid schedule with end strictly after start
 */
export function validateAdInput(input: {
  title: string
  description: string
  imageUrl: string
  destinationUrl: string
  placements: string[]
  startsAt: string
  endsAt: string
  active: boolean
}): { ok: true; data: ValidatedAdInput } | { ok: false; error: string } {
  const title = input.title.trim()
  const description = input.description.trim()
  const imageUrl = input.imageUrl.trim()
  const rawUrl = input.destinationUrl.trim()

  if (!title) return { ok: false, error: "Title is required." }
  if (title.length > 120) return { ok: false, error: "Title must be 120 characters or fewer." }
  if (!description) return { ok: false, error: "Description is required." }
  if (description.length > 300) return { ok: false, error: "Description must be 300 characters or fewer." }
  if (!imageUrl) return { ok: false, error: "An advertisement image is required." }
  if (imageUrl.length > 500) return { ok: false, error: "Image URL is too long." }

  const destinationUrl = validatePromotionUrl(rawUrl)
  if (!destinationUrl) return { ok: false, error: "Enter a valid http(s) destination URL." }

  const placements = Array.from(new Set(input.placements.filter((p): p is AdPlacement => (AD_PLACEMENTS as readonly string[]).includes(p))))
  if (placements.length === 0) return { ok: false, error: "Select at least one placement (Academic, Social or Marketplace)." }

  const start = new Date(input.startsAt)
  const end = new Date(input.endsAt)
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Start date/time is invalid." }
  if (Number.isNaN(end.getTime())) return { ok: false, error: "End date/time is invalid." }
  if (end.getTime() <= start.getTime()) return { ok: false, error: "End date/time must be after the start date/time." }

  return {
    ok: true,
    data: {
      title,
      description,
      imageUrl,
      destinationUrl,
      placements,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      active: input.active,
    },
  }
}

/**
 * Fetches live advertisements for a placement. All filtering happens in the
 * database (active, not archived, inside the schedule window, placement
 * contains) — only the small result set is transferred. Returns an empty
 * array when the table isn't available yet (e.g. migration not applied), so
 * pages degrade gracefully instead of crashing.
 */
export async function fetchLiveAds(
  supabase: SupabaseClient,
  placement: AdPlacement,
  limit = 1,
): Promise<AdCampaign[]> {
  const now = new Date().toISOString()
  try {
    const { data, error } = await supabase
      .from("ad_campaigns")
      .select("id, advertiser_name, description, creative_url, destination_url, placements, starts_at_ts, ends_at_ts, active, archived")
      .eq("active", true)
      .eq("archived", false)
      .lte("starts_at_ts", now)
      .gte("ends_at_ts", now)
      .contains("placements", [placement])
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) return []
    return (data ?? []).map((row) => mapAdRow(row as Parameters<typeof mapAdRow>[0]))
  } catch {
    // Missing column / table (pre-migration) must never break a page.
    return []
  }
}
