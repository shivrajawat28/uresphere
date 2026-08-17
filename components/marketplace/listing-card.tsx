"use client"

import Image from "next/image"
import { useState, useTransition } from "react"
import { MoreVertical, Flag, Trash2, CheckCircle2, ImageOff, ShoppingCart, Loader2 } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  addToCartAction,
  deleteListingAction,
  reportListingAction,
  updateListingStatusAction,
} from "@/lib/actions/marketplace"
import { BuyNowDialog } from "@/components/marketplace/buy-now-dialog"
import type { Listing } from "@/app/dashboard/marketplace/page"

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like new",
  used: "Used",
  fair: "Fair",
}

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

export function ListingCard({ listing, currentUserId }: { listing: Listing; currentUserId: string }) {
  const isOwner = listing.seller_id === currentUserId
  const [reportOpen, setReportOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [isPending, startTransition] = useTransition()
  const coverImage = listing.image_urls[0]
  const publicStatus = listing.status === "active" || listing.status === "sold"
  const effectivePrice = listing.admin_price_cents ?? listing.price_cents

  function handleMarkSold() {
    startTransition(async () => {
      const result = await updateListingStatusAction(listing.id, "sold")
      if (result.error) toast.error(result.error)
      else toast.success("Marked as sold")
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteListingAction(listing.id, listing.image_urls)
      if (result.error) toast.error(result.error)
      else toast.success("Listing removed")
    })
  }

  function handleReport() {
    startTransition(async () => {
      const result = await reportListingAction(listing.id, listing.sphere_id, reason)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Report submitted")
        setReportOpen(false)
        setReason("")
      }
    })
  }

  function handleAddToCart() {
    startTransition(async () => {
      const result = await addToCartAction(listing.id, 1)
      if (result.error) toast.error(result.error)
      else toast.success("Added to your cart")
    })
  }

  return (
    <Card className="overflow-hidden border-border bg-card">
      <div className="relative aspect-[4/3] w-full bg-muted">
        {coverImage ? (
          <Image src={coverImage} alt={listing.title} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        {listing.status === "sold" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Badge className="bg-primary text-primary-foreground">Sold</Badge>
          </div>
        )}
        {listing.status === "pending" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Badge variant="outline" className="border-amber-500/50 bg-background/90 text-amber-600">
              Pending review
            </Badge>
          </div>
        )}
        {listing.status === "removed" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Badge variant="outline" className="border-destructive/40 bg-background/90 text-destructive">
              {listing.rejection_reason ? "Rejected" : "Removed"}
            </Badge>
          </div>
        )}
        <div className="absolute right-2 top-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" aria-label="Listing options">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwner ? (
                <>
                  {listing.status === "active" && (
                    <DropdownMenuItem onClick={handleMarkSold} disabled={isPending}>
                      <CheckCircle2 className="h-4 w-4" /> Mark as sold
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleDelete} disabled={isPending} className="text-destructive">
                    <Trash2 className="h-4 w-4" /> Delete listing
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => setReportOpen(true)}>
                  <Flag className="h-4 w-4" /> Report listing
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <CardContent className="flex flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-medium text-foreground">{listing.title}</h3>
          <span className="shrink-0 font-serif text-lg font-semibold text-primary">{formatPrice(effectivePrice)}</span>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{listing.description}</p>
        {isOwner && listing.status === "removed" && listing.rejection_reason && (
          <p className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
            Rejected: {listing.rejection_reason}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3 border-t border-border p-4 pt-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {listing.category}
          </Badge>
          <span className="text-xs text-muted-foreground">{CONDITION_LABELS[listing.condition]}</span>
        </div>
        {publicStatus && !isOwner && listing.status === "active" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleAddToCart} disabled={isPending} className="gap-1.5">
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShoppingCart className="size-3.5" />}
              Add to cart
            </Button>
            <Button size="sm" onClick={() => setBuyOpen(true)}>
              Buy now
            </Button>
          </div>
        )}
      </CardFooter>

      {publicStatus && !isOwner && listing.status === "active" && (
        <BuyNowDialog
          listingId={listing.id}
          title={listing.title}
          priceCents={effectivePrice}
          open={buyOpen}
          onOpenChange={setBuyOpen}
        />
      )}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this listing</DialogTitle>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What's wrong with this listing?"
            maxLength={500}
            rows={4}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={handleReport} disabled={isPending || reason.trim().length === 0}>
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
