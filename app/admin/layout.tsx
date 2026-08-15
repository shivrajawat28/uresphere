import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { requireAdminAccess } from "@/lib/data/session"
import { ShieldAlert } from "lucide-react"

// Private area: never indexable, even if a crawler ignores robots.txt.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await requireAdminAccess()

  return (
    <div className="min-h-svh bg-background">
      <div className="border-b border-border bg-sidebar">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Admin {access.isSuperAdmin ? "· Platform" : `· ${access.member.sphereName}`}
            </span>
          </div>
          <Link href="/dashboard" className="text-sm text-muted-foreground transition hover:text-foreground">
            ← Back to app
          </Link>
        </div>
      </div>
      {children}
    </div>
  )
}
