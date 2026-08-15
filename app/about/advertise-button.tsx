"use client"

import { useState } from "react"
import { Mail, Megaphone, Phone, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
  phone: string
  email: string
}

export function AdvertiseButton({ phone, email }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="lg" className="gap-2" onClick={() => setOpen(true)}>
        <Megaphone className="size-4" />
        Advertise on UreSphere
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Advertise on UreSphere"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl text-foreground">Advertise anything on UreSphere</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reach students inside their campus Spheres. Get in touch and we&apos;ll set you up.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground transition hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-3">
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-3 rounded-md border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-foreground transition hover:border-primary/40"
                >
                  <Phone className="size-4 text-primary" />
                  {phone}
                </a>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 rounded-md border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-foreground transition hover:border-primary/40"
                >
                  <Mail className="size-4 text-primary" />
                  {email}
                </a>
              )}
              {!phone && !email && (
                <p className="text-sm text-muted-foreground">
                  Contact details are being set up. Check back soon.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
