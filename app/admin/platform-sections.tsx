"use client"

import { useRef, useState, useTransition } from "react"
import {
  upsertPlanAction,
  deletePlanAction,
  upsertTeamMemberAction,
  deleteTeamMemberAction,
  updateApplicationStatusAction,
  updateAdvertisingConfigAction,
  updateOrderStatusAction,
  reviewCollegeRequestAction,
  createCollegeFromRequestAction,
  upsertCollegeAction,
  setCollegeStatusAction,
  updatePromotionPaymentConfigAction,
} from "@/lib/actions/platform"
import { Orbit, Loader2, Plus, Upload, X, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { FileUpload } from "@/components/ui/file-upload"
import { upsertShopProductAction, deleteShopProductAction } from "@/lib/actions/platform"

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
  collegeRequests: { id: string; name: string; city: string; contact_name: string; contact_email: string; contact_phone: string; status: string; created_at: string }[]
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
  applications: { id: string; full_name: string; email: string; phone: string; college: string; year: string; skills: string; experience: string; portfolio: string; motivation: string; links: string; resume_url: string | null; status: string; admin_note: string; created_at: string }[]
  advertising: { contact_phone: string; contact_email: string }
  promotionPayment: { price_inr: number; duration_days: number; qr_image_url: string | null; upi_id: string | null; instructions: string }
}

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

const ORDER_STATUSES = ["pending", "accepted", "in_progress", "delivered", "cancelled"] as const
const APP_STATUSES = ["new", "reviewed", "shortlisted", "rejected"] as const

export function CollegesSection({ data, isSuperAdmin }: { data: PlatformData; isSuperAdmin: boolean }) {
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PlatformData["colleges"][number] | null>(null)
  const [isPending, startTransition] = useTransition()
  const q = query.trim().toLowerCase()
  const filtered = data.colleges.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.aliases.some((a) => a.toLowerCase().includes(q)),
  )

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search colleges" className="pl-3" />
        </div>
        {isSuperAdmin && (
          <Button
            size="sm"
            onClick={() => {
              setCreating(true)
              setEditing(null)
            }}
          >
            New college
          </Button>
        )}
      </div>
      {!isSuperAdmin && (
        <p className="text-xs text-muted-foreground">Only super admins can create or edit colleges.</p>
      )}

      {(creating || editing) && (
        <CollegeForm
          key={editing ? editing.id : "new"}
          initial={editing}
          isPending={isPending}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSubmit={(formData) =>
            run(async () => {
              const r = await upsertCollegeAction(formData)
              if (!r.error) {
                setCreating(false)
                setEditing(null)
              }
              return r
            }, editing ? "College updated" : "College created — its Sphere is ready")
          }
        />
      )}

      {filtered.length === 0 ? (
        <Empty text="No colleges in the directory yet." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((c) => (
            <Card key={c.id} className="border-border/70 bg-card">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {c.short_name && <span className="font-medium text-primary">{c.short_name}</span>}
                      {c.city && <span>· {c.city}</span>}
                      <code className="text-[10px]">{c.slug}</code>
                    </p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                      <Orbit className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      {c.sphere_name ? (
                        <span className="truncate text-foreground">{c.sphere_name}</span>
                      ) : (
                        <span className="text-muted-foreground">Sphere not created yet</span>
                      )}
                    </p>
                    {c.aliases.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.aliases.slice(0, 4).map((a) => (
                          <span
                            key={a}
                            className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {a}
                          </span>
                        ))}
                        {c.aliases.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{c.aliases.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge
                      variant="outline"
                      className={`border-border/60 text-[10px] font-normal ${c.status === "active" ? "text-primary" : "text-destructive"}`}
                    >
                      {c.status}
                    </Badge>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(c)
                          setCreating(false)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={c.status === "active" ? "destructive" : "default"}
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => setCollegeStatusAction(c.id, c.status === "active" ? "inactive" : "active"),
                            c.status === "active" ? "College deactivated" : "College activated",
                          )
                        }
                      >
                        {c.status === "active" ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function CollegeForm({
  initial,
  isPending,
  onClose,
  onSubmit,
}: {
  initial: PlatformData["colleges"][number] | null
  isPending: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => void
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(new FormData(e.currentTarget))
      }}
      className="space-y-3 rounded-lg border border-border/70 bg-secondary/20 p-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="collegeName">Official name</Label>
          <Input
            id="collegeName"
            name="name"
            required
            maxLength={120}
            defaultValue={initial?.name ?? ""}
            placeholder="ITS Engineering College"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collegeShort">Display name / short name</Label>
          <Input id="collegeShort" name="shortName" defaultValue={initial?.short_name ?? ""} placeholder="ITS" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collegeCity">City</Label>
          <Input id="collegeCity" name="city" defaultValue={initial?.city ?? ""} placeholder="Greater Noida" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collegeState">State</Label>
          <Input id="collegeState" name="state" placeholder="Uttar Pradesh" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="collegeAliases">Search aliases (comma-separated)</Label>
        <Input
          id="collegeAliases"
          name="aliases"
          defaultValue={initial?.aliases.join(", ") ?? ""}
          placeholder="ITS, I.T.S, ITS College, ITS Engineering"
        />
        <p className="text-xs text-muted-foreground">
          Anyone typing an alias finds this college in signup. Aliases replace the previous list on save.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="collegeDesc">Description (optional)</Label>
        <Input id="collegeDesc" name="description" placeholder="One line about the campus" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="collegeLogo">Logo URL (optional)</Label>
          <Input id="collegeLogo" name="logoUrl" placeholder="https://…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collegeCover">Cover image URL (optional)</Label>
          <Input id="collegeCover" name="coverUrl" placeholder="https://…" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="status"
          defaultChecked={initial ? initial.status === "active" : true}
          className="size-4 accent-[var(--primary)]"
        />
        Active (visible in the signup directory)
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {initial ? "Save changes" : "Create college"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function CollegeRequestsSection({ requests }: { requests: PlatformData["collegeRequests"] }) {
  const [isPending, startTransition] = useTransition()

  function setStatus(id: string, status: "approved" | "rejected") {
    startTransition(async () => {
      const result = await reviewCollegeRequestAction(id, status)
      if (result.error) toast.error(result.error)
      else toast.success(status === "approved" ? "Request approved" : "Request rejected")
    })
  }

  function addToDirectory(id: string) {
    startTransition(async () => {
      const result = await createCollegeFromRequestAction(id)
      if (result.error) toast.error(result.error)
      else toast.success("College added to the directory — its Sphere is ready")
    })
  }

  return (
    <div className="space-y-3">
      {requests.length === 0 ? (
        <Empty text="No college requests yet." />
      ) : (
        requests.map((r) => (
          <Card key={r.id} className="border-border/70 bg-card">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{r.name}</p>
                {r.city && <span className="text-xs text-muted-foreground">· {r.city}</span>}
                <Badge variant="outline" className="ml-auto border-border/60 text-[10px] font-normal capitalize">
                  {r.status}
                </Badge>
              </div>
              {(r.contact_name || r.contact_email || r.contact_phone) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[r.contact_name, r.contact_email, r.contact_phone].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status === "pending" && (
                  <>
                    <Button size="sm" disabled={isPending} onClick={() => setStatus(r.id, "approved")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus(r.id, "rejected")}>
                      Reject
                    </Button>
                  </>
                )}
                <Button size="sm" variant="secondary" disabled={isPending} onClick={() => addToDirectory(r.id)}>
                  Add to directory
                </Button>
              </div>
              {r.status !== "pending" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  “Add to directory” creates the college and its Sphere, then marks the request approved.
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

export function PlansSection({ plans }: { plans: PlatformData["plans"] }) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<PlatformData["plans"][number] | null>(null)
  const [creating, setCreating] = useState(false)

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Roadmap plans shown on the landing page and the member dashboard. Publishing a plan notifies every
          active member once.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setCreating(true)
            setEditing(null)
          }}
        >
          New plan
        </Button>
      </div>

      {(creating || editing) && (
        <PlanForm
          key={editing ? editing.id : "new"}
          initial={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSubmit={(formData) =>
            run(async () => {
              const r = await upsertPlanAction(formData)
              if (!r.error) {
                setCreating(false)
                setEditing(null)
              }
              return r
            }, editing ? "Plan updated" : "Plan created")
          }
        />
      )}

      {plans.length === 0 ? (
        <Empty text="No plans yet. Add the first roadmap item." />
      ) : (
        plans.map((p) => (
          <Card key={p.id} className="border-border/70 bg-card">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.title}</p>
                {p.description && <p className="truncate text-xs text-muted-foreground">{p.description}</p>}
              </div>
              <Badge variant="outline" className={`shrink-0 border-border/60 text-[10px] font-normal ${p.active ? "text-primary" : "text-muted-foreground"}`}>
                {p.active ? "published" : "hidden"}
              </Badge>
              {p.feedbackCount > 0 && (
                <span className="shrink-0 text-[11px] text-muted-foreground" title={`${p.feedbackCount} feedback entries`}>
                  {p.averageRating != null ? `${p.averageRating.toFixed(1)}★ ` : ""}
                  ({p.feedbackCount})
                </span>
              )}
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => { setEditing(p); setCreating(false) }}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                onClick={() => run(() => deletePlanAction(p.id), "Plan deleted")}
              >
                Delete
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

function PlanForm({
  initial,
  onClose,
  onSubmit,
}: {
  initial: PlatformData["plans"][number] | null
  onClose: () => void
  onSubmit: (fd: FormData) => void
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(new FormData(e.currentTarget))
      }}
      className="space-y-3 rounded-lg border border-border/70 bg-secondary/20 p-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="space-y-1.5">
        <Label htmlFor="planTitle">Title</Label>
        <Input id="planTitle" name="title" required maxLength={160} defaultValue={initial?.title ?? ""} placeholder="e.g. Campus leaderboards" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="planDescription">Description</Label>
        <Textarea id="planDescription" name="description" rows={2} maxLength={400} defaultValue={initial?.description ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="planOrder">Display order</Label>
          <Input id="planOrder" name="displayOrder" type="number" defaultValue={initial?.display_order ?? 0} />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-muted-foreground">
          <input type="checkbox" name="active" defaultChecked={initial ? initial.active : true} className="size-4 accent-[var(--primary)]" />
          Published (visible + notifies members)
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit">{initial ? "Save changes" : "Create plan"}</Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function TeamSection({ team }: { team: PlatformData["team"] }) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Team members shown on the public About page.</p>
        <Button size="sm" onClick={() => {
          setPhotoUrls([])
          setOpen(true)
        }}>
          Add member
        </Button>
      </div>
      {team.length === 0 ? (
        <Empty text="No team members yet." />
      ) : (
        team.map((m) => (
          <Card key={m.id} className="border-border/70 bg-card">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.role} · {m.short_bio || "—"}
                </p>
              </div>
              <Badge variant="outline" className={`shrink-0 border-border/60 text-[10px] font-normal ${m.active ? "text-primary" : "text-muted-foreground"}`}>
                {m.active ? "visible" : "hidden"}
              </Badge>
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                onClick={() => run(() => deleteTeamMemberAction(m.id), "Member removed")}
              >
                Delete
              </Button>
            </CardContent>
          </Card>
        ))
      )}

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const r = await upsertTeamMemberAction(new FormData(e.currentTarget))
              if (!r.error) {
                setOpen(false)
                setPhotoUrls([])
              }
              return r
            }, "Team member saved")
          }}
          className="space-y-3 rounded-lg border border-border/70 bg-secondary/20 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="teamName">Name</Label>
              <Input id="teamName" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select name="role" defaultValue="Member">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Founder", "Co-Founder", "Member", "Advisor"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Photo (optional)</Label>
            <FileUpload
              accept="image"
              maxFiles={1}
              value={photoUrls}
              onChange={(v) => setPhotoUrls(v as string[])}
            />
            <input type="hidden" name="photoUrl" value={photoUrls[0] || ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teamShort">Short bio</Label>
            <Input id="teamShort" name="shortBio" placeholder="One line about this member" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teamBio">Full bio (optional)</Label>
            <Textarea id="teamBio" name="bio" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="teamOrder">Display order</Label>
              <Input id="teamOrder" name="displayOrder" type="number" defaultValue={0} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-muted-foreground">
              <input type="checkbox" name="active" defaultChecked className="size-4 accent-[var(--primary)]" />
              Visible on About page
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              Save member
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

export function WorkWithUsSection({ applications }: { applications: PlatformData["applications"] }) {
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState<Record<string, string>>({})
  const [openId, setOpenId] = useState<string | null>(null)

  function setStatus(id: string, status: (typeof APP_STATUSES)[number]) {
    startTransition(async () => {
      const result = await updateApplicationStatusAction(id, status, note[id] ?? "")
      if (result.error) toast.error(result.error)
      else toast.success("Application updated")
    })
  }

  return (
    <div className="space-y-3">
      {applications.length === 0 ? (
        <Empty text="No work-with-us applications yet." />
      ) : (
        applications.map((a) => (
          <Card key={a.id} className="border-border/70 bg-card">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{a.full_name}</p>
                {a.college && <span className="text-xs text-muted-foreground">· {a.college}</span>}
                <Badge variant="outline" className={`ml-auto border-border/60 text-[10px] font-normal capitalize ${a.status === "new" ? "text-primary" : "text-muted-foreground"}`}>
                  {a.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.email}
                {a.phone ? ` · ${a.phone}` : ""}
                {a.year ? ` · ${a.year}` : ""}
              </p>
              {a.skills && <p className="mt-1 text-xs text-muted-foreground">Skills: {a.skills}</p>}
              {a.portfolio && (
                <a href={a.portfolio} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-primary hover:underline">
                  {a.portfolio}
                </a>
              )}

              <button onClick={() => setOpenId(openId === a.id ? null : a.id)} className="mt-2 text-xs font-medium text-primary hover:underline">
                {openId === a.id ? "Hide details" : "View full application"}
              </button>

              {openId === a.id && (
                <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-secondary/20 p-3 text-sm">
                  <p><span className="font-medium text-foreground">Motivation:</span> <span className="text-muted-foreground">{a.motivation}</span></p>
                  {a.experience && <p><span className="font-medium text-foreground">Experience:</span> <span className="text-muted-foreground">{a.experience}</span></p>}
                  {a.links && <p><span className="font-medium text-foreground">Links:</span> <span className="text-muted-foreground">{a.links}</span></p>}
                  {a.resume_url && (
                    <a href={a.resume_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      View resume ↗
                    </a>
                  )}
                  {a.admin_note && <p className="text-xs text-muted-foreground">Note: {a.admin_note}</p>}
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row">
                <Input
                  value={note[a.id] ?? ""}
                  onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))}
                  placeholder="Admin note (optional)"
                  className="h-9 flex-1"
                />
                {APP_STATUSES.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={a.status === s ? "default" : "outline"}
                    disabled={isPending}
                    onClick={() => setStatus(a.id, s)}
                  >
                    {s === "new" ? "Mark new" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

export function AdvertisingSection({ data }: { data: PlatformData["advertising"] }) {
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateAdvertisingConfigAction(new FormData(e.currentTarget))
      if (result.error) toast.error(result.error)
      else toast.success("Advertising contact details updated")
    })
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="adPhone">Contact phone</Label>
        <Input id="adPhone" name="phone" defaultValue={data.contact_phone} placeholder="+91 98765 43210" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="adEmail">Contact email</Label>
        <Input id="adEmail" name="email" type="email" defaultValue={data.contact_email} placeholder="ads@uresphere.app" />
      </div>
      <Button type="submit" disabled={isPending}>
        Save contact details
      </Button>
      <p className="text-xs text-muted-foreground">
        These appear in the “Advertise on UreSphere” modal on the About page.
      </p>
    </form>
  )
}

const ORDER_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  in_progress: "In progress",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export function OrdersSection({ orders }: { orders: OrderRow[] }) {
  const [isPending, startTransition] = useTransition()

  function setStatus(id: string, status: (typeof ORDER_STATUSES)[number]) {
    startTransition(async () => {
      const result = await updateOrderStatusAction(id, status)
      if (result.error) toast.error(result.error)
      else toast.success("Order updated")
    })
  }

  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <Empty text="No marketplace orders yet." />
      ) : (
        orders.map((o) => (
          <Card key={o.id} className="border-border/70 bg-card">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{o.buyer_name}</p>
                <span className="text-xs text-muted-foreground">· {o.buyer_phone}</span>
                <Badge variant="outline" className="ml-auto border-border/60 text-[10px] font-normal capitalize">
                  {ORDER_LABELS[o.status] ?? o.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                🏠 {o.address}
                {o.delivery_date ? ` · by ${o.delivery_date}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(o.price_cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} · fee{" "}
                {(o.fee_cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} · settlement{" "}
                {(o.settlement_cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                {ORDER_STATUSES.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={o.status === s ? "default" : "outline"}
                    disabled={isPending}
                    onClick={() => setStatus(o.id, s)}
                  >
                    {s === "cancelled" ? "Cancel" : ORDER_LABELS[s]}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

export type ShopProductRow = {
  id: string
  name: string
  description: string
  category: string
  price_cents: number
  image_urls: string[]
  availability: string
  active: boolean
  delivery_info: string | null
  payment_info: string | null
}

const SHOP_CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  stationery: "Stationery",
  essentials: "Essentials",
  other: "Other",
}

const SHOP_AVAILABILITY = ["in_stock", "low_stock", "out_of_stock"] as const

export function ShopProductsSection({ sphereId, products }: { sphereId: string; products: ShopProductRow[] }) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<ShopProductRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [images, setImages] = useState<string[]>([])

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  function openCreate() {
    setEditing(null)
    setImages([])
    setCreating(true)
  }

  function openEdit(p: ShopProductRow) {
    setEditing(p)
    setImages(p.image_urls ?? [])
    setCreating(true)
  }

  function submit(formData: FormData) {
    formData.set("sphereId", sphereId)
    formData.set("imageUrls", JSON.stringify(images))
    if (editing) formData.set("id", editing.id)
    run(async () => {
      const r = await upsertShopProductAction(formData)
      if (!r.error) setCreating(false)
      return r
    }, editing ? "Product updated" : "Product created")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Products shown in the UreSphere Shop tab — admin-created, same checkout flow as member listings.
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openCreate}>
          <Plus className="size-3.5" aria-hidden="true" />
          Add product
        </Button>
      </div>

      {products.length === 0 ? (
        <Empty text="No shop products in this Sphere yet." />
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id} className="border-border/70 bg-card">
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {SHOP_CATEGORY_LABELS[p.category] ?? p.category} ·{" "}
                    {(p.price_cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
                    {" · "}
                    {p.availability.replace("_", " ")}
                  </p>
                </div>
                <Badge variant={p.active ? "default" : "outline"} className="border-border/60 text-[10px] font-normal">
                  {p.active ? "Live" : "Hidden"}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => openEdit(p)} disabled={isPending}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => {
                    if (confirm(`Delete product "${p.name}"?`)) run(() => deleteShopProductAction(p.id), "Product deleted")
                  }}
                >
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setCreating(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-serif text-xl text-foreground">{editing ? "Edit product" : "Add a shop product"}</p>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="Close editor"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <form action={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="spName">Product name</Label>
                <Input id="spName" name="name" required maxLength={120} defaultValue={editing?.name ?? ""} placeholder="Printed notes bundle" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spDesc">Description</Label>
                <Textarea id="spDesc" name="description" rows={2} maxLength={2000} defaultValue={editing?.description ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="spPrice">Price (₹)</Label>
                  <Input id="spPrice" name="price" type="number" min="0" step="1" required defaultValue={editing ? editing.price_cents / 100 : ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select name="category" defaultValue={editing?.category ?? "essentials"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SHOP_CATEGORY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Availability</Label>
                <Select name="availability" defaultValue={editing?.availability ?? "in_stock"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOP_AVAILABILITY.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Photos</Label>
                <FileUpload
                  accept="image"
                  multiple
                  maxFiles={6}
                  value={images}
                  onChange={(v) => setImages(v as string[])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spDelivery">Delivery info (optional)</Label>
                <Textarea id="spDelivery" name="deliveryInfo" rows={2} maxLength={500} defaultValue={editing?.delivery_info ?? ""} placeholder="Pickup from the campus store, 10am–4pm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spPayment">Payment info (optional)</Label>
                <Textarea id="spPayment" name="paymentInfo" rows={2} maxLength={500} defaultValue={editing?.payment_info ?? ""} placeholder="Pay on pickup or UPI" />
              </div>
              <div className="flex items-center gap-2">
                <input id="spActive" name="active" type="checkbox" defaultChecked={editing ? editing.active : true} className="size-4" />
                <Label htmlFor="spActive" className="text-sm font-normal">
                  Visible in the shop
                </Label>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={isPending}>
                  {editing ? "Save changes" : "Create product"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export function PromotionPaymentSection({ data }: { data: PlatformData["promotionPayment"] }) {
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [qrUrl, setQrUrl] = useState(data.qr_image_url ?? "")
  const fileInputRef = useRef<HTMLInputElement>(null)

  function uploadQr(file: File) {
    const formData = new FormData()
    formData.set("file", file)
    setUploading(true)
    fetch("/api/promotions/upload", { method: "POST", body: formData })
      .then(async (res) => {
        const json = (await res.json()) as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed")
        setQrUrl(json.url)
        toast.success("QR uploaded")
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Upload failed"))
      .finally(() => setUploading(false))
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("qrImageUrl", qrUrl)
    startTransition(async () => {
      const result = await updatePromotionPaymentConfigAction(fd)
      if (result.error) toast.error(result.error)
      else toast.success("Promotion payment settings saved")
    })
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-4">
      <p className="text-sm text-muted-foreground">
        This QR and fee are shown to members after they submit a promotion. Only super admins can change them.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="promoPrice">Promotion fee (₹)</Label>
          <Input id="promoPrice" name="priceInr" type="number" min={0} step="any" required defaultValue={data.price_inr} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="promoDuration">Live duration (days)</Label>
          <Input id="promoDuration" name="durationDays" type="number" min={1} max={90} required defaultValue={data.duration_days} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="promoUpi">UPI ID (optional)</Label>
        <Input id="promoUpi" name="upiId" defaultValue={data.upi_id ?? ""} placeholder="uresphere@upi" maxLength={120} />
        <p className="text-xs text-muted-foreground">Shown to the member alongside the QR so they can pay by UPI id too.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Payment QR code</Label>
        {qrUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="Payment QR preview" className="h-24 w-24 rounded-md border border-border bg-white object-contain" />
            <Button type="button" size="sm" variant="outline" onClick={() => setQrUrl("")} className="gap-1">
              <X className="size-3.5" aria-hidden="true" />
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-border bg-background">
              <QrCode className="size-8 text-muted-foreground/50" />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {uploading ? "Uploading…" : "Upload QR"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadQr(file)
                e.target.value = ""
              }}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Stored in Vercel Blob (max 5MB). Members see this QR — never a hardcoded URL.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="promoInstructions">Payment instructions</Label>
        <Textarea id="promoInstructions" name="instructions" rows={3} maxLength={1000} defaultValue={data.instructions} />
      </div>

      <Button type="submit" disabled={isPending}>
        Save payment settings
      </Button>
    </form>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{text}</p>
}
