import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  return {
    rules: [
      {
        // The landing page and public marketing pages are indexable.
        userAgent: "*",
        allow: ["/", "/about", "/request-college", "/auth/login", "/auth/sign-up", "/auth/forgot-password"],
      },
      {
        // Everything behind authentication is private and must not be indexed.
        userAgent: "*",
        disallow: [
          "/dashboard/",
          "/admin/",
          "/onboarding/",
          "/auth/callback",
          "/auth/reset-password",
          "/auth/suspended",
          "/api/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
