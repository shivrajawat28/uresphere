"use client"

import { useRef, useState, useTransition } from "react"
import Image from "next/image"
import { Loader2, Upload, X } from "lucide-react"
import { upload } from "@vercel/blob/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { createListingAction } from "@/lib/actions/marketplace"

const CATEGORIES = [
  { value: "books", label: "Books" },
  { value: "calculators", label: "Calculators" },
  { value: "cycles", label: "Cycles" },
  { value: "electronics", label: "Electronics" },
  { value: "college_supplies", label: "College supplies" },
  { value: "other", label: "Other" },
]

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "used", label: "Used" },
  { value: "fair", label: "Fair" },
]

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

export function CreateListingDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>("")
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (images.length + files.length > 6) {
      toast.error("Maximum 6 photos per listing.")
      return
    }

    setUploading(true)
    const uploaded: string[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress(`Uploading ${i + 1} of ${files.length}…`)

        // Client-side size validation.
        if (file.size > MAX_FILE_BYTES) {
          toast.error(
            `"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please choose an image under 10 MB.`,
          )
          continue
        }

        // Build storage path matching the existing convention:
        // listings/{userId}/{uuid}.{ext}
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
        const pathname = `listings/temp/${crypto.randomUUID()}.${ext}`

        try {
          const blob = await upload(pathname, file, {
            access: "public",
            handleUploadUrl: "/api/blob/handle-upload",
            contentType: file.type || undefined,
          })
          uploaded.push(blob.url)
        } catch (uploadError) {
          const msg =
            uploadError instanceof Error ? uploadError.message : String(uploadError)
          if (msg.includes("Not authenticated")) {
            toast.error("Please sign in to upload images.")
          } else if (msg.includes("too large") || msg.includes("size") || msg.includes("413")) {
            toast.error(
              `"${file.name}" is too large. Please choose an image under 10 MB.`,
            )
          } else if (msg.includes("type") || msg.includes("Unsupported")) {
            toast.error(`"${file.name}" is an unsupported image format.`)
          } else {
            toast.error(`Couldn't upload "${file.name}". Please try again.`)
          }
        }
      }

      if (uploaded.length > 0) {
        setImages((prev) => [...prev, ...uploaded])
        if (uploaded.length < files.length) {
          toast.info(
            `${uploaded.length} of ${files.length} images uploaded. Check file sizes.`,
          )
        }
      } else if (files.length > 0) {
        toast.error("No images were uploaded. Please check file sizes and try again.")
      }
    } finally {
      setUploading(false)
      setUploadProgress("")
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url))
  }

  function handleSubmit(formData: FormData) {
    if (images.length === 0) {
      toast.error("Please add at least one photo.")
      return
    }
    formData.set("imageUrls", JSON.stringify(images))
    startTransition(async () => {
      const result = await createListingAction(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Listing submitted for review — it goes live after an admin approves it")
        setImages([])
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>List an item</DialogTitle>
          <DialogDescription>
            Visible only to verified members of your Sphere. Listings go live after admin review.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" maxLength={120} required placeholder="Calculus textbook, 3rd edition" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              maxLength={2000}
              required
              rows={4}
              placeholder="Condition, pickup details, anything a buyer should know"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">Price (₹)</Label>
              <Input id="price" name="price" type="number" min="0" step="1" required placeholder="250" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Condition</Label>
              <Select name="condition" defaultValue="used">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Category</Label>
            <Select name="category" defaultValue="other">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Photos (max 6, 10 MB each)</Label>
            <div className="flex flex-wrap gap-2">
              {images.map((url) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border border-border">
                  <Image src={url} alt="Listing photo" fill className="object-cover" unoptimized />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5"
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length < 6 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="text-[10px]">{uploadProgress || "Add"}</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-[11px] text-muted-foreground">
              Supports JPG, PNG, WebP, GIF, HEIC/HEIF. Max 10 MB per image.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || uploading} className="w-full">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish listing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
