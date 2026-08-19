"use client"

import { useState, useTransition } from "react"
import { CalendarDays, Loader2, Pencil, Plus, Trash2, X, Clock, CheckCircle2, Image as ImageIcon, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { createEventAction, deleteEventAction, updateEventAction, getEventRegistrations, getEventGalleryItems } from "@/lib/actions/admin"
import { EventGalleryManager, type GalleryItem } from "@/components/event-gallery-manager"
import { FileUpload } from "@/components/ui/file-upload"
import { toast } from "sonner"

type EventStatus = "coming_soon" | "upcoming" | "past"

type EventRow = {
  id: string; title: string; description: string; event_date: string | null; event_time: string | null
  venue: string; organizer: string; image_url: string | null; contact_name: string; contact_phone: string
  contact_email: string; registration_url: string; registration_deadline: string | null; status: EventStatus
}

type RegistrationRow = {
  id: string; full_name: string; phone_number: string; section: string; branch: string; year: string; created_at: string
}

export function EventsAdminClient({ sphereId, sphereName, events }: {
  sphereId: string; sphereName: string; events: EventRow[]
}) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tab, setTab] = useState<"all" | "upcoming" | "past">("all")
  const [viewingRegistrations, setViewingRegistrations] = useState<{ eventId: string; eventTitle: string } | null>(null)
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [regCount, setRegCount] = useState(0)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [galleryEvent, setGalleryEvent] = useState<{ eventId: string; eventTitle: string } | null>(null)
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([])

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  async function loadRegistrations(eventId: string, eventTitle: string) {
    setLoadingRegs(true)
    setViewingRegistrations({ eventId, eventTitle })
    const result = await getEventRegistrations(eventId, "college")
    setRegistrations(result.registrations)
    setRegCount(result.count)
    setLoadingRegs(false)
  }

  async function loadGallery(eventId: string, eventTitle: string) {
    setGalleryEvent({ eventId, eventTitle })
    const result = await getEventGalleryItems(eventId, "college")
    setGalleryItems(result.items)
  }

  const filtered = events.filter((e) => {
    if (tab === "upcoming") return e.status === "upcoming" || e.status === "coming_soon"
    if (tab === "past") return e.status === "past"
    return true
  })

  const editing = events.find((e) => e.id === editingId) ?? null

  function StatusBadge({ status }: { status: EventStatus }) {
    if (status === "coming_soon") return <Badge variant="secondary" className="gap-1"><Clock className="size-3" />Coming Soon</Badge>
    if (status === "upcoming") return <Badge variant="outline" className="border-primary/40 text-primary gap-1"><CalendarDays className="size-3" />Upcoming</Badge>
    return <Badge variant="outline" className="border-border/60 text-muted-foreground gap-1"><CheckCircle2 className="size-3" />Past</Badge>
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <CalendarDays className="size-3.5" />Events Admin
        </p>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{sphereName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage events, Coming Soon, galleries and registrations.</p>
      </div>

      <div className="mb-6 flex gap-2">
        {(["all", "upcoming", "past"] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
            {t === "all" ? "All" : t === "upcoming" ? "Upcoming & Coming Soon" : "Past"}
            <span className="ml-1.5 text-xs opacity-60">
              {t === "all" ? events.length : events.filter((e) => t === "upcoming" ? e.status !== "past" : e.status === "past").length}
            </span>
          </Button>
        ))}
      </div>

      <div className="mb-6">
        {showCreate && <EventForm sphereId={sphereId} isPending={isPending} onClose={() => setShowCreate(false)}
          onSubmit={(fd) => run(async () => { const r = await createEventAction(fd); if (!r.error) setShowCreate(false); return r }, "Event created")} />}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-3.5" />{showCreate ? "Hide form" : "New Event"}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {tab === "past" ? "No past events yet." : tab === "upcoming" ? "No upcoming events." : "No events in this Sphere yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <Card key={e.id} className="border-border/70 bg-card">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                      <StatusBadge status={e.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e.event_date ? <>{e.event_date}{e.event_time ? ` · ${e.event_time.slice(0, 5)}` : ""}</> : <span className="italic">Date TBA</span>}
                      {e.venue ? ` · ${e.venue}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => loadRegistrations(e.id, e.title)}>
                      <Users className="size-3" />Regs
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => loadGallery(e.id, e.title)}>
                      <ImageIcon className="size-3" />Gallery
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(e.id)}>
                      <Pencil className="mr-1 size-3" />Edit
                    </Button>
                    <Button size="sm" variant="destructive" disabled={isPending}
                      onClick={() => { if (confirm("Delete this event?")) run(() => deleteEventAction(e.id), "Event deleted") }}>
                      <Trash2 className="mr-1 size-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setEditingId(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-serif text-xl text-foreground">Edit event</p>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label="Close"><X className="size-4" /></button>
            </div>
            <EventForm sphereId={sphereId} initial={editing} isPending={isPending} onClose={() => setEditingId(null)}
              onSubmit={(fd) => run(async () => { const r = await updateEventAction(fd); if (!r.error) setEditingId(null); return r }, "Event updated")} />
          </div>
        </div>
      )}

      {viewingRegistrations && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setViewingRegistrations(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-serif text-xl text-foreground">Registrations</p>
                <p className="text-xs text-muted-foreground">{viewingRegistrations.eventTitle} — {regCount} registered</p>
              </div>
              <button type="button" onClick={() => setViewingRegistrations(null)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label="Close"><X className="size-4" /></button>
            </div>
            {loadingRegs ? (
              <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-primary" /></div>
            ) : registrations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No registrations yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Phone</th>
                    <th className="pb-2 font-medium">Section</th><th className="pb-2 font-medium">Branch</th>
                    <th className="pb-2 font-medium">Year</th><th className="pb-2 font-medium">Date</th>
                  </tr></thead>
                  <tbody>
                    {registrations.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="py-2 font-medium">{r.full_name}</td><td className="py-2">{r.phone_number}</td>
                        <td className="py-2">{r.section || "—"}</td><td className="py-2">{r.branch || "—"}</td>
                        <td className="py-2">{r.year || "—"}</td>
                        <td className="py-2 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {galleryEvent && (
        <EventGalleryManager open={true} onOpenChange={(open) => { if (!open) setGalleryEvent(null) }}
          eventId={galleryEvent.eventId} eventTitle={galleryEvent.eventTitle} source="college" items={galleryItems} />
      )}
    </div>
  )
}

function EventForm({ sphereId, initial, isPending, onClose, onSubmit }: {
  sphereId: string; initial?: EventRow; isPending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void
}) {
  const [busy, startTransition] = useTransition()
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "")
  const [isComingSoon, setIsComingSoon] = useState(!initial?.event_date)

  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("sphereId", sphereId); if (initial) fd.set("id", initial.id); if (imageUrl) fd.set("imageUrl", imageUrl); if (isComingSoon) fd.set("date", ""); startTransition(() => onSubmit(fd)) }}
      className="mb-3 grid gap-3 rounded-lg border border-border/70 bg-secondary/20 p-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2"><Label>Title</Label><Input name="title" required maxLength={120} defaultValue={initial?.title ?? ""} placeholder="Tech Fest 2026" /></div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" id="comingSoon" checked={isComingSoon} onChange={(e) => setIsComingSoon(e.target.checked)} className="size-4" />
        <Label htmlFor="comingSoon" className="text-sm font-normal">Coming Soon — date TBA</Label>
      </div>
      {!isComingSoon && (<>
        <div className="space-y-1.5"><Label>Date</Label><Input name="date" type="date" defaultValue={initial?.event_date ?? ""} /></div>
        <div className="space-y-1.5"><Label>Time</Label><Input name="time" type="time" defaultValue={initial?.event_time ?? ""} /></div>
      </>)}
      <div className="space-y-1.5"><Label>Venue</Label><Input name="venue" defaultValue={initial?.venue ?? ""} /></div>
      <div className="space-y-1.5"><Label>Organizer</Label><Input name="organizer" defaultValue={initial?.organizer ?? ""} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea name="description" rows={2} defaultValue={initial?.description ?? ""} /></div>
      <div className="space-y-1.5"><Label>Contact Name</Label><Input name="contactName" defaultValue={initial?.contact_name ?? ""} /></div>
      <div className="space-y-1.5"><Label>Contact Phone</Label><Input name="contactPhone" defaultValue={initial?.contact_phone ?? ""} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Contact Email</Label><Input name="contactEmail" type="email" defaultValue={initial?.contact_email ?? ""} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Registration URL</Label><Input name="registrationUrl" defaultValue={initial?.registration_url ?? ""} placeholder="https://forms.google.com/..." /></div>
      <div className="space-y-1.5"><Label>Registration Deadline</Label><Input name="registrationDeadline" type="date" defaultValue={initial?.registration_deadline ?? ""} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Event image</Label><FileUpload accept="image" value={imageUrl} onChange={(v) => setImageUrl(v as string)} label="Event image" /></div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || isPending} className="gap-2">
          {(busy || isPending) && <Loader2 className="size-3.5 animate-spin" />}{initial ? "Save changes" : "Create event"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  )
}
