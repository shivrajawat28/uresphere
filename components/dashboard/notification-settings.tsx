"use client"

import { useEffect, useState, useTransition } from "react"
import {
  getNotificationPreferences,
  updateNotificationPreferencesAction,
  type NotificationPreferences,
} from "@/lib/actions/notifications"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { BellRing, Users, Loader2 } from "lucide-react"

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    pushEnabled: true,
    chatNotifications: true,
    groupNotifications: true,
  })
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getNotificationPreferences().then((result) => {
      if (result.preferences) setPrefs(result.preferences)
      setLoading(false)
    })
  }, [])

  function updatePref(key: keyof NotificationPreferences, value: boolean) {
    const newPrefs = { ...prefs, [key]: value }
    setPrefs(newPrefs)
    startTransition(async () => {
      const result = await updateNotificationPreferencesAction({ [key]: value })
      if (result.error) {
        toast.error(result.error)
        // Revert on error.
        setPrefs(prefs)
      } else {
        toast.success("Preference saved")
      }
    })
  }

  if (loading) {
    return (
      <Card className="border-border/60 bg-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/60 bg-card">
      <CardHeader>
        <CardTitle className="font-serif text-lg font-medium">Notifications</CardTitle>
        <CardDescription>Control how and when you receive notifications.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleRow
          icon={<BellRing className="size-4" />}
          label="Browser push notifications"
          description="Receive push notifications in your browser for important updates"
          enabled={prefs.pushEnabled}
          onChange={(v) => updatePref("pushEnabled", v)}
          disabled={isPending}
        />
        <ToggleRow
          icon={<Users className="size-4" />}
          label="Group chat notifications"
          description="Get notified when there's new activity in your groups"
          enabled={prefs.groupNotifications}
          onChange={(v) => updatePref("groupNotifications", v)}
          disabled={isPending}
        />
      </CardContent>
    </Card>
  )
}

function ToggleRow({
  icon,
  label,
  description,
  enabled,
  onChange,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  description: string
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-secondary/20 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
          enabled ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  )
}
