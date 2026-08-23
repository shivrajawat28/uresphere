"use client"

import { useCallback, useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react"
import { ImageViewer } from "@/components/ui/image-viewer"

/**
 * Touch-swipeable image carousel for marketplace listings.
 * - 1 image: simple static display, no controls.
 * - 2+ images: arrows on desktop, swipe on mobile, position indicator.
 */
export function ImageCarousel({
  images,
  alt,
  className = "",
}: {
  images: string[]
  alt: string
  className?: string
}) {
  const [current, setCurrent] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const touchStartX = useRef(0)
  const touchDeltaX = useRef(0)
  const isDragging = useRef(false)

  const count = images.length
  const hasMultiple = count > 1

  const goPrev = useCallback(() => setCurrent((c) => (c > 0 ? c - 1 : count - 1)), [count])
  const goNext = useCallback(() => setCurrent((c) => (c < count - 1 ? c + 1 : 0)), [count])

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchDeltaX.current = 0
    isDragging.current = false
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current
    if (Math.abs(touchDeltaX.current) > 10) {
      isDragging.current = true
    }
  }

  function handleTouchEnd() {
    const threshold = 40
    if (touchDeltaX.current > threshold) goPrev()
    else if (touchDeltaX.current < -threshold) goNext()
    touchDeltaX.current = 0
  }

  if (count === 0) {
    return (
      <div className={`flex h-full w-full items-center justify-center ${className}`}>
        <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Images — all rendered, translated via transform for smooth swiping */}
      <div
        className="flex h-full transition-transform duration-200 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {images.map((url, i) => (
          <div 
            key={url} 
            className="relative h-full w-full shrink-0 cursor-pointer"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!isDragging.current) {
                setViewerOpen(true)
              }
            }}
          >
            <Image
              src={url}
              alt={`${alt} — photo ${i + 1}`}
              fill
              className="object-cover"
              unoptimized
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* Navigation arrows — desktop only */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); goPrev() }}
            className="absolute left-1.5 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background md:left-2"
            aria-label="Previous photo"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); goNext() }}
            className="absolute right-1.5 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background md:right-2"
            aria-label="Next photo"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      )}

      {/* Position indicator */}
      {hasMultiple && (
        <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm">
          {current + 1} / {count}
        </div>
      )}

      {viewerOpen && (
        <ImageViewer
          images={images}
          initialIndex={current}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  )
}
