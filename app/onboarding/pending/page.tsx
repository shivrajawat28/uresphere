import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OnboardingPendingPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
        <h1 className="mb-3 font-serif text-3xl text-foreground text-balance">Setting up your Sphere.</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          We&apos;re finishing your campus verification. This only takes a moment — refresh to continue.
        </p>
        <Button asChild className="w-full">
          <Link href="/dashboard">Refresh</Link>
        </Button>
      </div>
    </main>
  )
}
