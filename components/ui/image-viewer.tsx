"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react"
import { Button } from "./button"
import { createPortal } from "react-dom"

interface ImageViewerProps {
  images: string[]
  initialIndex?: number
  onClose: () => void
}

export function ImageViewer({ images, initialIndex = 0, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [startPan, setStartPan] = useState({ x: 0, y: 0 })
  const [mounted, setMounted] = useState(false)
  
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true)
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = "auto"
    }
  }, [])

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 5))
  const handleZoomOut = () => {
    setScale((s) => {
      const newScale = Math.max(s - 0.5, 1)
      if (newScale === 1) setPan({ x: 0, y: 0 }) // reset pan if returning to original scale
      return newScale
    })
  }
  
  const handleReset = () => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
    handleReset()
  }, [images.length])

  const handleNext = useCallback(() => {
    if (images.length <= 1) return
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
    handleReset()
  }, [images.length])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") handlePrev()
      else if (e.key === "ArrowRight") handleNext()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [currentIndex, images.length, handlePrev, handleNext, onClose])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return
    setIsPanning(true)
    setStartPan({
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning || scale <= 1) return
    setPan({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    })
  }

  const handlePointerUp = () => {
    setIsPanning(false)
  }

  if (!mounted) return null

  const content = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <Button variant="secondary" size="icon" onClick={handleZoomOut} disabled={scale <= 1} aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" onClick={handleReset} disabled={scale === 1} aria-label="Reset zoom">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" onClick={handleZoomIn} disabled={scale >= 5} aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="destructive" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {images.length > 1 && (
        <>
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-4 top-1/2 z-50 -translate-y-1/2 rounded-full"
            onClick={handlePrev}
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-4 top-1/2 z-50 -translate-y-1/2 rounded-full"
            onClick={handleNext}
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}

      <div className="flex h-full w-full items-center justify-center overflow-hidden p-4 md:p-12">
        <div
          className={`relative flex items-center justify-center ${scale > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transition: isPanning ? "none" : "transform 0.2s ease-in-out",
          }}
          onPointerDown={handlePointerDown}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={images[currentIndex]}
            alt={`Image ${currentIndex + 1} of ${images.length}`}
            className="max-h-[85vh] max-w-[85vw] object-contain pointer-events-none"
            draggable={false}
          />
        </div>
      </div>
      
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 z-50 p-2 bg-background/50 backdrop-blur rounded-full">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentIndex(i)
                handleReset()
              }}
              className={`h-2 w-2 rounded-full transition-all ${
                i === currentIndex ? "bg-primary w-4" : "bg-primary/40 hover:bg-primary/60"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
