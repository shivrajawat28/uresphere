"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { checkoutCartAction, removeFromCartAction, updateCartQuantityAction } from "@/lib/actions/marketplace"
import { toast } from "sonner"
import type { CartItem } from "@/app/dashboard/marketplace/page"

function formatINR(cents: number) {
  return (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

export function CartSection({ cartItems }: { cartItems: CartItem[] }) {
  const [isPending, startTransition] = useTransition()
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const subtotal = cartItems.reduce((sum, item) => sum + item.price_cents * item.quantity, 0)
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  function setQuantity(item: CartItem, qty: number) {
    if (qty < 1) return
    startTransition(async () => {
      const result = await updateCartQuantityAction(item.id, qty)
      if (result.error) toast.error(result.error)
    })
  }

  function removeItem(item: CartItem) {
    startTransition(async () => {
      const result = await removeFromCartAction(item.id)
      if (result.error) toast.error(result.error)
    })
  }

  function handleCheckout(formData: FormData) {
    startTransition(async () => {
      const result = await checkoutCartAction(formData)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Order placed — the seller will confirm delivery details.")
        setCheckoutOpen(false)
      }
    })
  }

  if (cartItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
        <ShoppingCart className="size-8 text-muted-foreground/50" aria-hidden="true" />
        <p className="font-serif text-lg text-foreground">Your cart is empty</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add items from your Marketplace or the ÙreSphere Shop and check out with delivery details.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex-1 space-y-3">
        {cartItems.map((item) => (
          <Card key={item.id} className="border-border/70 bg-card">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {item.image_url ? (
                  <Image src={item.image_url} alt={item.title} fill unoptimized className="object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                    No photo
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatINR(item.price_cents)} each · line total {formatINR(item.price_cents * item.quantity)}
                </p>
                {item.status === "shop" && <p className="text-[11px] text-muted-foreground">ÙreSphere Shop item</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Decrease quantity"
                  disabled={isPending}
                  onClick={() => setQuantity(item, item.quantity - 1)}
                >
                  <Minus className="size-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium" aria-live="polite">
                  {item.quantity}
                </span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Increase quantity"
                  disabled={isPending}
                  onClick={() => setQuantity(item, item.quantity + 1)}
                >
                  <Plus className="size-3" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove from cart"
                  disabled={isPending}
                  onClick={() => removeItem(item)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="w-full lg:w-72">
        <Card className="border-border/70 bg-card">
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium text-foreground">Order summary</p>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
              <span className="text-foreground">{formatINR(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Delivery</span>
              <span>On delivery</span>
            </div>
            <div className="flex items-center justify-between border-t border-border/60 pt-2 text-base font-semibold text-foreground">
              <span>Total</span>
              <span className="text-primary">{formatINR(subtotal)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Prices are confirmed at checkout from the current listing price.
            </p>
            <Button className="w-full" onClick={() => setCheckoutOpen(true)}>
              Checkout
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkout ({itemCount} item{itemCount === 1 ? "" : "s"})</DialogTitle>
            <DialogDescription>
              Total {formatINR(subtotal)} — confirm your delivery details below.
            </DialogDescription>
          </DialogHeader>
          <form action={handleCheckout} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="checkoutName">Full name</Label>
              <Input id="checkoutName" name="buyerName" required placeholder="Jordan Alvarez" autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkoutPhone">Phone</Label>
              <Input id="checkoutPhone" name="buyerPhone" type="tel" required placeholder="(555) 123-4567" autoComplete="tel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkoutAddress">Delivery address</Label>
              <Input id="checkoutAddress" name="address" required placeholder="Hostel block, room, campus…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="checkoutDate">Delivery date (optional)</Label>
                <Input id="checkoutDate" name="deliveryDate" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="checkoutTime">Preferred time (optional)</Label>
                <Input id="checkoutTime" name="deliveryTime" placeholder="e.g. 5–7 PM" maxLength={200} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending && <Loader2 className="size-4 animate-spin" />}
                Place order
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
