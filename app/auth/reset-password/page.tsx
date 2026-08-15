"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { resetPasswordAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"

export default function ResetPasswordPage() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await resetPasswordAction(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setDone(true)
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md">
        <Link
          href="/auth/login"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>

        <div className="mb-8 flex items-center gap-2">
          <UreSphereLogo className="h-6" wordmark />
        </div>

        {done ? (
          <>
            <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Password updated.</h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              You can now sign in with your new password.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Choose a new password.</h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">At least 8 characters.</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
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
                Update password
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
