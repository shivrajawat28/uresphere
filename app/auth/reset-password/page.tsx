"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { resetPasswordAction } from "@/lib/auth/actions"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function initRecoverySession() {
      try {
        // First, check if we already have a valid session (server-side
        // code exchange succeeded during the callback redirect).
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (cancelled) return
        if (user) {
          setHasSession(true)
          setLoading(false)
          return
        }

        // No session yet — this typically means the Supabase recovery link
        // included a hash fragment (#access_token=...&refresh_token=...&type=recovery)
        // that needs to be processed client-side. The @supabase/ssr browser
        // client should handle this automatically, but we also provide an
        // explicit fallback for edge cases where the initial getUser() was
        // racing the hash-fragment processing.
        const hash = window.location.hash
        if (hash && hash.includes("access_token")) {
          // Wait briefly for the Supabase client to process the hash fragment,
          // then re-check. The browser client processes the hash on page load
          // via internal Supabase logic — this gives it time to settle.
          await new Promise((r) => setTimeout(r, 500))
          if (cancelled) return

          const {
            data: { user: retryUser },
          } = await supabase.auth.getUser()
          if (cancelled) return
          if (retryUser) {
            setHasSession(true)
            setLoading(false)
            return
          }
        }

        // Also listen for the PASSWORD_RECOVERY event which fires when
        // Supabase successfully establishes a recovery session from the
        // hash fragment or from cookies set by the server-side exchange.
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
          if (cancelled) return
          if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
            setHasSession(true)
            setLoading(false)
            subscription.unsubscribe()
          }
        })

        // Final check after a short delay — if nothing has happened by now,
        // the link is likely invalid or expired.
        setTimeout(() => {
          if (cancelled) return
          setLoading(false)
          // hasSession will still be false; the form won't render and
          // the error state will show the "invalid link" message.
        }, 2000)

        return () => {
          subscription.unsubscribe()
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    initRecoverySession()
    return () => {
      cancelled = true
    }
  }, [])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    // Client-side checks first so mismatches never reach the server.
    const password = String(formData.get("password") || "")
    const confirmPassword = String(formData.get("confirmPassword") || "")
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }

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

        {loading ? (
          /* Loading state: waiting for Supabase to establish the recovery
             session from the hash fragment or server-side code exchange. */
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Setting up your reset link…</p>
          </div>
        ) : done ? (
          <>
            <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Password updated.</h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              You can now sign in with your new password.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </>
        ) : hasSession ? (
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
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
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
        ) : (
          /* No session: the link is invalid, expired, or has already been used. */
          <>
            <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Link expired or invalid.</h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              This password reset link is no longer valid. It may have expired or already been used.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth/forgot-password">Request a new link</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  )
}
