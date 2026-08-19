"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ExternalLink, ChevronRight, Image as ImageIcon } from "lucide-react"
import { EventRegistrationDialog } from "@/components/event-registration-dialog"

type GalleryItem = { id: string; item_type: "photo" | "link"; url: string; title: string }

export function CollegeEventActions({
  eventId,
  eventTitle,
  hasRegUrl,
  registrationUrl,
  canRegister,
  isRegistered,
  registrationDeadline,
  galleryItems,
}: {
  eventId: string
  eventTitle: string
  hasRegUrl: boolean
  registrationUrl: string | null
  canRegister: boolean
  isRegistered: boolean
  registrationDeadline: string | null
  galleryItems: GalleryItem[]
}) {
  const [regOpen, setRegOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {hasRegUrl && canRegister && (
          <Button asChild size="sm" variant="default" className="gap-1.5">
            <a href={registrationUrl!} target="_blank" rel="noopener noreferrer">
              Register <ExternalLink className="size-3" />
            </a>
          </Button>
        )}
        {!hasRegUrl && canRegister && !isRegistered && (
          <Button size="sm" variant="default" className="gap-1.5" onClick={() => setRegOpen(true)}>
            Register <ChevronRight className="size-3" />
          </Button>
        )}
        {isRegistered && (
          <span className="inline-flex items-center gap-1 rounded-md border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
            Registered ✓
          </span>
        )}
        {!canRegister && !isRegistered && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
            Registration closed
          </span>
        )}
        {galleryItems.length > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setGalleryOpen(!galleryOpen)}>
            <ImageIcon className="size-3" /> Gallery ({galleryItems.length})
          </Button>
        )}
      </div>

      {/* Gallery display for past events */}
      {galleryOpen && galleryItems.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {galleryItems.map((item) =>
            item.item_type === "photo" ? (
              <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="group relative block aspect-square overflow-hidden rounded-lg border border-border/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.title || "Gallery photo"} className="h-full w-full object-cover transition group-hover:scale-105" />
              </a>
            ) : (
              <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="group flex aspect-square items-center justify-center rounded-lg border border-border/60 bg-secondary/20 p-2 text-center transition hover:bg-secondary/40">
                <span className="line-clamp-3 text-[10px] text-muted-foreground group-hover:text-foreground">{item.title || item.url}</span>
              </a>
            )
          )}
        </div>
      )}

      <EventRegistrationDialog
        open={regOpen}
        onOpenChange={setRegOpen}
        eventId={eventId}
        eventTitle={eventTitle}
        isAlreadyRegistered={isRegistered}
        registrationDeadline={registrationDeadline}
        source="college"
      />
    </>
  )
}
