import { logoutAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <Button variant="outline" size="sm" type="submit" className="gap-2 text-muted-foreground">
        <LogOut className="size-4" />
        Sign out
      </Button>
    </form>
  )
}
