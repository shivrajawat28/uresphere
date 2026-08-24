"use client"

import { useEffect, useRef, useState } from "react"
import { PlanFeedbackForm } from "@/components/landing/plan-feedback-form"

type RoadmapPlan = { id: string; title: string; description: string }
type MyFeedback = { rating: number; comment: string }

/**
 * Renders published roadmap plan cards for authenticated dashboard users.
 * Every card embeds the shared feedback form (1–5 stars + optional comment,
 * one editable entry per user per plan). When `highlightPlanId` matches a
 * card, the page scrolls to it and briefly highlights it — this is what a
 * "New UreSphere update" notification deep link lands on.
 */
export function RoadmapPlanList({
  plans,
  myFeedback,
  highlightPlanId,
}: {
  plans: RoadmapPlan[]
  myFeedback: Record<string, MyFeedback>
  highlightPlanId: string | null
}) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const scrolledRef = useRef(false)

  useEffect(() => {
    if (!highlightPlanId || scrolledRef.current) return
    // The list is server-rendered, so the card is already in the DOM on
    // hydration — a short defer keeps the scroll from racing the first paint.
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`roadmap-plan-${highlightPlanId}`)
      if (el) {
        scrolledRef.current = true
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        setHighlightedId(highlightPlanId)
      }
    }, 60)
    // Drop the highlight after a moment so it reads as a "you are here" cue.
    const clearTimer = setTimeout(() => setHighlightedId(null), 4000)
    return () => {
      clearTimeout(scrollTimer)
      clearTimeout(clearTimer)
    }
  }, [highlightPlanId])

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {plans.map((plan) => {
        const highlighted = highlightedId === plan.id
        return (
          <article
            key={plan.id}
            id={`roadmap-plan-${plan.id}`}
            className={`scroll-mt-24 rounded-lg border bg-secondary/20 p-6 transition-all duration-300 ${
              highlighted ? "border-primary/70 shadow-[0_0_0_1px_var(--primary)]" : "border-border/70"
            }`}
          >
            <h2 className="font-serif text-lg font-medium text-foreground">{plan.title}</h2>
            {plan.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
            )}
            <PlanFeedbackForm planId={plan.id} initial={myFeedback[plan.id]} signedIn />
          </article>
        )
      })}
    </div>
  )
}
