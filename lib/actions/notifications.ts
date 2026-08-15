"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

type ActionResult = { error: string | null }

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false)
  if (error) return { error: "Couldn't update notifications." }

  revalidatePath("/dashboard/notifications")
  return { error: null }
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user.id)
  if (error) return { error: "Couldn't update notification." }

  revalidatePath("/dashboard/notifications")
  return { error: null }
}
