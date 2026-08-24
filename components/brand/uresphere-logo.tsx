import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Single source of truth for the UreSphere brand mark.
 *
 * The high-resolution logo lives at /public/brand/uresphere-logo.png (the
 * original asset — never recompressed or duplicated elsewhere). The component
 * renders it with next/image:
 *  - aspect ratio preserved (object-contain; width auto-sizes from height),
 *  - never stretched or distorted by CSS filters,
 *  - responsive: pass a height (e.g. "h-5", "h-6", "h-8") via `className`
 *    for each placement — width follows automatically,
 *  - works on light and dark themes (the asset itself carries its colors),
 *  - no layout shift (explicit intrinsic dimensions + priority where above
 *    the fold),
 *  - accessible alt text, overridable per context.
 *
 * With `wordmark`, it renders the brand lockup `[logo] UreSphere` as one unit
 * (logo + text beside it, vertically aligned). The wordmark uses the site's
 * serif display font so it stays consistent in light and dark themes.
 *
 * Usage:
 *   <UreSphereLogo className="h-6" />
 *   <UreSphereLogo className="h-6" wordmark />
 *   <UreSphereLogo className="h-8" priority={false} alt="Back to UreSphere" />
 */
export function UreSphereLogo({
  className,
  wordmark = false,
  wordmarkClassName,
  alt = "UreSphere",
  priority = true,
}: {
  className?: string
  /** Show the "UreSphere" wordmark beside the logo (brand lockup). */
  wordmark?: boolean
  /** Override the wordmark typography (defaults to the brand serif style). */
  wordmarkClassName?: string
  alt?: string
  priority?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Image
        src="/brand/uresphere-logo.png"
        // When the wordmark is shown it carries the accessible name, so the
        // image is decorative to avoid announcing "UreSphere" twice.
        alt={wordmark ? "" : alt}
        // Intrinsic dimensions of the original high-res asset. `object-contain`
        // + h-auto keeps the true aspect ratio at any rendered size.
        width={512}
        height={512}
        priority={priority}
        className={cn("h-auto w-auto object-contain", className)}
      />
      {wordmark && (
        <span
          className={cn(
            "whitespace-nowrap font-serif text-lg font-medium tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          UreSphere
        </span>
      )}
    </span>
  )
}
