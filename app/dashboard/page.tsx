import type { CSSProperties } from "react"
import Link from "next/link"
import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { latestPublishedPlan } from "@/lib/plans"
import { selectLivePromotions } from "@/lib/promotions"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AnimatedCounter } from "@/components/dashboard/animated-counter"
import { PlanFeedbackForm } from "@/components/landing/plan-feedback-form"
import {
  MessageCircle,
  Users,
  BookOpen,
  CalendarDays,
  ShoppingBag,
  Globe,
  Sparkles,
  ArrowRight,
  PartyPopper,
  Megaphone,
  ExternalLink,
} from "lucide-react"

export const dynamic = "force-dynamic"

type Activity = { id: string; body: string; authorHandle: string; createdAt: string }

// Time-window helpers live outside the component so the render stays pure
// (the page is force-dynamic — these are evaluated per request server-side).
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function DashboardPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const today = todayISO()

  const [{ count: memberCount }, { count: clubCount }, { count: groupCount }, { data: upcomingEvents }, { data: recentMessages }, { data: plans }, { data: promotionRows }, { data: promoConfig }] =
    await Promise.all([
      supabase
        .from("user_spheres")
        .select("*", { count: "exact", head: true })
        .eq("sphere_id", member.sphereId)
        .eq("membership_status", "active"),
      supabase.from("clubs").select("*", { count: "exact", head: true }).eq("sphere_id", member.sphereId),
      supabase.from("groups").select("*", { count: "exact", head: true }).eq("sphere_id", member.sphereId),
      supabase
        .from("events")
        .select("id, title, event_date, event_time, venue")
        .eq("sphere_id", member.sphereId)
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
        .limit(3),
      supabase
        .from("chat_messages")
        .select("id, body, author_id, created_at")
        .eq("sphere_id", member.sphereId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("platform_plans")
        .select("id, title, description, display_order, active, created_at")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("promotions")
        .select("id, title, url, status, fee_status, user_id, created_at, reviewed_at, paid_at")
        .eq("sphere_id", member.sphereId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("platform_config").select("value").eq("key", "promotion_payment").maybeSingle(),
    ])

  // Resolve author handles for the recent activity list (same-Sphere handles
  // only — real names are never exposed to ordinary users).
  const authorIds = Array.from(new Set((recentMessages ?? []).map((m) => m.author_id)))
  const { data: handleRows } = authorIds.length
    ? await supabase.from("user_spheres").select("user_id, anonymous_handle").in("user_id", authorIds)
    : { data: [] as { user_id: string; anonymous_handle: string }[] }
  const handleMap = new Map((handleRows ?? []).map((h) => [h.user_id, h.anonymous_handle]))

  const activity: Activity[] = (recentMessages ?? [])
    .map((m) => ({
      id: m.id,
      body: m.body,
      authorHandle: handleMap.get(m.author_id) ?? "Unknown",
      createdAt: m.created_at,
    }))
    .reverse()

  const plan = latestPublishedPlan((plans ?? []) as Parameters<typeof latestPublishedPlan>[0])
  let myFeedback: { rating: number; comment: string } | undefined
  if (plan) {
    const { data } = await supabase
      .from("plan_feedback")
      .select("rating, comment")
      .eq("plan_id", plan.id)
      .eq("user_id", member.userId)
      .maybeSingle()
    if (data) myFeedback = { rating: data.rating, comment: data.comment }
  }

  const upcomingCount = upcomingEvents?.length ?? 0

  const promoDuration = (promoConfig?.value as { duration_days?: number } | null)?.duration_days ?? 1
  const livePromotions = selectLivePromotions(
    ((promotionRows ?? []) as Parameters<typeof selectLivePromotions>[0]).map((p) => ({
      id: p.id,
      title: p.title,
      url: p.url,
      status: p.status,
      fee_status: p.fee_status,
      user_id: p.user_id,
      created_at: p.created_at,
      reviewed_at: p.reviewed_at,
      paid_at: p.paid_at,
    })),
    promoDuration,
  ).slice(0, 3)

  const quickActions = [
    { href: "/dashboard/chat", label: "Sphere Chat", desc: "Live campus conversation", icon: MessageCircle },
    { href: "/dashboard/groups", label: "Groups", desc: "Private group chats", icon: Users },
    { href: "/dashboard/academic", label: "Academic", desc: "Notes, subjects, calendar", icon: BookOpen },
    { href: "/dashboard/events", label: "Events", desc: "Campus events & RSVPs", icon: CalendarDays },
    { href: "/dashboard/clubs", label: "Clubs", desc: "Societies & communities", icon: Sparkles },
    { href: "/dashboard/marketplace", label: "Marketplace", desc: "Buy & sell on campus", icon: ShoppingBag },
    { href: "/dashboard/global-listings", label: "Listings", desc: "Hostels, cafés, gyms", icon: Globe },
  ]

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-10">
      {/* Living campus backdrop (pointer-events: none). Slow gradient drift +
          a faint network pulse; reduced motion renders it static. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2">
          <div className="dash-ambient h-72 w-[42rem] rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="absolute -right-24 top-40">
          <div className="dash-ambient-slow h-64 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>
        <div className="absolute -left-24 top-72">
          <div className="dash-ambient-slower h-64 w-96 rounded-full bg-blue-400/10 blur-3xl" />
        </div>
      </div>

      {/* Header */}
      <header className="dash-enter relative mb-8">
        {/* Floating activity elements — tiny campus dots drifting near the greeting. */}
        <span aria-hidden="true" className="dash-float absolute -left-3 top-2 size-1.5 rounded-full bg-primary/40" />
        <span
          aria-hidden="true"
          className="dash-float absolute left-16 top-10 size-1 rounded-full bg-cyan-500/40"
          style={{ animationDelay: "-2s" }}
        />
        <span
          aria-hidden="true"
          className="dash-float absolute right-4 top-4 size-2 rounded-full bg-primary/30"
          style={{ animationDelay: "-4s" }}
        />
        {/* Faint network pulse — decorative nodes + links, top-right. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 160 160"
          className="dash-enter pointer-events-none absolute -top-6 right-0 hidden h-40 w-40 opacity-50 lg:block"
          style={{ "--dash-delay": "200ms" } as CSSProperties}
        >
          <g fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/20">
            <path d="M24 76 L66 34 L112 44 L138 88 L104 122 L48 112 Z" />
            <path d="M66 34 L48 112" />
            <path d="M24 76 L104 122" />
            <path d="M112 44 L138 88" />
          </g>
          <g className="text-primary">
            <circle cx="24" cy="76" r="3" fill="currentColor" className="dash-twinkle" />
            <circle cx="66" cy="34" r="2.5" fill="currentColor" className="dash-twinkle" style={{ animationDelay: "-1.2s" }} />
            <circle cx="112" cy="44" r="3" fill="currentColor" className="dash-twinkle" style={{ animationDelay: "-2.4s" }} />
            <circle cx="138" cy="88" r="2.5" fill="currentColor" className="dash-twinkle" style={{ animationDelay: "-0.6s" }} />
            <circle cx="104" cy="122" r="3" fill="currentColor" className="dash-twinkle" style={{ animationDelay: "-3s" }} />
            <circle cx="48" cy="112" r="2.5" fill="currentColor" className="dash-twinkle" style={{ animationDelay: "-1.8s" }} />
          </g>
        </svg>
        <p className="font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Hello, {member.realName || member.anonymousHandle} <span aria-hidden="true">👋</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening in your Sphere today.</p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
          {member.sphereName}
        </p>
      </header>

      {/* Your Sphere — compact stats */}
      <section className="dash-enter mb-6" style={{ "--dash-delay": "60ms" } as CSSProperties}>
        <h2 className="mb-3 font-serif text-lg font-medium text-foreground">Your Sphere</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Users} label="Members" value={memberCount ?? 0} />
          <StatCard icon={CalendarDays} label="Upcoming events" value={upcomingCount} />
          <StatCard icon={Users} label="Groups" value={groupCount ?? 0} />
          <StatCard icon={Sparkles} label="Clubs" value={clubCount ?? 0} />
        </div>
      </section>

      {/* What's happening on your campus */}
      <section
        className="dash-enter mb-6"
        style={{ "--dash-delay": "120ms" } as CSSProperties}
      >
        <div className="mb-3 flex items-center gap-2">
          <PartyPopper className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-serif text-lg font-medium text-foreground">What&apos;s happening on your campus</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="border-border/70 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Upcoming events</p>
              {upcomingEvents && upcomingEvents.length > 0 ? (
                <ul className="space-y-2">
                  {upcomingEvents.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(`${e.event_date}T00:00:00`).toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                          {e.event_time ? ` · ${e.event_time.slice(0, 5)}` : ""}
                          {e.venue ? ` · ${e.venue}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">No events on campus yet — check back soon.</p>
              )}
              <Button asChild variant="ghost" size="sm" className="gap-1.5 px-0 text-primary">
                <Link href="/dashboard/events">
                  See all events
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Latest activity</p>
              {activity.length > 0 ? (
                <ul className="space-y-2">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-sm">
                      <span className="shrink-0 font-mono text-xs text-primary">{a.authorHandle}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">&ldquo;{a.body}&rdquo;</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/60">
                        {new Date(a.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">
                  The Sphere is quiet right now. Start the conversation.
                </p>
              )}
              <Button asChild variant="ghost" size="sm" className="gap-1.5 px-0 text-primary">
                <Link href="/dashboard/chat">
                  Open Sphere chat
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* What's coming next — latest published plan */}
      {plan && (
        <section
          id={`plan-${plan.id}`}
          className="dash-enter mb-6 scroll-mt-24"
          style={{ "--dash-delay": "180ms" } as CSSProperties}
        >
          <Card className="border-border/70 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
            <CardContent className="p-5">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                <h2 className="font-serif text-lg font-medium text-foreground">What&apos;s coming next</h2>
              </div>
              <p className="font-medium text-foreground">{plan.title}</p>
              {plan.description && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
              )}
              <PlanFeedbackForm planId={plan.id} initial={myFeedback} signedIn />
              <Button asChild variant="ghost" size="sm" className="mt-2 gap-1.5 px-0 text-primary">
                <Link href="/dashboard/roadmap">
                  View full roadmap
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Live promotions — compact highlight */}
      {livePromotions.length > 0 && (
        <section className="dash-enter mb-6" style={{ "--dash-delay": "220ms" } as CSSProperties}>
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-serif text-lg font-medium text-foreground">Live right now</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {livePromotions.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                <span className="min-w-0 truncate text-sm font-medium text-foreground group-hover:text-primary">
                  {p.title || p.url}
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section className="dash-enter" style={{ "--dash-delay": "280ms" } as CSSProperties}>
        <h2 className="mb-3 font-serif text-lg font-medium text-foreground">Jump back in</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-primary transition-transform duration-150 group-hover:scale-110" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <p className="dash-enter mt-8 text-xs text-muted-foreground/70" style={{ "--dash-delay": "340ms" } as CSSProperties}>
        Promotions, Premium and settings live in the sidebar — or use the More tab on mobile.
      </p>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: number
}) {
  return (
    <Card className="border-border/70 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="size-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="font-serif text-2xl text-foreground">
            <AnimatedCounter value={value} />
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
