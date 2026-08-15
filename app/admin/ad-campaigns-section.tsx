"use client"

import { useRef, useState, useTransition } from "react"
import {
  createAdAction,
  updateAdAction,
  setAdActiveAction,
  archiveAdAction,
  deleteAdAction,
} from "@/lib/actions/advertising"
import { AD_PLACEMENT_LABELS, adStatus, type AdAdminRow } from "@/lib/ads"
import { AdCard } from "@/components/ads/ad-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { Loader2, Megaphone, Pencil, Eye, Archive, Trash2, Power, Plus, Upload, X } from "lucide-react"

const STATUS_STYLES: Record<string, string> = {
  live: "bg-primary/10 text-primary",
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  expired: "bg-destructive/10 text-destructive",
  inactive: "bg-secondary text-muted-foreground",
  archived: "bg-secondary text-muted-foreground line-through",
}

const STATUS_LABELS: Record<string, string> = {
  live: "Live",
  scheduled: "Scheduled",
  expired: "Expired",
  inactive: "Inactive",
  archived: "Archived",
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AdCampaignsSection({ ads }: { ads: AdAdminRow[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AdAdminRow | null>(null)
  const [preview, setPreview] = useState<AdAdminRow | null>(null)
  const [confirm, setConfirm] = useState<{ type: "archive" | "delete"; ad: AdAdminRow } | null>(null)
  const [isPending, startTransition] = useTransition()

  const now = new Date()
  const stats = {
    total: ads.length,
    live: ads.filter((a) => adStatus(a, now) === "live").length,
    scheduled: ads.filter((a) => adStatus(a, now) === "scheduled").length,
    expired: ads.filter((a) => adStatus(a, now) === "expired").length,
  }

  function toggleActive(ad: AdAdminRow) {
    startTransition(async () => {
      const result = await setAdActiveAction(ad.id, !ad.active)
      if (result.error) toast.error(result.error)
      else toast.success(ad.active ? "Advertisement deactivated" : "Advertisement activated")
    })
  }

  function runConfirm() {
    if (!confirm) return
    const { type, ad } = confirm
    startTransition(async () => {
      const result = type === "archive" ? await archiveAdAction(ad.id) : await deleteAdAction(ad.id)
      if (result.error) toast.error(result.error)
      else {
        toast.success(type === "archive" ? "Advertisement archived" : "Advertisement deleted")
        setConfirm(null)
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Total ads", stats.total],
            ["Active", stats.live],
            ["Scheduled", stats.scheduled],
            ["Expired", stats.expired],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/70 bg-card p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-serif text-2xl text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Advertisements shown on Academic, Social and Marketplace pages.</p>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />
          New advertisement
        </Button>
      </div>

      {/* Empty state */}
      {ads.length === 0 && (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No advertisements yet. Create your first campus advertisement.
        </p>
      )}

      {/* Table */}
      <div className="space-y-3">
        {ads.map((ad) => {
          const status = adStatus(ad, now)
          return (
            <div key={ad.id} className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-secondary sm:h-14 sm:w-24">
                  {ad.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ad.imageUrl} alt="" loading="lazy" className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground">
                      <Megaphone className="size-4" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${ad.archived ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {ad.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {ad.placements.map((p) => (
                      <Badge key={p} variant="outline" className="border-border/60 text-[10px] font-normal capitalize">
                        {AD_PLACEMENT_LABELS[p as keyof typeof AD_PLACEMENT_LABELS] ?? p}
                      </Badge>
                    ))}
                    <Badge className={`text-[10px] font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.inactive}`}>
                      {STATUS_LABELS[status] ?? status}
                    </Badge>
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {ad.startsAt && ad.endsAt ? (
                    <p>
                      {new Date(ad.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} →{" "}
                      {new Date(ad.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  ) : (
                    <p>No schedule</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button size="icon-sm" variant="outline" aria-label="Preview advertisement" onClick={() => setPreview(ad)}>
                    <Eye className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="outline" aria-label="Edit advertisement" onClick={() => setEditing(ad)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant={ad.active ? "secondary" : "outline"}
                    aria-label={ad.active ? "Deactivate advertisement" : "Activate advertisement"}
                    disabled={ad.archived || isPending}
                    onClick={() => toggleActive(ad)}
                  >
                    <Power className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="outline" aria-label="Archive advertisement" disabled={isPending} onClick={() => setConfirm({ type: "archive", ad })}>
                    <Archive className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete advertisement" className="text-destructive hover:text-destructive" disabled={isPending} onClick={() => setConfirm({ type: "delete", ad })}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create / edit dialog */}
      <AdFormDialog
        open={createOpen || editing !== null}
        initial={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditing(null)
          }
        }}
      />

      {/* Preview dialog */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advertisement preview</DialogTitle>
            <DialogDescription>Exactly how members will see it on the targeted pages.</DialogDescription>
          </DialogHeader>
          {preview && <AdCard ad={preview} />}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destructive confirmations */}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm ? (confirm.type === "archive" ? "Archive this advertisement?" : "Delete this advertisement?") : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? confirm.type === "archive"
                  ? `"${confirm.ad.title}" will stop displaying everywhere immediately. You can't undo this from the UI.`
                  : `"${confirm.ad.title}" will be permanently removed. This can't be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={runConfirm}>
              {confirm ? (confirm.type === "archive" ? "Archive" : "Delete") : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------

function AdFormDialog({
  open,
  initial,
  onOpenChange,
}: {
  open: boolean
  initial: AdAdminRow | null
  onOpenChange: (open: boolean) => void
}) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "")
  const [destinationUrl, setDestinationUrl] = useState(initial?.destinationUrl ?? "")
  const [placements, setPlacements] = useState<string[]>(initial?.placements ?? [])
  const [startsAt, setStartsAt] = useState(toLocalInputValue(initial?.startsAt))
  const [endsAt, setEndsAt] = useState(toLocalInputValue(initial?.endsAt))
  const [active, setActive] = useState(initial?.active ?? false)
  const [uploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The dialog stays mounted across opens (create → create, create → edit,
  // edit → create), so reset every field whenever it transitions from closed
  // to open — otherwise stale state from the previous ad (e.g. already-checked
  // placements) would carry over into the new form.
  const [wasOpen, setWasOpen] = useState(open)
  if (open && !wasOpen) {
    setWasOpen(true)
    setTitle(initial?.title ?? "")
    setDescription(initial?.description ?? "")
    setImageUrl(initial?.imageUrl ?? "")
    setDestinationUrl(initial?.destinationUrl ?? "")
    setPlacements(initial?.placements ?? [])
    setStartsAt(toLocalInputValue(initial?.startsAt))
    setEndsAt(toLocalInputValue(initial?.endsAt))
    setActive(initial?.active ?? false)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  function togglePlacement(p: string) {
    setPlacements((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/ads/upload", { method: "POST", body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Upload failed")
      setImageUrl(json.url)
      toast.success("Image uploaded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData()
    if (initial) formData.set("id", initial.id)
    formData.set("title", title)
    formData.set("description", description)
    formData.set("imageUrl", imageUrl)
    formData.set("destinationUrl", destinationUrl)
    for (const p of placements) formData.append("placements", p)
    formData.set("startsAt", new Date(startsAt).toISOString())
    formData.set("endsAt", new Date(endsAt).toISOString())
    formData.set("active", active ? "on" : "off")

    startTransition(async () => {
      const result = initial ? await updateAdAction(formData) : await createAdAction(formData)
      if (result.error) toast.error(result.error)
      else {
        toast.success(initial ? "Advertisement updated" : "Advertisement created")
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit advertisement" : "New advertisement"}</DialogTitle>
          <DialogDescription>
            Shown as sponsored content on the selected placements. Only super admins can manage ads.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="adTitle">Title</Label>
            <Input id="adTitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Campus Café — 20% off this month" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="adDescription">Description</Label>
            <Textarea id="adDescription" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} required rows={3} placeholder="A short, honest description of the offer." />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Image</Label>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="Advertisement preview" className="size-full object-cover" referrerPolicy="no-referrer" />
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
                    aria-label="Remove image"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-16 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  <span className="text-[10px]">Upload</span>
                </button>
              )}
              {imageUrl && (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-xs text-primary hover:underline">
                  Replace
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFileChange} />
            <p className="text-[11px] text-muted-foreground">PNG, JPEG, WebP or GIF · max 5 MB</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="adDestination">Destination URL</Label>
            <Input id="adDestination" type="url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} required placeholder="https://example.com/offer" />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Placements</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(AD_PLACEMENT_LABELS).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                    placements.includes(value)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/70 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <input type="checkbox" checked={placements.includes(value)} onChange={() => togglePlacement(value)} className="size-3.5 accent-primary" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="adStartsAt">Start</Label>
              <Input id="adStartsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="adEndsAt">End</Label>
              <Input id="adEndsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-3.5 accent-primary" />
            Active (show immediately, within the schedule window)
          </label>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || uploading}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : initial ? "Save changes" : "Create advertisement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
