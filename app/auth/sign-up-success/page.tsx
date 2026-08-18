import Link from "next/link"
import { MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SignUpSuccessPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="size-6 text-primary" />
        </div>
        <h1 className="mb-3 font-serif text-3xl text-foreground text-balance">Account created.</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          Please check your email and click the confirmation link to verify your account. Once confirmed, you can
          sign in and enter your campus Sphere.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </div>
    </main>
  )
}
