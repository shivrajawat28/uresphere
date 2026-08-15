import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { JoinClubButton } from "./join-club-button"
import { Card, CardContent } from "@/components/ui/card"
import { Users } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function ClubsPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const [{ data: clubs }, { data: myMemberships }] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, description, logo_url, club_members(user_id)")
      .eq("sphere_id", member.sphereId)
      .order("created_at", { ascending: false }),
    supabase.from("club_members").select("club_id").eq("user_id", member.userId),
  ])

  const membershipSet = new Set((myMemberships ?? []).map((m) => m.club_id))

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">Clubs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Official clubs at {member.sphereName}, created by your administrators. Join to stay in the loop.
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
            const joined = membershipSet.has(club.id)
            return (
              <Card key={club.id} className="border-border/70 bg-card">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
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
                      <h3 className="font-serif text-lg font-medium text-foreground">{club.name}</h3>
                    </div>
                    <JoinClubButton clubId={club.id} joined={joined} />
                  </div>
                  {club.description && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{club.description}</p>
                  )}
                  <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {memberCount} member{memberCount === 1 ? "" : "s"}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
