"use client"

import { useState, useTransition } from "react"
import { Package, Store, Calendar, CreditCard, Box, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ShopProductsSection, OrdersSection } from "@/app/admin/platform-sections"
import type { ShopProductRow, OrderRow } from "@/app/admin/spheres/[sphereId]/sphere-admin"

export function ShopAdminSection({
  sphereId,
  products,
  orders,
  userId,
}: {
  sphereId: string
  products: ShopProductRow[]
  orders: OrderRow[]
  userId: string
}) {
  const [view, setView] = useState<"products" | "orders">("products")

  const orderStatusLabels: Record<string, string> = {
    pending: "Pending",
    accepted: "Accepted",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-foreground">My Shop</h2>
          <p className="text-sm text-muted-foreground">Manage your shop profile, products, and incoming orders.</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border/60 pb-2">
        <Button
          variant={view === "products" ? "secondary" : "ghost"}
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setView("products")}
        >
          <Box className="size-4" /> Products ({products.length})
        </Button>
        <Button
          variant={view === "orders" ? "secondary" : "ghost"}
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setView("orders")}
        >
          <Package className="size-4" /> Orders ({orders.length})
        </Button>
      </div>

      {view === "products" && (
        <div className="rounded-lg bg-card border border-border/70 p-4">
          <ShopProductsSection sphereId={sphereId} products={products} />
        </div>
      )}

      {view === "orders" && (
        <div className="rounded-lg bg-card border border-border/70 p-4">
          {orders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Package className="size-8 mx-auto mb-3 opacity-50" />
              No orders yet.
            </div>
          ) : (
            <OrdersSection orders={orders} />
          )}
        </div>
      )}
    </div>
  )
}
