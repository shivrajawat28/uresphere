"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Logged server-side; never render internals to the user.
    console.error("[uresphere] unhandled error:", error.message)
  }, [error])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 text-center">
      <UreSphereLogo className="mb-6 h-10" />
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Something went wrong.</h1>
      <p className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
        This is our fault, not yours. Try again — if it keeps happening, check back in a few minutes.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to UreSphere</Link>
        </Button>
      </div>
    </main>
  )
}
