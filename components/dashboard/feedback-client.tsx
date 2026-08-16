"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { submitFeedbackAction, replyToFeedbackAction } from "@/lib/actions/feedback"
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/feedback"
import type { MyFeedbackItem } from "@/lib/data/feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Loader2, MessageSquareText, SendHorizontal, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

type MemberInfo = { userId: string; anonymousHandle: string; sphereName: string }

const USER_REPLYABLE_STATUSES = ["open", "in_review"]

export function FeedbackClient({
  member,
  initialFeedback,
}: {
  member: MemberInfo
  initialFeedback: MyFeedbackItem[]
}) {
  const router = useRouter()
  // The server component re-fetches on every refresh, so the list renders
  // straight from props — no local copy to keep in sync (a local copy would
  // also duplicate the list after submit/reply without a re-render).
  const items = initialFeedback
  const [category, setCategory] = useState<FeedbackCategory>("general")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, startSubmit] = useTransition()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [isReplying, startReply] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return
    const formData = new FormData()
    formData.set("category", category)
    formData.set("subject", subject)
    formData.set("message", message)
    startSubmit(async () => {
      const result = await submitFeedbackAction(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success("Feedback sent — thanks!")
      setSubject("")
      setMessage("")
      router.refresh()
    })
  }

  function handleReply(feedbackId: string) {
    const body = (replyDrafts[feedbackId] ?? "").trim()
    if (!body) return
    setReplyingId(feedbackId)
    startReply(async () => {
      const result = await replyToFeedbackAction(feedbackId, body)
      if (result.error) {
        toast.error(result.error)
        setReplyingId(null)
        return
      }
      toast.success("Reply sent")
      setReplyDrafts((d) => ({ ...d, [feedbackId]: "" }))
      setReplyingId(null)
      router.refresh()
    })
  }

  const openCount = items.filter((i) => i.status === "open" || i.status === "in_review").length

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <MessageSquareText className="size-3.5" />
          Feedback
        </p>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Tell us what you think</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bugs, feature requests, suggestions or anything about {member.sphereName} — it goes straight to the
          platform team, who reply right here.
        </p>
      </div>

      {/* Submission form */}
      <form onSubmit={handleSubmit} className="mb-10 space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="feedback-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory((v ?? "general") as FeedbackCategory)}>
              <SelectTrigger className="w-full" aria-label="Feedback category">
                <SelectValue>{FEEDBACK_CATEGORY_LABELS[category]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {FEEDBACK_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="feedback-subject">Subject</Label>
            <Input
              id="feedback-subject"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              placeholder="A short title for your feedback"
              required
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="feedback-message">Feedback</Label>
          <Textarea
            id="feedback-message"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Tell us what's on your mind…"
            required
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Sent as <span className="font-mono">{member.anonymousHandle}</span>. Only you and the platform team
            can see this.
          </p>
          <Button type="submit" disabled={isSubmitting || !subject.trim() || !message.trim()}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            Send feedback
          </Button>
        </div>
      </form>

      {/* History */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Your feedback</h2>
        {openCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {openCount} open thread{openCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          You haven&apos;t sent any feedback yet. When you do, it and any admin replies will show up here.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const expanded = expandedId === item.id
            const latestAdminReply = [...item.replies].reverse().find((r) => r.authorUserId !== member.userId)
            const canReply = USER_REPLYABLE_STATUSES.includes(item.status)
            const replyDraft = replyDrafts[item.id] ?? ""
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
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {FEEDBACK_CATEGORY_LABELS[item.category as FeedbackCategory] ?? item.category}
                        </Badge>
                        <StatusBadge status={item.status} />
                        <span className="text-[11px] text-muted-foreground/70">
                          {new Date(item.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="font-medium text-foreground">{item.subject}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.message}</p>
                      {!expanded && latestAdminReply && (
                        <p className="mt-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                          <ShieldCheck className="mr-1 inline size-3 text-primary" />
                          Latest admin reply: {latestAdminReply.message}
                        </p>
                      )}
                    </div>
                    <span className="mt-1 shrink-0 text-muted-foreground">
                      {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </span>
                  </button>

                  {expanded && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      <div className="rounded-lg bg-secondary/40 px-3 py-2.5">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {member.anonymousHandle} · submitted{" "}
                          {new Date(item.created_at).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">{item.message}</p>
                      </div>

                      {item.replies.map((reply) => {
                        const isOwn = reply.authorUserId === member.userId
                        return (
                          <div
                            key={reply.id}
                            className={cn("rounded-lg px-3 py-2.5", isOwn ? "bg-primary/10" : "bg-secondary/40")}
                          >
                            <p className="text-[11px] font-medium text-muted-foreground">
                              {isOwn ? (
                                member.anonymousHandle
                              ) : (
                                <span className="inline-flex items-center gap-1 text-primary">
                                  <ShieldCheck className="size-3" /> Platform team
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
                        )
                      })}

                      {canReply ? (
                        <div className="flex items-end gap-2 pt-1">
                          <Textarea
                            value={replyDraft}
                            onChange={(e) => setReplyDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                            placeholder="Add a reply…"
                            rows={2}
                            maxLength={2000}
                            className="min-h-16 flex-1 resize-none bg-secondary/40"
                          />
                          <Button
                            size="icon"
                            disabled={isReplying || !replyDraft.trim()}
                            aria-label="Send reply"
                            onClick={() => handleReply(item.id)}
                          >
                            {isReplying && replyingId === item.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <SendHorizontal className="size-4" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <p className="pt-1 text-xs text-muted-foreground">
                          This thread is closed — replies are no longer accepted.
                        </p>
                      )}
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

function StatusBadge({ status }: { status: string }) {
  const label = FEEDBACK_STATUS_LABELS[status as FeedbackStatus] ?? status
  const resolved = status === "resolved" || status === "closed"
  return (
    <Badge
      variant={resolved ? "outline" : "secondary"}
      className={cn(
        "shrink-0 text-[10px] font-normal capitalize",
        resolved && "border-border/60 text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  )
}
