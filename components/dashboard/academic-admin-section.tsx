"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  createSubjectAction,
  updateSubjectAction,
  deleteSubjectAction,
  updateDegreeAction,
  updateYearAction,
  updateBranchAction,
  createUnitAction,
  updateUnitAction,
  deleteUnitAction,
  uploadResourceAction,
  updateResourceAction,
  deleteResourceAction,
  createCalendarEntryAction,
  updateCalendarEntryAction,
  deleteCalendarEntryAction,
  createSyllabusAction,
  updateSyllabusAction,
  deleteSyllabusAction,
  createChapterAction,
  updateChapterAction,
  deleteChapterAction,
} from "@/lib/actions/admin"
import type { AcademicSection } from "@/lib/academic"
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
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  ArrowLeft,
  BookOpen,
  CalendarDays,
  FileText,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { FileUpload } from "@/components/ui/file-upload"
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
  chapter_id: string | null
  subjectName: string
}
type CalendarEntry = { id: string; title: string; event_date: string; description: string; pdf_url: string | null; external_url: string | null; degree: string | null; year: string | null }
type Syllabus = { id: string; title: string; degree: string; year: string; branch: string; pdf_url: string | null; external_url: string | null }
type Chapter = { id: string; unit_id: string; name: string }

export function AcademicAdminSectionClient({
  sphereId,
  sphereName,
  section,
  sectionLabel,
  subjects,
  units,
  resources,
  calendar,
  syllabuses,
  chapters,
}: {
  sphereId: string
  sphereName: string
  section: AcademicSection
  sectionLabel: string
  subjects: Subject[]
  units: Unit[]
  resources: Resource[]
  calendar: CalendarEntry[]
  syllabuses: Syllabus[]
  chapters: Chapter[]
}) {
  const [isPending, startTransition] = useTransition()

  // Subject dialog state
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)

  // Unit dialog state
  const [unitOpen, setUnitOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [unitSubjectId, setUnitSubjectId] = useState<string>("")

  // Resource state
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [resourceSubjectId, setResourceSubjectId] = useState<string>("")
  const [resourceChapterId, setResourceChapterId] = useState<string>("")
  const [resourceUrl, setResourceUrl] = useState("")

  // Calendar state
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [editingCalendarEntry, setEditingCalendarEntry] = useState<CalendarEntry | null>(null)
  const [calendarPdfUrl, setCalendarPdfUrl] = useState("")
  const [calendarExternalUrl, setCalendarExternalUrl] = useState("")

  // Syllabus state
  const [syllabusOpen, setSyllabusOpen] = useState(false)
  const [editingSyllabus, setEditingSyllabus] = useState<Syllabus | null>(null)
  const [syllabusPdfUrl, setSyllabusPdfUrl] = useState("")
  const [syllabusExternalUrl, setSyllabusExternalUrl] = useState("")

  // Chapter state
  const [chapterOpen, setChapterOpen] = useState(false)
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [chapterUnitId, setChapterUnitId] = useState<string>("")

  // Taxonomy Edit state
  // Taxonomy Edit state
  const [editingDegree, setEditingDegree] = useState<string | null>(null)
  const [editingYear, setEditingYear] = useState<{ degree: string; year: string } | null>(null)
  const [editingBranch, setEditingBranch] = useState<{ degree: string; year: string; branch: string } | null>(null)

  const defaultSubjectId = subjects[0]?.id ?? ""
  const effectiveUnitSubject = unitSubjectId || defaultSubjectId
  const effectiveResourceSubject = resourceSubjectId || defaultSubjectId

  const unitsOfSubject = useMemo(
    () => (effectiveUnitSubject ? units.filter((u) => u.subject_id === effectiveUnitSubject) : []),
    [units, effectiveUnitSubject],
  )
  const resourcesOfSubject = useMemo(
    () => (effectiveResourceSubject ? resources.filter((r) => r.subject_id === effectiveResourceSubject) : []),
    [resources, effectiveResourceSubject],
  )

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  const distinctDegrees = Array.from(new Set([...subjects.map(s => s.degree), ...calendar.map(c => c.degree), ...syllabuses.map(s => s.degree)].filter(Boolean))).sort()
  const distinctYears = Array.from(new Set([...subjects.map(s => s.year), ...calendar.map(c => c.year), ...syllabuses.map(s => s.year)].filter(Boolean))).sort()
  const distinctBranches = Array.from(new Set([...subjects.map(s => s.branch), ...syllabuses.map(s => s.branch)].filter(Boolean))).sort()

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <Link
        href="/dashboard/academic/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Academic Admin
      </Link>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <GraduationCap className="size-3.5" />
            Academic Admin
          </p>
          <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{sectionLabel}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sphereName} — manage the subjects, units, resources and calendar for this section.
          </p>
        </div>
      </div>

      {/* Taxonomy Edit Controls */}
      <section className="mb-8 rounded-lg border border-border/70 bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Pencil className="size-4 text-primary" aria-hidden="true" />
          Edit Taxonomy
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <div className="flex-1 space-y-2">
            <h3 className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Degrees</h3>
            {distinctDegrees.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : distinctDegrees.map(d => (
              <div key={d} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                <p className="text-sm font-medium">{d}</p>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingDegree(d as string)} title={`Edit ${d}`}>
                  <Pencil className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Years</h3>
            {distinctYears.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : distinctYears.map(y => {
              const deg = (subjects.find(s => s.year === y)?.degree || calendar.find(c => c.year === y)?.degree || syllabuses.find(s => s.year === y)?.degree) ?? ""
              return (
                <div key={y} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-sm font-medium">{y}</p>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingYear({ degree: deg, year: y as string })} title={`Edit ${y}`}>
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Branches</h3>
            {distinctBranches.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : distinctBranches.map(b => {
              const subj = subjects.find(s => s.branch === b) || syllabuses.find(s => s.branch === b)
              const deg = subj?.degree ?? ""
              const yr = subj?.year ?? ""
              return (
                <div key={b} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-sm font-medium">{b}</p>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingBranch({ degree: deg, year: yr, branch: b as string })} title={`Edit ${b}`}>
                    <Pencil className="size-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Subjects */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            Subjects
          </h2>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditingSubject(null)
              setSubjectOpen(true)
            }}
          >
            <Plus className="size-3.5" />
            Add subject
          </Button>
        </div>
        {subjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No subjects in this section yet — add the first one.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {subjects.map((s) => (
              <Card key={s.id} className="border-border/70 bg-card">
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[s.code, s.degree, s.year, s.branch].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        setEditingSubject(s)
                        setSubjectOpen(true)
                      }}
                      aria-label={`Edit ${s.name}`}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm(`Delete subject "${s.name}"? Its units and resources will be unlinked.`)) {
                          run(() => deleteSubjectAction(s.id), "Subject deleted")
                        }
                      }}
                      aria-label={`Delete ${s.name}`}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Units */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="size-4 text-primary" aria-hidden="true" />
            Units
          </h2>
          {subjects.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setEditingUnit(null)
                setUnitSubjectId(effectiveUnitSubject)
                setUnitOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              Add unit
            </Button>
          )}
        </div>
        {subjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Add a subject first.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="max-w-xs">
              <Select value={effectiveUnitSubject} onValueChange={(v) => setUnitSubjectId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
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
            {unitsOfSubject.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                No units yet.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {unitsOfSubject.map((u) => {
                  const chaptersOfUnit = chapters.filter((c) => c.unit_id === u.id)
                  return (
                    <Card key={u.id} className="border-border/70 bg-card">
                      <div className="flex items-start justify-between gap-2 border-b border-border/40 p-3 pb-2">
                        <div className="font-medium text-sm text-foreground">{u.name}</div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingUnit(u)
                              setUnitSubjectId(u.subject_id)
                              setUnitOpen(true)
                            }}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete unit "${u.name}"?`)) run(() => deleteUnitAction(u.id), "Unit deleted")
                            }}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-3 pt-2">
                        <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                          <span>Chapters</span>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs text-primary"
                            onClick={() => {
                              setEditingChapter(null)
                              setChapterUnitId(u.id)
                              setChapterOpen(true)
                            }}
                          >
                            + Add chapter
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {chaptersOfUnit.map((c) => (
                            <span
                              key={c.id}
                              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/30 px-2 py-0.5 text-xs text-foreground"
                            >
                              {c.name}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingChapter(c)
                                  setChapterUnitId(c.unit_id)
                                  setChapterOpen(true)
                                }}
                                className="text-muted-foreground transition hover:text-primary"
                              >
                                <Pencil className="size-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Delete chapter "${c.name}"?`)) run(() => deleteChapterAction(c.id), "Chapter deleted")
                                }}
                                className="text-muted-foreground transition hover:text-destructive"
                              >
                                <Trash2 className="size-2.5" />
                              </button>
                            </span>
                          ))}
                          {chaptersOfUnit.length === 0 && <span className="text-xs italic text-muted-foreground">No chapters</span>}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Syllabuses */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            Syllabus (Yearly)
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setEditingSyllabus(null)
              setSyllabusPdfUrl("")
              setSyllabusExternalUrl("")
              setSyllabusOpen(true)
            }}
          >
            <Plus className="size-3.5" />
            Upload syllabus
          </Button>
        </div>
        {syllabuses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            No syllabuses for this section yet.
          </p>
        ) : (
          <div className="space-y-2">
            {syllabuses.map((s) => (
              <Card key={s.id} className="border-border/70 bg-card">
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <a
                    href={s.pdf_url || s.external_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-3"
                  >
                    <BookOpen className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground hover:underline">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{[s.degree, s.year, s.branch].filter(Boolean).join(" · ")}</p>
                    </div>
                  </a>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        setEditingSyllabus(s)
                        setSyllabusPdfUrl(s.pdf_url ?? "")
                        setSyllabusExternalUrl(s.external_url ?? "")
                        setSyllabusOpen(true)
                      }}
                      aria-label={`Edit ${s.title}`}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm(`Delete syllabus "${s.title}"?`)) run(() => deleteSyllabusAction(s.id), "Syllabus deleted")
                      }}
                      aria-label={`Delete ${s.title}`}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Resources */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            Resources
          </h2>
          {subjects.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setEditingResource(null)
                setResourceUrl("")
                setUploadOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              Upload resource
            </Button>
          )}
        </div>
        {subjects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Add a subject first.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="max-w-xs">
              <Select value={effectiveResourceSubject} onValueChange={(v) => setResourceSubjectId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
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
            {resourcesOfSubject.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                No resources for this subject yet.
              </p>
            ) : (
              <div className="space-y-2">
                {resourcesOfSubject.map((r) => (
                  <Card key={r.id} className="border-border/70 bg-card">
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-3"
                      >
                        <FileText className="size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground hover:underline">{r.title}</p>
                          <p className="text-xs text-muted-foreground">{TYPE_LABELS[r.type] ?? r.type}</p>
                        </div>
                      </a>
                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => {
                            setEditingResource(r)
                            setResourceSubjectId(r.subject_id ?? "")
                            setResourceChapterId(r.chapter_id ?? "")
                            setResourceUrl(r.url)
                            setUploadOpen(true)
                          }}
                          aria-label={`Edit ${r.title}`}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={isPending}
                          onClick={() => {
                            if (confirm(`Delete resource "${r.title}"?`)) run(() => deleteResourceAction(r.id), "Resource deleted")
                          }}
                          aria-label={`Delete ${r.title}`}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Calendar */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            Academic calendar
          </h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
            setEditingCalendarEntry(null)
            setCalendarPdfUrl("")
            setCalendarExternalUrl("")
            setCalendarOpen(true)
          }}>
            <Plus className="size-3.5" />
            Add entry
          </Button>
        </div>
        {calendar.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nothing on the calendar yet.
          </p>
        ) : (
          <div className="space-y-2">
            {calendar.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-4 py-3">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{entry.title}</p>
                  {entry.description && <p className="text-xs text-muted-foreground">{entry.description}</p>}
                </div>
                <Badge variant="outline" className="shrink-0 border-border/60 font-normal text-muted-foreground">
                  {new Date(`${entry.event_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </Badge>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => {
                      setEditingCalendarEntry(entry)
                      setCalendarPdfUrl(entry.pdf_url ?? "")
                      setCalendarExternalUrl(entry.external_url ?? "")
                      setCalendarOpen(true)
                    }}
                    aria-label={`Edit ${entry.title}`}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() => {
                      if (confirm(`Delete entry "${entry.title}"?`)) run(() => deleteCalendarEntryAction(entry.id), "Calendar entry deleted")
                    }}
                    aria-label={`Delete ${entry.title}`}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Subject add / edit */}
      <Dialog open={subjectOpen} onOpenChange={setSubjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSubject ? "Edit subject" : "Add a subject"}</DialogTitle>
            <DialogDescription>
              {editingSubject ? "Update this subject." : `New subject in ${sectionLabel}.`}
            </DialogDescription>
          </DialogHeader>
          <form
            action={(formData) =>
              run(async () => {
                formData.set("sphereId", sphereId)
                const r = editingSubject
                  ? await updateSubjectAction(formData)
                  : await createSubjectAction(formData)
                if (!r.error) setSubjectOpen(false)
                return r
              }, editingSubject ? "Subject updated" : "Subject added")
            }
            className="flex flex-col gap-4"
          >
            {editingSubject && <input type="hidden" name="id" value={editingSubject.id} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="acName">Subject name</Label>
              <Input id="acName" name="name" required defaultValue={editingSubject?.name ?? ""} placeholder="Data Structures" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acCode">Code (optional)</Label>
              <Input id="acCode" name="code" defaultValue={editingSubject?.code ?? ""} placeholder="CS-203" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Degree</Label>
                <Select name="degree" defaultValue={editingSubject?.degree ?? section.degree}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
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
                <Select name="year" defaultValue={editingSubject?.year ?? section.year}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
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
              <Label htmlFor="acBranch">Branch (optional)</Label>
              <Input id="acBranch" name="branch" defaultValue={editingSubject?.branch ?? section.branch} placeholder="CSE" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {editingSubject ? "Save changes" : "Add subject"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unit add */}
      <Dialog open={unitOpen} onOpenChange={setUnitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Edit unit" : "Add a unit"}</DialogTitle>
            <DialogDescription>{editingUnit ? "Update this unit's name." : "Units break a subject into parts (e.g. Unit 1, Unit 2)."}</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) =>
              run(async () => {
                formData.set("subjectId", unitSubjectId)
                const r = editingUnit
                  ? await updateUnitAction(formData)
                  : await createUnitAction(formData)
                if (!r.error) setUnitOpen(false)
                return r
              }, editingUnit ? "Unit updated" : "Unit added")
            }
            className="flex flex-col gap-4"
          >
            {editingUnit && <input type="hidden" name="id" value={editingUnit.id} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="acUnitName">Unit name</Label>
              <Input id="acUnitName" name="name" required defaultValue={editingUnit?.name ?? ""} placeholder="Unit 1 — Arrays" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {editingUnit ? "Save changes" : "Add unit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Chapter add / edit */}
      <Dialog open={chapterOpen} onOpenChange={setChapterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingChapter ? "Edit chapter" : "Add a chapter"}</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) =>
              run(async () => {
                formData.set("unitId", chapterUnitId)
                const r = editingChapter
                  ? await updateChapterAction(formData)
                  : await createChapterAction(formData)
                if (!r.error) setChapterOpen(false)
                return r
              }, editingChapter ? "Chapter updated" : "Chapter added")
            }
            className="flex flex-col gap-4"
          >
            {editingChapter && <input type="hidden" name="id" value={editingChapter.id} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="acChapterName">Chapter name</Label>
              <Input id="acChapterName" name="name" required defaultValue={editingChapter?.name ?? ""} placeholder="Introduction to Arrays" />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>{editingChapter ? "Save changes" : "Add chapter"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Resource upload / edit */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingResource ? "Edit resource" : "Upload a resource"}</DialogTitle>
            <DialogDescription>
              {editingResource ? "Update this resource." : "Add notes, syllabi, and previous papers for students."}
            </DialogDescription>
          </DialogHeader>
          <form
            action={(formData) => {
              formData.set("sphereId", sphereId)
              formData.set("subjectId", resourceSubjectId || effectiveResourceSubject)
              if (resourceChapterId && resourceChapterId !== "none") formData.set("chapterId", resourceChapterId)
              if (resourceUrl) formData.set("url", resourceUrl)
              return run(async () => {
                const r = editingResource
                  ? await updateResourceAction(formData)
                  : await uploadResourceAction(formData)
                if (!r.error) setUploadOpen(false)
                return r
              }, editingResource ? "Resource updated" : "Resource uploaded")
            }}
            className="flex flex-col gap-4"
          >
            {editingResource && <input type="hidden" name="id" value={editingResource.id} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="acResTitle">Title</Label>
              <Input id="acResTitle" name="title" required defaultValue={editingResource?.title ?? ""} placeholder="Data Structures — Unit 3 notes" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select name="type" defaultValue={editingResource?.type ?? "notes"}>
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
            
            <div className="flex flex-col gap-2">
              <Label>Chapter (Optional)</Label>
              <Select value={resourceChapterId} onValueChange={(v) => setResourceChapterId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="No chapter (General subject resource)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General (No chapter)</SelectItem>
                  {chapters.filter((c) => units.some((u) => u.id === c.unit_id && u.subject_id === (resourceSubjectId || effectiveResourceSubject))).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>File (PDF, notes, images)</Label>
              <FileUpload
                accept="image,pdf"
                value={resourceUrl}
                onChange={(v) => setResourceUrl(v as string)}
                label="Resource file"
              />
              <p className="text-xs text-muted-foreground">Upload a PDF or image from your device, or paste a link.</p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {editingResource ? "Save changes" : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Calendar entry */}
      <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCalendarEntry ? "Edit calendar entry" : "Add a calendar entry"}</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) =>
              run(async () => {
                formData.set("sphereId", sphereId)
                formData.set("degree", section.degree)
                formData.set("year", section.year)
                if (calendarPdfUrl) formData.set("pdfUrl", calendarPdfUrl)
                if (calendarExternalUrl) formData.set("externalUrl", calendarExternalUrl)
                const r = editingCalendarEntry
                  ? await updateCalendarEntryAction(formData)
                  : await createCalendarEntryAction(formData)
                if (!r.error) setCalendarOpen(false)
                return r
              }, editingCalendarEntry ? "Calendar updated" : "Calendar entry added")
            }
            className="flex flex-col gap-4"
          >
            {editingCalendarEntry && <input type="hidden" name="id" value={editingCalendarEntry.id} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="acCalTitle">Title</Label>
              <Input id="acCalTitle" name="title" required defaultValue={editingCalendarEntry?.title ?? ""} placeholder="Mid-semester exams" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acCalDate">Date</Label>
              <Input id="acCalDate" name="date" type="date" required defaultValue={editingCalendarEntry?.event_date ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acCalDesc">Description (optional)</Label>
              <Textarea id="acCalDesc" name="description" rows={2} defaultValue={editingCalendarEntry?.description ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Attachment (PDF or Image)</Label>
              <FileUpload
                accept="image,pdf"
                value={calendarPdfUrl}
                onChange={(v) => setCalendarPdfUrl(v as string)}
                label="Calendar attachment"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acCalExtUrl">External URL (optional)</Label>
              <Input id="acCalExtUrl" name="externalUrl" type="url" placeholder="https://example.com" value={calendarExternalUrl} onChange={(e) => setCalendarExternalUrl(e.target.value)} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {editingCalendarEntry ? "Save changes" : "Add entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Syllabus upload / edit */}
      <Dialog open={syllabusOpen} onOpenChange={setSyllabusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSyllabus ? "Edit syllabus" : "Upload syllabus"}</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) => {
              formData.set("sphereId", sphereId)
              formData.set("degree", section.degree ?? "")
              formData.set("year", section.year ?? "")
              formData.set("branch", section.branch ?? "")
              if (syllabusPdfUrl) formData.set("pdfUrl", syllabusPdfUrl)
              if (syllabusExternalUrl) formData.set("externalUrl", syllabusExternalUrl)
              return run(async () => {
                const r = editingSyllabus
                  ? await updateSyllabusAction(formData)
                  : await createSyllabusAction(formData)
                if (!r.error) setSyllabusOpen(false)
                return r
              }, editingSyllabus ? "Syllabus updated" : "Syllabus added")
            }}
            className="flex flex-col gap-4"
          >
            {editingSyllabus && <input type="hidden" name="id" value={editingSyllabus.id} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="acSyllTitle">Title</Label>
              <Input id="acSyllTitle" name="title" required defaultValue={editingSyllabus?.title ?? ""} placeholder="First Year Curriculum 2024" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Syllabus PDF</Label>
              <FileUpload
                accept="pdf"
                value={syllabusPdfUrl}
                onChange={(v) => setSyllabusPdfUrl(v as string)}
                label="Syllabus PDF"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acSyllExtUrl">External URL (optional)</Label>
              <Input id="acSyllExtUrl" name="externalUrl" type="url" placeholder="https://example.com" value={syllabusExternalUrl} onChange={(e) => setSyllabusExternalUrl(e.target.value)} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>{editingSyllabus ? "Save changes" : "Upload"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground/70">
        Section: {sectionLabel} · {sphereName}
      </p>

      {/* Degree Edit Dialog */}
      <Dialog open={!!editingDegree} onOpenChange={(o) => setEditingDegree(o ? editingDegree : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Degree</DialogTitle>
            <DialogDescription>Rename this degree across the sphere.</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) =>
              run(async () => {
                formData.set("sphereId", sphereId)
                formData.set("oldDegree", editingDegree ?? "")
                const r = await updateDegreeAction(formData)
                if (!r.error) setEditingDegree(null)
                return r
              }, "Degree updated")
            }
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="newDegree">Degree Name</Label>
              <Input id="newDegree" name="newDegree" required defaultValue={editingDegree ?? ""} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Year Edit Dialog */}
      <Dialog open={!!editingYear} onOpenChange={(o) => setEditingYear(o ? editingYear : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Year</DialogTitle>
            <DialogDescription>Rename this year across the degree.</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) =>
              run(async () => {
                formData.set("sphereId", sphereId)
                formData.set("degree", editingYear?.degree ?? "")
                formData.set("oldYear", editingYear?.year ?? "")
                const r = await updateYearAction(formData)
                if (!r.error) setEditingYear(null)
                return r
              }, "Year updated")
            }
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="newYear">Year Name</Label>
              <Input id="newYear" name="newYear" required defaultValue={editingYear?.year ?? ""} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Branch Edit Dialog */}
      <Dialog open={!!editingBranch} onOpenChange={(o) => setEditingBranch(o ? editingBranch : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Branch</DialogTitle>
            <DialogDescription>Rename this branch across the year.</DialogDescription>
          </DialogHeader>
          <form
            action={(formData) =>
              run(async () => {
                formData.set("sphereId", sphereId)
                formData.set("degree", editingBranch?.degree ?? "")
                formData.set("year", editingBranch?.year ?? "")
                formData.set("oldBranch", editingBranch?.branch ?? "")
                const r = await updateBranchAction(formData)
                if (!r.error) setEditingBranch(null)
                return r
              }, "Branch updated")
            }
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="newBranch">Branch Name</Label>
              <Input id="newBranch" name="newBranch" required defaultValue={editingBranch?.branch ?? ""} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
