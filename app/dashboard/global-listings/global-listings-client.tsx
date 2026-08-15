"use client"

import { useMemo, useState, useTransition } from "react"
import { upsertGlobalListingAction, deleteGlobalListingAction } from "@/lib/actions/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Search, MapPin, Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { GlobalListing } from "./page"

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

function formatPrice(cents: number | null) {
  if (cents === null) return ""
  return (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

export function GlobalListingsClient({
  member,
  listings,
}: {
  member: { role: string }
  listings: GlobalListing[]
}) {
  const isSuperAdmin = member.role === "super_admin"
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [editing, setEditing] = useState<GlobalListing | "new" | null>(null)
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
          <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Global Listings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hostels, cafés, gyms, and local businesses — the same listings in every Sphere, maintained by UreSphere.
          </p>
        </div>
        {isSuperAdmin && (
          <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" />
            Add listing
          </Button>
        )}
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hostels, cafés, gyms…"
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
          No listings match your search.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((listing) => (
            <Card key={listing.id} className="border-border/70 bg-card">
              <CardContent className="flex h-full flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 font-medium text-foreground">{listing.title}</h3>
                  {formatPrice(listing.price_cents) && (
                    <span className="shrink-0 font-serif text-lg font-semibold text-primary">
                      {formatPrice(listing.price_cents)}
                    </span>
                  )}
                </div>
                <Badge variant="secondary" className="w-fit capitalize">
                  {CATEGORY_LABELS[listing.category] ?? listing.category}
                </Badge>
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{listing.description}</p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {listing.city || "—"}
                    {listing.address ? ` · ${listing.address}` : ""}
                  </p>
                  {isSuperAdmin && (
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(listing)} aria-label="Edit">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          run(() => deleteGlobalListingAction(listing.id, listing.image_urls), "Listing deleted")
                        }
                        disabled={isPending}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
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
            <DialogDescription>Visible in every Sphere. Managed by platform admins.</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => {
              if (editing && editing !== "new") formData.set("id", editing.id)
              run(
                () => {
                  const p = upsertGlobalListingAction(formData)
                  return p.then((r) => {
                    if (!r.error) setEditing(null)
                    return r
                  })
                },
                "Listing saved",
                () => setEditing(null),
              )
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required maxLength={120} defaultValue={editing && editing !== "new" ? editing.title : ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Category</Label>
                <Select name="category" defaultValue={editing && editing !== "new" ? editing.category : "hostel"}>
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
                <Label htmlFor="price">Price (₹, optional)</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={editing && editing !== "new" && editing.price_cents !== null ? editing.price_cents / 100 : ""}
                  placeholder="e.g. 2500"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" maxLength={2000} rows={3} defaultValue={editing && editing !== "new" ? editing.description : ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" defaultValue={editing && editing !== "new" ? editing.city : ""} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" defaultValue={editing && editing !== "new" ? editing.address : ""} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact">Contact info</Label>
              <Input id="contact" name="contact" defaultValue={editing && editing !== "new" ? editing.contact : ""} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                Save listing
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
