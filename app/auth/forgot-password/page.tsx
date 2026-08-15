"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { forgotPasswordAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, ArrowLeft, Loader2, MailCheck } from "lucide-react"

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await forgotPasswordAction(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setSent(true)
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

        <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Reset your password.</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          Enter your email and we&apos;ll send you a secure reset link.
        </p>

        {sent ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4">
            <MailCheck className="size-5 text-primary" />
            <p className="text-sm text-foreground">
              If an account exists for that email, a reset link is on its way. Check your inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
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
              Send reset link
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
