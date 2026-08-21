"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Check, Loader2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { submitPlanFeedbackAction } from "@/lib/actions/platform"

type Props = {
  planId: string
  initial?: { rating: number; comment: string }
  signedIn?: boolean
}

export function PlanFeedbackForm({ planId, initial, signedIn = false }: Props) {
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState(initial?.comment ?? "")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(Boolean(initial))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (rating < 1) {
      setError("Pick a rating first.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitPlanFeedbackAction(planId, rating, comment)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
    })
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-border/60 pt-4">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={`size-5 ${
                n <= (hover || rating) ? "fill-primary text-primary" : "text-muted-foreground/40"
              }`}
            />
          </button>
        ))}
        {saved && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Check className="size-3.5" />
            Thanks!
          </span>
        )}
      </div>

      <Input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="What would make this great? (optional)"
        className="mt-3"
        maxLength={600}
      />

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending} className="gap-2">
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          {saved ? "Update feedback" : "Submit feedback"}
        </Button>
        {!signedIn && (
          <Link href="/auth/login" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Join your Sphere to vote
          </Link>
        )}
      </div>
    </form>
  )
}
