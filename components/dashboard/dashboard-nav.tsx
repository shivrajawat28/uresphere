"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import type { CurrentMember } from "@/lib/data/session"
import { logoutAction } from "@/lib/auth/actions"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { UreSphereLogo } from "@/components/brand/uresphere-logo"
import {
  LayoutGrid,
  MessageCircle,
  Users,
  Megaphone,
  BookOpen,
  CalendarDays,
  ShoppingBag,
  Globe,
  Gem,
  Bell,
  ShieldAlert,
  LogOut,
  Orbit,
  Sparkles,
  Settings,
  MoreHorizontal,
  Milestone,
  GraduationCap,
  CalendarCheck2,
  MessagesSquare,
  MessageSquareText,
} from "lucide-react"

type NavLink = { href: string; label: string; icon: typeof LayoutGrid; badge?: number }

export type SectionAdminFlags = {
  academic?: boolean
  promotions?: boolean
  events?: boolean
  social?: boolean
}

export function DashboardNav({
  member,
  initialUnread = 0,
  sectionAdmins = {},
}: {
  member: CurrentMember
  initialUnread?: number
  sectionAdmins?: SectionAdminFlags
}) {
  const pathname = usePathname()
  const [unread, setUnread] = useState(initialUnread)
  const [moreOpen, setMoreOpen] = useState(false)

  // Close the mobile More sheet on route change (render-adjust, no effect).
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setMoreOpen(false)
  }

  const isAdmin = member.role === "admin" || member.role === "super_admin"
  const initials = member.anonymousHandle.replace(/^@/, "").slice(0, 2).toUpperCase()

  const groups = useMemo<{ label: string; links: NavLink[] }[]>(
    () => [
      {
        label: "Your Sphere",
        links: [
          { href: "/dashboard", label: "Overview", icon: LayoutGrid },
          { href: "/dashboard/chat", label: "Sphere Chat", icon: MessageCircle },
          ...(sectionAdmins.social
            ? [{ href: "/dashboard/social/admin", label: "Social Admin", icon: MessagesSquare }]
            : []),
          { href: "/dashboard/groups", label: "Groups", icon: Users },
        ],
      },
      {
        label: "Campus",
        links: [
          { href: "/dashboard/academic", label: "Academic", icon: BookOpen },
          ...(sectionAdmins.academic
            ? [{ href: "/dashboard/academic/admin", label: "Academic Admin", icon: GraduationCap }]
            : []),
          { href: "/dashboard/events", label: "Events", icon: CalendarDays },
          ...(sectionAdmins.events
            ? [{ href: "/dashboard/events/admin", label: "Events Admin", icon: CalendarCheck2 }]
            : []),
          { href: "/dashboard/clubs", label: "Clubs", icon: Sparkles },
        ],
      },
      {
        label: "Community",
        links: [
          { href: "/dashboard/promotions", label: "Promotions", icon: Megaphone },
          ...(sectionAdmins.promotions
            ? [{ href: "/dashboard/promotions/admin", label: "Promotions Admin", icon: ShieldAlert }]
            : []),
          { href: "/dashboard/marketplace", label: "Marketplace", icon: ShoppingBag },
        ],
      },
      {
        label: "Other",
        links: [
          { href: "/dashboard/global-listings", label: "Global Listings", icon: Globe },
          { href: "/dashboard/premium", label: "Premium", icon: Gem },
          { href: "/dashboard/notifications", label: "Notifications", icon: Bell, badge: unread },
          { href: "/dashboard/roadmap", label: "Roadmap", icon: Milestone },
          { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquareText },
          { href: "/dashboard/about", label: "About", icon: Orbit },
        ],
      },
    ],
    [unread, sectionAdmins],
  )

  // Mobile bottom bar — the four most-used destinations.
  const bottomItems = useMemo<NavLink[]>(
    () => [
      { href: "/dashboard", label: "Home", icon: LayoutGrid },
      { href: "/dashboard/chat", label: "Chat", icon: MessageCircle },
      { href: "/dashboard/marketplace", label: "Marketplace", icon: ShoppingBag },
      { href: "/dashboard/notifications", label: "Alerts", icon: Bell, badge: unread },
    ],
    [unread],
  )

  // Everything else lives behind the More sheet on mobile.
  const moreItems = useMemo<NavLink[]>(
    () => [
      { href: "/dashboard/groups", label: "Groups", icon: Users },
      { href: "/dashboard/promotions", label: "Promotions", icon: Megaphone },
      ...(sectionAdmins.promotions
        ? [{ href: "/dashboard/promotions/admin", label: "Promotions Admin", icon: ShieldAlert }]
        : []),
      { href: "/dashboard/academic", label: "Academic", icon: BookOpen },
      ...(sectionAdmins.academic
        ? [{ href: "/dashboard/academic/admin", label: "Academic Admin", icon: GraduationCap }]
        : []),
      { href: "/dashboard/events", label: "Events", icon: CalendarDays },
      ...(sectionAdmins.events
        ? [{ href: "/dashboard/events/admin", label: "Events Admin", icon: CalendarCheck2 }]
        : []),
      { href: "/dashboard/clubs", label: "Clubs", icon: Sparkles },
      ...(sectionAdmins.social
        ? [{ href: "/dashboard/social/admin", label: "Social Admin", icon: MessagesSquare }]
        : []),
      { href: "/dashboard/global-listings", label: "Global Listings", icon: Globe },
      { href: "/dashboard/premium", label: "Premium", icon: Gem },
      { href: "/dashboard/roadmap", label: "Roadmap", icon: Milestone },
      { href: "/dashboard/feedback", label: "Feedback", icon: MessageSquareText },
      { href: "/dashboard/settings", label: "Profile & settings", icon: Settings },
      { href: "/dashboard/about", label: "About", icon: Orbit },
    ],
    [sectionAdmins],
  )

  // Keep the unread badge live without polling (RLS delivers only own rows).
  useEffect(() => {
    if (member.userId === "") return
    const supabase = createClient()
    const channel = supabase
      .channel(`nav-notifications-${member.userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${member.userId}` },
        (payload) => {
          if (!(payload.new as { read?: boolean }).read) setUnread((c) => c + 1)
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${member.userId}` },
        (payload) => {
          const prev = (payload.old as { read?: boolean }).read
          const next = (payload.new as { read?: boolean }).read
          if (prev !== next) setUnread((c) => Math.max(0, c + (next ? -1 : 1)))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [member.userId])

  // Lock body scroll while the More sheet is open.
  useEffect(() => {
    document.body.style.overflow = moreOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [moreOpen])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  function renderSidebarNav() {
    return (
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Dashboard navigation">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.links.map((link) => (
                <NavLinkRow key={link.href} link={link} active={isActive(link.href)} />
              ))}
            </div>
          </div>
        ))}
        {isAdmin && (
          <div>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Admin
            </p>
            <NavLinkRow link={{ href: "/admin", label: "Admin panel", icon: ShieldAlert }} active={isActive("/admin")} />
          </div>
        )}
      </nav>
    )
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/dashboard" aria-label="UreSphere home" className="flex items-center gap-2">
          <UreSphereLogo className="h-5" wordmark wordmarkClassName="text-base" />
        </Link>
        <ThemeToggle />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:sticky md:top-0 md:flex md:h-svh">
        <div className="mb-6 flex items-center justify-between px-1">
          <Link href="/dashboard" aria-label="UreSphere home" className="flex items-center gap-2">
            <UreSphereLogo className="h-6" wordmark />
          </Link>
          <ThemeToggle />
        </div>

        {renderSidebarNav()}

        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-secondary"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/15 text-xs text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col overflow-hidden text-left">
              <span className="truncate text-foreground">{member.anonymousHandle}</span>
              <span className="truncate text-xs text-muted-foreground">{member.sphereName}</span>
            </div>
          </Link>
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" type="submit" className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-sidebar/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {bottomItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={`flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${
              moreOpen ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </div>
      </nav>

      {/* Mobile More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-label="More navigation"
            className="absolute inset-x-0 bottom-0 max-h-[80svh] overflow-y-auto rounded-t-2xl border-t border-border bg-sidebar p-4 pb-8"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-foreground">More</p>
              <ThemeToggle />
            </div>
            <div className="flex flex-col gap-0.5">
              {moreItems.map((link) => (
                <NavLinkRow key={link.href} link={link} active={isActive(link.href)} onNavigate={() => setMoreOpen(false)} />
              ))}
              {isAdmin && (
                <NavLinkRow link={{ href: "/admin", label: "Admin panel", icon: ShieldAlert }} active={isActive("/admin")} onNavigate={() => setMoreOpen(false)} />
              )}
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <Link
                href="/dashboard/settings"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-secondary"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/15 text-xs text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col overflow-hidden text-left">
                  <span className="truncate text-foreground">{member.anonymousHandle}</span>
                  <span className="truncate text-xs text-muted-foreground">{member.sphereName}</span>
                </div>
              </Link>
              <form action={logoutAction} className="mt-2">
                <Button variant="ghost" size="sm" type="submit" className="w-full justify-start gap-2 text-muted-foreground">
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function NavLinkRow({
  link,
  active,
  onNavigate,
}: {
  link: NavLink
  active: boolean
  onNavigate?: () => void
}) {
  const Icon = link.icon
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group/nav relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
        active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon
        className={`size-4 shrink-0 transition-transform duration-150 group-hover/nav:scale-110 ${active ? "text-primary" : ""}`}
      />
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
      {typeof link.badge === "number" && link.badge > 0 && (
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {link.badge > 99 ? "99+" : link.badge}
        </span>
      )}
    </Link>
  )
}
