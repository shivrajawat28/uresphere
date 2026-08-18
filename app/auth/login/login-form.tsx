"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { loginAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await loginAction(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(searchParams.get("next") || "/dashboard")
      router.refresh()
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back home
        </Link>

        <div className="mb-8 flex items-center gap-2">
          <UreSphereLogo className="h-6" wordmark />
        </div>

        <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Welcome back.</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          Sign in to re-enter your campus Sphere.
        </p>

        {/* noValidate: friendly app-level errors (e.g. email-only login) must
            surface instead of being swallowed by the browser's native checks. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={isPending} className="w-full gap-2">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Sign in
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            <Link href="/auth/forgot-password" className="underline underline-offset-4 hover:text-foreground">
              Forgot your password?
            </Link>
          </p>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          New to UreSphere?{" "}
          <Link href="/auth/sign-up" className="text-foreground underline underline-offset-4 hover:text-primary">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  )
}
