import { Orbit } from "lucide-react"

export default function Loading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background">
      <Orbit className="size-8 animate-spin text-primary" aria-label="Loading" />
    </main>
  )
}
