import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { RsvpButton } from "./rsvp-button"
import { EventQuestions } from "./event-questions"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarDays, MapPin, Clock } from "lucide-react"
import { CollegeEventActions } from "@/components/college-event-actions"

export const dynamic = "force-dynamic"

type EventRow = {
  id: string
  title: string
  description: string | null
  event_date: string | null
  event_time: string | null
  venue: string | null
  organizer: string | null
  image_url: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  registration_url: string | null
  registration_deadline: string | null
  clubs: { name: string }[] | { name: string } | null
}

type GalleryItem = { id: string; item_type: "photo" | "link"; url: string; title: string }

function getCountdown(dateStr: string, timeStr: string | null): string | null {
  const now = new Date()
  const eventDate = new Date(`${dateStr}T${timeStr ?? "23:59:59"}`)
  const diff = eventDate.getTime() - now.getTime()
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `Starts in ${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`
  return `Starts in ${minutes}m`
}

export default async function EventsPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const [{ data: events }, { data: myRsvps }, { data: questions }, { data: myRegistrations }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, description, event_date, event_time, venue, organizer, image_url, contact_name, contact_phone, contact_email, registration_url, registration_deadline, clubs(name)")
      .eq("sphere_id", member.sphereId)
      .order("event_date", { ascending: true, nullsFirst: true }),
    supabase.from("event_rsvps").select("event_id").eq("user_id", member.userId),
    supabase.from("event_questions").select("id, event_id, question, answer, created_at"),
    supabase.from("event_registrations").select("event_id").eq("user_id", member.userId),
  ])

  // Fetch gallery items for all events
  const eventIds = (events ?? []).map((e) => e.id)
  const { data: allGalleryItems } = eventIds.length > 0
    ? await supabase.from("event_gallery").select("id, event_id, item_type, url, title").in("event_id", eventIds).order("display_order", { ascending: true })
    : { data: [] }

  const galleryByEvent = new Map<string, GalleryItem[]>()
  for (const item of (allGalleryItems ?? []) as { id: string; event_id: string; item_type: string; url: string; title: string }[]) {
    const list = galleryByEvent.get(item.event_id) ?? []
    list.push({ id: item.id, item_type: item.item_type as "photo" | "link", url: item.url, title: item.title })
    galleryByEvent.set(item.event_id, list)
  }

  const rsvpSet = new Set((myRsvps ?? []).map((r) => r.event_id))
  const registeredSet = new Set((myRegistrations ?? []).map((r) => r.event_id))
  const questionsByEvent = new Map<string, { id: string; question: string; answer: string | null; created_at: string }[]>()
  for (const q of (questions ?? []) as { id: string; event_id: string; question: string; answer: string | null; created_at: string }[]) {
    const list = questionsByEvent.get(q.event_id) ?? []
    list.push(q)
    questionsByEvent.set(q.event_id, list)
  }
  const canAnswer = member.role === "admin" || member.role === "super_admin"
  const today = new Date().toISOString().slice(0, 10)

  // Categorize events using computed status
  const comingSoon = (events ?? []).filter((e) => !e.event_date)
  const upcoming = (events ?? []).filter((e) => e.event_date && e.event_date >= today)
  const past = (events ?? []).filter((e) => e.event_date && e.event_date < today).reverse()

  function EventCard({ event, showCountdown = false }: { event: EventRow; showCountdown?: boolean }) {
    const clubName =
      (Array.isArray(event.clubs) ? (event.clubs[0] as { name?: string } | null)?.name : (event.clubs as { name?: string } | null)?.name) ??
      null
    const countdown = event.event_date ? getCountdown(event.event_date, event.event_time) : null
    const isRegistered = registeredSet.has(event.id)
    const isPast = event.event_date ? event.event_date < today : false
    const isDeadlinePassed = event.registration_deadline ? event.registration_deadline < today : false
    const hasRegUrl = !!event.registration_url
    const canRegister = !isPast && !isDeadlinePassed && !isRegistered
    const galleryItems = galleryByEvent.get(event.id) ?? []

    return (
      <Card className="border-border/70 bg-card">
        <CardContent className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {event.event_date ? (
                <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border border-primary/25 bg-primary/8">
                  <span className="text-[10px] font-medium uppercase text-primary">
                    {new Date(`${event.event_date}T00:00:00`).toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                  <span className="font-serif text-lg leading-none text-foreground">
                    {new Date(`${event.event_date}T00:00:00`).getDate()}
                  </span>
                </div>
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-primary/30 bg-primary/5">
                  <Clock className="size-5 text-primary/60" />
                </div>
              )}
              <div>
                <h3 className="font-medium text-foreground">{event.title}</h3>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" />
                  {event.venue || "Venue TBA"}
                </p>
              </div>
            </div>
            <RsvpButton eventId={event.id} isRsvped={rsvpSet.has(event.id)} isPast={isPast} />
          </div>

          {event.description && (
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{event.description}</p>
          )}

          {/* Countdown or Coming Soon */}
          {showCountdown && !isPast && (
            <div className="mb-3">
              {!event.event_date ? (
                <Badge variant="secondary" className="gap-1.5"><Clock className="size-3" />Coming Soon — date to be announced</Badge>
              ) : countdown ? (
                <Badge variant="outline" className="border-primary/40 text-primary gap-1.5">
                  <CalendarDays className="size-3" />{countdown}
                </Badge>
              ) : null}
            </div>
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

          {/* Registration + Gallery actions */}
          <CollegeEventActions
            eventId={event.id}
            eventTitle={event.title}
            hasRegUrl={hasRegUrl}
            registrationUrl={event.registration_url}
            canRegister={canRegister}
            isRegistered={isRegistered}
            registrationDeadline={event.registration_deadline}
            galleryItems={galleryItems}
          />

          {/* Contact / Query info */}
          {(event.contact_name || event.contact_phone || event.contact_email) && (
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <span>Query:</span>
              {event.contact_phone && <a href={`tel:${event.contact_phone}`} className="text-primary hover:underline">{event.contact_phone}</a>}
              {event.contact_email && <a href={`mailto:${event.contact_email}`} className="text-primary hover:underline">{event.contact_email}</a>}
              {event.contact_name && !event.contact_phone && !event.contact_email && <span>{event.contact_name}</span>}
            </div>
          )}

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

      {/* Coming Soon */}
      {comingSoon.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="size-4 text-primary" /> Coming Soon
          </h2>
          <div className="space-y-3">
            {comingSoon.map((e) => (
              <EventCard key={e.id} event={e as EventRow} showCountdown />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-foreground">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No upcoming events yet. Check back soon.
          </p>
        ) : (
          <div className="space-y-3">
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e as EventRow} showCountdown />
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
