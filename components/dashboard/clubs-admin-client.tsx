"use client"

import { useState, useTransition } from "react"
import { Loader2, Pencil, Plus, Sparkles, Trash2, UserMinus, Users, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileUpload } from "@/components/ui/file-upload"
import { createClubAction, deleteClubAction, removeClubMemberAction, updateClubAction } from "@/lib/actions/admin"
import { toast } from "sonner"

type ClubRow = {
  id: string
  name: string
  description: string
  logo_url: string | null
  members: { userId: string; handle: string }[]
}

export function ClubsAdminClient({
  sphereId,
  sphereName,
  clubs,
}: {
  sphereId: string
  sphereName: string
  clubs: ClubRow[]
}) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else toast.success(success)
    })
  }

  const editing = clubs.find((c) => c.id === editingId) ?? null

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Clubs Admin
        </p>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">{sphereName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the official clubs members see — information, logos, and membership. Scoped to your Sphere only.
        </p>
      </div>

      <div className="mb-6">
        {showCreate && (
          <ClubForm
            sphereId={sphereId}
            isPending={isPending}
            onClose={() => setShowCreate(false)}
            onSubmit={(fd) =>
              run(async () => {
                const r = await createClubAction(fd)
                if (!r.error) setShowCreate(false)
                return r
              }, "Club created")
            }
          />
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-3.5" aria-hidden="true" />
          {showCreate ? "Hide form" : "Create club"}
        </Button>
      </div>

      {clubs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No clubs in this Sphere yet.
        </p>
      ) : (
        <div className="space-y-3">
          {clubs.map((club) => (
            <Card key={club.id} className="border-border/70 bg-card">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      {club.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={club.logo_url}
                          alt={club.name}
                          className="size-10 rounded-lg border border-border/60 object-cover"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/8">
                          <Users className="size-4 text-primary" />
                        </div>
                      )}
                      <p className="truncate font-medium text-foreground">{club.name}</p>
                    </div>
                    {club.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{club.description}</p>
                    )}
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {club.members.length} member{club.members.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(club.id)}>
                      <Pencil className="mr-1 size-3" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm(`Delete “${club.name}”? Members will no longer see it.`)) {
                          run(() => deleteClubAction(club.id), "Club deleted")
                        }
                      }}
                    >
                      <Trash2 className="mr-1 size-3" aria-hidden="true" />
                      Delete
                    </Button>
                  </div>
                </div>

                {club.members.length > 0 && (
                  <div className="mt-3 rounded-md border border-border/60 bg-secondary/20 p-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Members
                    </p>
                    <ul className="space-y-1.5">
                      {club.members.map((m) => (
                        <li key={m.userId} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-foreground">{m.handle}</span>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${m.handle}`}
                            disabled={isPending}
                            onClick={() => {
                              if (confirm(`Remove ${m.handle} from ${club.name}?`)) {
                                run(() => removeClubMemberAction(club.id, m.userId), "Member removed")
                              }
                            }}
                          >
                            <UserMinus className="size-3.5 text-destructive" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setEditingId(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-serif text-xl text-foreground">Edit club</p>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="Close editor"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <ClubForm
              sphereId={sphereId}
              initial={editing}
              isPending={isPending}
              onClose={() => setEditingId(null)}
              onSubmit={(fd) =>
                run(async () => {
                  const r = await updateClubAction(fd)
                  if (!r.error) setEditingId(null)
                  return r
                }, "Club updated")
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ClubForm({
  sphereId,
  initial,
  isPending,
  onClose,
  onSubmit,
}: {
  sphereId: string
  initial?: ClubRow
  isPending: boolean
  onClose: () => void
  onSubmit: (fd: FormData) => void
}) {
  const [logo, setLogo] = useState<string>(initial?.logo_url ?? "")
  const [busy, startTransition] = useTransition()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set("sphereId", sphereId)
        if (initial) fd.set("id", initial.id)
        fd.set("imageUrl", logo)
        startTransition(() => onSubmit(fd))
      }}
      className="mb-3 grid gap-3 rounded-lg border border-border/70 bg-secondary/20 p-4 sm:grid-cols-2"
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="clubName">Club name</Label>
        <Input id="clubName" name="name" required maxLength={120} defaultValue={initial?.name ?? ""} placeholder="Coding Club" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="clubDesc">Description (optional)</Label>
        <Textarea id="clubDesc" name="description" rows={2} defaultValue={initial?.description ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Logo (optional)</Label>
        <FileUpload value={logo} onChange={(v) => setLogo(typeof v === "string" ? v : (v[0] ?? ""))} label="Club logo" />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || isPending} className="gap-2">
          {busy || isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {initial ? "Save changes" : "Create club"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
