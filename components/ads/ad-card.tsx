import type { AdCampaign } from "@/lib/ads"
import { ExternalLink } from "lucide-react"

/**
 * Visual card for one advertisement. Clearly labeled as sponsored, links out
 * to the destination URL in a new tab with safe rel attributes. Shared by the
 * frontend banner and the admin preview dialog so both always look identical.
 */
export function AdCard({ ad, compact = false }: { ad: AdCampaign; compact?: boolean }) {
  return (
    <a
      href={ad.destinationUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm sm:gap-4"
    >
      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary sm:h-16 sm:w-28">
        {ad.imageUrl ? (
          // Below-the-fold / secondary content — lazy-load the creative.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.imageUrl}
            alt={ad.title}
            loading="lazy"
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
            Ad
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Sponsored
        </p>
        <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{ad.title}</p>
        {!compact && ad.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{ad.description}</p>
        )}
      </div>
      <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-primary sm:inline-flex">
        Learn more
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </span>
    </a>
  )
}
