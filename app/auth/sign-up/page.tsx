"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signUpAction } from "@/lib/auth/actions"
import { normalizeIndianPhone } from "@/lib/validation"
import { CollegeSearch } from "@/components/auth/college-search"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react"

const STEPS = ["identity", "campus", "credentials"] as const
type Step = (typeof STEPS)[number]

const YEARS = [
  { value: "1", label: "1st Year" },
  { value: "2", label: "2nd Year" },
  { value: "3", label: "3rd Year" },
  { value: "4", label: "4th Year" },
  { value: "other", label: "Other" },
]

type FieldKey = "realName" | "phone" | "college" | "year" | "email" | "password" | "confirmPassword"
type FieldErrors = Partial<Record<FieldKey, string>>

const EMPTY_ERRORS: FieldErrors = {}

export default function SignUpPage() {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<FieldErrors>(EMPTY_ERRORS)
  const submittingRef = useRef(false)
  const [values, setValues] = useState({
    realName: "",
    phone: "",
    college: "",
    collegeId: "",
    year: "",
    email: "",
    password: "",
    confirmPassword: "",
  })

  const step: Step = STEPS[stepIndex]

  function update(field: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    // Clear the field's error as soon as the user starts fixing it — errors
    // only ever appear after the user has tried to advance (never on load).
    if (field === "collegeId") return
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  /** Field-specific validation — runs on Continue/Submit only, never on load. */
  function validateStep(): FieldErrors {
    const errs: FieldErrors = {}
    if (step === "identity") {
      if (values.realName.trim().length < 2) errs.realName = "Please enter your full legal name."
      if (values.phone.trim().length < 7 || !normalizeIndianPhone(values.phone)) {
        errs.phone = "Enter a valid 10-digit Indian phone number."
      }
    }
    if (step === "campus") {
      if (!values.collegeId) errs.college = "Select your college from the directory below."
      if (!values.year) errs.year = "Pick your current year."
    }
    if (step === "credentials") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errs.email = "Please enter a valid email address."
      if (values.password.length < 8) errs.password = "Password must be at least 8 characters."
      if (values.password !== values.confirmPassword) errs.confirmPassword = "Passwords don't match."
    }
    return errs
  }

  function next() {
    const errs = validateStep()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setErrors(EMPTY_ERRORS)
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }

  function back() {
    setErrors(EMPTY_ERRORS)
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Guard: prevent duplicate submissions (React Strict Mode, rapid clicks).
    if (submittingRef.current || isPending) return
    const errs = validateStep()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setErrors(EMPTY_ERRORS)
    submittingRef.current = true

    const formData = new FormData()
    formData.set("realName", values.realName)
    formData.set("phone", values.phone)
    formData.set("college", values.college)
    formData.set("collegeId", values.collegeId)
    formData.set("collegeYear", values.year)
    formData.set("email", values.email)
    formData.set("password", values.password)
    formData.set("confirmPassword", values.confirmPassword)

    startTransition(async () => {
      const result = await signUpAction(formData)
      submittingRef.current = false
      if (result.error) {
        // Surface server-side errors field-specifically where we can map them.
        const err = result.error
        const lower = err.toLowerCase()
        if (lower.includes("phone")) setErrors((e) => ({ ...e, phone: err }))
        else if (lower.includes("email")) setErrors((e) => ({ ...e, email: err }))
        else if (lower.includes("password")) setErrors((e) => ({ ...e, password: err }))
        else setErrors((e) => ({ ...e, email: err }))
        return
      }
      if (result.needsEmailConfirmation) {
        router.push("/auth/sign-up-success")
      } else {
        router.push("/dashboard")
      }
    })
  }

  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-8 sm:items-center sm:py-16">
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

        <h1 className="mb-2 font-serif text-2xl text-foreground text-balance sm:text-3xl">Claim your campus identity.</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground sm:mb-8">
          We verify who you are once, privately. Everyone else only ever sees your anonymous handle.
        </p>

        <div className="mb-6 flex items-center gap-2 sm:mb-8" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
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
                  aria-invalid={Boolean(errors.realName)}
                  aria-describedby={errors.realName ? "realName-error" : undefined}
                />
                {errors.realName && (
                  <p id="realName-error" role="alert" className="text-xs text-destructive">
                    {errors.realName}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Private. Used only for verification, never shown.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  value={values.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                />
                {errors.phone && (
                  <p id="phone-error" role="alert" className="text-xs text-destructive">
                    {errors.phone}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Stored privately in your profile so your campus can reach you — never shown to other members.
                </p>
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
                {errors.college && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.college}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Pick your campus from the directory — it places you inside that campus&apos;s private Sphere.
                  Only people from the same college can see you.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Current year</Label>
                <div className="grid grid-cols-3 gap-2">
                  {YEARS.map((y) => (
                    <button
                      key={y.value}
                      type="button"
                      onClick={() => update("year", y.value)}
                      aria-pressed={values.year === y.value}
                      className={`rounded-md border px-2 py-2 text-sm transition ${
                        values.year === y.value
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border/70 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {y.label}
                    </button>
                  ))}
                </div>
                {errors.year && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.year}
                  </p>
                )}
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
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
                {errors.email && (
                  <p id="email-error" role="alert" className="text-xs text-destructive">
                    {errors.email}
                  </p>
                )}
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
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                {errors.password && (
                  <p id="password-error" role="alert" className="text-xs text-destructive">
                    {errors.password}
                  </p>
                )}
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
                  aria-invalid={Boolean(errors.confirmPassword)}
                  aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
                />
                {errors.confirmPassword && (
                  <p id="confirmPassword-error" role="alert" className="text-xs text-destructive">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
            </fieldset>
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

        <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Your details stay private. We never sell or share your data.
        </p>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already on UreSphere?{" "}
          <Link href="/auth/login" className="text-foreground underline underline-offset-4 hover:text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
