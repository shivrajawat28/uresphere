import { GraduationCap, ShieldCheck, MessageCircleMore } from "lucide-react"

const steps = [
  {
    icon: GraduationCap,
    title: "Verify once, privately",
    body: "Tell us your real name, phone, and college. It's used only to confirm you belong — then it's sealed away from every other member.",
  },
  {
    icon: ShieldCheck,
    title: "Get your Sphere identity",
    body: "We drop you into your campus's private Sphere and generate an anonymous handle. That's the only thing anyone else ever sees.",
  },
  {
    icon: MessageCircleMore,
    title: "Show up as yourself, without your name",
    body: "Chat live, list things for sale, and organize with classmates — all scoped to your campus, all anonymous by default.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border/60 bg-secondary/20 py-24">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="mb-14 max-w-xl">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-primary">How it works</p>
          <h2 className="font-serif text-3xl font-medium text-balance text-foreground md:text-4xl">
            Three steps between you and your campus.
          </h2>
        </div>

        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="relative">
                <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-border/60 bg-card">
                  <Icon className="size-5 text-primary" />
                </div>
                <h3 className="mb-2 font-serif text-xl font-medium text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
