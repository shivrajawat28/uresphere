"use client"

import { Suspense, useState, useTransition } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react"
import { resendVerificationEmailAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import { toast } from "sonner"

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const [email, setEmail] = useState("")
  const [isPending, startTransition] = useTransition()
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  // Map known error descriptions to clear, human-friendly guidance
  let displayTitle = "Something went wrong."
  let displayMessage =
    "That verification link may have expired, is invalid, or has already been used. Try signing in, or request a new verification email below."

  if (errorDescription) {
    const lower = errorDescription.toLowerCase()
    if (lower.includes("expired") || lower.includes("invalid") || errorParam === "otp_expired") {
      displayTitle = "Verification link expired."
      displayMessage =
        "This email verification link is no longer valid. If you already verified your email, you can sign in right away. Otherwise, request a new link below."
    } else if (lower.includes("session")) {
      displayTitle = "Session establishment failed."
      displayMessage = errorDescription
    } else {
      displayMessage = errorDescription
    }
  }

  function handleResend(e: React.FormEvent) {
    e.preventDefault()
    if (isPending) return
    setResendError(null)

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResendError("Please enter a valid email address.")
      return
    }

    const formData = new FormData()
    formData.set("email", email)

    startTransition(async () => {
      const res = await resendVerificationEmailAction(formData)
      if (res.error) {
        setResendError(res.error)
        toast.error(res.error)
      } else {
        setResendSuccess(true)
        toast.success("Verification link sent! Please check your inbox.")
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

        <div className="mb-6 flex items-center gap-2">
          <UreSphereLogo className="h-6" wordmark />
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>

          <h1 className="mb-2 text-center font-serif text-2xl text-foreground text-balance">{displayTitle}</h1>
          <p className="mb-6 text-center text-sm leading-relaxed text-muted-foreground">{displayMessage}</p>

          {resendSuccess ? (
            <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
              <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="size-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Check your inbox</p>
              <p className="mt-1 text-xs text-muted-foreground">
                We sent a new confirmation link to <span className="font-medium text-foreground">{email}</span>. Click
                the link to activate your account.
              </p>
            </div>
          ) : (
            <form onSubmit={handleResend} className="mb-6 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="resend-email" className="text-xs font-medium text-muted-foreground">
                  Need a new link? Enter your signup email
                </Label>
                <div className="relative">
                  <Input
                    id="resend-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setResendError(null)
                    }}
                    autoComplete="email"
                    className="pr-10 text-sm"
                  />
                  <Mail className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted-foreground" />
                </div>
                {resendError && <p className="text-xs text-destructive">{resendError}</p>}
              </div>
              <Button type="submit" disabled={isPending} variant="secondary" className="w-full gap-2 text-sm">
                {isPending && <Loader2 className="size-4 animate-spin" />}
                Request new verification email
              </Button>
            </form>
          )}

          <div className="space-y-2 border-t border-border/50 pt-5">
            <Button asChild className="w-full">
              <Link href="/auth/login">Try signing in</Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/auth/sign-up" className="underline underline-offset-4 hover:text-foreground">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
          <div className="w-full max-w-md text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      }
    >
      <AuthErrorContent />
    </Suspense>
  )
}
