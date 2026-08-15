"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function regenerateHandleAction(): Promise<{ error: string | null; handle?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Not signed in." }

  const { data, error } = await supabase.rpc("regenerate_own_handle")

  if (error) {
    console.log("[v0] regenerateHandle error:", error.message)
    return { error: "Couldn't regenerate your handle — try again." }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/settings")
  return { error: null, handle: data as string }
}
