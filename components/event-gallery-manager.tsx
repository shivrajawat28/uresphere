"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { Loader2, Plus, Trash2, ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { FileUpload } from "@/components/ui/file-upload"
import { addEventGalleryItemAction, deleteEventGalleryItemAction } from "@/lib/actions/admin"
import { toast } from "sonner"

export type GalleryItem = {
  id: string
  item_type: "photo" | "link"
  url: string
  title: string
}

export function EventGalleryManager({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  source,
  items,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  eventTitle: string
  source: "college" | "club" | "activity"
  items: GalleryItem[]
}) {
  const [isPending, startTransition] = useTransition()
  const [showAddPhoto, setShowAddPhoto] = useState(false)
  const [showAddLink, setShowAddLink] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string>("")
  const [linkUrl, setLinkUrl] = useState("")
  const [linkTitle, setLinkTitle] = useState("")
  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else {
        toast.success(success)
        setPhotoUrl("")
        setLinkUrl("")
        setLinkTitle("")
        setShowAddPhoto(false)
        setShowAddLink(false)
      }
    })
  }

  function handleAddPhoto() {
    if (!photoUrl) { toast.error("Upload a photo first."); return }
    const fd = new FormData()
    fd.set("eventId", eventId)
    fd.set("itemType", "photo")
    fd.set("url", photoUrl)
    fd.set("title", "")
    fd.set("source", source)
    run(() => addEventGalleryItemAction(fd), "Photo added")
  }

  function handleAddLink() {
    if (!linkUrl.trim()) { toast.error("Enter a URL."); return }
    const fd = new FormData()
    fd.set("eventId", eventId)
    fd.set("itemType", "link")
    fd.set("url", linkUrl.trim())
    fd.set("title", linkTitle.trim())
    fd.set("source", source)
    run(() => addEventGalleryItemAction(fd), "Link added")
  }

  const displayItems = items // Use initial items; refreshKey triggers re-render from parent

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Gallery — {eventTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button size="sm" variant={showAddPhoto ? "default" : "outline"} onClick={() => { setShowAddPhoto(!showAddPhoto); setShowAddLink(false) }}>
            <Plus className="size-3 mr-1" />Upload Photo
          </Button>
          <Button size="sm" variant={showAddLink ? "default" : "outline"} onClick={() => { setShowAddLink(!showAddLink); setShowAddPhoto(false) }}>
            <Plus className="size-3 mr-1" />Add Link
          </Button>
        </div>

        {showAddPhoto && (
          <div className="mb-4 rounded-lg border border-border/70 bg-secondary/20 p-4 space-y-3">
            <Label>Photo</Label>
            <FileUpload value={photoUrl} onChange={(v) => setPhotoUrl(v as string)} label="Gallery photo" />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddPhoto} disabled={isPending || !photoUrl}>
                {isPending ? <Loader2 className="size-3 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAddPhoto(false); setPhotoUrl("") }}>Cancel</Button>
            </div>
          </div>
        )}

        {showAddLink && (
          <div className="mb-4 rounded-lg border border-border/70 bg-secondary/20 p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/..." />
            </div>
            <div className="space-y-1.5">
              <Label>Title (optional)</Label>
              <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Google Drive album" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddLink} disabled={isPending || !linkUrl.trim()}>
                {isPending ? <Loader2 className="size-3 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAddLink(false); setLinkUrl(""); setLinkTitle("") }}>Cancel</Button>
            </div>
          </div>
        )}

        {displayItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No gallery items yet.</p>
        ) : (
          <div className="space-y-2">
            {displayItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 p-2">
                {item.item_type === "photo" ? (
                  <div className="relative size-16 shrink-0 overflow-hidden rounded border border-border">
                    <Image src={item.url} alt={item.title || "Gallery photo"} fill unoptimized className="object-cover" />
                  </div>
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded border border-border bg-secondary/40">
                    <ExternalLink className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Badge variant="outline" className="text-[10px] mb-1">{item.item_type === "photo" ? "Photo" : "Link"}</Badge>
                  {item.title && <p className="text-xs font-medium text-foreground truncate">{item.title}</p>}
                  <p className="text-[10px] text-muted-foreground truncate">{item.url}</p>
                </div>
                <Button size="icon-sm" variant="ghost" disabled={isPending}
                  onClick={() => {
                    if (confirm("Delete this gallery item?")) {
                      run(() => deleteEventGalleryItemAction(item.id, source), "Deleted")
                    }
                  }}>
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
