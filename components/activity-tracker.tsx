"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

/**
 * Keeps `profiles.last_activity_at` fresh for the 48-hour inactivity logout.
 *
 * The authoritative timeout check runs server-side in `requireMember` (which
 * signs the user out and redirects to login). This tracker is the client-side
 * half: it records "the user was here" so an active user's timestamp never
 * goes stale, and a returning user's timestamp is refreshed on arrival.
 *
 * Two classes of trigger:
 *   - Meaningful returns (always write — they are low frequency by nature):
 *     initial authenticated load, route change / navigation (the layout stays
 *     mounted across client-side navigation, so the pathname is watched
 *     explicitly — otherwise a signup → dashboard jump would never ping),
 *     `visibilitychange` → visible, window `focus`, `pageshow` (browser
 *     reopen / bfcache restore).
 *   - Interaction (throttled to one write per ACTIVITY_WRITE_INTERVAL_MS):
 *     `pointerdown` / `keydown`, so normal browsing never produces a
 *     database write per event.
 *
 * All listeners are cleaned up on unmount / navigation — no leaks.
 */
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000

export function ActivityTracker() {
  const pathname = usePathname()
  const lastWriteRef = useRef(0)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    async function recordActivity(force = false) {
      if (inFlightRef.current) return
      const now = Date.now()
      // Meaningful returns always advance the clock; only high-frequency
      // interaction is throttled.
      if (!force && now - lastWriteRef.current < ACTIVITY_WRITE_INTERVAL_MS) return
      inFlightRef.current = true
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        lastWriteRef.current = now
        await supabase
          .from("profiles")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("id", user.id)
      } catch {
        // Activity pings must never break the app; the server-side check in
        // requireMember treats a missing timestamp as "active", so a failed
        // write just means the clock isn't advanced this round.
      } finally {
        inFlightRef.current = false
      }
    }

    recordActivity(true)

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recordActivity(true)
    }
    const onFocus = () => recordActivity(true)
    const onPageShow = () => recordActivity(true)
    const onInput = () => recordActivity(false)

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", onFocus)
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("pointerdown", onInput)
    window.addEventListener("keydown", onInput)

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("pointerdown", onInput)
      window.removeEventListener("keydown", onInput)
    }
  }, [pathname])

  return null
}
