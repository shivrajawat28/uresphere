import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"
import { CampusNetwork } from "./campus-network"

export function Hero() {
  return (
    <section className="relative flex min-h-[calc(100svh-73px)] items-center overflow-hidden border-b border-border/60">
      <CampusNetwork />

      <div className="relative mx-auto w-full max-w-4xl px-4 py-20 text-center md:px-8 md:py-28">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3.5 py-1.5 text-xs font-medium text-primary backdrop-blur-sm">
          <Sparkles className="size-3.5" />
          Your campus, Your space
        </div>

        <h1 className="font-serif text-[clamp(2.6rem,7vw,5rem)] font-medium leading-[1.04] tracking-tight text-balance text-foreground">
        Same Campus
          <br />
          <em className="italic text-primary">Different Stories</em>
          <br />
          One Sphere
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
        A private space for the people you pass every day.
        Chat, connect, trade, join groups, discover events and see what&apos;s happening around campus — without putting your real name out there.
        </p>

        <div className="mt-11 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="gap-2 px-7 text-base">
            <Link href="/auth/login">
              Enter your Sphere
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="px-7 text-base">
            <a href="#how-it-works">Explore ÙreSphere</a>
          </Button>
        </div>

        <p className="mt-7 text-xs text-muted-foreground">
          One verified account per person. Your real name never leaves your profile.
        </p>
      </div>
    </section>
  )
}
