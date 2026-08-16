"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  setUserStatusAction,
  resolveReportAction,
  reviewPromotionAction,
  removeListingAction,
  deleteEventAction,
  deleteClubAction,
  deleteResourceAction,
  deleteSubjectAction,
  createEventAction,
  createClubAction,
  createSubjectAction,
} from "@/lib/actions/admin"
import { deleteMessageAction } from "@/lib/actions/chat"
import { adminDeleteGroupAction } from "@/lib/actions/groups"
import { createClient } from "@/lib/supabase/client"
import { deletedMessageLabel, mergeChatMessages, type ChatMessage, type DeletedByRole } from "@/lib/chat"
import { TAB_PERMISSION } from "@/lib/roles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Search, ArrowLeft, Users, ShieldCheck, Plus, X } from "lucide-react"
import { OrdersSection } from "../../platform-sections"

type UserRow = {
  userId: string
  handle: string
  membershipStatus: string
  joinedAt: string
  realName: string
  email: string
  phone: string
  role: string
  accountStatus: string
}
type GroupRow = {
  id: string
  name: string
  description: string
  creatorHandle: string
  memberCount: number
  createdAt: string
}
type ReportRow = { id: string; target_type: string; reason: string; status: string; created_at: string; reporter_id: string }
type SocialMessage = ChatMessage & {
  authorRealName?: string | null
  // Admin-only original content of deleted messages (chat_message_archives).
  originalBody?: string | null
}
type PromotionRow = { id: string; title: string; url: string; status: string; fee_status: string; user_id: string; created_at: string }
type ListingRow = { id: string; title: string; price_cents: number; category: string; status: string; seller_id: string }
type EventRow = { id: string; title: string; event_date: string; event_time: string | null; venue: string; organizer: string }
type ClubRow = { id: string; name: string; description: string; logo_url: string | null }
type SubjectRow = { id: string; name: string; code: string; degree: string; year: string; branch: string }
type ResourceRow = { id: string; title: string; type: string }
type OrderRow = {
  id: string
  listing_id: string
  buyer_id: string
  seller_id: string
  buyer_name: string
  buyer_phone: string
  address: string
  delivery_date: string | null
  price_cents: number
  fee_cents: number
  settlement_cents: number
  status: string
  created_at: string
}
type AuditRow = { id: string; action: string; entity_type: string | null; details: Record<string, unknown>; created_at: string }

export function SphereAdmin({
  sphereId,
  sphereName,
  sphereCity,
  sphereState,
  isSphereAdministrator,
  isSuperAdmin,
  permissions,
  stats,
  users,
  reports,
  promotions,
  listings,
  events,
  clubs,
  subjects,
  resources,
  orders,
  auditLogs,
  messages,
  groups,
  rolesByUser,
}: {
  sphereId: string
  sphereName: string
  sphereCity: string
  sphereState: string
  isSphereAdministrator: boolean
  isSuperAdmin: boolean
  permissions: string[]
  stats: { memberCount: number; openReports: number; pendingPromotions: number }
  users: UserRow[]
  reports: ReportRow[]
  promotions: PromotionRow[]
  listings: ListingRow[]
  events: EventRow[]
  clubs: ClubRow[]
  subjects: SubjectRow[]
  resources: ResourceRow[]
  orders: OrderRow[]
  auditLogs: AuditRow[]
  messages: SocialMessage[]
  groups: GroupRow[]
  rolesByUser: Record<string, { role: string; scope: Record<string, unknown> }[]>
}) {
  const [isPending, startTransition] = useTransition()
  const [userQuery, setUserQuery] = useState("")
  const [liveMessages, setLiveMessages] = useState<SocialMessage[]>(messages)
  const [selectedMember, setSelectedMember] = useState<UserRow | null>(null)
  const handleCache = useRef(new Map<string, string>())

  // Live discussion: subscribe to new messages / deletes in this Sphere only.
  // Dedupe by id, so reconnect or double events can never duplicate a message.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`sphere-chat-admin-${sphereId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `sphere_id=eq.${sphereId}` },
        async (payload) => {
          const row = payload.new as {
            id: string
            body: string
            author_id: string
            created_at: string
            is_deleted: boolean
            deleted_by_role: string | null
            reply_to_message_id: string | null
          }
          const cached = handleCache.current.get(row.author_id)
          let handle = cached ?? "Unknown"
          if (!cached) {
            const { data } = await supabase
              .from("user_spheres")
              .select("anonymous_handle")
              .eq("user_id", row.author_id)
              .maybeSingle()
            handle = data?.anonymous_handle ?? "Unknown"
            handleCache.current.set(row.author_id, handle)
          }
          setLiveMessages((prev) =>
            mergeChatMessages(prev, [
              {
                id: row.id,
                body: row.body,
                authorId: row.author_id,
                createdAt: row.created_at,
                isDeleted: row.is_deleted,
                deletedByRole: (row.deleted_by_role as DeletedByRole | null) ?? null,
                replyToMessageId: row.reply_to_message_id ?? null,
                authorHandle: handle,
              },
            ]),
          )
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `sphere_id=eq.${sphereId}` },
        (payload) => {
          const row = payload.new as { id: string; is_deleted: boolean; deleted_by_role: string | null }
          setLiveMessages((prev) =>
            prev.map((m) =>
              m.id === row.id
                ? {
                    ...m,
                    isDeleted: row.is_deleted,
                    deletedByRole: (row.deleted_by_role as DeletedByRole | null) ?? m.deletedByRole,
                  }
                : m,
            ),
          )
          // When a message gets deleted, fetch its archived original for the
          // moderation view (RLS gates this to admins).
          if (row.is_deleted) {
            supabase
              .from("chat_message_archives")
              .select("body")
              .eq("message_id", row.id)
              .maybeSingle()
              .then(({ data }) => {
                if (data?.body) {
                  setLiveMessages((cur) =>
                    cur.map((m) => (m.id === row.id ? { ...m, originalBody: data.body } : m)),
                  )
                }
              })
          }
        },
      )
      // 24h retention purge hard-deletes rows; drop them from the admin list.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `sphere_id=eq.${sphereId}` },
        (payload) => {
          const old = payload.old as { id: string }
          setLiveMessages((prev) => prev.filter((m) => m.id !== old.id))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [sphereId])

  function removeMessage(id: string) {
    startTransition(async () => {
      const result = await deleteMessageAction(id)
      if (result.error) toast.error(result.error)
      else {
        setLiveMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, isDeleted: true, deletedByRole: result.deletedByRole ?? "admin" }
              : m,
          ),
        )
        toast.success("Message removed.")
      }
    })
  }

  const can = (tab: string) => isSphereAdministrator || isSuperAdmin || permissions.includes(TAB_PERMISSION[tab])

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.handle.toLowerCase().includes(q) ||
        u.realName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    )
  }, [users, userQuery])

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      {/* Breadcrumb / Switch Sphere */}
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All Spheres
      </Link>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">{sphereName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {[sphereCity, sphereState].filter(Boolean).join(", ") || "Sphere"}
            {isSphereAdministrator && (
              <Badge variant="outline" className="border-border/60 text-[10px] font-normal capitalize">
                <ShieldCheck className="mr-1 size-3 text-primary" aria-hidden="true" />
                Sphere administrator
              </Badge>
            )}
          </p>
        </div>
        <Link href={`/admin/spheres/${sphereId}/roles`}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Users className="size-3.5" aria-hidden="true" />
            Manage roles
          </Button>
        </Link>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Active members" value={stats.memberCount} />
        <Stat label="Open reports" value={stats.openReports} />
        <Stat label="Pending promotions" value={stats.pendingPromotions} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          {can("social") && <TabsTrigger value="social">Social {stats.openReports > 0 && `(${stats.openReports})`}</TabsTrigger>}
          {can("groups") && <TabsTrigger value="groups">Groups</TabsTrigger>}
          {can("academic") && <TabsTrigger value="academic">Academic</TabsTrigger>}
          {can("clubs") && <TabsTrigger value="clubs">Clubs</TabsTrigger>}
          {can("events") && <TabsTrigger value="events">Events</TabsTrigger>}
          {can("marketplace") && <TabsTrigger value="marketplace">Marketplace</TabsTrigger>}
          {can("listings") && <TabsTrigger value="listings">Listings</TabsTrigger>}
          {can("promotions") && <TabsTrigger value="promotions">Promotions {stats.pendingPromotions > 0 && `(${stats.pendingPromotions})`}</TabsTrigger>}
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Clubs" value={clubs.length} />
            <Stat label="Upcoming events" value={events.filter((e) => e.event_date >= new Date().toISOString().slice(0, 10)).length} />
            <Stat label="Marketplace listings" value={listings.filter((l) => l.status === "active").length} />
            <Stat label="Marketplace orders" value={orders.length} />
          </div>
          <p className="text-xs text-muted-foreground">
            Everything on this page is scoped to {sphereName} — members, clubs, events, marketplace and logs are never
            mixed across Spheres.
          </p>
        </TabsContent>

        {/* Users */}
        {can("users") && (
          <TabsContent value="users" className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search members"
                className="pl-9"
              />
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Handle</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.userId} className="border-t border-border/60">
                      <td className="px-3 py-2 font-mono text-xs text-primary">{u.handle}</td>
                      <td className="px-3 py-2">{u.realName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.phone}</td>
                      <td className="px-3 py-2 capitalize">{u.role.replace("_", " ")}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`border-border/60 text-[10px] font-normal ${
                            u.accountStatus === "suspended" ? "text-destructive" : "text-primary"
                          }`}
                        >
                          {u.accountStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant={u.accountStatus === "suspended" ? "outline" : "destructive"}
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () =>
                                setUserStatusAction(u.userId, u.accountStatus === "suspended" ? "active" : "suspended"),
                              u.accountStatus === "suspended" ? "Member restored" : "Member suspended",
                            )
                          }
                        >
                          {u.accountStatus === "suspended" ? "Unsuspend" : "Suspend"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        )}

        {/* Social — live discussion + reports (moderation) */}
        {can("social") && (
          <TabsContent value="social" className="space-y-6">
            {/* Live discussion */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">Live discussion</h3>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Recent messages in {sphereName}. Handles stay anonymous in the public chat; real names are shown here
                for moderation only and never leave the admin panel.
              </p>
              {liveMessages.length === 0 ? (
                <Empty text="No messages in this Sphere yet." />
              ) : (
                <div className="space-y-1.5">
                  {liveMessages
                    .slice()
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    .slice(-50)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const member = users.find((u) => u.userId === m.authorId)
                                if (member) setSelectedMember(member)
                              }}
                              className="group inline-flex items-center gap-1.5 font-mono text-[11px] text-primary transition hover:underline"
                              title="View member details"
                            >
                              {m.authorHandle}
                              {m.authorRealName && (
                                <span className="rounded-full border border-border/60 bg-secondary/40 px-1.5 py-px font-sans text-[10px] font-medium normal-case text-foreground transition group-hover:border-primary/40">
                                  {m.authorRealName}
                                </span>
                              )}
                            </button>
                            <span className="text-[10px] text-muted-foreground/60">
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className={`mt-0.5 text-sm ${m.isDeleted ? "italic text-muted-foreground" : "text-foreground"}`}>
                            {m.isDeleted ? deletedMessageLabel(true, m.deletedByRole) ?? "Message deleted" : m.body}
                          </p>
                          {m.isDeleted && m.originalBody && (
                            <p className="mt-1 max-w-full truncate rounded bg-destructive/5 px-2 py-1 text-xs text-muted-foreground">
                              <span className="mr-1 font-medium">Original (admin-only):</span>
                              {m.originalBody}
                            </p>
                          )}
                        </div>
                        {!m.isDeleted && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isPending}
                            onClick={() => removeMessage(m.id)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Reports */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Reports {stats.openReports > 0 && `(${stats.openReports} open)`}
              </h3>
              {reports.length === 0 ? (
                <Empty text="No reports in this Sphere." />
              ) : (
                reports.map((r) => (
                  <Card key={r.id} className="border-border/70 bg-card">
                    <CardContent className="p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {r.target_type.replace("_", " ")}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`border-border/60 text-[10px] font-normal ${
                            r.status === "open" ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {r.status}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground">{r.reason}</p>
                      {r.status === "open" && (
                        <ReportActions
                          isPending={isPending}
                          onAction={(resolution, note) =>
                            run(
                              () => resolveReportAction(r.id, resolution, note),
                              resolution === "resolved" ? "Report resolved" : "Report rejected",
                            )
                          }
                        />
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        )}

        {/* Groups */}
        {can("groups") && (
          <TabsContent value="groups" className="space-y-3">
            {groups.length === 0 ? (
              <Empty text="No groups in this Sphere yet." />
            ) : (
              groups.map((g) => (
                <Card key={g.id} className="border-border/70 bg-card">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{g.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {g.description || "No description"}
                        {g.creatorHandle !== "Unknown" && ` · created by ${g.creatorHandle}`}
                        {` · ${new Date(g.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-border/60 text-[10px] font-normal">
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => run(() => adminDeleteGroupAction(g.id), "Group deleted")}
                    >
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        )}

        {/* Promotions */}
        {can("promotions") && (
          <TabsContent value="promotions" className="space-y-3">
            {promotions.length === 0 ? (
              <Empty text="No promotions submitted in this Sphere." />
            ) : (
              promotions.map((p) => (
                <Card key={p.id} className="border-border/70 bg-card">
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{p.title || p.url}</p>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-primary hover:underline">
                        {p.url}
                      </a>
                    </div>
                    <Badge variant="outline" className="border-border/60 text-[10px] font-normal capitalize">
                      {p.status}
                    </Badge>
                    {p.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => run(() => reviewPromotionAction(p.id, "approved"), "Promotion approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => run(() => reviewPromotionAction(p.id, "rejected"), "Promotion rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        )}

        {/* Listings */}
        {can("listings") && (
          <TabsContent value="listings" className="space-y-2">
            {listings.length === 0 ? (
              <Empty text="No marketplace listings in this Sphere." />
            ) : (
              listings.map((l) => (
                <Card key={l.id} className="border-border/70 bg-card">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{l.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.category} ·{" "}
                        {(l.price_cents / 100).toLocaleString("en-IN", {
                          style: "currency",
                          currency: "INR",
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-border/60 text-[10px] font-normal capitalize">
                      {l.status}
                    </Badge>
                    {l.status !== "removed" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => run(() => removeListingAction(l.id, []), "Listing removed")}
                      >
                        Remove
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        )}

        {/* Events */}
        {can("events") && (
          <TabsContent value="events" className="space-y-4">
            <CreateEventForm sphereId={sphereId} isPending={isPending} />
            {events.length === 0 ? (
              <Empty text="No events in this Sphere." />
            ) : (
              events.map((e) => (
                <Card key={e.id} className="border-border/70 bg-card">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.event_date}
                        {e.event_time ? ` · ${e.event_time}` : ""}
                        {e.venue ? ` · ${e.venue}` : " · Venue TBA"}
                        {e.organizer ? ` · ${e.organizer}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => run(() => deleteEventAction(e.id), "Event deleted")}
                    >
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        )}

        {/* Clubs */}
        {can("clubs") && (
          <TabsContent value="clubs" className="space-y-4">
            <CreateClubForm sphereId={sphereId} isPending={isPending} />
            {clubs.length === 0 ? (
              <Empty text="No clubs in this Sphere." />
            ) : (
              clubs.map((c) => (
                <Card key={c.id} className="border-border/70 bg-card">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                      {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => run(() => deleteClubAction(c.id), "Club deleted")}
                    >
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        )}

        {/* Academic */}
        {can("academic") && (
          <TabsContent value="academic" className="space-y-4">
            <CreateSubjectForm sphereId={sphereId} isPending={isPending} />
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">Subjects ({subjects.length})</h3>
              {subjects.length === 0 ? (
                <Empty text="No subjects in this Sphere." />
              ) : (
                <div className="space-y-1.5">
                  {subjects.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {s.name}
                        {s.code ? <span className="text-muted-foreground"> ({s.code})</span> : null}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {[s.degree, s.year, s.branch].filter(Boolean).join(" · ") || "General"}
                      </span>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => run(() => deleteSubjectAction(s.id), "Subject deleted")}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">Resources ({resources.length})</h3>
              {resources.length === 0 ? (
                <Empty text="No resources in this Sphere." />
              ) : (
                <div className="space-y-2">
                  {resources.map((r) => (
                    <Card key={r.id} className="border-border/70 bg-card">
                      <CardContent className="flex items-center gap-3 p-3">
                        <p className="min-w-0 flex-1 truncate text-sm text-foreground">{r.title}</p>
                        <Badge variant="outline" className="border-border/60 text-[10px] font-normal capitalize">
                          {r.type}
                        </Badge>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => run(() => deleteResourceAction(r.id), "Resource deleted")}
                        >
                          Delete
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* Marketplace — orders */}
        {can("marketplace") && (
          <TabsContent value="marketplace" className="space-y-4">
            <OrdersSection orders={orders} />
          </TabsContent>
        )}

        {selectedMember && (
          <MemberDetailsModal
            member={selectedMember}
            roles={rolesByUser[selectedMember.userId] ?? []}
            onClose={() => setSelectedMember(null)}
          />
        )}

        {/* Audit log */}
        <TabsContent value="audit" className="space-y-2">
          {auditLogs.length === 0 ? (
            <Empty text="No admin actions logged in this Sphere yet." />
          ) : (
            auditLogs.map((a) => (
              <Card key={a.id} className="border-border/70 bg-card">
                <CardContent className="flex items-center gap-3 p-3">
                  <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-primary">{a.action}</code>
                  {a.entity_type && (
                    <Badge variant="outline" className="border-border/60 text-[10px] font-normal capitalize">
                      {a.entity_type.replace("_", " ")}
                    </Badge>
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
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-serif text-3xl text-foreground">{value}</p>
      </CardContent>
    </Card>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{text}</p>
}

function CreateEventForm({ sphereId, isPending }: { sphereId: string; isPending: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Plus className="size-3.5" aria-hidden="true" />
        {open ? "Hide form" : "Create event"}
      </Button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            fd.set("sphereId", sphereId)
            startTransition(async () => {
              const r = await createEventAction(fd)
              if (r.error) toast.error(r.error)
              else {
                toast.success("Event created")
                setOpen(false)
              }
            })
          }}
          className="grid gap-3 rounded-lg border border-border/70 bg-secondary/20 p-4 sm:grid-cols-2"
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="evTitle">Title</Label>
            <Input id="evTitle" name="title" required maxLength={120} placeholder="Tech Fest 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evDate">Date</Label>
            <Input id="evDate" name="date" type="date" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evTime">Time (optional)</Label>
            <Input id="evTime" name="time" type="time" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evVenue">Venue (optional)</Label>
            <Input id="evVenue" name="venue" placeholder="Main Auditorium" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evOrganizer">Organizer (optional)</Label>
            <Input id="evOrganizer" name="organizer" placeholder="Coding Club" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="evDesc">Description (optional)</Label>
            <Textarea id="evDesc" name="description" rows={2} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy || isPending}>
              Create event
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function CreateClubForm({ sphereId, isPending }: { sphereId: string; isPending: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Plus className="size-3.5" aria-hidden="true" />
        {open ? "Hide form" : "Create club"}
      </Button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            fd.set("sphereId", sphereId)
            startTransition(async () => {
              const r = await createClubAction(fd)
              if (r.error) toast.error(r.error)
              else {
                toast.success("Club created")
                setOpen(false)
              }
            })
          }}
          className="grid gap-3 rounded-lg border border-border/70 bg-secondary/20 p-4 sm:grid-cols-2"
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="clName">Club name</Label>
            <Input id="clName" name="name" required maxLength={120} placeholder="Robotics Club" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="clDesc">Description (optional)</Label>
            <Textarea id="clDesc" name="description" rows={2} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy || isPending}>
              Create club
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function CreateSubjectForm({ sphereId, isPending }: { sphereId: string; isPending: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Plus className="size-3.5" aria-hidden="true" />
        {open ? "Hide form" : "Create subject"}
      </Button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            fd.set("sphereId", sphereId)
            startTransition(async () => {
              const r = await createSubjectAction(fd)
              if (r.error) toast.error(r.error)
              else {
                toast.success("Subject created")
                setOpen(false)
              }
            })
          }}
          className="grid gap-3 rounded-lg border border-border/70 bg-secondary/20 p-4 sm:grid-cols-4"
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="subName">Subject name</Label>
            <Input id="subName" name="name" required placeholder="Data Structures" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subCode">Code (optional)</Label>
            <Input id="subCode" name="code" placeholder="CS-201" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subDegree">Degree</Label>
            <Input id="subDegree" name="degree" placeholder="btech" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subYear">Year</Label>
            <Input id="subYear" name="year" placeholder="2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subBranch">Branch</Label>
            <Input id="subBranch" name="branch" placeholder="cse" />
          </div>
          <div className="flex gap-2 sm:col-span-4">
            <Button type="submit" size="sm" disabled={busy || isPending}>
              Create subject
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function MemberDetailsModal({
  member,
  roles,
  onClose,
}: {
  member: UserRow
  roles: { role: string; scope: Record<string, unknown> }[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-serif text-xl text-foreground">{member.realName}</p>
            <p className="font-mono text-xs text-primary">{member.handle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Close member details"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <dl className="space-y-2 text-sm">
          <DetailRow label="Email" value={member.email} />
          <DetailRow label="Phone" value={member.phone} />
          <DetailRow label="Account status" value={member.accountStatus} />
          <DetailRow label="Profile role" value={member.role.replace("_", " ")} />
          <DetailRow label="Joined" value={new Date(member.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} />
        </dl>
        {roles.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sphere role assignments</p>
            <div className="space-y-1.5">
              {roles.map((r, i) => (
                <div key={i} className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2">
                  <p className="text-xs font-medium capitalize text-foreground">{r.role.replace(/_/g, " ")}</p>
                  {Object.keys(r.scope).length > 0 && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {Object.entries(r.scope)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-4 text-[11px] text-muted-foreground">
          Admin-only view. This identity is never exposed in the public chat.
        </p>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  )
}

function ReportActions({
  isPending,
  onAction,
}: {
  isPending: boolean
  onAction: (resolution: "resolved" | "rejected", note: string) => void
}) {
  const [note, setNote] = useState("")

  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (optional)"
        rows={1}
        className="min-h-9 flex-1"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => onAction("resolved", note)}>
          Resolve
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => onAction("rejected", note)}>
          Reject
        </Button>
      </div>
    </div>
  )
}
