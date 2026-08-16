import type { Metadata } from "next"
import { requireMember } from "@/lib/data/session"
import { DashboardAboutContent } from "./about-content"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "About",
  // Private dashboard surface — never indexable. The dashboard layout also
  // sets robots: noindex, and robots.txt disallows /dashboard/, so this route
  // can never leak into the public SEO surface or sitemap.
  robots: { index: false, follow: false },
}

export default async function DashboardAboutPage() {
  // Same protection as every dashboard route: unauthenticated visitors are
  // redirected to login by requireMember (and by the auth proxy middleware).
  const member = await requireMember()

  return <DashboardAboutContent sphereName={member.sphereName} />
}
