import type { Metadata } from "next"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { RoadmapPlanList } from "@/components/roadmap/roadmap-plan-list"
import { Sparkles } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Roadmap",
  // Private dashboard surface — never indexable. The dashboard layout also
  // sets robots: noindex, and robots.txt disallows /dashboard/.
  robots: { index: false, follow: false },
}

type FeedbackRow = { plan_id: string; rating: number; comment: string }

export default async function DashboardRoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const member = await requireMember()
  const supabase = await createClient()
  const { plan } = await searchParams

  // Same published-plan source as the public landing roadmap. Only active
  // plans are readable by members (RLS) — drafts, deleted and admin-only rows
  // never reach this page.
  const [{ data: plans }, { data: feedback }] = await Promise.all([
    supabase
      .from("platform_plans")
      .select("id, title, description, display_order")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("plan_feedback").select("plan_id, rating, comment").eq("user_id", member.userId),
  ])

  const myFeedback: Record<string, { rating: number; comment: string }> = {}
  for (const f of (feedback ?? []) as FeedbackRow[]) {
    myFeedback[f.plan_id] = { rating: f.rating, comment: f.comment }
  }

  const list = (plans ?? []) as { id: string; title: string; description: string; display_order: number }[]

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-10">
      <div className="mb-10 text-center">
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="size-3.5" />
          Roadmap
        </p>
        <h1 className="text-pretty font-serif text-3xl font-medium text-foreground md:text-4xl">
          Help shape what&apos;s coming next.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
          We&apos;re building ÙreSphere in the open. Rate the plans below — your feedback decides what we
          ship first.
        </p>
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No published plans yet — check back soon.
        </p>
      ) : (
        <RoadmapPlanList
          plans={list.map(({ id, title, description }) => ({ id, title, description }))}
          myFeedback={myFeedback}
          highlightPlanId={typeof plan === "string" && plan.length > 0 ? plan : null}
        />
      )}
    </div>
  )
}
