import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import { CollegeRequestForm } from "./college-request-form"
import { getSiteUrl } from "@/lib/site-url"

export const metadata = {
  title: "Request your college | ÙreSphere",
  description:
    "Can't find your college on ÙreSphere? Request it — our team will add it to the campus directory.",
  alternates: {
    canonical: "/request-college",
  },
  openGraph: {
    title: "Request your college | ÙreSphere",
    description:
      "Can't find your college on ÙreSphere? Request it — our team will add it to the campus directory.",
    type: "website",
    url: "/request-college",
  },
}

export default function RequestCollegePage() {
  const siteUrl = getSiteUrl()
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Request your college on ÙreSphere",
    url: `${siteUrl}/request-college`,
    description: "Can't find your college on ÙreSphere? Request it — our team will add it to the campus directory.",
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
          Every campus on ÙreSphere is an officially managed Sphere. If yours isn&apos;t in the directory yet,
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
