"use client"

import { useState } from "react"
import { Package, ShoppingBag, ShoppingCart } from "lucide-react"
import { MarketplaceGrid } from "@/components/marketplace/marketplace-grid"
import { ShopGrid } from "@/components/marketplace/shop-grid"
import { OrdersSection } from "@/components/marketplace/orders-section"
import { AdCard } from "@/components/ads/ad-card"
import type { AdCampaign } from "@/lib/ads"
import type { Listing, Order, ShopProduct } from "@/app/dashboard/marketplace/page"

type Tab = "shop" | "marketplace" | "orders"

export function MarketplaceTabs({
  listings,
  products,
  orders,
  orderStatusLabels,
  currentUserId,
  sphereName,
  ads,
}: {
  listings: Listing[]
  products: ShopProduct[]
  orders: Order[]
  orderStatusLabels: Record<string, string>
  currentUserId: string
  sphereName: string
  ads: AdCampaign[]
}) {
  const [tab, setTab] = useState<Tab>("marketplace")

  const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: "marketplace", label: "Your Marketplace", icon: ShoppingBag },
    { id: "shop", label: "UreSphere Shop", icon: Package },
    { id: "orders", label: "My orders", icon: ShoppingCart },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          Student-to-student listings inside {sphereName}, plus the campus shop run by your admins.
        </p>
      </div>

      {ads.length > 0 && (
        <div className="mb-6 space-y-2">
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-border/70 bg-secondary/20 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "marketplace" && <MarketplaceGrid listings={listings} currentUserId={currentUserId} />}
      {tab === "shop" && <ShopGrid products={products} />}
      {tab === "orders" && <OrdersSection orders={orders} orderStatusLabels={orderStatusLabels} currentUserId={currentUserId} />}
    </div>
  )
}
