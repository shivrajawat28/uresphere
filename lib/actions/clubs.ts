"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"

type ActionResult = { error: string | null }

export async function toggleClubMembershipAction(clubId: string): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: club } = await supabase
    .from("clubs")
    .select("id, sphere_id")
    .eq("id", clubId)
    .eq("sphere_id", member.sphereId)
    .maybeSingle()
  if (!club) return { error: "Club not found in your Sphere." }

  const { data: existing } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", member.userId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from("club_members").delete().eq("id", existing.id)
    if (error) return { error: "Couldn't update your membership." }
  } else {
    const { error } = await supabase.from("club_members").insert({ club_id: clubId, user_id: member.userId })
    if (error) return { error: "Couldn't update your membership." }
  }

  revalidatePath("/dashboard/clubs")
  return { error: null }
}
