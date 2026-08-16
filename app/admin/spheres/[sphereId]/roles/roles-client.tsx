"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { assignRoleAction, removeRoleAction } from "@/lib/actions/platform"
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLE_PERMISSION_PRESETS,
  ROLE_SCOPE_FIELDS,
  ALL_PERMISSIONS,
  type AssignableRole,
} from "@/lib/roles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { ArrowLeft, Search, Pencil, Trash2, X, Plus } from "lucide-react"

type Member = {
  userId: string
  handle: string
  realName: string
  email: string
  role: string
  accountStatus: string
}

type Assignment = {
  id: string
  user_id: string
  role: string
  scope: Record<string, unknown>
  created_at: string
}

export function RolesClient({
  sphereId,
  sphereName,
  sphereCity,
  sphereState,
  users,
  assignments,
}: {
  sphereId: string
  sphereName: string
  sphereCity: string
  sphereState: string
  users: Member[]
  assignments: Assignment[]
}) {
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [selectedUserId, setSelectedUserId] = useState("")
  const [role, setRole] = useState<AssignableRole>("academic_manager")
  const [permissions, setPermissions] = useState<string[]>([...ROLE_PERMISSION_PRESETS.academic_manager])
  const [degree, setDegree] = useState("")
  const [year, setYear] = useState("")
  const [branch, setBranch] = useState("")
  const [sections, setSections] = useState<{ degree: string; year: string; branch: string }[]>([{ degree: "", year: "", branch: "" }])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.handle.toLowerCase().includes(q) ||
        u.realName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    )
  }, [users, query])

  const selectedMember = users.find((u) => u.userId === selectedUserId)
  const scopeFields = ROLE_SCOPE_FIELDS[role]

  function pickRole(next: string) {
    const r = next as AssignableRole
    setRole(r)
    setPermissions([...ROLE_PERMISSION_PRESETS[r]])
  }

  function startEdit(a: Assignment) {
    const member = users.find((u) => u.userId === a.user_id)
    if (!member) {
      toast.error("That member is no longer active in this Sphere.")
      return
    }
    setEditingId(a.id)
    setSelectedUserId(a.user_id)
    const r = ASSIGNABLE_ROLES.includes(a.role as AssignableRole) ? (a.role as AssignableRole) : "academic_manager"
    setRole(r)
    const scope = a.scope ?? {}
    setPermissions(
      Array.isArray(scope.permissions) && (scope.permissions as string[]).length > 0
        ? (scope.permissions as string[])
        : [...ROLE_PERMISSION_PRESETS[r]],
    )
    setDegree(typeof scope.degree === "string" ? scope.degree : "")
    setYear(typeof scope.year === "string" ? scope.year : "")
    setBranch(typeof scope.branch === "string" ? scope.branch : "")
    if (r === "academic_manager") {
      const rawSections = Array.isArray(scope.sections) && (scope.sections as unknown[]).length > 0 ? (scope.sections as unknown[]) : null
      const loaded = rawSections
        ? rawSections.map((s) => ({
            degree: String((s as { degree?: unknown })?.degree ?? ""),
            year: String((s as { year?: unknown })?.year ?? ""),
            branch: String((s as { branch?: unknown })?.branch ?? ""),
          }))
        : [{ degree: String(scope.degree ?? ""), year: String(scope.year ?? ""), branch: String(scope.branch ?? "") }]
      setSections(loaded.filter((s) => s.degree || s.year || s.branch).length > 0 ? loaded : [{ degree: "", year: "", branch: "" }])
    }
    setShowPicker(false)
  }

  function resetForm() {
    setEditingId(null)
    setSelectedUserId("")
    setRole("academic_manager")
    setPermissions([...ROLE_PERMISSION_PRESETS.academic_manager])
    setDegree("")
    setYear("")
    setBranch("")
    setSections([{ degree: "", year: "", branch: "" }])
    setShowPicker(false)
  }

  function setSection(index: number, field: "degree" | "year" | "branch", value: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function addSection() {
    setSections((prev) => [...prev, { degree: "", year: "", branch: "" }])
  }

  function removeSection(index: number) {
    setSections((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function togglePermission(p: string) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }

  function assign(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId) {
      toast.error("Pick a member first.")
      return
    }
    startTransition(async () => {
      const formData = new FormData()
      formData.set("userId", selectedUserId)
      formData.set("sphereId", sphereId)
      formData.set("role", role)
      formData.set("permissions", permissions.join(","))
      if (role === "academic_manager") {
        const nonEmpty = sections.filter((s) => s.degree || s.year || s.branch)
        if (nonEmpty.length === 0) {
          toast.error("Add at least one assigned section for an academic manager.")
          return
        }
        formData.set("sections", JSON.stringify(nonEmpty))
      } else {
        formData.set("degree", degree)
        formData.set("year", year)
        formData.set("branch", branch)
      }

      const result = await assignRoleAction(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }

      // Editing with a changed role leaves the old assignment behind — revoke it.
      if (editingId) {
        const current = assignments.find((a) => a.id === editingId)
        if (current && current.role !== role) {
          await removeRoleAction(editingId)
        }
      }

      toast.success(editingId ? "Assignment updated" : "Role assigned")
      resetForm()
    })
  }

  function revoke(id: string) {
    startTransition(async () => {
      const result = await removeRoleAction(id)
      if (result.error) toast.error(result.error)
      else toast.success("Assignment removed")
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <Link
        href={`/admin/spheres/${sphereId}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {sphereName}
      </Link>

      <div className="mb-8">
        <h1 className="font-serif text-3xl font-semibold text-foreground">Roles &amp; permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[sphereName, sphereCity, sphereState].filter(Boolean).join(" · ")} — assignments are scoped to this Sphere
          only.
        </p>
      </div>

      <form onSubmit={assign} className="mb-10 space-y-4 rounded-lg border border-border/70 bg-secondary/20 p-4">
        {/* Member search + select */}
        <div>
          <Label htmlFor="memberSearch" className="mb-1.5 block">
            Member
          </Label>
          {selectedMember ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-card px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  <span className="font-mono text-xs text-primary">{selectedMember.handle}</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  {selectedMember.realName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{selectedMember.email}</p>
              </div>
              <Button type="button" size="icon-xs" variant="ghost" aria-label="Clear member" onClick={() => setSelectedUserId("")}>
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="memberSearch"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by handle, name or email"
                className="pl-9"
              />
              {query && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border/70 bg-card shadow-lg">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No members match.</p>
                  ) : (
                    filtered.map((u) => (
                      <button
                        key={u.userId}
                        type="button"
                        onClick={() => {
                          setSelectedUserId(u.userId)
                          setQuery("")
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-secondary/50"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-mono text-xs text-primary">{u.handle}</span>
                          <span className="mx-1.5 text-muted-foreground">·</span>
                          {u.realName}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{u.email}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => pickRole(v ?? "academic_manager")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              sphere_admin = full administration inside this Sphere. Managers get only their section (and scope below).
            </p>
          </div>

          {role === "academic_manager" && (
            <div className="space-y-2">
              <Label>Assigned sections</Label>
              <p className="text-xs text-muted-foreground">
                Each section is a degree / year / branch combination. Leave a field blank to cover all of it — e.g.
                just “First Year” manages every First Year subject, whatever the degree or branch.
              </p>
              <div className="space-y-2">
                {sections.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                    <Input
                      value={s.degree}
                      onChange={(e) => setSection(i, "degree", e.target.value)}
                      placeholder="Degree (any)"
                      aria-label={`Section ${i + 1} degree`}
                    />
                    <Input
                      value={s.year}
                      onChange={(e) => setSection(i, "year", e.target.value)}
                      placeholder="Year (any)"
                      aria-label={`Section ${i + 1} year`}
                    />
                    <Input
                      value={s.branch}
                      onChange={(e) => setSection(i, "branch", e.target.value)}
                      placeholder="Branch (any)"
                      aria-label={`Section ${i + 1} branch`}
                    />
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removeSection(i)}
                      disabled={sections.length === 1}
                      aria-label="Remove section"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addSection}>
                <Plus className="size-3.5" aria-hidden="true" />
                Add section
              </Button>
            </div>
          )}
          {role !== "academic_manager" && scopeFields.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {scopeFields.includes("degree") && (
                <div className="space-y-1.5">
                  <Label htmlFor="scopeDegree">Degree</Label>
                  <Input id="scopeDegree" value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="B.Tech" />
                </div>
              )}
              {scopeFields.includes("year") && (
                <div className="space-y-1.5">
                  <Label htmlFor="scopeYear">Year</Label>
                  <Input id="scopeYear" value={year} onChange={(e) => setYear(e.target.value)} placeholder="1st" />
                </div>
              )}
              {scopeFields.includes("branch") && (
                <div className="space-y-1.5">
                  <Label htmlFor="scopeBranch">Branch</Label>
                  <Input id="scopeBranch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="CSE" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Permissions */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>Permissions</Label>
            <button type="button" onClick={() => setShowPicker((s) => !s)} className="text-xs font-medium text-primary hover:underline">
              {showPicker ? "Use preset" : "Customize"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {permissions.slice(0, 8).map((p) => (
              <span key={p} className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                {p}
              </span>
            ))}
            {permissions.length > 8 && (
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                +{permissions.length - 8} more
              </span>
            )}
          </div>
          {showPicker && (
            <div className="mt-2 rounded-md border border-border/70 bg-card p-3">
              <div className="flex flex-wrap gap-1.5">
                {ALL_PERMISSIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePermission(p)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      permissions.includes(p)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {editingId ? "Save changes" : "Assign role"}
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancel edit
            </Button>
          )}
        </div>
      </form>

      {/* Existing assignments */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground">Current assignments ({assignments.length})</h2>
        {assignments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No role assignments in this Sphere yet.
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => {
              const member = users.find((u) => u.userId === a.user_id)
              const scope = a.scope ?? {}
              const perms = Array.isArray(scope.permissions) ? (scope.permissions as string[]) : []
              const sectionList = Array.isArray(scope.sections) && (scope.sections as unknown[]).length > 0
                ? (scope.sections as { degree?: unknown; year?: unknown; branch?: unknown }[]).map(
                    (s) => [s.degree, s.year, s.branch].filter(Boolean).join(" · ") || "All content",
                  )
                : null
              const scopeText = sectionList
                ? sectionList.join(" + ")
                : [scope.degree, scope.year, scope.branch].filter(Boolean).join(" · ")
              return (
                <Card key={a.id} className="border-border/70 bg-card">
                  <CardContent className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        <span className="font-mono text-xs text-primary">{member?.handle ?? a.user_id.slice(0, 8)}</span>
                        <span className="mx-1.5 text-muted-foreground">·</span>
                        <span className="text-primary">{ROLE_LABELS[a.role as AssignableRole] ?? a.role.replace("_", " ")}</span>
                        {scopeText && <span className="ml-2 text-xs text-muted-foreground">scope: {scopeText}</span>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {perms.slice(0, 6).join(", ")}
                        {perms.length > 6 ? ` +${perms.length - 6} more` : ""}
                      </p>
                    </div>
                    {a.role === "sphere_admin" && (
                      <Badge variant="outline" className="border-border/60 text-[10px] font-normal">
                        Full sphere
                      </Badge>
                    )}
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => startEdit(a)}>
                        <Pencil className="mr-1 size-3" aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => {
                          if (confirm("Revoke this role assignment?")) revoke(a.id)
                        }}
                      >
                        <Trash2 className="mr-1 size-3" aria-hidden="true" />
                        Revoke
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
