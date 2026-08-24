import { createClient } from "@/lib/supabase/server"
import { Sparkles } from "lucide-react"
import { PlanFeedbackForm } from "./plan-feedback-form"

export async function UpcomingPlans() {
  // Public pages must render even when Supabase isn't configured yet.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: plans }, { data: feedback }] = await Promise.all([
    supabase
      .from("platform_plans")
      .select("id, title, description, display_order")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    user
      ? supabase.from("plan_feedback").select("plan_id, rating, comment").eq("user_id", user.id)
      : Promise.resolve({ data: null }),
  ])

  const myFeedback = new Map<string, { rating: number; comment: string }>()
  if (feedback) {
    for (const f of feedback as { plan_id: string; rating: number; comment: string }[]) {
      myFeedback.set(f.plan_id, { rating: f.rating, comment: f.comment })
    }
  }

  const list = (plans ?? []) as { id: string; title: string; description: string; display_order: number }[]
  if (list.length === 0) return null

  return (
    <section id="plans" className="border-b border-border/60 bg-background">
      <div className="mx-auto max-w-4xl px-4 py-20 md:px-8">
        <div className="mb-12 text-center">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="size-3.5" />
            Roadmap
          </p>
          <h2 className="font-serif text-3xl font-medium text-balance text-foreground md:text-4xl">
            Help shape what&apos;s coming next.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
            We&apos;re building UreSphere in the open. Rate the plans below — your feedback decides what we
            ship first.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {list.map((plan) => {
            const mine = myFeedback.get(plan.id)
            return (
              <div key={plan.id} className="rounded-lg border border-border/70 bg-secondary/20 p-6">
                <h3 className="font-serif text-lg font-medium text-foreground">{plan.title}</h3>
                {plan.description && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                )}
                <PlanFeedbackForm planId={plan.id} initial={mine} signedIn={Boolean(user)} />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
