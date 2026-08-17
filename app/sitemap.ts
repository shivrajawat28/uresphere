import type { MetadataRoute } from "next"
import { getSiteUrl } from "@/lib/site-url"

/**
 * Public, indexable routes only. Authenticated routes (/dashboard/*,
 * /admin/*, /auth/*, /onboarding/*, etc.) are intentionally excluded —
 * they are private by design and must never appear in the sitemap.
 *
 * The base URL always resolves to the production origin (https://uresphere.in)
 * in production — never a Vercel preview domain or localhost.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl()
  const now = new Date()

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/request-college`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ]
}
