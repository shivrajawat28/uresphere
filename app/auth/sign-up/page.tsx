"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signUpAction } from "@/lib/auth/actions"
import { CollegeSearch } from "@/components/auth/college-search"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react"

const STEPS = ["identity", "campus", "credentials"] as const
type Step = (typeof STEPS)[number]

export default function SignUpPage() {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState({
    realName: "",
    phone: "",
    college: "",
    collegeId: "",
    email: "",
    password: "",
    confirmPassword: "",
  })

  const step: Step = STEPS[stepIndex]

  function update(field: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
  }

  function validateStep(): string | null {
    if (step === "identity") {
      if (values.realName.trim().length < 2) return "Please enter your full legal name."
      if (values.phone.trim().length < 7) return "Please enter a valid phone number."
    }
    if (step === "campus") {
      if (!values.collegeId) return "Select your college from the directory below."
    }
    if (step === "credentials") {
      if (!values.email.includes("@")) return "Please enter a valid email address."
      if (values.password.length < 8) return "Password must be at least 8 characters."
      if (values.password !== values.confirmPassword) return "Passwords don't match."
    }
    return null
  }

  function next() {
    const err = validateStep()
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }

  function back() {
    setError(null)
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validateStep()
    if (err) {
      setError(err)
      return
    }
    setError(null)

    const formData = new FormData()
    formData.set("realName", values.realName)
    formData.set("phone", values.phone)
    formData.set("college", values.college)
    formData.set("collegeId", values.collegeId)
    formData.set("email", values.email)
    formData.set("password", values.password)
    formData.set("confirmPassword", values.confirmPassword)

    startTransition(async () => {
      const result = await signUpAction(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push("/auth/sign-up-success")
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

        <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Claim your campus identity.</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          We verify who you are once, privately. Everyone else only ever sees your anonymous handle.
        </p>

        <div className="mb-8 flex items-center gap-2" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {step === "identity" && (
            <fieldset className="space-y-5">
              <legend className="sr-only">Your real identity (kept private)</legend>
              <div className="space-y-2">
                <Label htmlFor="realName">Full legal name</Label>
                <Input
                  id="realName"
                  autoComplete="name"
                  placeholder="Jordan Alvarez"
                  value={values.realName}
                  onChange={(e) => update("realName", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Private. Used only for verification, never shown.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="(555) 123-4567"
                  value={values.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </div>
            </fieldset>
          )}

          {step === "campus" && (
            <fieldset className="space-y-5">
              <legend className="sr-only">Your campus</legend>
              <div className="space-y-2">
                <Label htmlFor="college">College or university</Label>
                <CollegeSearch
                  value={values.college}
                  collegeId={values.collegeId}
                  onSelect={(college, raw) => {
                    update("college", college ? college.name : raw)
                    update("collegeId", college?.id ?? "")
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Pick your campus from the directory — it places you inside that campus&apos;s private Sphere.
                  Only people from the same college can see you.
                </p>
              </div>
            </fieldset>
          )}

          {step === "credentials" && (
            <fieldset className="space-y-5">
              <legend className="sr-only">Login credentials</legend>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={values.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={values.password}
                  onChange={(e) => update("password", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={values.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                />
              </div>
            </fieldset>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            {stepIndex > 0 && (
              <Button type="button" variant="outline" onClick={back} className="flex-1">
                Back
              </Button>
            )}
            {step !== "credentials" ? (
              <Button type="button" onClick={next} className="flex-1 gap-2">
                Continue
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={isPending} className="flex-1 gap-2">
                {isPending && <Loader2 className="size-4 animate-spin" />}
                Create account
              </Button>
            )}
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already on UreSphere?{" "}
          <Link href="/auth/login" className="text-foreground underline underline-offset-4 hover:text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
