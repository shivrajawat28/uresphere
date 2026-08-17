"use client"

import { useState, useTransition } from "react"
import { CalendarDays, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createEventAction, deleteEventAction, updateEventAction } from "@/lib/actions/admin"
import { FileUpload } from "@/components/ui/file-upload"
import { toast } from "sonner"

type EventRow = {
  id: string
  title: string
  description: string
  event_date: string
  event_time: string | null
  venue: string
  organizer: string
  image_url: string | null
}

export function EventsAdminClient({
  sphereId,
  sphereName,
  events,
}: {
  sphereId: string
  sphereName: string
  events: EventRow[]
}) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  const editing = events.find((e) => e.id === editingId) ?? null

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          Events Admin
        </p>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{sphereName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the events members see on the Events page — create, edit and remove them.
        </p>
      </div>

      <div className="mb-6">
        {showCreate && (
          <EventForm
            sphereId={sphereId}
            isPending={isPending}
            onClose={() => setShowCreate(false)}
            onSubmit={(fd) =>
              run(async () => {
                const r = await createEventAction(fd)
                if (!r.error) setShowCreate(false)
                return r
              }, "Event created")
            }
          />
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-3.5" aria-hidden="true" />
          {showCreate ? "Hide form" : "Create event"}
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No events in this Sphere yet.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Card key={e.id} className="border-border/70 bg-card">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e.event_date}
                      {e.event_time ? ` · ${e.event_time.slice(0, 5)}` : ""}
                      {e.venue ? ` · ${e.venue}` : " · Venue TBA"}
                      {e.organizer ? ` · ${e.organizer}` : ""}
                    </p>
                    {e.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(e.id)}>
                      <Pencil className="mr-1 size-3" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm("Delete this event? Members will no longer see it.")) {
                          run(() => deleteEventAction(e.id), "Event deleted")
                        }
                      }}
                    >
                      <Trash2 className="mr-1 size-3" aria-hidden="true" />
                      Delete
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
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="Close editor"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <EventForm
              sphereId={sphereId}
              initial={editing}
              isPending={isPending}
              onClose={() => setEditingId(null)}
              onSubmit={(fd) =>
                run(async () => {
                  const r = await updateEventAction(fd)
                  if (!r.error) setEditingId(null)
                  return r
                }, "Event updated")
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function EventForm({
  sphereId,
  initial,
  isPending,
  onClose,
  onSubmit,
}: {
  sphereId: string
  initial?: EventRow
  isPending: boolean
  onClose: () => void
  onSubmit: (fd: FormData) => void
}) {
  const [busy, startTransition] = useTransition()
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "")
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set("sphereId", sphereId)
        if (initial) fd.set("id", initial.id)
        if (imageUrl) fd.set("imageUrl", imageUrl)
        startTransition(() => onSubmit(fd))
      }}
      className="mb-3 grid gap-3 rounded-lg border border-border/70 bg-secondary/20 p-4 sm:grid-cols-2"
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="evTitle">Title</Label>
        <Input id="evTitle" name="title" required maxLength={120} defaultValue={initial?.title ?? ""} placeholder="Tech Fest 2026" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="evDate">Date</Label>
        <Input id="evDate" name="date" type="date" required defaultValue={initial?.event_date ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="evTime">Time (optional)</Label>
        <Input id="evTime" name="time" type="time" defaultValue={initial?.event_time ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="evVenue">Venue (optional)</Label>
        <Input id="evVenue" name="venue" defaultValue={initial?.venue ?? ""} placeholder="Main Auditorium" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="evOrganizer">Organizer (optional)</Label>
        <Input id="evOrganizer" name="organizer" defaultValue={initial?.organizer ?? ""} placeholder="Coding Club" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="evDesc">Description (optional)</Label>
        <Textarea id="evDesc" name="description" rows={2} defaultValue={initial?.description ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Event image (optional)</Label>
        <FileUpload
          accept="image"
          value={imageUrl}
          onChange={(v) => setImageUrl(v as string)}
          label="Event image"
        />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || isPending} className="gap-2">
          {busy || isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {initial ? "Save changes" : "Create event"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
