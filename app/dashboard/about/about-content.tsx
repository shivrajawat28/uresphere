import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { WorkWithUsForm } from "@/components/landing/work-with-us-form"
import { TEAM_MEMBERS, type TeamMember } from "./team"
import {
  Compass,
  Eye,
  Fingerprint,
  HeartHandshake,
  Link as LinkIcon,
  Lock,
  Orbit,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"

const principles = [
  {
    icon: Fingerprint,
    title: "Anonymous by design",
    body: "You join your campus Sphere under a generated handle. Your real name, email and phone stay private — visible only to you and your Sphere's admins for moderation.",
  },
  {
    icon: Lock,
    title: "Sphere isolation",
    body: "Every college gets its own private Sphere. Content never crosses into another campus, and nothing on your campus is visible to other Spheres.",
  },
  {
    icon: ShieldCheck,
    title: "Moderated, not surveilled",
    body: "Sphere admins can review reported content, but moderation happens inside your campus, by people who understand it.",
  },
  {
    icon: HeartHandshake,
    title: "Community first",
    body: "Clubs, events, groups, academic resources and a marketplace built around campus life — owned by the people who live it.",
  },
]

const steps = [
  { n: "01", title: "Claim your campus", body: "Pick your college from the UreSphere directory and enter its dedicated Sphere." },
  { n: "02", title: "Become anonymous", body: "Get a unique handle that becomes your identity. Your real identity stays private." },
  { n: "03", title: "Make campus life yours", body: "Chat, join groups, explore academics, clubs, events and the marketplace." },
]

export function DashboardAboutContent({ sphereName }: { sphereName: string }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      {/* Header */}
      <div className="mb-10">
        <Badge variant="outline" className="mb-3 border-border/60 font-normal text-primary">
          <Orbit className="mr-1 size-3" aria-hidden="true" />
          About UreSphere
        </Badge>
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Your campus, your Sphere
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          UreSphere is a private campus community built around one simple idea: your college deserves its own space.
          Chat, discover, learn, join groups, explore events and trade with people from your campus — while your public
          identity stays anonymous. Nothing crosses into another Sphere.
        </p>
      </div>

      {/* Why we built it / Our vision */}
      <div className="mb-10 grid gap-4 md:grid-cols-2">
        <Card className="border-border/70 bg-card">
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <Compass className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-serif text-lg font-medium text-foreground">Why we built it</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Campus life shouldn&apos;t be scattered across dozens of group chats. UreSphere brings the conversations,
              people, academics, events and everyday campus life into one place — where you can be part of the
              community without putting your real identity out there.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card">
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <Eye className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-serif text-lg font-medium text-foreground">Our vision</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Every campus deserves a Sphere. We want to connect campuses across the country through one platform while
              keeping every campus community local, private and independent. One platform, thousands of Spheres,
              millions of campus stories.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* The story / mission */}
      <Card className="mb-10 border-border/70 bg-secondary/20">
        <CardContent className="flex flex-col gap-3 p-5 md:p-6">
          <h2 className="font-serif text-xl font-medium text-foreground">The UreSphere story</h2>
          <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
            Most campus conversations happen in throwaway group chats — loud, fragmented, and with no real sense of
            community. UreSphere started with a simple mission: give every campus one place to belong, where students
            can be themselves without being exposed. Everything we build — anonymous handles, Sphere isolation,
            campus-scoped moderation — exists to protect that.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
            Welcome to {sphereName}. This is your campus&apos;s corner of that mission.
          </p>
        </CardContent>
      </Card>

      {/* Trust, privacy & community */}
      <div className="mb-10">
        <h2 className="mb-1 font-serif text-2xl font-medium text-foreground">Trust, privacy & community</h2>
        <p className="mb-5 max-w-xl text-sm text-muted-foreground">
          The principles every Sphere is built on.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {principles.map((p) => {
            const Icon = p.icon
            return (
              <Card key={p.title} className="border-border/70 bg-card">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="font-medium text-foreground">{p.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* How it works */}
      <div className="mb-10">
        <h2 className="mb-5 font-serif text-2xl font-medium text-foreground">How UreSphere works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.n} className="border-border/70 bg-card">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <p className="font-serif text-3xl text-primary/60">{s.n}</p>
                <h3 className="font-medium text-foreground">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Our Team */}
      <div className="mb-10">
        <h2 className="mb-1 font-serif text-2xl font-medium text-foreground">Our Team</h2>
        <p className="mb-6 max-w-xl text-sm text-muted-foreground">
          The people building UreSphere, campus by campus.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM_MEMBERS.map((m) => (
            <TeamCard key={m.name} member={m} />
          ))}
        </div>
      </div>

      {/* Work with us */}
      <Card className="border-border/70 bg-secondary/20">
        <CardContent className="p-5 md:p-6">
          <h2 className="mb-1 font-serif text-xl font-medium text-foreground">Work with us</h2>
          <p className="mb-6 max-w-xl text-sm text-muted-foreground">
            We&apos;re a small team building something big. If you want to help shape how campuses connect,
            tell us about yourself.
          </p>
          <WorkWithUsForm />
        </CardContent>
      </Card>
    </div>
  )
}

function TeamCard({ member }: { member: TeamMember }) {
  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        {member.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.image}
            alt={member.name}
            className="size-14 rounded-full object-cover ring-1 ring-border"
          />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 font-serif text-xl text-primary">
            {member.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h3 className="font-medium text-foreground">{member.name}</h3>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{member.role}</p>
        </div>
        {member.bio && <p className="text-sm leading-relaxed text-muted-foreground">{member.bio}</p>}
        {member.links && member.links.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {member.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:underline"
              >
                <LinkIcon className="size-3" aria-hidden="true" />
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
