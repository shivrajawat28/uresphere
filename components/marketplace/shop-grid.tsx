"use client"

import Image from "next/image"
import { ImageOff } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

export function ShopGrid({ products }: { products: ShopProduct[] }) {
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
        <Card key={p.id} className="overflow-hidden border-border bg-card">
          <div className="relative aspect-[4/3] w-full bg-muted">
            {p.image_urls[0] ? (
              <Image src={p.image_urls[0]} alt={p.name} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
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
          <CardFooter className="flex items-center justify-between border-t border-border p-4 pt-3">
            <Badge variant="secondary" className="capitalize">
              {CATEGORY_LABELS[p.category] ?? p.category}
            </Badge>
            {p.payment_info && <span className="text-xs text-muted-foreground">{p.payment_info}</span>}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
