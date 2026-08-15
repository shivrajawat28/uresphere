"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Counts up from 0 to `value` once the element scrolls into view.
 * Respects `prefers-reduced-motion`: users who prefer reduced motion get the
 * final value immediately with no animation.
 */
export function AnimatedCounter({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || started.current) return
        started.current = true
        observer.disconnect()
        // Reduced-motion users get the final value immediately.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setDisplay(value)
          return
        }
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          // easeOutCubic — fast start, gentle landing.
          const eased = 1 - Math.pow(1 - t, 3)
          setDisplay(Math.round(eased * value))
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [value, duration])

  return <span ref={ref}>{display}</span>
}
