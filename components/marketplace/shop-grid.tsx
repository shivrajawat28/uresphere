"use client"

import { useState, useTransition } from "react"
import { ShoppingCart, Loader2 } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ImageCarousel } from "./image-carousel"
import { BuyShopProductDialog } from "./buy-shop-product-dialog"
import { addShopProductToCartAction } from "@/lib/actions/marketplace"
import type { ShopProduct } from "@/app/dashboard/marketplace/page"

const CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  stationery: "Stationery",
  essentials: "Essentials",
  other: "Other",
}

function formatINR(cents: number) {
  return (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

function ShopProductCard({ p, currentUserId }: { p: ShopProduct; currentUserId?: string }) {
  const [buyOpen, setBuyOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  const isOwner = p.created_by === currentUserId

  function handleAddToCart() {
    startTransition(async () => {
      const result = await addShopProductToCartAction(p.id, 1)
      if (result.error) toast.error(result.error)
      else toast.success("Added to cart")
    })
  }

  return (
    <Card className="overflow-hidden border-border bg-card">
      <div className="relative aspect-[4/3] w-full bg-muted">
        <ImageCarousel images={p.image_urls} alt={p.name} />
        {p.availability === "out_of_stock" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Badge variant="outline" className="border-border text-muted-foreground">
              Out of stock
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="flex flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-medium text-foreground">{p.name}</h3>
          <span className="shrink-0 font-serif text-lg font-semibold text-primary">
            {formatINR(p.price_cents)}
          </span>
        </div>
        {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
        <p className="text-xs font-medium text-muted-foreground">
          Sold by: <span className="text-foreground">{p.shop_name || "ÙreSphere Shop"}</span>
        </p>
        {p.delivery_info && <p className="text-xs text-muted-foreground">📍 {p.delivery_info}</p>}
      </CardContent>
      <CardFooter className="flex flex-col gap-3 border-t border-border p-4 pt-3">
        <div className="flex w-full items-center justify-between">
          <Badge variant="secondary" className="capitalize">
            {CATEGORY_LABELS[p.category] ?? p.category}
          </Badge>
          {p.payment_info && <span className="text-xs text-muted-foreground">{p.payment_info}</span>}
        </div>
        
        {!isOwner && p.active && p.availability === "in_stock" && (
          <div className="flex w-full gap-2">
            <Button size="sm" variant="outline" onClick={handleAddToCart} disabled={isPending} className="flex-1 gap-1.5">
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShoppingCart className="size-3.5" />}
              Add to cart
            </Button>
            <Button size="sm" onClick={() => setBuyOpen(true)} className="flex-1">
              Buy now
            </Button>
          </div>
        )}
      </CardFooter>

      {!isOwner && p.active && p.availability === "in_stock" && (
        <BuyShopProductDialog
          shopProductId={p.id}
          title={p.name}
          priceCents={p.price_cents}
          open={buyOpen}
          onOpenChange={setBuyOpen}
        />
      )}
    </Card>
  )
}

export function ShopGrid({ products, currentUserId }: { products: ShopProduct[]; currentUserId?: string }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="font-serif text-lg text-foreground">Coming soon</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your campus shop is being stocked. Check back later.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <ShopProductCard key={p.id} p={p} currentUserId={currentUserId} />
      ))}
    </div>
  )
}
