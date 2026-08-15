import { Lock, EyeOff, Scale } from "lucide-react"

const points = [
  {
    icon: EyeOff,
    title: "Your identity stays yours",
    body: "Your real identity stays private while you use your Sphere with an anonymous name.",
  },
  {
    icon: Lock,
    title: "Your Sphere stays your Sphere",
    body: "Your conversations, groups and campus activity stay within your college community.",
  },
  {
    icon: Scale,
    title: "Moderation that keeps things in check",
    body: "Your Sphere has its own admins to handle reports and keep the community safe.",
  },
]

export function Trust() {
  return (
    <section id="trust" className="py-24">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="mb-14 max-w-xl">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-primary">Trust & safety</p>
          <h2 className="font-serif text-3xl font-medium text-balance text-foreground md:text-4xl">
          Private by default. Built for trust.
          </h2>
        </div>

        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {points.map((p) => {
            const Icon = p.icon
            return (
              <div key={p.title}>
                <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-border/60 bg-card">
                  <Icon className="size-5 text-primary" />
                </div>
                <h3 className="mb-2 font-serif text-xl font-medium text-foreground">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
