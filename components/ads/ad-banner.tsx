import { createClient } from "@/lib/supabase/server"
import { fetchLiveAds, type AdPlacement } from "@/lib/ads"
import { AdCard } from "./ad-card"

/**
 * Renders the live advertisements for a placement (Academic / Social /
 * Marketplace). The eligibility filter (active, not archived, inside the
 * schedule window, placement match) runs entirely in the database — only the
 * small result set is fetched. Renders nothing when no ad is live or when the
 * ad table isn't available yet (migration not applied), so pages degrade
 * gracefully instead of crashing.
 */
export async function AdBanner({ placement, limit = 1 }: { placement: AdPlacement; limit?: number }) {
  const supabase = await createClient()
  const ads = await fetchLiveAds(supabase, placement, limit)
  if (ads.length === 0) return null

  return (
    <div className="space-y-2" data-placement={placement} data-ads={ads.length}>
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  )
}
