"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ListingCard } from "@/components/marketplace/listing-card"
import { CreateListingDialog } from "@/components/marketplace/create-listing-dialog"
import type { Listing } from "@/app/dashboard/marketplace/page"

const CATEGORY_LABELS: Record<string, string> = {
  all: "All categories",
  books: "Books",
  calculators: "Calculators",
  cycles: "Cycles",
  electronics: "Electronics",
  college_supplies: "College supplies",
  other: "Other",
}

export function MarketplaceGrid({
  listings,
  currentUserId,
}: {
  listings: Listing[]
  currentUserId: string
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    return listings.filter((listing) => {
      const matchesCategory = category === "all" || listing.category === category
      const matchesQuery =
        query.trim().length === 0 ||
        listing.title.toLowerCase().includes(query.toLowerCase()) ||
        listing.description.toLowerCase().includes(query.toLowerCase())
      return matchesCategory && matchesQuery
    })
  }, [listings, query, category])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search listings"
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={(value) => setCategory(value ?? "all")}>
            <SelectTrigger className="w-full sm:w-48">
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
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          List an item
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="font-serif text-lg text-foreground">Nothing here yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {listings.length === 0
              ? "Be the first to list something for your Sphere."
              : "Try a different search or category."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((listing) => (
            <ListingCard key={listing.id} listing={listing} currentUserId={currentUserId} />
          ))}
        </div>
      )}

      <CreateListingDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
