import { Suspense } from "react"
import { LoginForm } from "./login-form"

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
