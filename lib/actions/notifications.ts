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

  const { error } = await supabase.from("notifications").delete().eq("user_id", user.id)
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

  const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", user.id)
  if (error) return { error: "Couldn't update notification." }

  revalidatePath("/dashboard/notifications")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

export type NotificationPreferences = {
  pushEnabled: boolean
  chatNotifications: boolean
  groupNotifications: boolean
}

export async function getNotificationPreferences(): Promise<{
  error: string | null
  preferences?: NotificationPreferences
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const { data } = await supabase
    .from("notification_preferences")
    .select("push_enabled, chat_notifications, group_notifications")
    .eq("user_id", user.id)
    .maybeSingle()

  return {
    error: null,
    preferences: {
      pushEnabled: data?.push_enabled ?? true,
      chatNotifications: data?.chat_notifications ?? true,
      groupNotifications: data?.group_notifications ?? true,
    },
  }
}

export async function updateNotificationPreferencesAction(
  prefs: Partial<NotificationPreferences>,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (prefs.pushEnabled !== undefined) update.push_enabled = prefs.pushEnabled
  if (prefs.chatNotifications !== undefined) update.chat_notifications = prefs.chatNotifications
  if (prefs.groupNotifications !== undefined) update.group_notifications = prefs.groupNotifications

  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, ...update }, { onConflict: "user_id" })

  if (error) return { error: "Couldn't update preferences." }
  revalidatePath("/dashboard/settings")
  return { error: null }
}

// ---------------------------------------------------------------------------
// Push Subscription Management
// ---------------------------------------------------------------------------

export async function savePushSubscriptionAction(
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  })

  if (error) return { error: "Couldn't save push subscription." }
  return { error: null }
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }

  const { error } = await supabase.rpc("remove_push_subscription", {
    p_endpoint: endpoint,
  })

  if (error) return { error: "Couldn't remove push subscription." }
  return { error: null }
}
