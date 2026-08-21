import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logoutAction } from "@/lib/auth/actions"

export default function SuspendedPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="size-6 text-destructive" />
        </div>
        <h1 className="mb-3 font-serif text-3xl text-foreground text-balance">Your account is suspended.</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          Your Sphere&apos;s administrators have temporarily suspended your account. If you believe this is a mistake,
          contact your campus admins.
        </p>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
        <p className="mt-6 text-xs text-muted-foreground">
          <Link href="/" className="underline underline-offset-4 hover:text-foreground">
            Back to ÙreSphere
          </Link>
        </p>
      </div>
    </main>
  )
}
