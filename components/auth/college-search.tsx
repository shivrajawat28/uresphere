"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Building2, Check, Loader2, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { searchCollegesAction, type CollegeSearchResult } from "@/lib/actions/platform"

type Props = {
  value: string
  collegeId: string
  onSelect: (college: CollegeSearchResult | null, raw: string) => void
}

export function CollegeSearch({ value, collegeId, onSelect }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<CollegeSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selected = collegeId ? value : ""

  // Close when clicking outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function search(raw: string) {
    setQuery(raw)
    onSelect(null, raw)
    if (timer.current) clearTimeout(timer.current)
    if (raw.trim().length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const { colleges } = await searchCollegesAction(raw.trim())
      setResults(colleges)
      setLoading(false)
      setHighlighted(0)
      setOpen(true)
    }, 200)
  }

  function choose(college: CollegeSearchResult) {
    onSelect(college, college.name)
    setQuery(college.name)
    setOpen(false)
    setResults([])
  }

  function clear() {
    onSelect(null, "")
    setQuery("")
    setOpen(false)
    setResults([])
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) {
        if (results.length > 0) setOpen(true)
      } else {
        setHighlighted((i) => Math.min(i + 1, results.length - 1))
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      if (open && results.length > 0) {
        e.preventDefault()
        choose(results[Math.min(highlighted, results.length - 1)])
      }
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const showList = open && (loading || results.length > 0)
  const showEmpty = open && !loading && query.trim().length >= 2 && results.length === 0

  return (
    <div ref={boxRef} className="relative">
      {selected ? (
        // Selected state replaces the input in place — no layout jumping.
        <div className="flex h-8 items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2.5">
          <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{selected}</span>
          <button
            type="button"
            onClick={clear}
            aria-label="Clear selected college"
            className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            id="college"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls="college-results"
            aria-activedescendant={open && results.length > 0 ? `college-option-${highlighted}` : undefined}
            className="pl-9"
            placeholder="Search your college or university"
            value={query}
            onChange={(e) => search(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>
      )}

      {showList && (
        <ul
          id="college-results"
          role="listbox"
          aria-label="Colleges"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {loading && (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching…
            </li>
          )}
          {!loading &&
            results.map((c, i) => (
              <li
                key={c.id}
                id={`college-option-${i}`}
                role="option"
                aria-selected={i === highlighted}
                className={i === highlighted ? "bg-accent" : ""}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(c)}
                  onMouseEnter={() => setHighlighted(i)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-accent/60"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{c.name}</span>
                    {(c.short_name || c.city) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {[c.short_name, c.city].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <Building2 className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                </button>
              </li>
            ))}
        </ul>
      )}

      {showEmpty && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover p-3 shadow-lg">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">College not found.</span> We only support verified
            campuses.{" "}
            <Link href="/request-college" className="font-medium text-primary underline underline-offset-2">
              Request your college
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
