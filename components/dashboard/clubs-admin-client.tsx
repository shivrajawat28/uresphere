"use client"

import { useState, useTransition } from "react"
import { Loader2, Pencil, Plus, Sparkles, Trash2, Users, X, ChevronDown, ChevronUp, Image as ImageIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { FileUpload } from "@/components/ui/file-upload"
import {
  createClubAction, deleteClubAction, updateClubAction,
  createClubActivityAction, deleteClubActivityAction,
  createClubEventAction, deleteClubEventAction, updateClubEventAction,
  getEventRegistrations, getEventGalleryItems,
} from "@/lib/actions/admin"
import { EventGalleryManager, type GalleryItem } from "@/components/event-gallery-manager"
import { toast } from "sonner"

type ClubRow = {
  id: string
  name: string
  description: string
  logo_url: string | null
  category?: string
  tagline?: string
  contact_info?: string
  members: { userId: string; handle: string }[]
}

type ActivityRow = {
  id: string
  title: string
  description: string
  category: string
  event_date: string | null
  venue: string
  organizer: string
  thumbnail_url: string | null
  club_id: string
}

type ClubEventRow = {
  id: string
  title: string
  description: string
  event_date: string | null
  event_time: string | null
  venue: string
  organizer: string
  contact_name: string
  contact_phone: string
  contact_email: string
  registration_url: string
  registration_deadline: string | null
  thumbnail_url: string | null
  registration_count?: number
  club_id: string
}

export function ClubsAdminClient({
  sphereId,
  sphereName,
  clubs,
  isClubAdmin = false,
  activities = [],
  clubEvents = [],
  initialExpandedClub,
}: {
  sphereId: string
  sphereName: string
  clubs: ClubRow[]
  isClubAdmin?: boolean
  activities?: ActivityRow[]
  clubEvents?: ClubEventRow[]
  initialExpandedClub?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedClub, setExpandedClub] = useState<string | null>(initialExpandedClub ?? null)
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [galleryTarget, setGalleryTarget] = useState<{ eventId: string; eventTitle: string; source: "club" | "activity" } | null>(null)
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([])
  const [viewingRegs, setViewingRegs] = useState<{ eventId: string; eventTitle: string } | null>(null)
  const [registrations, setRegistrations] = useState<{ id: string; full_name: string; phone_number: string; section: string; branch: string; year: string; created_at: string }[]>([])
  const [regCount, setRegCount] = useState(0)
  const [loadingRegs, setLoadingRegs] = useState(false)

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  const editing = clubs.find((c) => c.id === editingId) ?? null

  async function loadRegistrations(eventId: string, eventTitle: string) {
    setLoadingRegs(true)
    setViewingRegs({ eventId, eventTitle })
    const result = await getEventRegistrations(eventId, "club")
    setRegistrations(result.registrations)
    setRegCount(result.count)
    setLoadingRegs(false)
  }

  async function loadGallery(eventId: string, eventTitle: string, source: "club" | "activity" = "club") {
    setGalleryTarget({ eventId, eventTitle, source })
    const result = await getEventGalleryItems(eventId, source)
    setGalleryItems(result.items)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {isClubAdmin ? "Club Admin" : "Clubs Admin"}
        </p>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{sphereName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isClubAdmin ? "Manage your assigned club — information, activities, and events." : "Manage clubs — information, activities, events, and galleries."}
        </p>
      </div>

      {/* Create Club */}
      <div className="mb-6">
        {showCreate && (
          <ClubForm
            sphereId={sphereId}
            isPending={isPending}
            onClose={() => setShowCreate(false)}
            onSubmit={(fd) => run(async () => { const r = await createClubAction(fd); if (!r.error) setShowCreate(false); return r }, "Club created")}
          />
        )}
        {!isClubAdmin && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="size-3.5" />{showCreate ? "Hide form" : "Create club"}
          </Button>
        )}
      </div>

      {clubs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No clubs in this Sphere yet.
        </p>
      ) : (
        <div className="space-y-4">
          {clubs.map((club) => (
            <Card key={club.id} className="border-border/70 bg-card">
              <CardContent className="p-4">
                {/* Club header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      {club.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={club.logo_url} alt={club.name} className="size-10 rounded-lg border border-border/60 object-cover" />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/8">
                          <Users className="size-4 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="truncate font-medium text-foreground">{club.name}</p>
                        {club.category && <Badge variant="secondary" className="text-[10px] mt-0.5">{club.category}</Badge>}
                      </div>
                    </div>
                    {club.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{club.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(club.id)}>
                      <Pencil className="mr-1 size-3" />Edit
                    </Button>
                    <Button size="sm" variant="destructive" disabled={isPending}
                      onClick={() => { if (confirm(`Delete "${club.name}"?`)) run(() => deleteClubAction(club.id), "Club deleted") }}>
                      <Trash2 className="mr-1 size-3" />Delete
                    </Button>
                    {!isClubAdmin && (
                      <Button size="sm" variant="ghost"
                        onClick={() => setExpandedClub(expandedClub === club.id ? null : club.id)}>
                        {expandedClub === club.id ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        Manage
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded club management */}
                {(expandedClub === club.id || isClubAdmin) && (
                  <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
                    {/* Activities Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-foreground">Activities</h3>
                        <Button size="sm" variant="ghost" className="gap-1 text-xs"
                          onClick={() => { setShowAddActivity(true); setExpandedClub(club.id) }}>
                          <Plus className="size-3" />Add Activity
                        </Button>
                      </div>
                      {(() => {
                        const clubActivities = activities.filter((a) => a.club_id === club.id)
                        return clubActivities.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No activities yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {clubActivities.map((a) => (
                            <div key={a.id} className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/20 p-2">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{a.title}</p>
                                <p className="text-[10px] text-muted-foreground">{a.category} {a.venue ? `· ${a.venue}` : ""}</p>
                              </div>
                              <div className="flex gap-1">
                                <Button size="icon-sm" variant="ghost" disabled={isPending}
                                  onClick={() => loadGallery(a.id, a.title, "activity")}>
                                  <ImageIcon className="size-3 text-muted-foreground" />
                                </Button>
                                <Button size="icon-sm" variant="ghost" disabled={isPending}
                                  onClick={() => { if (confirm("Delete this activity?")) run(() => deleteClubActivityAction(a.id), "Activity deleted") }}>
                                  <Trash2 className="size-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                      })()}
                    </div>

                    {/* Club Events Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-foreground">Club Events</h3>
                        <Button size="sm" variant="ghost" className="gap-1 text-xs"
                          onClick={() => { setShowAddEvent(true); setEditingEventId(null); setExpandedClub(club.id) }}>
                          <Plus className="size-3" />Add Event
                        </Button>
                      </div>
                      {(() => {
                        const clubEvts = clubEvents.filter((e) => e.club_id === club.id)
                        return clubEvts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No club events yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {clubEvts.map((e) => (
                            <div key={e.id} className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/20 p-2">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{e.title}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {e.event_date || "Coming Soon"} {e.venue ? `· ${e.venue}` : ""}
                                  {typeof e.registration_count === "number" ? ` · ${e.registration_count} registrations` : ""}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <Button size="icon-sm" variant="ghost" disabled={isPending}
                                  onClick={() => loadRegistrations(e.id, e.title)}>
                                  <Users className="size-3 text-muted-foreground" />
                                </Button>
                                <Button size="icon-sm" variant="ghost" disabled={isPending}
                                  onClick={() => { setEditingEventId(e.id); setShowAddEvent(true); setExpandedClub(club.id) }}>
                                  <Pencil className="size-3 text-muted-foreground" />
                                </Button>
                                <Button size="icon-sm" variant="ghost" disabled={isPending}
                                  onClick={() => loadGallery(e.id, e.title, "club")}>
                                  <ImageIcon className="size-3 text-muted-foreground" />
                                </Button>
                                <Button size="icon-sm" variant="ghost" disabled={isPending}
                                  onClick={() => { if (confirm("Delete this event?")) run(() => deleteClubEventAction(e.id), "Event deleted") }}>
                                  <Trash2 className="size-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                      })()}
                    </div>

                    {/* Add Activity Form */}
                    {showAddActivity && expandedClub === club.id && (
                      <ActivityForm
                        clubId={club.id}
                        isPending={isPending}
                        onClose={() => setShowAddActivity(false)}
                        onSubmit={(fd) => run(async () => { const r = await createClubActivityAction(fd); if (!r.error) setShowAddActivity(false); return r }, "Activity created")}
                      />
                    )}

                    {/* Add/Edit Event Form */}
                    {showAddEvent && expandedClub === club.id && (
                      <ClubEventForm
                        clubId={club.id}
                        initial={clubEvents.find(e => e.id === editingEventId)}
                        isPending={isPending}
                        onClose={() => { setShowAddEvent(false); setEditingEventId(null) }}
                        onSubmit={(fd) => run(async () => { const r = editingEventId ? await updateClubEventAction(fd) : await createClubEventAction(fd); if (!r.error) { setShowAddEvent(false); setEditingEventId(null) }; return r }, editingEventId ? "Event updated" : "Event created")}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Club Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setEditingId(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-serif text-xl text-foreground">Edit club</p>
              <button type="button" onClick={() => setEditingId(null)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <ClubForm sphereId={sphereId} initial={editing} isPending={isPending}
              onClose={() => setEditingId(null)}
              onSubmit={(fd) => run(async () => { const r = await updateClubAction(fd); if (!r.error) setEditingId(null); return r }, "Club updated")} />
          </div>
        </div>
      )}

      {/* Registration Viewer Dialog */}
      {viewingRegs && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setViewingRegs(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-serif text-xl text-foreground">Registrations</p>
                <p className="text-xs text-muted-foreground">{viewingRegs.eventTitle} — {regCount} registered</p>
              </div>
              <button type="button" onClick={() => setViewingRegs(null)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label="Close"><X className="size-4" /></button>
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

      {/* Gallery Manager Dialog */}
      {galleryTarget && (
        <EventGalleryManager
          open={true}
          onOpenChange={(open) => { if (!open) setGalleryTarget(null) }}
          eventId={galleryTarget.eventId}
          eventTitle={galleryTarget.eventTitle}
          source={galleryTarget.source}
          items={galleryItems}
        />
      )}
    </div>
  )
}

// --- Club Form ---
function ClubForm({ sphereId, initial, isPending, onClose, onSubmit }: {
  sphereId: string; initial?: ClubRow; isPending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void
}) {
  const [logo, setLogo] = useState<string>(initial?.logo_url ?? "")
  const [busy, startTransition] = useTransition()
  const CATEGORIES = [
    { value: "coding", label: "Coding" }, { value: "robotics", label: "Robotics" },
    { value: "ai_ml", label: "AI/ML" }, { value: "cultural", label: "Cultural" },
    { value: "sports", label: "Sports" }, { value: "entrepreneurship", label: "Entrepreneurship" },
    { value: "literary", label: "Literary" }, { value: "photography", label: "Photography" },
    { value: "design", label: "Design" }, { value: "other", label: "Other" },
  ]
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("sphereId", sphereId); if (initial) fd.set("id", initial.id); fd.set("imageUrl", logo); startTransition(() => onSubmit(fd)) }}
      className="mb-3 grid gap-3 rounded-lg border border-border/70 bg-secondary/20 p-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="clubName">Club name</Label>
        <Input id="clubName" name="name" required maxLength={120} defaultValue={initial?.name ?? ""} placeholder="Coding Club" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clubCategory">Category</Label>
        <select id="clubCategory" name="category" defaultValue={initial?.category ?? "other"} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
          {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clubTagline">Tagline (optional)</Label>
        <Input id="clubTagline" name="tagline" maxLength={200} defaultValue={initial?.tagline ?? ""} placeholder="Building the future of code" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="clubDesc">Description</Label>
        <Textarea id="clubDesc" name="description" rows={2} defaultValue={initial?.description ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Logo (optional)</Label>
        <FileUpload value={logo} onChange={(v) => setLogo(typeof v === "string" ? v : (v[0] ?? ""))} label="Club logo" />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || isPending} className="gap-2">
          {(busy || isPending) && <Loader2 className="size-3.5 animate-spin" />}
          {initial ? "Save changes" : "Create club"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  )
}

// --- Activity Form ---
function ActivityForm({ clubId, isPending, onClose, onSubmit }: {
  clubId: string; isPending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void
}) {
  const [busy, startTransition] = useTransition()
  const [thumb, setThumb] = useState("")
  const CATS = ["coding", "workshop", "seminar", "competition", "cultural", "sports", "other"]
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("clubId", clubId); fd.set("thumbnailUrl", thumb); startTransition(() => onSubmit(fd)) }}
      className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:grid-cols-2">
      <p className="sm:col-span-2 text-xs font-medium text-foreground">Add Activity</p>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Title</Label><Input name="title" required maxLength={200} placeholder="Annual Coding Competition" />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <select name="category" defaultValue="other" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          {CATS.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
      </div>
      <div className="space-y-1.5"><Label>Date (optional)</Label><Input name="date" type="date" /></div>
      <div className="space-y-1.5"><Label>Venue</Label><Input name="venue" placeholder="Auditorium" /></div>
      <div className="space-y-1.5"><Label>Organizer</Label><Input name="organizer" placeholder="Coding Club" /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea name="description" rows={2} /></div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Thumbnail</Label>
        <FileUpload value={thumb} onChange={(v) => setThumb(v as string)} label="Activity thumbnail" />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || isPending} className="gap-2">
          {(busy || isPending) && <Loader2 className="size-3.5 animate-spin" />}Save Activity
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  )
}

// --- Club Event Form ---
function ClubEventForm({ clubId, initial, isPending, onClose, onSubmit }: {
  clubId: string; initial?: ClubEventRow; isPending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void
}) {
  const [busy, startTransition] = useTransition()
  const [thumb, setThumb] = useState(initial?.thumbnail_url ?? "")
  const [isComingSoon, setIsComingSoon] = useState(!initial?.event_date && !!initial)
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("clubId", clubId); fd.set("thumbnailUrl", thumb); if (initial) fd.set("id", initial.id); if (isComingSoon) fd.set("date", ""); startTransition(() => onSubmit(fd)) }}
      className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:grid-cols-2">
      <p className="sm:col-span-2 text-xs font-medium text-foreground">{initial ? "Edit Club Event" : "Add Club Event"}</p>
      <div className="space-y-1.5 sm:col-span-2"><Label>Event Title</Label><Input name="title" required maxLength={200} defaultValue={initial?.title ?? ""} placeholder="Hackathon 2026" /></div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" id="ceComingSoon" checked={isComingSoon} onChange={(e) => setIsComingSoon(e.target.checked)} className="size-4" />
        <Label htmlFor="ceComingSoon" className="text-sm font-normal">Coming Soon — date TBA</Label>
      </div>
      {!isComingSoon && (<>
        <div className="space-y-1.5"><Label>Date</Label><Input name="date" type="date" defaultValue={initial?.event_date ?? ""} /></div>
        <div className="space-y-1.5"><Label>Time</Label><Input name="time" type="time" defaultValue={initial?.event_time ?? ""} /></div>
      </>)}
      <div className="space-y-1.5"><Label>Venue</Label><Input name="venue" defaultValue={initial?.venue ?? ""} placeholder="Auditorium" /></div>
      <div className="space-y-1.5"><Label>Organizer</Label><Input name="organizer" defaultValue={initial?.organizer ?? ""} placeholder="Coding Club" /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea name="description" rows={2} defaultValue={initial?.description ?? ""} /></div>
      <div className="space-y-1.5"><Label>Contact Name</Label><Input name="contactName" defaultValue={initial?.contact_name ?? ""} /></div>
      <div className="space-y-1.5"><Label>Contact Phone</Label><Input name="contactPhone" defaultValue={initial?.contact_phone ?? ""} /></div>
      <div className="space-y-1.5"><Label>Contact Email</Label><Input name="contactEmail" type="email" defaultValue={initial?.contact_email ?? ""} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Registration URL (Google Form etc.)</Label><Input name="registrationUrl" defaultValue={initial?.registration_url ?? ""} placeholder="https://forms.google.com/..." /></div>
      <div className="space-y-1.5"><Label>Registration Deadline</Label><Input name="registrationDeadline" type="date" defaultValue={initial?.registration_deadline ?? ""} /></div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Thumbnail</Label>
        <FileUpload value={thumb} onChange={(v) => setThumb(typeof v === "string" ? v : (v[0] ?? ""))} label="Event thumbnail" />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || isPending} className="gap-2">
          {(busy || isPending) && <Loader2 className="size-3.5 animate-spin" />}Save Event
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  )
}
