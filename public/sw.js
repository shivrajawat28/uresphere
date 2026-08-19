// UreSphere Push Notification Service Worker
// Handles push events and displays browser notifications.

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener("push", (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = {
      title: "UreSphere",
      body: event.data.text(),
    }
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || "uresphere-notification",
    data: data.data || {},
    actions: data.actions || [],
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "UreSphere", options),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const url = event.notification.data?.url || "/dashboard"

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if one is open.
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Otherwise open a new window.
      return clients.openWindow(url)
    }),
  )
})
