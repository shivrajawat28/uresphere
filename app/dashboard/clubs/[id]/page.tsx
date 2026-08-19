import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Clock, ArrowLeft, CalendarDays, MapPin, Image as ImageIcon, ExternalLink } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"
import { ClubEventActions } from "@/components/club-event-actions"

export const dynamic = "force-dynamic"

const CATEGORY_LABELS: Record<string, string> = {
  coding: "Coding",
  robotics: "Robotics",
  ai_ml: "AI/ML",
  cultural: "Cultural",
  sports: "Sports",
  entrepreneurship: "Entrepreneurship",
  literary: "Literary",
  photography: "Photography",
  design: "Design",
  other: "Other",
}

type GalleryItem = { id: string; item_type: "photo" | "link"; url: string; title: string }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const member = await requireMember()
  const supabase = await createClient()
  const { data: club } = await supabase
    .from("clubs")
    .select("name, description")
    .eq("id", id)
    .eq("sphere_id", member.sphereId)
    .maybeSingle()

  return {
    title: club ? `${club.name} — Clubs` : "Club",
    robots: { index: false, follow: false },
  }
}

function getCountdown(dateStr: string, timeStr: string | null): string | null {
  const now = new Date()
  const eventDate = new Date(`${dateStr}T${timeStr ?? "23:59:59"}`)
  const diff = eventDate.getTime() - now.getTime()
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default async function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const member = await requireMember()
  const supabase = await createClient()

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, description, logo_url, category, tagline, contact_info, club_members(user_id), club_activities(id, title, description, category, event_date, venue, organizer, thumbnail_url, created_at), club_events(id, title, description, event_date, event_time, venue, organizer, contact_name, contact_phone, contact_email, registration_url, registration_deadline, thumbnail_url)")
    .eq("id", id)
    .eq("sphere_id", member.sphereId)
    .maybeSingle()

  if (!club) notFound()

  const memberCount = Array.isArray(club.club_members) ? club.club_members.length : 0
  const categoryLabel = CATEGORY_LABELS[club.category ?? "other"] ?? "Other"
  const today = new Date().toISOString().slice(0, 10)

  const activities = Array.isArray(club.club_activities) ? club.club_activities : []
  const clubEvents = Array.isArray(club.club_events) ? club.club_events : []
  const upcomingClubEvents = clubEvents.filter((e) => !e.event_date || e.event_date >= today)
  const pastClubEvents = clubEvents.filter((e) => e.event_date && e.event_date < today)

  // Fetch gallery for club events
  const clubEventIds = clubEvents.map((e) => e.id)
  const { data: eventGalleryData } = clubEventIds.length > 0
    ? await supabase.from("club_event_gallery").select("id, club_event_id, item_type, url, title").in("club_event_id", clubEventIds).order("display_order", { ascending: true })
    : { data: [] }

  const eventGalleryByEvent = new Map<string, GalleryItem[]>()
  for (const item of (eventGalleryData ?? []) as { id: string; club_event_id: string; item_type: string; url: string; title: string }[]) {
    const list = eventGalleryByEvent.get(item.club_event_id) ?? []
    list.push({ id: item.id, item_type: item.item_type as "photo" | "link", url: item.url, title: item.title })
    eventGalleryByEvent.set(item.club_event_id, list)
  }

  // Fetch gallery for club activities
  const activityIds = activities.map((a) => a.id)
  const { data: activityGalleryData } = activityIds.length > 0
    ? await supabase.from("club_activity_gallery").select("id, activity_id, item_type, url, title").in("activity_id", activityIds).order("display_order", { ascending: true })
    : { data: [] }

  const activityGalleryByActivity = new Map<string, GalleryItem[]>()
  for (const item of (activityGalleryData ?? []) as { id: string; activity_id: string; item_type: string; url: string; title: string }[]) {
    const list = activityGalleryByActivity.get(item.activity_id) ?? []
    list.push({ id: item.id, item_type: item.item_type as "photo" | "link", url: item.url, title: item.title })
    activityGalleryByActivity.set(item.activity_id, list)
  }

  // Check user's registration status for club events
  const { data: myRegData } = await supabase
    .from("club_event_registrations")
    .select("club_event_id")
    .eq("user_id", member.userId)
    .in("club_event_id", clubEventIds.length > 0 ? clubEventIds : ["__none__"])
  const registeredClubEvents = new Set((myRegData ?? []).map((r) => r.club_event_id))

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      {/* Back link */}
      <Link href="/dashboard/clubs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to Clubs
      </Link>

      {/* Club Header */}
      <div className="mb-8 flex items-start gap-4">
        {club.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logo_url} alt={club.name} className="size-16 rounded-xl border border-border/60 object-cover" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-xl border border-primary/25 bg-primary/8">
            <Users className="size-7 text-primary" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{club.name}</h1>
          {club.tagline && <p className="mt-0.5 text-sm text-muted-foreground italic">{club.tagline}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{categoryLabel}</Badge>
            <Badge variant="outline" className="border-border/60">
              <Users className="mr-1 size-2.5" />
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Description */}
      {club.description && (
        <Card className="mb-6 border-border/70 bg-card">
          <CardContent className="p-5">
            <p className="text-sm leading-relaxed text-muted-foreground">{club.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Club Events */}
      {upcomingClubEvents.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-lg font-medium text-foreground flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" /> Upcoming Events
          </h2>
          <div className="space-y-3">
            {upcomingClubEvents.map((event) => {
              const countdown = event.event_date ? getCountdown(event.event_date, event.event_time) : null
              const hasRegUrl = !!event.registration_url
              const isRegistered = registeredClubEvents.has(event.id)
              const galleryItems = eventGalleryByEvent.get(event.id) ?? []

              return (
                <Card key={event.id} className="border-border/70 bg-card">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-foreground">{event.title}</h3>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin className="size-3" />
                          {event.venue || "Venue TBA"}
                          {event.organizer && ` · ${event.organizer}`}
                        </p>
                        {event.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{event.description}</p>}
                        {!event.event_date ? (
                          <Badge variant="secondary" className="mt-2 gap-1"><Clock className="size-3" />Coming Soon</Badge>
                        ) : countdown ? (
                          <Badge variant="outline" className="mt-2 border-primary/40 text-primary gap-1"><CalendarDays className="size-3" />{countdown}</Badge>
                        ) : null}
                        {(event.contact_name || event.contact_phone) && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Query: {event.contact_name}
                            {event.contact_phone && ` · ${event.contact_phone}`}
                          </p>
                        )}
                      </div>
                      <ClubEventActions
                        eventId={event.id}
                        eventTitle={event.title}
                        hasRegUrl={hasRegUrl}
                        registrationUrl={event.registration_url}
                        isRegistered={isRegistered}
                        registrationDeadline={event.registration_deadline ?? null}
                        galleryItems={galleryItems}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Club Activities */}
      {activities.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-lg font-medium text-foreground">Activities & Past Events</h2>
          <div className="space-y-3">
            {activities.map((activity) => {
              const galleryItems = activityGalleryByActivity.get(activity.id) ?? []
              return (
                <Card key={activity.id} className="border-border/70 bg-card">
                  <CardContent className="p-4">
                    <h3 className="font-medium text-foreground">{activity.title}</h3>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      {activity.event_date && <><CalendarDays className="size-3" />{activity.event_date}</>}
                      {activity.venue && <><MapPin className="size-3" />{activity.venue}</>}
                    </p>
                    {activity.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{activity.description}</p>}

                    {/* Activity Gallery */}
                    {galleryItems.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <ImageIcon className="size-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{galleryItems.length} gallery item{galleryItems.length === 1 ? "" : "s"}</span>
                      </div>
                    )}
                    {galleryItems.length > 0 && (
                      <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                        {galleryItems.map((item) =>
                          item.item_type === "photo" ? (
                            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="group relative block aspect-square overflow-hidden rounded border border-border/60">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.url} alt={item.title || "Gallery photo"} className="h-full w-full object-cover transition group-hover:scale-105" />
                            </a>
                          ) : (
                            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="group flex aspect-square items-center justify-center rounded border border-border/60 bg-secondary/20 p-1 text-center transition hover:bg-secondary/40">
                              <ExternalLink className="size-3 text-muted-foreground group-hover:text-foreground" />
                            </a>
                          )
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Past Club Events */}
      {pastClubEvents.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-lg font-medium text-foreground">Past Events</h2>
          <div className="space-y-3 opacity-70">
            {pastClubEvents.map((event) => {
              const galleryItems = eventGalleryByEvent.get(event.id) ?? []
              return (
                <Card key={event.id} className="border-border/70 bg-card">
                  <CardContent className="p-4">
                    <h3 className="font-medium text-foreground">{event.title}</h3>
                    <p className="text-xs text-muted-foreground">{event.event_date} · {event.venue || "Venue TBA"}</p>

                    {/* Past Event Gallery */}
                    {galleryItems.length > 0 && (
                      <>
                        <div className="mt-2 flex items-center gap-2">
                          <ImageIcon className="size-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{galleryItems.length} gallery item{galleryItems.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-1.5">
                          {galleryItems.map((item) =>
                            item.item_type === "photo" ? (
                              <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="group relative block aspect-square overflow-hidden rounded border border-border/60">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={item.url} alt={item.title || "Gallery photo"} className="h-full w-full object-cover transition group-hover:scale-105" />
                              </a>
                            ) : (
                              <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="group flex aspect-square items-center justify-center rounded border border-border/60 bg-secondary/20 p-1 text-center transition hover:bg-secondary/40">
                                <ExternalLink className="size-3 text-muted-foreground group-hover:text-foreground" />
                              </a>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Empty states */}
      {upcomingClubEvents.length === 0 && activities.length === 0 && pastClubEvents.length === 0 && (
        <Card className="border-border/70 bg-card">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No activities or events yet. Check back soon!</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
