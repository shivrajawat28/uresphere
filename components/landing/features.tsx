import { MessageCircle, ShoppingBag, Users, CalendarDays, BookOpen, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const features = [
  {
    icon: MessageCircle,
    title: "Sphere Chat",
    body: "Talk freely. Stay anonymous. Stay in your Sphere.",
    status: "live",
  },
  {
    icon: ShoppingBag,
    title: "Campus marketplace",
    body: "BBuy, sell and trade with students around you.",
    status: "live",
  },
  {
    icon: Users,
    title: "Groups",
    body: "Find your people. Create your own space.",
    status: "live",
  },
  {
    icon: CalendarDays,
    title: "Clubs & Events",
    body: "Discover clubs. Catch events. Never miss what's happening.",
    status: "live",
  },
  {
    icon: BookOpen,
    title: "Academic",
    body: "Notes, resources, subjects and more — all in one place.",
    status: "live",
  },
  {
    icon: ShieldAlert,
    title: "Moderation you can trust",
    body: "Your Sphere. Your community. Your moderation.",
    status: "live",
  },
]

export function Features() {
  return (
    <section id="features" className="border-b border-border/60 bg-secondary/20 py-24">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="mb-14 max-w-xl">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-primary">Features</p>
          <h2 className="font-serif text-3xl font-medium text-balance text-foreground md:text-4xl">
          Everything your campus does, in one private sphere.
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="rounded-xl border border-border/60 bg-card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <Icon className="size-5 text-primary" />
                  <Badge
                    variant="outline"
                    className={`border-border/60 text-[10px] font-normal ${
                      f.status === "live" ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {f.status === "live" ? "Live now" : "Coming soon"}
                  </Badge>
                </div>
                <h3 className="mb-2 font-serif text-lg font-medium text-foreground">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
