import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <h1 className="mb-3 font-serif text-3xl text-foreground text-balance">Something went wrong.</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          That verification link may have expired or already been used. Try signing in, or request a new link.
        </p>
        <Button asChild className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </div>
    </main>
  )
}
