"use client"

import Link from "next/link"
import { Users, Trophy, CalendarDays, Tag, Orbit, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { AdAdminRow } from "@/lib/ads"
import type { AdminFeedbackItem } from "@/lib/data/feedback"
import {
  CollegesSection,
  CollegeRequestsSection,
  PlansSection,
  TeamSection,
  WorkWithUsSection,
  AdvertisingSection,
  PromotionPaymentSection,
} from "./platform-sections"
import { AdCampaignsSection } from "./ad-campaigns-section"
import { FeedbackSection } from "./feedback-section"

export type SphereCard = {
  sphere_id: string
  name: string
  slug: string
  city: string
  state: string
  member_count: number
  club_count: number
  upcoming_event_count: number
  listing_count: number
}

export type PlatformData = {
  colleges: {
    id: string
    name: string
    short_name: string
    slug: string
    city: string
    status: string
    sphere_id: string | null
    sphere_name: string
    aliases: string[]
  }[]
  collegeRequests: {
    id: string
    name: string
    city: string
    contact_name: string
    contact_email: string
    contact_phone: string
    status: string
    created_at: string
  }[]
  plans: {
    id: string
    title: string
    description: string
    display_order: number
    active: boolean
    feedbackCount: number
    averageRating: number | null
  }[]
  team: { id: string; name: string; role: string; photo_url: string | null; short_bio: string; bio: string; display_order: number; active: boolean }[]
  applications: {
    id: string
    full_name: string
    email: string
    phone: string
    college: string
    year: string
    skills: string
    experience: string
    portfolio: string
    motivation: string
    links: string
    resume_url: string | null
    status: string
    admin_note: string
    created_at: string
  }[]
  advertising: { contact_phone: string; contact_email: string }
  promotionPayment: {
    price_inr: number
    duration_days: number
    qr_image_url: string | null
    upi_id: string | null
    instructions: string
  }
  ads: AdAdminRow[]
  feedback: AdminFeedbackItem[]
  auditLogs: { id: string; action: string; entity_type: string | null; details: Record<string, unknown>; created_at: string }[]
}

export function PlatformAdmin({
  isSuperAdmin,
  memberRole,
  spheres,
  platform,
}: {
  isSuperAdmin: boolean
  memberRole: string
  spheres: SphereCard[]
  platform: PlatformData | null
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-semibold text-foreground">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSuperAdmin
            ? "Platform administration. Pick a Sphere to manage its members, clubs, events and marketplace — or use the platform tools below."
            : "Pick a Sphere to administer. Access is limited to the Spheres you belong to or hold a role in."}
        </p>
      </div>

      {spheres.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {isSuperAdmin
            ? "No active Spheres yet. Create a college to provision its Sphere."
            : "You don't have access to any Sphere yet."}
        </p>
      ) : (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spheres.map((s) => (
            <Link
              key={s.sphere_id}
              href={`/admin/spheres/${s.sphere_id}`}
              className="group rounded-xl border border-border/70 bg-card p-5 transition hover:border-primary/40 hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-serif text-lg font-semibold text-foreground">{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {(s.city || s.state) && (
                      <span>
                        {[s.city, s.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary/70">
                      <Orbit className="size-3" aria-hidden="true" /> {s.slug}
                    </span>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-primary" aria-hidden="true" />
                  {s.member_count} members
                </span>
                <span className="flex items-center gap-1.5">
                  <Trophy className="size-3.5 text-primary" aria-hidden="true" />
                  {s.club_count} clubs
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
                  {s.upcoming_event_count} events
                </span>
                <span className="flex items-center gap-1.5">
                  <Tag className="size-3.5 text-primary" aria-hidden="true" />
                  {s.listing_count} listings
                </span>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open Sphere
                <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {isSuperAdmin && platform && (
        <Tabs defaultValue="colleges">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="colleges">Colleges</TabsTrigger>
            <TabsTrigger value="requests">College requests</TabsTrigger>
            <TabsTrigger value="plans">Platform plans</TabsTrigger>
            <TabsTrigger value="team">Platform team</TabsTrigger>
            <TabsTrigger value="work">Work with us</TabsTrigger>
            <TabsTrigger value="advertising">Advertising</TabsTrigger>
            <TabsTrigger value="promotions">Promotions</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="colleges" className="space-y-4">
            <CollegesSection data={platform} isSuperAdmin />
          </TabsContent>
          <TabsContent value="requests" className="space-y-4">
            <CollegeRequestsSection requests={platform.collegeRequests} />
          </TabsContent>
          <TabsContent value="plans" className="space-y-4">
            <PlansSection plans={platform.plans} />
          </TabsContent>
          <TabsContent value="team" className="space-y-4">
            <TeamSection team={platform.team} />
          </TabsContent>
          <TabsContent value="work" className="space-y-4">
            <WorkWithUsSection applications={platform.applications} />
          </TabsContent>
          <TabsContent value="advertising" className="space-y-8">
            <AdCampaignsSection ads={platform.ads} />
            <AdvertisingSection data={platform.advertising} />
          </TabsContent>
          <TabsContent value="promotions" className="space-y-4">
            <PromotionPaymentSection data={platform.promotionPayment} />
          </TabsContent>
          <TabsContent value="feedback" className="space-y-4">
            <FeedbackSection feedback={platform.feedback} />
          </TabsContent>
          <TabsContent value="audit" className="space-y-2">
            {platform.auditLogs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                No platform-level admin actions logged yet.
              </p>
            ) : (
              platform.auditLogs.map((a) => (
                <Card key={a.id} className="border-border/70 bg-card">
                  <CardContent className="flex items-center gap-3 p-3">
                    <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-primary">{a.action}</code>
                    {a.entity_type && (
                      <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                        {a.entity_type.replace("_", " ")}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      {!isSuperAdmin && memberRole === "admin" && (
        <p className="text-xs text-muted-foreground">
          You are a Sphere admin. Platform-wide settings are managed by the super admin.
        </p>
      )}
    </div>
  )
}
