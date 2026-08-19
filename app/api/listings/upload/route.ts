import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ALLOWED_IMAGE_TYPES, MAX_FILE_BYTES, isAllowedUploadOrigin, sniffImageType } from "@/lib/uploads"

export async function POST(request: NextRequest) {
  // Reject cross-origin requests (CSRF defense for a state-changing endpoint).
  // Compares the browser Origin against the canonical app URL AND the origin
  // the request was actually sent to, so uploads work in local development,
  // behind tunnels, and on Vercel preview deployments without weakening the
  // check (a cross-site attacker's Origin never matches either).
  const origin = request.headers.get("origin")
  if (!isAllowedUploadOrigin(origin, request.url)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()

  if (authError || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // Uploads are only meaningful for active Sphere members — a suspended or
  // unprovisioned user must not be able to store files.
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

    // Accept any image/* MIME type from the browser — the real validation is
    // done by magic-byte sniffing below. Browsers may report non-standard or
    // empty MIME types for HEIC/HEIF, camera photos, etc., so we only
    // reject obviously non-image types at this stage.
    const mimeIsImage = file.type.startsWith("image/") || file.type === ""
    if (!mimeIsImage) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Image is too large. Please choose an image under 10 MB." }, { status: 400 })
    }

    // Never trust the client-supplied Content-Type alone — verify the bytes
    // actually match a known image format before storing anything.
    const detectedType = await sniffImageType(file)
    if (!detectedType || !ALLOWED_IMAGE_TYPES.has(detectedType)) {
      return NextResponse.json({ error: "File contents don't match a supported image type" }, { status: 400 })
    }

    // Allow admin-provided paths for backward compat, otherwise generate a safe path.
    const clientPathname = formData.get("pathname") as string | null
    const ext = detectedType.split("/")[1] ?? "jpg"
    const safePathname = clientPathname && clientPathname.startsWith(`listings/${userData.user.id}/`)
      ? clientPathname
      : `listings/${userData.user.id}/${crypto.randomUUID()}.${ext}`

    const blob = await put(safePathname, file, {
      access: "public",
      contentType: detectedType,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.log("[v0] listing upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
