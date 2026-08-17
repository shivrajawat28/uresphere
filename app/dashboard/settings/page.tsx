import { requireMember } from "@/lib/data/session"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { RegenerateHandleButton } from "@/components/dashboard/regenerate-handle-button"
import { SignOutButton } from "@/components/dashboard/sign-out-button"
import { Shield, Mail, Phone, GraduationCap } from "lucide-react"

export default async function SettingsPage() {
  const member = await requireMember()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("real_name, phone, college_input, college_year")
    .eq("id", member.userId)
    .maybeSingle()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-balance">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your identity, verification details, and Sphere membership.
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-border/60 bg-card">
          <CardHeader>
            <CardTitle className="font-serif text-lg font-medium">Anonymous identity</CardTitle>
            <CardDescription>This is what other members of your Sphere see — never your real name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-4 py-3">
              <div>
                <p className="font-mono text-sm text-primary">{member.anonymousHandle}</p>
                <p className="text-xs text-muted-foreground">Your handle within {member.sphereName}</p>
              </div>
              <RegenerateHandleButton />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardHeader>
            <CardTitle className="font-serif text-lg font-medium">Verified details</CardTitle>
            <CardDescription>Private. Only visible to you and platform administrators.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Shield className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Real name</span>
              <span className="ml-auto font-medium">{profile?.real_name ?? "—"}</span>
            </div>
            <Separator className="bg-border/60" />
            <div className="flex items-center gap-3 text-sm">
              <Mail className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Email</span>
              <span className="ml-auto font-medium">{member.email ?? "—"}</span>
            </div>
            <Separator className="bg-border/60" />
            <div className="flex items-center gap-3 text-sm">
              <Phone className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Phone</span>
              <span className="ml-auto font-medium">{profile?.phone ?? "—"}</span>
            </div>
            <Separator className="bg-border/60" />
            <div className="flex items-center gap-3 text-sm">
              <GraduationCap className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">College</span>
              <span className="ml-auto font-medium">{profile?.college_input ?? "—"}</span>
            </div>
            {profile?.college_year && (
              <>
                <Separator className="bg-border/60" />
                <div className="flex items-center gap-3 text-sm">
                  <GraduationCap className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Current year</span>
                  <span className="ml-auto font-medium capitalize">{profile.college_year}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardHeader>
            <CardTitle className="font-serif text-lg font-medium">Sphere</CardTitle>
            <CardDescription>Your private community. You can only belong to one at a time.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="font-medium">{member.sphereName}</p>
              <Badge variant="outline" className="mt-1 border-border/60 text-xs font-normal text-muted-foreground">
                Active
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-2">
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
