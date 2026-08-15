// Live check: can we subscribe to the exact channel + postgres_changes filter
// ChatRoom uses, against this Supabase project? (anon; RLS filters rows, but
// the handshake validates the WS endpoint, channel name and filter syntax.)
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

function env() {
  const out = {}
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const e = env()
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { data: colleges } = await sb.from("colleges").select("id, name").eq("status", "active").limit(1)
const sphereId = colleges?.[0]?.id ?? "00000000-0000-0000-0000-000000000000"
const fakeUserId = "11111111-1111-1111-1111-111111111111"

const channel = sb
  .channel(`sphere-chat-${sphereId}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "chat_messages", filter: `sphere_id=eq.${sphereId} and author_id=neq.${fakeUserId}` },
    () => {},
  )
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "chat_messages", filter: `sphere_id=eq.${sphereId}` },
    () => {},
  )

const status = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve("TIMEOUT"), 8000)
  channel.subscribe((s, err) => {
    if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
      clearTimeout(timer)
      resolve(err ? `ERROR ${err.message}` : s)
    }
  })
})

console.log("subscribe status:", status)
await sb.removeChannel(channel)
process.exit(status.startsWith("SUBSCRIBED") ? 0 : 1)
