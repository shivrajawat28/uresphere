"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { FileText, Link2, Loader2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export type UploadKind = "image" | "pdf" | "image,pdf"

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url)
}

/**
 * Shared device-upload control used everywhere an image/PDF is required.
 *
 * - "Upload from device" posts the file to `endpoint` (server-side MIME +
 *   size + magic-byte validation, same-origin CSRF check).
 * - Keeps the existing URL input for admins who prefer to paste a link.
 * - Renders responsive previews: images keep their aspect ratio with
 *   `object-contain` (never stretched/cropped); PDFs show a link card
 *   (never rendered as an image).
 *
 * `value` is a single URL string, or — with `multiple` — an array of URLs.
 */
export function FileUpload({
  endpoint = "/api/upload",
  accept = "image",
  multiple = false,
  value,
  onChange,
  label = "Files",
  maxFiles = 1,
  className,
}: {
  endpoint?: string
  accept?: UploadKind
  multiple?: boolean
  value: string | string[]
  onChange: (value: string | string[]) => void
  label?: string
  maxFiles?: number
  className?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [showUrl, setShowUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const values = multiple ? (Array.isArray(value) ? value : value ? [value] : []) : []
  const current = multiple ? values : value ? [value as string] : []

  const acceptAttr =
    accept === "pdf"
      ? "application/pdf"
      : accept === "image,pdf"
        ? "image/*,application/pdf"
        : "image/*"

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (current.length + files.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} file${maxFiles === 1 ? "" : "s"} allowed.`)
      return
    }

    setUploading(true)
    try {
      const uploaded: string[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch(endpoint, { method: "POST", body: formData })
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
        if (!res.ok) throw new Error(json.error ?? "Upload failed")
        if (!json.url) throw new Error("Upload failed")
        uploaded.push(json.url)
      }
      const next = multiple ? [...current, ...uploaded] : uploaded[0]
      onChange(next as string | string[])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function removeUrl(url: string) {
    if (multiple) {
      onChange((value as string[]).filter((u) => u !== url))
    } else {
      onChange("")
    }
  }

  function addUrl() {
    const raw = urlDraft.trim()
    if (!raw) return
    let normalized = raw
    if (!/^https?:\/\//i.test(raw)) normalized = `https://${raw}`
    const next = multiple ? [...current, normalized] : normalized
    onChange(next as string | string[])
    setUrlDraft("")
    setShowUrl(false)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {current.map((url) =>
          url ? (
            <div key={url} className="relative h-24 w-24 overflow-hidden rounded-md border border-border">
              {isPdfUrl(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full w-full flex-col items-center justify-center gap-1 bg-secondary/40 p-1 text-center text-[10px] leading-tight text-muted-foreground hover:text-foreground"
                >
                  <FileText className="size-6 text-primary" aria-hidden="true" />
                  <span className="line-clamp-2 break-all">PDF file</span>
                </a>
              ) : (
                <Image
                  src={url}
                  alt="Uploaded file preview"
                  fill
                  unoptimized
                  className="object-contain"
                />
              )}
              <button
                type="button"
                onClick={() => removeUrl(url)}
                className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground transition hover:bg-background"
                aria-label="Remove file"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : null,
        )}
        {current.length < maxFiles && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            <span className="text-[10px]">{uploading ? "Uploading…" : "Upload from device"}</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        multiple={multiple}
        className="hidden"
        onChange={handleFileChange}
      />

      {!showUrl ? (
        <button
          type="button"
          onClick={() => setShowUrl(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <Link2 className="size-3" aria-hidden="true" />
          Or paste a URL instead
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addUrl()
              }
            }}
            placeholder="https://…"
            aria-label={`${label} URL`}
          />
          <Button type="button" size="sm" variant="outline" onClick={addUrl}>
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowUrl(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
