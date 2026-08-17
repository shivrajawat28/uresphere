import type { MetadataRoute } from "next"
import { getSiteUrl } from "@/lib/site-url"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl()

  return {
    rules: [
      {
        // Public marketing pages are indexable.
        userAgent: "*",
        allow: ["/", "/about", "/request-college"],
      },
      {
        // Everything behind authentication is private and must not be indexed.
        userAgent: "*",
        disallow: [
          "/dashboard/",
          "/admin/",
          "/onboarding/",
          "/auth/",
          "/api/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
