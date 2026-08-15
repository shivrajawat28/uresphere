"use client"

import { useEffect, useRef } from "react"

// Deterministic pseudo-random so the network looks identical per render.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NODES = 26
const EDGES = 30

type Point = { x: number; y: number; r: number; label?: string }

/**
 * A lightweight, dependency-free campus network: nodes linked by animated
 * lines, concentric orbit paths, drifting particles, and subtle mouse
 * parallax. Respects prefers-reduced-motion (static render, no listeners).
 */
export function CampusNetwork() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let raf = 0
    const onPointerMove = (e: PointerEvent) => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const dx = (e.clientX - cx) / cx
      const dy = (e.clientY - cy) / cy
      if (bgRef.current) bgRef.current.style.transform = `translate3d(${dx * -12}px, ${dy * -12}px, 0)`
      if (midRef.current) midRef.current.style.transform = `translate3d(${dx * -22}px, ${dy * -22}px, 0)`
      if (fgRef.current) fgRef.current.style.transform = `translate3d(${dx * -34}px, ${dy * -34}px, 0)`
    }

    raf = window.requestAnimationFrame(() => {})
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("pointermove", onPointerMove)
    }
  }, [])

  const rand = mulberry32(1337)
  const nodes: Point[] = Array.from({ length: NODES }, () => {
    // Bias toward a loose sphere so the graph feels like a campus cluster.
    const angle = rand() * Math.PI * 2
    const dist = 0.16 + rand() * 0.34
    return {
      x: 50 + Math.cos(angle) * dist * 50,
      y: 50 + Math.sin(angle) * dist * 50,
      r: 1.5 + rand() * 2.5,
    }
  })

  const edges: [number, number][] = []
  let guard = 0
  while (edges.length < EDGES && guard++ < 200) {
    const a = Math.floor(rand() * NODES)
    const b = Math.floor(rand() * NODES)
    if (a === b) continue
    const dist = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)
    if (dist < 55 && !edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
      edges.push([a, b])
    }
  }

  const particles = Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 53) % 100}%`,
    delay: `${(i * 1.7) % 14}s`,
    duration: `${9 + ((i * 3.1) % 8)}s`,
    size: 2 + ((i * 7) % 3),
  }))

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Ambient gradient wash */}
      <div
        ref={bgRef}
        className="absolute inset-0 will-change-transform"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 42%, oklch(0.86 0.07 230 / 0.55), transparent 70%), radial-gradient(45% 40% at 78% 68%, oklch(0.9 0.05 270 / 0.4), transparent 70%), radial-gradient(40% 40% at 22% 70%, oklch(0.88 0.06 190 / 0.4), transparent 70%)",
        }}
      />

      {/* Orbit paths + nodes */}
      <div ref={midRef} className="absolute inset-0 flex items-center justify-center will-change-transform">
        <div className="relative size-[min(88vw,640px)]">
          <div className="hero-orbit absolute inset-0 rounded-full border border-foreground/10" />
          <div className="hero-orbit-reverse absolute inset-[12%] rounded-full border border-foreground/10" />
          <div className="hero-orbit absolute inset-[26%] rounded-full border border-primary/25" style={{ animationDuration: "40s" }} />
          <div className="hero-orbit-reverse absolute inset-[38%] rounded-full border border-foreground/10" style={{ animationDuration: "55s" }} />

          {/* Center hub */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="hero-float flex size-24 items-center justify-center rounded-full border border-primary/40 bg-primary/10 shadow-[0_0_60px_-10px] shadow-primary/40 backdrop-blur-sm md:size-28">
              <span className="font-serif text-sm italic text-primary md:text-base">Your campus</span>
            </div>
          </div>

          {/* Edge markers orbiting the rings */}
          {Array.from({ length: 14 }, (_, i) => {
            const ring = i % 4
            const inset = [0, 12, 26, 38][ring]
            const angle = (i / 14) * Math.PI * 2 + ring * 0.6
            const radius = (50 - inset) * 0.01 * 50 // % of container
            return (
              <div
                key={i}
                className={`absolute left-1/2 top-1/2 ${ring % 2 === 0 ? "hero-node-pulse" : ""}`}
                style={{
                  width: 0,
                  height: 0,
                  transform: `translate(-50%, -50%) rotate(${angle}rad) translateX(${radius}%)`,
                }}
              >
                <span
                  className={`absolute block rounded-full ${
                    ring === 2 ? "bg-primary" : "bg-foreground/40"
                  }`}
                  style={{
                    width: ring === 2 ? 7 : 5,
                    height: ring === 2 ? 7 : 5,
                    left: ring === 2 ? -3.5 : -2.5,
                    top: ring === 2 ? -3.5 : -2.5,
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Network graph */}
      <div ref={fgRef} className="absolute inset-0 flex items-center justify-center will-change-transform">
        <svg
          viewBox="0 0 100 100"
          className="size-[min(92vw,700px)] opacity-60"
          style={{ filter: "blur(0.3px)" }}
        >
          <defs>
            <linearGradient id="edge-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.62 0.17 225)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="oklch(0.55 0.13 195)" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <g fill="none" stroke="url(#edge-grad)" strokeWidth="0.18">
            {edges.map(([a, b], i) => (
              <line
                key={i}
                x1={nodes[a].x}
                y1={nodes[a].y}
                x2={nodes[b].x}
                y2={nodes[b].y}
                strokeDasharray="2 3"
                className="hero-network-dash"
              />
            ))}
          </g>
          <g>
            {nodes.map((n, i) => (
              <circle
                key={i}
                cx={n.x}
                cy={n.y}
                r={n.r}
                className="hero-node-pulse"
                style={{ animationDelay: `${(i % 6) * 0.6}s` }}
                fill={i % 3 === 0 ? "oklch(0.62 0.17 225)" : "oklch(0.19 0.035 255)"}
                opacity={i % 3 === 0 ? 0.7 : 0.5}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Floating particles */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="hero-particle absolute bottom-[-8px] rounded-full bg-primary/50"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}

      {/* Ground glow */}
      <div
        className="absolute inset-x-0 bottom-0 h-40"
        style={{
          background:
            "linear-gradient(to top, oklch(0.62 0.17 225 / 0.12), transparent)",
        }}
      />
    </div>
  )
}
