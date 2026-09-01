"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { loginAction, resendVerificationEmailAction } from "@/lib/auth/actions"
import { sanitizeRedirectPath } from "@/lib/validation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"

export function LoginForm() {
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [isResending, startResendTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<{ success: boolean; message: string } | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setResendStatus(null)
    setUnconfirmedEmail(null)
    const formData = new FormData(e.currentTarget)
    const email = String(formData.get("email") || "").trim()

    startTransition(async () => {
      const result = await loginAction(formData)
      if (result.error) {
        setError(result.error)
        if (result.error.toLowerCase().includes("confirm your email")) {
          setUnconfirmedEmail(email)
        }
        return
      }
      const rawNext = searchParams.get("next")
      const next = sanitizeRedirectPath(rawNext, "/dashboard")
      const target = next === "/auth/login" ? "/dashboard" : next
      window.location.assign(target)
    })
  }

  function handleResendConfirmation() {
    if (!unconfirmedEmail || isResending) return
    setResendStatus(null)
    const fd = new FormData()
    fd.set("email", unconfirmedEmail)

    startResendTransition(async () => {
      const result = await resendVerificationEmailAction(fd)
      if (result.error) {
        setResendStatus({ success: false, message: result.error })
      } else {
        setResendStatus({
          success: true,
          message: `Verification email resent to ${unconfirmedEmail}. Please check your inbox and spam folder.`,
        })
      }
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
              className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
              {unconfirmedEmail && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isResending}
                    onClick={handleResendConfirmation}
                    className="w-full gap-2 border-destructive/40 bg-background text-foreground hover:bg-destructive/15"
                  >
                    {isResending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Mail className="size-3.5" />
                    )}
                    Resend verification link
                  </Button>
                </div>
              )}
            </div>
          )}

          {resendStatus && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                resendStatus.success
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {resendStatus.success ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
              )}
              <span>{resendStatus.message}</span>
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
