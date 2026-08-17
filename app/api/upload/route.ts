import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ALLOWED_IMAGE_TYPES, MAX_FILE_BYTES, isAllowedUploadOrigin, sniffFileType } from "@/lib/uploads"

export const runtime = "nodejs"

/**
 * Generic authenticated upload endpoint for member-uploaded assets (listing
 * photos, event images, academic resource PDFs, shop/global-listing images).
 *
 * Security model (mirrors the per-resource routes):
 *   - Same-origin CSRF check (exact origin comparison, see lib/uploads.ts).
 *   - Requires an authenticated user who is an ACTIVE Sphere member.
 *   - 5 MB size cap, allow-list of MIME types, and — critically — the real
 *     file kind is verified from magic bytes, never the client Content-Type.
 *   - Storage path is server-derived (`uploads/{userId}/{uuid}.{ext}`) — no
 *     client-controlled paths or filenames.
 *
 * Authorization for the RESOURCE the upload feeds is enforced separately in
 * each server action that persists the returned URL (e.g. only a super admin
 * can save a promotion QR). This endpoint only gates "is an active member",
 * matching how a member may attach files to content they are allowed to
 * create; admin-only resources keep their dedicated admin routes.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!isAllowedUploadOrigin(origin, request.url)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from("user_spheres")
    .select("sphere_id")
    .eq("user_id", userData.user.id)
    .eq("membership_status", "active")
    .maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: "Not a member of a Sphere" }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Images are the common case; PDFs are allowed too (academic resources).
    const isImage = ALLOWED_IMAGE_TYPES.has(file.type)
    const isPdf = file.type === "application/pdf"
    if (!isImage && !isPdf) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 })
    }

    // Never trust the client-supplied Content-Type alone — verify the bytes.
    const detectedType = await sniffFileType(file)
    if (!detectedType) {
      return NextResponse.json({ error: "File contents don't match a supported type" }, { status: 400 })
    }
    const detectedIsImage = ALLOWED_IMAGE_TYPES.has(detectedType)
    const detectedIsPdf = detectedType === "application/pdf"
    if ((isImage && !detectedIsImage) || (isPdf && !detectedIsPdf) || (!detectedIsImage && !detectedIsPdf)) {
      return NextResponse.json({ error: "File contents don't match the declared type" }, { status: 400 })
    }

    const ext = detectedIsPdf ? "pdf" : (detectedType.split("/")[1] ?? "jpg")
    const pathname = `uploads/${userData.user.id}/${crypto.randomUUID()}.${ext}`

    const blob = await put(pathname, file, {
      access: "public",
      contentType: detectedType,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.log("[v0] generic upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
