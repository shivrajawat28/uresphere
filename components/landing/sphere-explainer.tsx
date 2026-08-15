import { Circle } from "lucide-react"

// Orbit rings rotate continuously (subtle, premium). Each handle chip orbits
// with its ring while counter-rotating so the text always stays upright.
// Reduced-motion users get a static, fully readable layout.

const ORBIT_CONFIG = [
  // Outer orbit — rides the inset-6 ring, slower.
  { inset: "inset-6", duration: "56s", handles: ["@SilentWolf482", "@CrazyPanda193"], angles: [0, 180] },
  // Inner orbit — rides the inset-12 ring, slightly faster for depth.
  { inset: "inset-12", duration: "44s", handles: ["@ShadowFox812", "@DarkKnight721"], angles: [90, 270] },
]

type OrbitRingProps = {
  inset: string
  duration: string
  handles: string[]
  angles: number[]
}

function OrbitRing({ inset, duration, handles, angles }: OrbitRingProps) {
  return (
    <div
      className={`sphere-orbit absolute ${inset}`}
      style={{ "--orbit-duration": duration } as React.CSSProperties}
      aria-hidden="true"
    >
      {handles.map((handle, i) => (
        // Full-size wrapper rotated to the handle's static angle; the label
        // inside counter-rotates so the text never tilts with the orbit.
        <div
          key={handle}
          className="sphere-orbit-angle absolute inset-0"
          style={{ "--orbit-angle": `${angles[i]}deg` } as React.CSSProperties}
        >
          <span className="sphere-orbit-chip">
            <span className="sphere-orbit-label rounded-full border border-border/60 bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
              {handle}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function SphereExplainer() {
  return (
    <section id="sphere" className="border-b border-border/60 py-24">
      <div className="mx-auto grid max-w-5xl gap-12 px-4 md:grid-cols-2 md:gap-16 md:px-8">
        <div>
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-primary">The Sphere</p>
          <h2 className="mb-5 font-serif text-3xl font-medium text-balance text-foreground md:text-4xl">
          The internet is huge, Your campus isn&apos;t
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
          UreSphere gives your campus&apos;s own private corner of the internet — built for the people who actually study, hang out and live there.

Talk freely, find your people, discover what&apos;s happening. Trade, join groups and share what matters — all without crossing into another campus.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              "One account. One Sphere. Your campus stays your campus.",
              "Everything in one place. Chat, groups, events, listings and more — all within your Sphere.",
              "Private by design. Your campus community stays separate from every other Sphere.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                <Circle className="mt-1 size-2 shrink-0 fill-primary text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-center">
          <div className="relative flex size-72 items-center justify-center md:size-80">
            {/* Static orbit rings */}
            <div className="absolute inset-0 rounded-full border border-border/60" aria-hidden="true" />
            <div className="absolute inset-6 rounded-full border border-border/60" aria-hidden="true" />
            <div className="absolute inset-12 rounded-full border border-primary/40" aria-hidden="true" />

            {/* Rotating orbits carrying the anonymous handles */}
            {ORBIT_CONFIG.map((orbit) => (
              <OrbitRing key={orbit.inset} {...orbit} />
            ))}

            {/* Center node stays stable and readable */}
            <div className="relative z-10 flex size-28 items-center justify-center rounded-full bg-primary/10 text-center">
              <span className="font-serif text-sm italic text-primary">ÙreSphere</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
