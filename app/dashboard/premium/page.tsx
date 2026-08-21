import { requireMember } from "@/lib/data/session"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Gem, Briefcase, Users2, FileText, ScanSearch, Rocket } from "lucide-react"

export const dynamic = "force-dynamic"

const features = [
  { icon: Briefcase, title: "Internships", body: "Curated internship openings from companies that recruit at your campus." },
  { icon: Users2, title: "Mentorship", body: "One-on-one guidance from seniors and alumni in your field." },
  { icon: FileText, title: "Resume checker", body: "Automated review of your resume against recruiter expectations." },
  { icon: ScanSearch, title: "ATS checker", body: "See how your resume scores against applicant-tracking systems." },
  { icon: Rocket, title: "Career tools", body: "Mock interviews, salary insights, and campus placement prep." },
  { icon: Gem, title: "Opportunities", body: "Early access to hackathons, fellowships, and campus ambassador roles." },
]

export default async function PremiumPage() {
  const member = await requireMember()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8 flex items-center gap-3">
        <Gem className="size-6 text-primary" />
        <h1 className="text-pretty font-serif text-3xl font-semibold text-foreground">ÙreSphere Premium</h1>
        <Badge className="border-border/60 font-normal text-muted-foreground" variant="outline">
          Coming soon
        </Badge>
      </div>

      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Premium is being built. When it launches, {member.sphereName} members will unlock career tools that
        don&apos;t exist anywhere else on campus. Nothing here is live yet — no payments, no fake features.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const Icon = f.icon
          return (
            <Card key={f.title} className="border-border/70 bg-card">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <Icon className="size-5 text-primary" />
                <h3 className="font-serif text-lg font-medium text-foreground">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
