"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { replyToFeedbackAction, updateFeedbackStatusAction } from "@/lib/actions/feedback"
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/feedback"
import type { AdminFeedbackItem } from "@/lib/data/feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  SendHorizontal,
  ShieldCheck,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_VARIANTS: Record<string, "outline" | "secondary" | "default"> = {
  open: "outline",
  in_review: "secondary",
  replied: "default",
  resolved: "secondary",
  closed: "outline",
}

export function FeedbackSection({ feedback }: { feedback: AdminFeedbackItem[] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [status, setStatus] = useState("all")
  const [sortNewest, setSortNewest] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [pendingReplyId, setPendingReplyId] = useState<string | null>(null)
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = feedback.filter((f) => {
      if (category !== "all" && f.category !== category) return false
      if (status !== "all" && f.status !== status) return false
      if (!q) return true
      const haystack = [f.subject, f.message, f.realName, f.handle, f.email ?? "", f.sphereName]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
    list = [...list].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return sortNewest ? -diff : diff
    })
    return list
  }, [feedback, query, category, status, sortNewest])

  const openCount = feedback.filter((f) => f.status === "open").length

  function sendReply(feedbackId: string) {
    const body = (replyDrafts[feedbackId] ?? "").trim()
    if (!body) return
    setPendingReplyId(feedbackId)
    startTransition(async () => {
      const result = await replyToFeedbackAction(feedbackId, body)
      if (result.error) {
        toast.error(result.error)
        setPendingReplyId(null)
        return
      }
      toast.success("Reply sent to the user")
      setReplyDrafts((d) => ({ ...d, [feedbackId]: "" }))
      setPendingReplyId(null)
      router.refresh()
    })
  }

  function changeStatus(feedbackId: string, next: string) {
    if (next === "") return
    setPendingStatusId(feedbackId)
    startTransition(async () => {
      const result = await updateFeedbackStatusAction(feedbackId, next)
      if (result.error) {
        toast.error(result.error)
        setPendingStatusId(null)
        return
      }
      toast.success("Status updated")
      setPendingStatusId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <Input
              id="feedback-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Subject, message, name or handle…"
              className="w-64"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
              <SelectTrigger aria-label="Filter by category">
                <SelectValue>
                  {category === "all" ? "All categories" : FEEDBACK_CATEGORY_LABELS[category as FeedbackCategory]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {FEEDBACK_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
              <SelectTrigger aria-label="Filter by status">
                <SelectValue>
                  {status === "all" ? "All statuses" : FEEDBACK_STATUS_LABELS[status as FeedbackStatus]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {FEEDBACK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {FEEDBACK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Sort</label>
            <Select value={sortNewest ? "newest" : "oldest"} onValueChange={(v) => setSortNewest(v !== "oldest")}>
              <SelectTrigger aria-label="Sort order">
                <SelectValue>{sortNewest ? "Newest first" : "Oldest first"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {openCount > 0 && <span className="mr-2 font-medium text-primary">{openCount} open</span>}
          {filtered.length}/{feedback.length} shown
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {feedback.length === 0
            ? "No feedback submissions yet — they'll appear here as members send them."
            : "No submissions match your filters."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const expanded = expandedId === item.id
            const replyDraft = replyDrafts[item.id] ?? ""
            const latestReply = item.replies[item.replies.length - 1]
            return (
              <Card key={item.id} className="border-border/70 bg-card">
                <CardContent className="p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <User className="size-3.5 text-muted-foreground" />
                          {item.realName}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{item.handle}</span>
                        {item.email && <span className="text-xs text-muted-foreground/70">{item.email}</span>}
                        <span className="text-xs text-muted-foreground/70">{item.sphereName}</span>
                      </div>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {FEEDBACK_CATEGORY_LABELS[item.category as FeedbackCategory] ?? item.category}
                        </Badge>
                        <Badge variant={STATUS_VARIANTS[item.status] ?? "outline"} className="capitalize">
                          {FEEDBACK_STATUS_LABELS[item.status as FeedbackStatus] ?? item.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground/70">
                          {new Date(item.createdAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="font-medium text-foreground">{item.subject}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.message}</p>
                      {!expanded && latestReply && (
                        <p className="mt-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                          <ShieldCheck className="mr-1 inline size-3 text-primary" />
                          Latest reply{latestReply.authorIsAdmin ? " (admin)" : " (user)"}: {latestReply.message}
                        </p>
                      )}
                    </div>
                    <span className="mt-1 shrink-0 text-muted-foreground">
                      {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </span>
                  </button>

                  {expanded && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      {/* Full conversation */}
                      <div className="rounded-lg bg-secondary/40 px-3 py-2.5">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {item.realName} ({item.handle}) · {item.sphereName} · submitted{" "}
                          {new Date(item.createdAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">{item.message}</p>
                      </div>
                      {item.replies.map((reply) => (
                        <div
                          key={reply.id}
                          className={cn("rounded-lg px-3 py-2.5", reply.authorIsAdmin ? "bg-primary/10" : "bg-secondary/40")}
                        >
                          <p className="text-[11px] font-medium text-muted-foreground">
                            {reply.authorIsAdmin ? (
                              <span className="inline-flex items-center gap-1 text-primary">
                                <ShieldCheck className="size-3" /> {reply.authorRealName} (admin)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <User className="size-3" /> {reply.authorRealName}
                              </span>
                            )}
                            <span className="ml-1.5 font-normal text-muted-foreground/60">
                              {new Date(reply.createdAt).toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </p>
                          <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">{reply.message}</p>
                        </div>
                      ))}

                      <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end">
                        <div className="flex min-w-0 flex-1 items-end gap-2">
                          <Textarea
                            value={replyDraft}
                            onChange={(e) => setReplyDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                            placeholder="Write a reply…"
                            rows={2}
                            maxLength={2000}
                            className="min-h-16 flex-1 resize-none bg-secondary/40"
                          />
                          <Button
                            size="icon"
                            disabled={isPending || !replyDraft.trim()}
                            aria-label="Send reply"
                            onClick={() => sendReply(item.id)}
                          >
                            {pendingReplyId === item.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <SendHorizontal className="size-4" />
                            )}
                          </Button>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <label className="text-xs text-muted-foreground">Status</label>
                          <Select value={item.status} onValueChange={(v) => changeStatus(item.id, v ?? item.status)}>
                            <SelectTrigger className="w-36" aria-label="Change status">
                              <SelectValue>
                                {FEEDBACK_STATUS_LABELS[item.status as FeedbackStatus] ?? item.status}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {FEEDBACK_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {FEEDBACK_STATUS_LABELS[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {pendingStatusId === item.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
