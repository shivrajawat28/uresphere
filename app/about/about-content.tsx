import { Orbit } from "lucide-react"
import { WorkWithUsForm } from "@/components/landing/work-with-us-form"
import { AdvertiseButton } from "./advertise-button"

type TeamMember = {
  id: string
  name: string
  role: string
  photo_url: string | null
  short_bio: string
  bio: string
  social_links: Record<string, string>
  display_order: number
}

type Props = {
  team: TeamMember[]
  advertising: { contact_phone: string; contact_email: string }
}

export function AboutContent({ team, advertising }: Props) {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-4xl px-4 py-20 md:px-8 md:py-28">
          <p className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Orbit className="size-4" />
            About ÙreSphere
          </p>
          <h1 className="font-serif text-4xl font-medium leading-tight text-balance text-foreground md:text-5xl">
          Your campus, your Sphere
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          ÙreSphere is a private campus community built around one simple idea: your college deserves its own space.
          Chat, discover, learn, join groups, explore events and trade with people from your campus — while your public identity stays anonymous. Nothing crosses into another Sphere.  
          </p>
        </div>
      </section>

      {/* Why we built it */}
      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-2 md:px-8">
          <div>
            <h2 className="font-serif text-2xl font-medium text-foreground md:text-3xl">Why we built it</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
            Campus life shouldn&apos;t be scattered across dozens of group chats.
            ÙreSphere brings the conversations, people, academics, events and everyday campus life into one place — where you can be part of the community without putting your real identity out there.
            </p>
          </div>
          <div>
            <h2 className="font-serif text-2xl font-medium text-foreground md:text-3xl">Our vision</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
            Every campus deserves a Sphere.

We want to connect campuses across the country through one platform while keeping every campus community local, private and independent.

<br />
One platform, Thousands of Spheres, Millions of campus stories.
<br />
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
          <h2 className="mb-8 font-serif text-2xl font-medium text-foreground md:text-3xl">How ÙreSphere works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: "01", t: "Claim your campus", d: "Choose your college from the ÙreSphere directory and enter its dedicated Sphere." },
              { n: "02", t: "Become anonymous", d: "You receive a unique handle that becomes your identity across ÙreSphere. Your real identity stays private." },
              { n: "03", t: "Make campus life yours", d: "Chat, join groups, explore academics, discover clubs and events, buy and sell, and see what's happening around your campus." },
            ].map((s) => (
              <div key={s.n} className="rounded-lg border border-border/70 bg-background p-6">
                <p className="font-serif text-3xl text-primary/60">{s.n}</p>
                <h3 className="mt-3 font-medium text-foreground">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
          <h2 className="mb-2 font-serif text-2xl font-medium text-foreground md:text-3xl">Our team</h2>
          <p className="mb-10 max-w-xl text-sm text-muted-foreground">
            The people building ÙreSphere, campus by campus.
          </p>
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground">The team page is being set up. Check back soon.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((m) => (
                <div key={m.id} className="rounded-lg border border-border/70 bg-secondary/20 p-6">
                  {m.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo_url} alt={m.name} className="mb-4 h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 font-serif text-xl text-primary">
                      {m.name.charAt(0)}
                    </div>
                  )}
                  <h3 className="font-medium text-foreground">{m.name}</h3>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">{m.role}</p>
                  {m.short_bio && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.short_bio}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Work with us */}
      <section className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-4xl px-4 py-16 md:px-8">
          <h2 className="mb-2 font-serif text-2xl font-medium text-foreground md:text-3xl">Work with us</h2>
          <p className="mb-8 max-w-xl text-sm text-muted-foreground">
            We&apos;re a small team building something big. If you want to help shape how campuses connect,
            tell us about yourself.
          </p>
          <WorkWithUsForm />
        </div>
      </section>

      {/* Advertise */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-8">
          <h2 className="mb-2 font-serif text-2xl font-medium text-foreground md:text-3xl">Advertise on ÙreSphere</h2>
          <p className="mx-auto mb-8 max-w-xl text-sm text-muted-foreground">
            Reach thousands of students inside their campus Spheres. From canteens to cafés to campus startups —
            put your brand where students already are.
          </p>
          <AdvertiseButton phone={advertising.contact_phone} email={advertising.contact_email} />
        </div>
      </section>
    </>
  )
}

export type { TeamMember }
