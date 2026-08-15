import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { GlobalListingsClient } from "./global-listings-client"
import type { CurrentMember } from "@/lib/data/session"

export const dynamic = "force-dynamic"

export type GlobalListing = {
  id: string
  title: string
  description: string
  category: string
  price_cents: number | null
  address: string
  city: string
  contact: string
  image_urls: string[]
  status: "active" | "hidden"
  created_at: string
}

export default async function GlobalListingsPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: listings } = await supabase
    .from("global_listings")
    .select(
      "id, title, description, category, price_cents, address, city, contact, image_urls, status, created_at",
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })

  return (
    <GlobalListingsClient
      member={
        {
          role: member.role,
        } as Pick<CurrentMember, "role">
      }
      listings={(listings ?? []) as GlobalListing[]}
    />
  )
}
