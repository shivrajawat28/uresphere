"use client"

import { useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { updateOrderStatusAction } from "@/lib/actions/platform"
import { toast } from "sonner"
import type { Order } from "@/app/dashboard/marketplace/page"

const STATUS_STYLES: Record<string, string> = {
  pending: "text-amber-600",
  accepted: "text-primary",
  in_progress: "text-primary",
  delivered: "",
  cancelled: "text-destructive",
}

function formatINR(cents: number) {
  return (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
}

function formatDate(d: string | null) {
  if (!d) return "Flexible"
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export function OrdersSection({
  orders,
  orderStatusLabels,
  currentUserId,
}: {
  orders: Order[]
  orderStatusLabels: Record<string, string>
  currentUserId: string
}) {
  const [isPending, startTransition] = useTransition()

  function setStatus(order: Order, status: Order["status"]) {
    startTransition(async () => {
      const result = await updateOrderStatusAction(order.id, status)
      if (result.error) toast.error(result.error)
      else toast.success(`Order marked ${orderStatusLabels[status].toLowerCase()}`)
    })
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="font-serif text-lg text-foreground">No orders yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          When you buy something or a buyer requests your item, it shows up here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const isSeller = order.seller_id === currentUserId
        const canUpdate = isSeller && order.status !== "delivered" && order.status !== "cancelled"
        return (
          <Card key={order.id} className="border-border/70 bg-card">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {isSeller ? "Buy request from" : "You bought"} {order.buyer_name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isSeller ? (
                      <>
                        📞 {order.buyer_phone} · 🏠 {order.address}
                      </>
                    ) : (
                      <>Deliver to {order.address}</>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatINR(order.price_cents)} · settlement {formatINR(order.settlement_cents)} (fee{" "}
                    {formatINR(order.fee_cents)}) · by {formatDate(order.delivery_date)}
                  </p>
                </div>
                <Badge variant="outline" className={`shrink-0 border-border/60 ${STATUS_STYLES[order.status] ?? ""}`}>
                  {orderStatusLabels[order.status] ?? order.status}
                </Badge>
              </div>

              {canUpdate && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                  <span className="text-xs text-muted-foreground">Update status:</span>
                  {(["accepted", "in_progress", "delivered", "cancelled"] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={order.status === s ? "default" : "outline"}
                      disabled={isPending}
                      onClick={() => setStatus(order, s)}
                    >
                      {s === "cancelled" ? "Cancel" : orderStatusLabels[s]}
                    </Button>
                  ))}
                  {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
