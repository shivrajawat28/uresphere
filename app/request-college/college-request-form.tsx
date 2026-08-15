"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { submitCollegeRequestAction } from "@/lib/actions/platform"

export function CollegeRequestForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await submitCollegeRequestAction(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-background p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 size-8 text-primary" />
        <h2 className="font-serif text-xl text-foreground">Request received!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Our team will review it and add your campus to the directory. We&apos;ll reach out on the contact
          details you shared.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">College / university name</Label>
        <Input id="name" name="name" required placeholder="e.g. ITS Engineering College" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="city">City (optional)</Label>
        <Input id="city" name="city" placeholder="e.g. Greater Noida" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="contactName">Your name (optional)</Label>
          <Input id="contactName" name="contactName" placeholder="Jordan Alvarez" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">Phone (optional)</Label>
          <Input id="contactPhone" name="contactPhone" type="tel" placeholder="(555) 123-4567" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactEmail">Email (optional)</Label>
        <Input id="contactEmail" name="contactEmail" type="email" placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">Anything else? (optional)</Label>
        <Input id="note" name="note" placeholder="Number of students, website, …" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full gap-2">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Submit request
      </Button>
    </form>
  )
}
