"use client"

import { useEffect, useRef, useState } from "react"
import { getGroupInspectionData, type GroupMemberRow, type GroupMessageRow } from "@/lib/actions/groups"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Users, MessageCircle, Calendar, Loader2, Shield, Info } from "lucide-react"

type GroupInfo = {
  id: string
  name: string
  description: string
  createdAt: string
  creatorHandle: string
  memberCount: number
}

export function GroupInspectionDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [members, setMembers] = useState<GroupMemberRow[]>([])
  const [messages, setMessages] = useState<GroupMessageRow[]>([])
  const [totalMessages, setTotalMessages] = useState(0)
  const lastGroupId = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !groupId || groupId === lastGroupId.current) return
    lastGroupId.current = groupId

    let cancelled = false
    setLoading(true)
    setGroup(null)
    setMembers([])
    setMessages([])
    setTotalMessages(0)

    getGroupInspectionData(groupId)
      .then((result) => {
        if (cancelled) return
        if (result.error) {
          toast.error(result.error)
          onOpenChange(false)
          return
        }
        setGroup(result.group ?? null)
        setMembers(result.members ?? [])
        setMessages(result.messages ?? [])
        setTotalMessages(result.totalMessages ?? 0)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Couldn't load group details.")
          onOpenChange(false)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, groupId, onOpenChange])

  // Reset when dialog closes.
  useEffect(() => {
    if (!open) {
      lastGroupId.current = null
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            Group Inspection
          </DialogTitle>
          <DialogDescription>Read-only view of group content. Admin authorization verified server-side.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading group details…
          </div>
        ) : !group ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No group data available.</p>
        ) : (
          <>
            {/* Group Information */}
            <Card className="border-border/70 bg-card">
              <CardContent className="space-y-3 p-4">
                <div>
                  <h3 className="font-serif text-lg font-medium text-foreground">{group.name}</h3>
                  {group.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="size-3" />
                    {totalMessages} message{totalMessages === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    Created {new Date(group.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Created by{" "}
                  <span className="font-mono text-primary">{group.creatorHandle}</span>
                </div>
              </CardContent>
            </Card>

            {/* Members & Messages tabs */}
            <Tabs defaultValue="members" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="members" className="flex-1 gap-1.5">
                  <Users className="size-3.5" />
                  Members ({members.length})
                </TabsTrigger>
                <TabsTrigger value="messages" className="flex-1 gap-1.5">
                  <MessageCircle className="size-3.5" />
                  Messages ({totalMessages})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="members" className="space-y-2 pt-2">
                {members.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No members yet
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {members.map((m) => (
                      <div
                        key={m.userId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-primary">{m.handle}</p>
                          {m.realName && (
                            <p className="text-xs text-muted-foreground">{m.realName}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`border-border/60 text-[10px] font-normal capitalize ${
                              m.role === "admin" ? "border-primary/40 text-primary" : ""
                            }`}
                          >
                            {m.role}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                            {new Date(m.joinedAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="messages" className="pt-2">
                {messages.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No messages yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {totalMessages > 100 && (
                      <div className="flex items-center gap-1.5 rounded-md bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground">
                        <Info className="size-3" />
                        Showing latest 100 of {totalMessages} messages
                      </div>
                    )}
                    {messages.map((m) => (
                      <div key={m.id} className="rounded-lg border border-border/70 bg-card p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-mono text-[11px] text-primary">{m.authorHandle}</span>
                          <span className="text-[10px] text-muted-foreground/60">
                            {new Date(m.createdAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          {m.isDeleted && (
                            <Badge variant="outline" className="border-destructive/40 text-[9px] text-destructive">
                              Deleted
                            </Badge>
                          )}
                        </div>
                        <p className={`text-sm ${m.isDeleted ? "italic text-muted-foreground" : "text-foreground"}`}>
                          {m.isDeleted ? "Message deleted" : m.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        <DialogClose asChild>
          <Button variant="outline" className="mt-2">
            Close
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
