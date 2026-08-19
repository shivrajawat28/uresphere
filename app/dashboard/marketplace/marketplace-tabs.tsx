"use client"

import { useState } from "react"
import { Package, ShieldCheck, ShoppingBag, ShoppingCart } from "lucide-react"
import { MarketplaceGrid } from "@/components/marketplace/marketplace-grid"
import { ShopGrid } from "@/components/marketplace/shop-grid"
import { CartSection } from "@/components/marketplace/cart-section"
import { MarketplaceAdminReview } from "@/components/marketplace/admin-review"
import { OrdersSection } from "@/components/marketplace/orders-section"
import { AdCard } from "@/components/ads/ad-card"
import type { AdCampaign } from "@/lib/ads"
import type { CartItem, Listing, Order, ShopProduct } from "@/app/dashboard/marketplace/page"

type Tab = "marketplace" | "shop" | "cart" | "orders"

export function MarketplaceTabs({
  listings,
  products,
  orders,
  cartItems,
  pendingListings,
  canReviewListings,
  orderStatusLabels,
  currentUserId,
  sphereName,
  ads,
}: {
  listings: Listing[]
  products: ShopProduct[]
  orders: Order[]
  cartItems: CartItem[]
  pendingListings: (Listing & { sellerHandle: string })[]
  canReviewListings: boolean
  orderStatusLabels: Record<string, string>
  currentUserId: string
  sphereName: string
  ads: AdCampaign[]
}) {
  const [tab, setTab] = useState<Tab>("marketplace")

  const tabs: { id: Tab; label: string; icon: typeof Package; badge?: number }[] = [
    { id: "marketplace", label: "Your Marketplace", icon: ShoppingBag },
    { id: "shop", label: "UreSphere Shop", icon: Package },
    { id: "cart", label: "Cart", icon: ShoppingCart, badge: cartItems.length },
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
            {typeof t.badge === "number" && t.badge > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "marketplace" && (
        <>
          {canReviewListings && (
            <MarketplaceAdminReview
              pendingListings={pendingListings}
              currentUserId={currentUserId}
            />
          )}
          <MarketplaceGrid listings={listings} currentUserId={currentUserId} />
        </>
      )}
      {tab === "shop" && <ShopGrid products={products} />}
      {tab === "cart" && <CartSection cartItems={cartItems} />}
      {tab === "orders" && (
        <OrdersSection orders={orders} orderStatusLabels={orderStatusLabels} currentUserId={currentUserId} />
      )}

      {tab === "orders" && orders.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Orders are only visible to you, the seller, and your Sphere&apos;s admins.
        </p>
      )}
    </div>
  )
}
