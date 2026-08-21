import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { SiteNav } from "@/components/landing/site-nav"
import { AboutContent } from "./about-content"
import { getSiteUrl } from "@/lib/site-url"

export const metadata: Metadata = {
  title: "About | ÙreSphere",
  description:
    "ÙreSphere is a campus platform where every college gets its own private Sphere. Read about why we built it, meet the team, work with us, or advertise on UreSphere.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About ÙreSphere",
    description:
      "ÙreSphere is a campus platform where every college gets its own private Sphere. Read about why we built it, meet the team, work with us, or advertise on UreSphere.",
    type: "website",
    url: "/about",
  },
}

export default async function AboutPage() {
  const supabase = await createClient()
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  let team: { id: string; name: string; role: string; photo_url: string | null; short_bio: string; bio: string; social_links: Record<string, string>; display_order: number }[] = []
  let advertising = { contact_phone: "", contact_email: "" }

  if (hasSupabase) {
    const [{ data: teamData }, { data: adData }] = await Promise.all([
      supabase.from("team_members").select("*").eq("active", true).order("display_order").order("created_at"),
      supabase.from("advertising_config").select("contact_phone, contact_email").eq("id", 1).maybeSingle(),
    ])
    if (teamData) team = teamData as typeof team
    if (adData) advertising = adData as typeof advertising
  }

  const siteUrl = getSiteUrl()
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About ÙreSphere",
    url: `${siteUrl}/about`,
    mainEntity: {
      "@type": "Organization",
      name: "ÙreSphere",
      url: siteUrl,
      description: "A private, campus-verified community platform.",
    },
  }

  return (
    <main className="min-h-svh bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav />
      <AboutContent team={team} advertising={advertising} />
    </main>
  )
}
