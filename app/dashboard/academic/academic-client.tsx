"use client"

import { useState, useRef, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  createSubjectAction,
  createUnitAction,
  uploadResourceAction,
  deleteResourceAction,
  createCalendarEntryAction,
} from "@/lib/actions/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AdCard } from "@/components/ads/ad-card"
import type { AdCampaign } from "@/lib/ads"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Search,
  FileText,
  Trash2,
  Plus,
  CalendarDays,
  BookOpen,
  ChevronRight,
  GraduationCap,
  Layers,
  ArrowLeft,
  AlertCircle,
  FileUp,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

const TYPE_LABELS: Record<string, string> = {
  notes: "Notes",
  handwritten: "Handwritten",
  syllabus: "Syllabus",
  paper: "Previous paper",
  other: "Other",
}

const DEGREES = ["B.Tech", "BBA", "MBA", "BCA", "MCA", "Other"]
const YEARS = ["First Year", "Second Year", "Third Year", "Fourth Year"]

type Subject = { id: string; name: string; code: string; degree: string; year: string; branch: string }
type Unit = { id: string; subject_id: string; name: string }
type Resource = {
  id: string
  title: string
  type: string
  url: string
  subject_id: string | null
  unit_id: string | null
  created_at: string
  subjectName: string
  unitName: string | null
}
type CalendarEntry = { id: string; title: string; event_date: string; description: string }

export function AcademicClient({
  member,
  subjects,
  units,
  resources,
  calendar,
  ads,
}: {
  member: { role: string; sphereId: string | null }
  subjects: Subject[]
  units: Unit[]
  resources: Resource[]
  calendar: CalendarEntry[]
  ads: AdCampaign[]
}) {
  const isAdmin = member.role === "admin" || member.role === "super_admin"
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)
  const [unitSubjectId, setUnitSubjectId] = useState<string>("")
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // --- Drill-down state lives in the URL (query params) so browser Back,
  // in-app Back, refresh, and direct links all preserve the degree/year/
  // branch/subject context. Navigation pushes a new history entry per level,
  // so Back walks one level at a time instead of resetting to the Academic
  // homepage.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const degree = searchParams.get("degree") ?? ""
  const year = searchParams.get("year") ?? ""
  const branch = searchParams.get("branch") ?? ""
  const subjectId = searchParams.get("subject") ?? ""
  const unitId = searchParams.get("unit") ?? ""

  /** Pushes a new drill-down level, preserving the deeper-lesser context. */
  function go(next: { degree?: string; year?: string; branch?: string; subject?: string; unit?: string }) {
    const qs = new URLSearchParams()
    if (next.degree) qs.set("degree", next.degree)
    if (next.year) qs.set("year", next.year)
    if (next.branch) qs.set("branch", next.branch)
    if (next.subject) qs.set("subject", next.subject)
    if (next.unit) qs.set("unit", next.unit)
    const queryString = qs.toString()
    router.push(queryString ? `${pathname}?${queryString}` : pathname)
  }

  function pickDegree(d: string) {
    if (isPending) return
    go({ degree: d })
  }
  function pickYear(y: string) {
    if (isPending) return
    go({ degree, year: y })
  }
  function pickBranch(b: string) {
    if (isPending) return
    go({ degree, year, branch: b })
  }
  function pickSubject(id: string) {
    if (isPending) return
    go({ degree, year, branch, subject: id })
  }

  /** In-app Back: pop the deepest level, keeping the outer context intact. */
  function back() {
    if (unitId) go({ degree, year, branch, subject: subjectId })
    else if (subjectId) go({ degree, year, branch })
    else if (branch) go({ degree, year })
    else if (year) go({ degree })
    else router.back()
  }

  // These derive from the URL search params (source of truth for the drill-
  // down); the React Compiler memoizes them automatically.
  const degrees = Array.from(new Set(subjects.map((s) => s.degree).filter(Boolean)))
  const yearsForDegree = Array.from(
    new Set(subjects.filter((s) => s.degree === degree).map((s) => s.year).filter(Boolean)),
  )
  const branchesForYear = Array.from(
    new Set(subjects.filter((s) => s.degree === degree && s.year === year).map((s) => s.branch).filter(Boolean)),
  )
  const subjectsForBranch = subjects.filter((s) => s.degree === degree && s.year === year && s.branch === branch)
  const selectedSubject = subjectsForBranch.find((s) => s.id === subjectId)
  const unitsForSubject = units.filter((u) => u.subject_id === subjectId)

  const visibleResources = resources.filter((r) => {
    if (subjectId) {
      if (r.subject_id !== subjectId) return false
      if (unitId && r.unit_id !== unitId) return false
    }
    const q = query.trim().toLowerCase()
    const matchesQuery = q.length === 0 || r.title.toLowerCase().includes(q) || r.subjectName.toLowerCase().includes(q)
    const matchesType = typeFilter === "all" || r.type === typeFilter
    return matchesQuery && matchesType
  })

  const crumb = [
    { label: degree || "All degrees", action: () => go({}) },
    ...(year ? [{ label: year, action: () => pickDegree(degree) }] : []),
    ...(branch ? [{ label: branch, action: () => pickYear(year) }] : []),
    ...(selectedSubject ? [{ label: selectedSubject.name, action: () => pickBranch(branch) }] : []),
  ]

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Academic</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Degrees, years, branches, subjects and units for your Sphere — managed by your admins.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSubjectOpen(true)}>
              <Plus className="size-3.5" />
              Subject
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCalendarOpen(true)}>
              <CalendarDays className="size-3.5" />
              Calendar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
              <Plus className="size-3.5" />
              Upload resource
            </Button>
          </div>
        )}
      </div>

      {/* Sponsored banner — Academic placement */}
      {ads.length > 0 && (
        <div className="mb-6 space-y-2">
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}

      {/* Back + Breadcrumb */}
      {(degree || year || branch || subjectId) && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={back} className="gap-1.5 -ml-2 text-muted-foreground">
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
            {crumb.map((c, i) => (
              <span key={c.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/50" />}
                <button
                  onClick={c.action}
                  className={`transition hover:text-primary ${i === crumb.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
        </div>
      )}

      {/* Level 1: Degrees */}
      {!degree && (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <GraduationCap className="size-4 text-primary" />
            Choose a degree
          </h2>
          {degrees.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No subjects have been added yet. {isAdmin ? "Add the first subject above." : "Check back soon."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {degrees.map((d) => (
                <button
                  key={d}
                  onClick={() => pickDegree(d)}
                  className="group flex items-center justify-between rounded-lg border border-border/70 bg-card p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm active:scale-[0.98] active:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <span className="font-serif text-lg text-foreground">{d}</span>
                  <ChevronRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Level 2: Years */}
      {degree && !year && (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="size-4 text-primary" />
            {degree} — choose a year
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">              {yearsForDegree.map((y) => (
                <button
                  key={y}
                  onClick={() => pickYear(y)}
                  className="group flex items-center justify-between rounded-lg border border-border/70 bg-card p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm active:scale-[0.98] active:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <span className="font-medium text-foreground">{y}</span>
                  <ChevronRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Level 3: Branches */}
      {degree && year && !branch && (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="size-4 text-primary" />
            {degree} · {year} — choose a branch
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">              {branchesForYear.map((b) => (
                <button
                  key={b}
                  onClick={() => pickBranch(b)}
                  className="group flex items-center justify-between rounded-lg border border-border/70 bg-card p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm active:scale-[0.98] active:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <span className="font-medium text-foreground">{b}</span>
                  <ChevronRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Level 4: Subjects */}
      {degree && year && branch && !subjectId && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-foreground">
            {degree} · {year} · {branch} — subjects
          </h2>
          {subjectsForBranch.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No subjects in this branch yet. {isAdmin ? "Add one above." : "Check back soon."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {subjectsForBranch.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickSubject(s.id)}
                  className="group flex items-center justify-between rounded-lg border border-border/70 bg-card p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm active:scale-[0.98] active:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{s.name}</p>
                    {s.code && <p className="text-xs text-muted-foreground">{s.code}</p>}
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Level 5: Subject detail — units + resources */}
      {selectedSubject && (
        <div className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl text-foreground">{selectedSubject.name}</h2>
              {selectedSubject.code && <p className="text-xs text-muted-foreground">{selectedSubject.code}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setUnitSubjectId(selectedSubject.id); setUnitOpen(true) }}>
                  <Plus className="size-3.5" />
                  Unit
                </Button>
              )}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search resources"
                    className="h-9 pl-9"
                  />
                </div>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "all")}>
                  <SelectTrigger className="h-9 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Units */}
          {unitsForSubject.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              <button
                onClick={() => go({ degree, year, branch, subject: subjectId })}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  !unitId ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                All units
              </button>
              {unitsForSubject.map((u) => (
                <button
                  key={u.id}
                  onClick={() => go({ degree, year, branch, subject: subjectId, unit: unitId === u.id ? "" : u.id })}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    unitId === u.id ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          )}

          {visibleResources.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              No resources here yet. {isAdmin ? "Upload the first one." : "Check back soon."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleResources.map((r) => (
                <a
                  key={r.id}
                  href={r.url}
                  rel="noopener noreferrer"
                  className="group/resource flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm active:scale-[0.98] active:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="size-5 shrink-0 text-primary transition-transform duration-150 group-hover/resource:scale-110" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground transition-colors group-hover/resource:text-primary">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.subjectName} · {TYPE_LABELS[r.type] ?? r.type}
                        {r.unitName ? ` · ${r.unitName}` : ""}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        run(() => deleteResourceAction(r.id), "Resource deleted")
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          e.stopPropagation()
                          run(() => deleteResourceAction(r.id), "Resource deleted")
                        }
                      }}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                      aria-label="Delete resource"
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </span>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calendar */}
      <section className="mt-12">
        <h2 className="mb-3 text-sm font-medium text-foreground">Academic calendar</h2>
        {calendar.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nothing on the calendar yet.
          </p>
        ) : (
          <div className="space-y-2">
            {calendar.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-4 py-3">
                <BookOpen className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">{entry.title}</p>
                  {entry.description && <p className="text-xs text-muted-foreground">{entry.description}</p>}
                </div>
                <Badge variant="outline" className="ml-auto shrink-0 border-border/60 font-normal text-muted-foreground">
                  {new Date(`${entry.event_date}T00:00:00`).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upload resource */}
      <UploadResourceDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        selectedSubjectId={selectedSubject?.id ?? null}
        subjects={subjects}
        isPending={isPending}
        startTransition={startTransition}
      />

      {/* New subject */}
      <Dialog open={subjectOpen} onOpenChange={setSubjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a subject</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) =>
              run(() => {
                formData.set("sphereId", member.sphereId ?? "")
                const p = createSubjectAction(formData)
                return p.then((r) => {
                  if (!r.error) setSubjectOpen(false)
                  return r
                })
              }, "Subject added")
            }
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Subject name</Label>
              <Input id="name" name="name" required placeholder="Data Structures" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">Code (optional)</Label>
              <Input id="code" name="code" placeholder="CS-203" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Degree</Label>
                <Select name="degree" defaultValue="">
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEGREES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Year</Label>
                <Select name="year" defaultValue="">
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="branch">Branch</Label>
              <Input id="branch" name="branch" placeholder="CSE" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                Add subject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New unit */}
      <Dialog open={unitOpen} onOpenChange={setUnitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a unit</DialogTitle>
            <DialogDescription>Units break a subject into parts (e.g. Unit 1, Unit 2).</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) =>
              run(() => {
                formData.set("subjectId", unitSubjectId)
                const p = createUnitAction(formData)
                return p.then((r) => {
                  if (!r.error) setUnitOpen(false)
                  return r
                })
              }, "Unit added")
            }
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="unitName">Unit name</Label>
              <Input id="unitName" name="name" required placeholder="Unit 1 — Arrays" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                Add unit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Calendar entry */}
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a calendar entry</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) =>
              run(() => {
                formData.set("sphereId", member.sphereId ?? "")
                const p = createCalendarEntryAction(formData)
                return p.then((r) => {
                  if (!r.error) setCalendarOpen(false)
                  return r
                })
              }, "Calendar updated")
            }
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="Mid-semester exams" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                Add entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upload resource dialog — handles file upload to Vercel Blob then creates
// the academic resource record via the server action.
// ---------------------------------------------------------------------------

function UploadResourceDialog({
  open,
  onOpenChange,
  selectedSubjectId,
  subjects,
  isPending,
  startTransition,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedSubjectId: string | null
  subjects: { id: string; name: string }[]
  isPending: boolean
  startTransition: React.TransitionStartFunction
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetDialog() {
    setUploading(false)
    setUploadError(null)
    setUploadedUrl(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) resetDialog()
    onOpenChange(isOpen)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploadedUrl(null)
    setFileName(file.name)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        setUploadError(data.error || "Upload failed")
        setUploading(false)
        return
      }

      setUploadedUrl(data.url)
      setUploading(false)
    } catch {
      setUploadError("Upload failed. Please try again.")
      setUploading(false)
    }
  }

  function handleCreateResource(formData: FormData) {
    if (!uploadedUrl) {
      setUploadError("Please upload a file first.")
      return
    }

    startTransition(async () => {
      formData.set("url", uploadedUrl)
      const result = await uploadResourceAction(formData)
      if (result.error) {
        setUploadError(result.error)
        return
      }
      toast.success("Resource uploaded")
      handleOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a resource</DialogTitle>
          <DialogDescription>
            Upload a PDF, notes, or document for students. Max file size: 5MB.
          </DialogDescription>
        </DialogHeader>
        <form action={handleCreateResource} className="flex flex-col gap-4">
          {/* File upload area */}
          <div className="flex flex-col gap-2">
            <Label>File</Label>
            <div
              onClick={() => !uploading && fileInputRef.current?.click()
              }
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !uploading) {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              role="button"
              tabIndex={0}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                uploadedUrl
                  ? "border-green-500/40 bg-green-500/5"
                  : "border-border/70 hover:border-primary/40 hover:bg-primary/5"
              } ${uploading ? "pointer-events-none opacity-60" : ""}`}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading…</p>
                </>
              ) : uploadedUrl ? (
                <>
                  <FileUp className="size-6 text-green-500" />
                  <p className="text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-xs text-green-600">Uploaded successfully. Click to replace.</p>
                </>
              ) : (
                <>
                  <FileUp className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload a PDF, image, or document
                  </p>
                  <p className="text-xs text-muted-foreground/70">PDF, JPEG, PNG, WebP, GIF — max 5MB</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Upload file"
            />
            {uploadError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="upload-title">Title</Label>
            <Input
              id="upload-title"
              name="title"
              required
              placeholder="Data Structures — Unit 3 notes"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Subject</Label>
            <Select name="subjectId" defaultValue={selectedSubjectId ?? ""}>
              <SelectTrigger>
                <SelectValue placeholder="General" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Select name="type" defaultValue="notes">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Hidden url field — populated from the file upload */}
          <input type="hidden" name="url" value={uploadedUrl ?? ""} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isPending || uploading || !uploadedUrl}
            >
              {(isPending || uploading) && <Loader2 className="size-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
