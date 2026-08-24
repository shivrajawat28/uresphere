import Link from "next/link"
import { Button } from "@/components/ui/button"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import { ArrowRight } from "lucide-react"

export function CtaFooter() {
  return (
    <>
      <section className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-8">
          <h2 className="mb-4 font-serif text-3xl font-medium text-balance text-foreground md:text-4xl">
          Ready to enter your Sphere?
          </h2>
          <p className="mb-8 text-base text-muted-foreground">Your campus community is waiting. Join in minutes. Stay private.</p>
          <Button asChild size="lg" className="gap-2 px-6">
            <Link href="/auth/login">
              Enter your Sphere
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="py-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 md:flex-row md:px-8">
          <div className="flex items-center gap-2">
            <UreSphereLogo className="h-5" wordmark />
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} UreSphere. Campus-verified, anonymous by design.</p>
        </div>
      </footer>
    </>
  )
}
