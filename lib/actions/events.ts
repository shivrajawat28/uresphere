"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireMember } from "@/lib/data/session"

type ActionResult = { error: string | null }

export async function toggleRsvpAction(eventId: string): Promise<ActionResult> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from("events")
    .select("id, sphere_id")
    .eq("id", eventId)
    .eq("sphere_id", member.sphereId)
    .maybeSingle()
  if (!event) return { error: "Event not found in your Sphere." }

  const { data: existing } = await supabase
    .from("event_rsvps")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", member.userId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from("event_rsvps").delete().eq("id", existing.id)
    if (error) return { error: "Couldn't update your RSVP." }
  } else {
    const { error } = await supabase.from("event_rsvps").insert({ event_id: eventId, user_id: member.userId })
    if (error) return { error: "Couldn't update your RSVP." }
  }

  revalidatePath("/dashboard/events")
  return { error: null }
}
