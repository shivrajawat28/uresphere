"use client"

import { useEffect, useRef, useState } from "react"
import {
  savePushSubscriptionAction,
  updateNotificationPreferencesAction,
} from "@/lib/actions/notifications"
import { toast } from "sonner"

function getInitialPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied"
  return Notification.permission
}

/**
 * Manages browser push notification registration.
 * Shows a friendly prompt if permission hasn't been decided.
 * Stores push subscriptions server-side via RPC.
 */
export function PushNotificationManager() {
  const [permissionState] = useState<NotificationPermission>(getInitialPermission)
  const [showPrompt, setShowPrompt] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const didInit = useRef(false)

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true

    if (!("Notification" in window) || !("serviceWorker" in navigator)) return

    const currentPermission = Notification.permission

    // Only show prompt if permission hasn't been decided yet.
    if (currentPermission === "default") {
      const timer = setTimeout(() => setShowPrompt(true), 5000)
      return () => clearTimeout(timer)
    }

    // If already granted, ensure we have a subscription.
    if (currentPermission === "granted") {
      void ensureSubscription()
    }
  }, [])

  if (permissionState !== "default" || !showPrompt) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl md:bottom-8">
      <div className="flex flex-col gap-3">
        <div>
          <p className="font-serif text-sm font-medium text-foreground">
            Stay updated on UreSphere
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Get notified when someone messages you or when activity happens in your groups.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={subscribing}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {subscribing ? "Enabling…" : "Enable notifications"}
          </button>
        </div>
      </div>
    </div>
  )

  async function handleEnable() {
    setSubscribing(true)
    try {
      const permission = await Notification.requestPermission()

      if (permission === "granted") {
        await ensureSubscription()
        await updateNotificationPreferencesAction({ pushEnabled: true })
        toast.success("Push notifications enabled")
      } else {
        toast.info("Push notifications remain disabled")
      }
      setShowPrompt(false)
    } catch {
      setShowPrompt(false)
    } finally {
      setSubscribing(false)
    }
  }

  function handleDismiss() {
    setShowPrompt(false)
    void updateNotificationPreferencesAction({ pushEnabled: false })
  }
}

/** Ensure the browser has an active push subscription registered server-side. */
async function ensureSubscription() {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready

    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await sendToServer(subscription)
      return
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) return

    const newSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })

    await sendToServer(newSubscription)
  } catch (err) {
    console.error("Push subscription failed:", err)
  }
}

async function sendToServer(subscription: PushSubscription) {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

  const result = await savePushSubscriptionAction(
    json.endpoint,
    json.keys.p256dh,
    json.keys.auth,
  )
  if (result.error) {
    console.error("Failed to save push subscription:", result.error)
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
