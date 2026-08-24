import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { SiteNav } from "@/components/landing/site-nav"
import { AboutContent } from "./about-content"
import { getSiteUrl } from "@/lib/site-url"

export const metadata: Metadata = {
  title: "About UreSphere | Campus Community Platform",
  description:
    "Learn about UreSphere, the private campus platform where every college gets its own verified community. Meet the team and discover our mission.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About UreSphere | Campus Community Platform",
    description:
      "Learn about UreSphere, the private campus platform where every college gets its own verified community. Meet the team and discover our mission.",
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
    name: "About UreSphere",
    url: `${siteUrl}/about`,
    mainEntity: {
      "@type": "Organization",
      name: "UreSphere",
      url: siteUrl,
      description: "UreSphere is a campus-verified college community platform where students can chat, create groups, discover events, and buy and sell through the campus marketplace.",
      logo: `${siteUrl}/favicon/android-chrome-512x512.png`,
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
