import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Compass } from "lucide-react"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 text-center">
      <UreSphereLogo className="mb-6 h-10" />
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Compass className="size-6 text-primary" />
      </div>
      <h1 className="mb-2 font-serif text-4xl text-foreground text-balance">This page drifted outside your Sphere.</h1>
      <p className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Button asChild>
        <Link href="/">Back to UreSphere</Link>
      </Button>
    </main>
  )
}
