import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { RsvpButton } from "./rsvp-button"
import { EventQuestions } from "./event-questions"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarDays, MapPin } from "lucide-react"

export const dynamic = "force-dynamic"

type EventRow = {
  id: string
  title: string
  description: string | null
  event_date: string
  event_time: string | null
  venue: string | null
  organizer: string | null
  image_url: string | null
  clubs: { name: string }[] | { name: string } | null
}

export default async function EventsPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const [{ data: events }, { data: myRsvps }, { data: questions }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, description, event_date, event_time, venue, organizer, image_url, clubs(name)")
      .eq("sphere_id", member.sphereId)
      .order("event_date", { ascending: true }),
    supabase.from("event_rsvps").select("event_id").eq("user_id", member.userId),
    supabase.from("event_questions").select("id, event_id, question, answer, created_at"),
  ])

  const rsvpSet = new Set((myRsvps ?? []).map((r) => r.event_id))
  const questionsByEvent = new Map<string, { id: string; question: string; answer: string | null; created_at: string }[]>()
  for (const q of (questions ?? []) as { id: string; event_id: string; question: string; answer: string | null; created_at: string }[]) {
    const list = questionsByEvent.get(q.event_id) ?? []
    list.push(q)
    questionsByEvent.set(q.event_id, list)
  }
  const canAnswer = member.role === "admin" || member.role === "super_admin"
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (events ?? []).filter((e) => e.event_date >= today)
  const past = (events ?? []).filter((e) => e.event_date < today).reverse()

  function EventCard({ event }: { event: EventRow }) {
    const clubName =
      (Array.isArray(event.clubs) ? (event.clubs[0] as { name?: string } | null)?.name : (event.clubs as { name?: string } | null)?.name) ??
      null
    const date = new Date(`${event.event_date}T00:00:00`)
    return (
      <Card className="border-border/70 bg-card">
        <CardContent className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border border-primary/25 bg-primary/8">
                <span className="text-[10px] font-medium uppercase text-primary">
                  {date.toLocaleDateString("en-IN", { month: "short" })}
                </span>
                <span className="font-serif text-lg leading-none text-foreground">
                  {date.getDate()}
                </span>
              </div>
              <div>
                <h3 className="font-medium text-foreground">{event.title}</h3>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" />
                  {event.venue || "Venue TBA"}
                </p>
              </div>
            </div>
            <RsvpButton eventId={event.id} isRsvped={rsvpSet.has(event.id)} isPast={event.event_date < today} />
          </div>
          {event.description && (
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{event.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {event.event_time && (
              <Badge variant="outline" className="border-border/60 font-normal">
                <CalendarDays className="mr-1 size-3" />
                {event.event_time.slice(0, 5)}
              </Badge>
            )}
            {clubName && (
              <Badge variant="outline" className="border-border/60 font-normal text-muted-foreground">
                {clubName}
              </Badge>
            )}
            {event.organizer && (
              <span className="text-xs text-muted-foreground">Organized by {event.organizer}</span>
            )}
          </div>
          <EventQuestions eventId={event.id} questions={questionsByEvent.get(event.id) ?? []} canAnswer={canAnswer} />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Campus events for {member.sphereName} — created by your administrators.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-foreground">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No upcoming events yet. Check back soon.
          </p>
        ) : (
          <div className="space-y-3">
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e as EventRow} />
          ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-foreground">Past events</h2>
          <div className="space-y-3 opacity-70">
            {past.map((e) => (
              <EventCard key={e.id} event={e as EventRow} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
