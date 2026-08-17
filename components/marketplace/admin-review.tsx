"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { reviewListingAction } from "@/lib/actions/marketplace"
import { toast } from "sonner"
import type { Listing } from "@/app/dashboard/marketplace/page"

type PendingListing = Listing & { sellerHandle: string }

function formatINR(cents: number) {
  return (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

const CATEGORY_LABELS: Record<string, string> = {
  books: "Books",
  calculators: "Calculators",
  cycles: "Cycles",
  electronics: "Electronics",
  college_supplies: "College supplies",
  other: "Other",
}

/**
 * Admin review queue for the Marketplace tab. Only rendered when the caller
 * may review listings (server-gated in the page); every action is re-gated
 * server-side in reviewListingAction.
 */
export function MarketplaceAdminReview({ pendingListings }: { pendingListings: PendingListing[] }) {
  const [isPending, startTransition] = useTransition()

  if (pendingListings.length === 0) return null

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-medium text-foreground">
          Pending listings ({pendingListings.length})
        </h2>
      </div>
      <div className="space-y-3">
        {pendingListings.map((listing) => (
          <ReviewRow key={listing.id} listing={listing} isPending={isPending} startTransition={startTransition} />
        ))}
      </div>
    </div>
  )
}

function ReviewRow({
  listing,
  isPending,
  startTransition,
}: {
  listing: PendingListing
  isPending: boolean
  startTransition: (fn: () => void) => void
}) {
  const [price, setPrice] = useState("")
  const [reason, setReason] = useState("")

  function review(decision: "approve" | "reject") {
    startTransition(async () => {
      const result = await reviewListingAction(listing.id, decision, price, reason)
      if (result.error) toast.error(result.error)
      else toast.success(decision === "approve" ? "Listing approved and published" : "Listing rejected")
    })
  }

  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:h-24 sm:w-24">
          {listing.image_urls[0] ? (
            <Image src={listing.image_urls[0]} alt={listing.title} fill unoptimized className="object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{listing.title}</p>
              <p className="text-xs text-muted-foreground">
                by <span className="font-mono text-primary">{listing.sellerHandle}</span> ·{" "}
                {CATEGORY_LABELS[listing.category] ?? listing.category} · listed{" "}
                {new Date(listing.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 border-border/60 text-amber-600">
              Requested {formatINR(listing.price_cents)}
            </Badge>
          </div>
          {listing.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{listing.description}</p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1 sm:w-44">
              <Label htmlFor={`final-price-${listing.id}`} className="text-[11px]">
                Final price (optional)
              </Label>
              <Input
                id={`final-price-${listing.id}`}
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={String(Math.round(listing.price_cents / 100))}
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label htmlFor={`reject-reason-${listing.id}`} className="text-[11px]">
                Rejection reason (if rejecting)
              </Label>
              <Input
                id={`reject-reason-${listing.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why isn't this approved?"
                maxLength={300}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" disabled={isPending} onClick={() => review("approve")}>
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Approve
            </Button>
            <Button size="sm" variant="destructive" className="gap-1.5" disabled={isPending} onClick={() => review("reject")}>
              <XCircle className="size-3.5" />
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
