"use client"

import { useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { createOrderAction } from "@/lib/actions/platform"
import { toast } from "sonner"

type Props = {
  listingId: string
  title: string
  priceCents: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatINR(cents: number) {
  return (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

export function BuyNowDialog({ listingId, title, priceCents, open, onOpenChange }: Props) {
  const [isPending, startTransition] = useTransition()
  const feeCents = Math.round(priceCents * 0.05)
  const settlementCents = priceCents - feeCents

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("listingId", listingId)
    startTransition(async () => {
      const result = await createOrderAction(formData)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Buy request sent to the seller — they'll confirm delivery details.")
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buy “{title}”</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5 rounded-md border border-border/70 bg-secondary/20 p-4 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Item price</span>
            <span className="text-foreground">{formatINR(priceCents)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Platform fee (5%)</span>
            <span className="text-foreground">{formatINR(feeCents)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5 font-medium">
            <span className="text-foreground">Estimated seller settlement</span>
            <span className="text-primary">{formatINR(settlementCents)}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            MVP note: no payment is collected yet — this just sends a buy request to the seller.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="buyerName">Your name</Label>
            <Input id="buyerName" name="buyerName" required placeholder="Jordan Alvarez" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buyerPhone">Phone</Label>
            <Input id="buyerPhone" name="buyerPhone" type="tel" required placeholder="(555) 123-4567" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Delivery address</Label>
            <Input id="address" name="address" required placeholder="Hostel block, room, campus…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deliveryDate">Preferred delivery date (optional)</Label>
            <Input id="deliveryDate" name="deliveryDate" type="date" />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Send buy request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
