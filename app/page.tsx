import { SiteNav } from "@/components/landing/site-nav"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { SphereExplainer } from "@/components/landing/sphere-explainer"
import { Features } from "@/components/landing/features"
import { Trust } from "@/components/landing/trust"
import { UpcomingPlans } from "@/components/landing/upcoming-plans"
import { CtaFooter } from "@/components/landing/cta-footer"

export default function Page() {
  return (
    <main className="min-h-svh bg-background">
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
