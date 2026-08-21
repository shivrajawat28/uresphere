import { SiteNav } from "@/components/landing/site-nav"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { SphereExplainer } from "@/components/landing/sphere-explainer"
import { Features } from "@/components/landing/features"
import { Trust } from "@/components/landing/trust"
import { UpcomingPlans } from "@/components/landing/upcoming-plans"
import { CtaFooter } from "@/components/landing/cta-footer"
import { getSiteUrl } from "@/lib/site-url"

export default function Page() {
  const siteUrl = getSiteUrl()

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "ÙreSphere",
    url: siteUrl,
    applicationCategory: "SocialNetworkingApplication",
    operatingSystem: "Web",
    description: "A private, campus-verified community platform. Chat, trade, and organize with people who share your college — anonymously.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
    },
    publisher: {
      "@type": "Organization",
      name: "ÙreSphere",
      url: siteUrl,
    },
  }

  return (
    <main className="min-h-svh bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav />
      <Hero />
      <HowItWorks />
      <SphereExplainer />
      <Features />
      <Trust />
      <UpcomingPlans />
      <CtaFooter />
    </main>
  )
}
