"use client"

import { useState, useTransition } from "react"
import { Loader2, CheckCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { registerForEventAction } from "@/lib/actions/admin"
import { toast } from "sonner"

export function EventRegistrationDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  isAlreadyRegistered,
  registrationDeadline,
  source,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  eventTitle: string
  isAlreadyRegistered: boolean
  registrationDeadline: string | null
  source?: "college" | "club"
}) {
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)

  const isDeadlinePassed = registrationDeadline ? new Date(registrationDeadline) < new Date() : false

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (source) fd.set("source", source)

    startTransition(async () => {
      const result = await registerForEventAction(eventId, fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        setSuccess(true)
        toast.success("Registered successfully!")
      }
    })
  }

  function handleClose() {
    setSuccess(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isAlreadyRegistered ? "Already Registered" : isDeadlinePassed ? "Registration Closed" : "Register for Event"}</DialogTitle>
          <DialogDescription>{eventTitle}</DialogDescription>
        </DialogHeader>

        {success || isAlreadyRegistered ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle className="size-12 text-green-500" />
            <p className="text-sm font-medium text-foreground">
              {isAlreadyRegistered ? "You are already registered for this event." : "You are registered!"}
            </p>
            <Button variant="outline" onClick={handleClose}>Close</Button>
          </div>
        ) : isDeadlinePassed ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">Registration for this event has closed.</p>
            <Button variant="outline" className="mt-4" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="regName">Full Name *</Label>
              <Input id="regName" name="fullName" required minLength={2} maxLength={100} placeholder="Your full name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regPhone">Phone Number *</Label>
              <Input id="regPhone" name="phone" required minLength={7} maxLength={15} placeholder="9876543210" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regSection">Section</Label>
              <Input id="regSection" name="section" maxLength={50} placeholder="e.g. A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="regBranch">Branch</Label>
                <Input id="regBranch" name="branch" maxLength={100} placeholder="e.g. CSE" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="regYear">Year</Label>
                <Input id="regYear" name="year" maxLength={20} placeholder="e.g. 2nd" />
              </div>
            </div>
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Register"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
