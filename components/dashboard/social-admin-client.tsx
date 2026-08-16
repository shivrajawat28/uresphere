"use client"

import { useState, useTransition } from "react"
import { MessageCircle, ShieldAlert, Trash2, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { deleteMessageAction } from "@/lib/actions/chat"
import { resolveReportAction } from "@/lib/actions/admin"
import { adminDeleteGroupAction } from "@/lib/actions/groups"
import { toast } from "sonner"

type SocialMessage = {
  id: string
  body: string
  authorHandle: string
  createdAt: string
  isDeleted: boolean
  deletedLabel: string
}

type ReportRow = {
  id: string
  target_type: string
  reason: string
  created_at: string
}

type GroupRow = {
  id: string
  name: string
  description: string
  creatorHandle: string
  memberCount: number
  createdAt: string
}

export function SocialAdminClient({
  sphereName,
  messages,
  reports,
  groups,
}: {
  sphereName: string
  messages: SocialMessage[]
  reports: ReportRow[]
  groups: GroupRow[]
}) {
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          Social Admin
        </p>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{sphereName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Moderate your Sphere&apos;s social space — remove messages, resolve reports and delete groups. Handles stay
          anonymous to everyone else.
        </p>
      </div>

      {/* Live discussion */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageCircle className="size-4 text-primary" aria-hidden="true" />
          Recent discussion
        </h2>
        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No messages in this Sphere yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {messages.map((m) => (
              <div key={m.id} className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-primary">{m.authorHandle}</span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {new Date(m.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-sm ${m.isDeleted ? "italic text-muted-foreground" : "text-foreground"}`}>
                    {m.isDeleted ? m.deletedLabel : m.body}
                  </p>
                </div>
                {!m.isDeleted && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => run(() => deleteMessageAction(m.id), "Message removed")}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reports */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-foreground">
          Open reports ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No open reports right now.
          </p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} isPending={isPending} run={run} />
            ))}
          </div>
        )}
      </section>

      {/* Groups */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Users className="size-4 text-primary" aria-hidden="true" />
          Groups
        </h2>
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No groups in this Sphere yet.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
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
                    onClick={() => {
                      if (confirm(`Delete the group “${g.name}”? Members lose access immediately.`)) {
                        run(() => adminDeleteGroupAction(g.id), "Group deleted")
                      }
                    }}
                  >
                    <Trash2 className="mr-1 size-3" aria-hidden="true" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ReportCard({
  report,
  isPending,
  run,
}: {
  report: ReportRow
  isPending: boolean
  run: (action: () => Promise<{ error: string | null }>, success: string) => void
}) {
  const [note, setNote] = useState("")
  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {report.target_type.replace("_", " ")}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(report.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        </div>
        <p className="text-sm text-foreground">{report.reason}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Resolution note (optional)"
            rows={1}
            className="min-h-9 flex-1"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => run(() => resolveReportAction(report.id, "resolved", note), "Report resolved")}
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => resolveReportAction(report.id, "rejected", note), "Report rejected")}
            >
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
