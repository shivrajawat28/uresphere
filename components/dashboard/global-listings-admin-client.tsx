"use client"

import { useMemo, useState, useTransition } from "react"
import {
  deleteGlobalListingAction,
  setGlobalListingStatusAction,
  upsertGlobalListingAction,
} from "@/lib/actions/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FileUpload } from "@/components/ui/file-upload"
import { Search, Globe, Plus, Pencil, Trash2, Eye, EyeOff, Loader2 } from "lucide-react"
import { toast } from "sonner"

const CATEGORY_LABELS: Record<string, string> = {
  all: "All categories",
  hostel: "Hostels",
  pg: "PGs",
  cafe: "Cafes",
  restaurant: "Restaurants",
  gym: "Gyms",
  services: "Services",
  business: "Local businesses",
  other: "Other",
}

type Row = {
  id: string
  title: string
  description: string
  category: string
  price_cents: number | null
  address: string
  city: string
  contact: string
  image_urls: string[]
  status: "active" | "hidden"
  created_at: string
}

function formatPrice(cents: number | null) {
  if (cents === null) return ""
  return (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

export function GlobalListingsAdminClient({ listings }: { listings: Row[] }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [editing, setEditing] = useState<Row | "new" | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return listings.filter((l) => {
      const matchesCategory = category === "all" || l.category === category
      const matchesQuery =
        q.length === 0 ||
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [listings, query, category])

  function run(action: () => Promise<{ error: string | null }>, success: string, close?: () => void) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else {
        toast.success(success)
        close?.()
      }
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Globe className="size-3.5" aria-hidden="true" />
            Global Listings Admin
          </p>
          <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Manage listings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hostels, PGs, cafés, restaurants, gyms and local services — visible in every Sphere once published.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" />
          Add listing
        </Button>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search listings…"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No listings match.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((listing) => (
            <Card key={listing.id} className="border-border/70 bg-card">
              <CardContent className="flex h-full flex-col gap-2 p-5">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted">
                  {listing.image_urls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={listing.image_urls[0]} alt={listing.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                      No photo
                    </div>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 font-medium text-foreground">{listing.title}</h3>
                  {formatPrice(listing.price_cents) && (
                    <span className="shrink-0 font-serif text-lg font-semibold text-primary">
                      {formatPrice(listing.price_cents)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="capitalize">
                    {CATEGORY_LABELS[listing.category] ?? listing.category}
                  </Badge>
                  {listing.status === "hidden" ? (
                    <Badge variant="outline" className="border-border/60 text-muted-foreground">
                      Hidden
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      Published
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{listing.description}</p>
                <p className="mt-auto text-xs text-muted-foreground">
                  {listing.city || "—"}
                  {listing.address ? ` · ${listing.address}` : ""}
                </p>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(
                        () => setGlobalListingStatusAction(listing.id, listing.status === "active" ? "hidden" : "active"),
                        listing.status === "active" ? "Listing hidden" : "Listing published",
                      )
                    }
                    disabled={isPending}
                    className="gap-1.5"
                  >
                    {listing.status === "active" ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {listing.status === "active" ? "Unpublish" : "Publish"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(listing)} className="gap-1.5">
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete “${listing.title}”?`)) {
                        run(() => deleteGlobalListingAction(listing.id, listing.image_urls), "Listing deleted")
                      }
                    }}
                    disabled={isPending}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add a global listing" : "Edit listing"}</DialogTitle>
            <DialogDescription>Visible in every Sphere once published.</DialogDescription>
          </DialogHeader>
          <ListingForm
            key={editing === "new" ? "new" : (editing?.id ?? "none")}
            initial={editing === "new" ? null : editing}
            isPending={isPending}
            onSaved={() => setEditing(null)}
            onSubmit={(fd) =>
              run(
                () => upsertGlobalListingAction(fd).then((r) => {
                  if (!r.error) setEditing(null)
                  return r
                }),
                "Listing saved",
                () => setEditing(null),
              )
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ListingForm({
  initial,
  isPending,
  onSaved,
  onSubmit,
}: {
  initial: Row | null
  isPending: boolean
  onSaved: () => void
  onSubmit: (fd: FormData) => void
}) {
  const [images, setImages] = useState<string[]>(initial?.image_urls ?? [])
  const [busy, startTransition] = useTransition()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        if (initial) fd.set("id", initial.id)
        fd.set("imageUrls", JSON.stringify(images))
        startTransition(() => onSubmit(fd))
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="glTitle">Title</Label>
        <Input id="glTitle" name="title" required maxLength={120} defaultValue={initial?.title ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Category</Label>
          <Select name="category" defaultValue={initial?.category ?? "hostel"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS)
                .filter(([v]) => v !== "all")
                .map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="glPrice">Price (₹, optional)</Label>
          <Input
            id="glPrice"
            name="price"
            type="number"
            min="0"
            step="1"
            defaultValue={initial && initial.price_cents !== null ? initial.price_cents / 100 : ""}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="glDesc">Description</Label>
        <Textarea id="glDesc" name="description" maxLength={2000} rows={3} defaultValue={initial?.description ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="glCity">City</Label>
          <Input id="glCity" name="city" defaultValue={initial?.city ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="glAddress">Address</Label>
          <Input id="glAddress" name="address" defaultValue={initial?.address ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="glContact">Contact / website</Label>
        <Input id="glContact" name="contact" defaultValue={initial?.contact ?? ""} placeholder="Phone, Instagram, website…" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Photos</Label>
        <FileUpload
          multiple
          maxFiles={6}
          accept="image"
          value={images}
          onChange={(v) => setImages(typeof v === "string" ? [v] : v)}
          label="Listing photos"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || isPending} className="gap-2">
          {busy || isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save listing
        </Button>
        <Button type="button" variant="ghost" onClick={onSaved}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
