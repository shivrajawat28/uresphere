import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, ChevronRight } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

const CATEGORY_LABELS: Record<string, string> = {
  coding: "Coding",
  robotics: "Robotics",
  ai_ml: "AI/ML",
  cultural: "Cultural",
  sports: "Sports",
  entrepreneurship: "Entrepreneurship",
  literary: "Literary",
  photography: "Photography",
  design: "Design",
  other: "Other",
}

export default async function ClubsPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, description, logo_url, category, tagline, club_members(user_id), club_events(id, title, event_date)")
    .eq("sphere_id", member.sphereId)
    .order("created_at", { ascending: false })

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Clubs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Official clubs at {member.sphereName}, created by your administrators.
        </p>
      </div>

      {!clubs || clubs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No clubs have been created yet. Your admins can add official clubs.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {clubs.map((club) => {
            const memberCount = Array.isArray(club.club_members) ? club.club_members.length : 0
            const categoryLabel = CATEGORY_LABELS[club.category ?? "other"] ?? "Other"
            const upcomingEvents = Array.isArray(club.club_events)
              ? club.club_events.filter((e: { event_date: string | null }) => !e.event_date || e.event_date >= today).length
              : 0

            return (
              <Card key={club.id} className="border-border/70 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-start gap-3">
                    {club.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={club.logo_url}
                        alt={club.name}
                        className="size-11 rounded-lg border border-border/60 object-cover"
                      />
                    ) : (
                      <div className="flex size-11 items-center justify-center rounded-lg border border-primary/25 bg-primary/8">
                        <Users className="size-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-serif text-lg font-medium text-foreground">{club.name}</h3>
                      {club.tagline && (
                        <p className="text-xs text-muted-foreground italic">{club.tagline}</p>
                      )}
                    </div>
                  </div>

                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{categoryLabel}</Badge>
                    <Badge variant="outline" className="text-[10px] border-border/60">
                      <Users className="mr-1 size-2.5" />
                      {memberCount} member{memberCount === 1 ? "" : "s"}
                    </Badge>
                    {upcomingEvents > 0 && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                        {upcomingEvents} upcoming event{upcomingEvents === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>

                  {club.description && (
                    <p className="mb-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">{club.description}</p>
                  )}

                  <Button asChild variant="ghost" size="sm" className="gap-1.5 px-0 text-primary">
                    <Link href={`/dashboard/clubs/${club.id}`}>
                      View club
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
