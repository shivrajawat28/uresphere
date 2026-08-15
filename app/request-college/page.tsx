import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import { CollegeRequestForm } from "./college-request-form"

export const metadata = {
  title: "Request your college | UreSphere",
  description:
    "Can't find your college on UreSphere? Request it — our team will add it to the campus directory.",
}

export default function RequestCollegePage() {
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
          <UreSphereLogo className="h-5" wordmark />
        </div>

        <h1 className="mb-2 font-serif text-3xl text-foreground text-balance">Request your college.</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          Every campus on UreSphere is an officially managed Sphere. If yours isn&apos;t in the directory yet,
          tell us about it and we&apos;ll bring it onboard.
        </p>

        <CollegeRequestForm />

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have your college?{" "}
          <Link href="/auth/sign-up" className="text-foreground underline underline-offset-4 hover:text-primary">
            Join your Sphere
          </Link>
        </p>
      </div>
    </main>
  )
}
