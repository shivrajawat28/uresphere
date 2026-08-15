"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { submitWorkWithUsAction } from "@/lib/actions/platform"

export function WorkWithUsForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await submitWorkWithUsAction(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-background p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 size-8 text-primary" />
        <h3 className="font-serif text-xl text-foreground">Application received!</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Thanks for your interest — our team reviews every application.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" required placeholder="Jordan Alvarez" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="college">College / university</Label>
        <Input id="college" name="college" placeholder="e.g. ITS Engineering College" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="year">Year / course</Label>
        <Input id="year" name="year" placeholder="e.g. Second Year, B.Tech CSE" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="skills">Skills</Label>
        <Input id="skills" name="skills" placeholder="Design, dev, content, community…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="experience">Experience</Label>
        <Input id="experience" name="experience" placeholder="Side projects, internships, clubs…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="portfolio">GitHub / portfolio</Label>
        <Input id="portfolio" name="portfolio" placeholder="https://github.com/you" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="motivation">Why do you want to work with UreSphere?</Label>
        <Input id="motivation" name="motivation" required placeholder="What excites you about campus communities?" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="links">Anything else? Links, resume URL (optional)</Label>
        <Input id="links" name="links" placeholder="https://your-resume-link" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Submit application
        </Button>
      </div>
    </form>
  )
}
