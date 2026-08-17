import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ALLOWED_IMAGE_TYPES, MAX_FILE_BYTES, isAllowedUploadOrigin, sniffImageType } from "@/lib/uploads"

export async function POST(request: NextRequest) {
  // Reject cross-origin requests (CSRF defense for a state-changing endpoint).
  // See lib/uploads.ts isAllowedUploadOrigin — exact origin comparison against
  // the canonical URL and the request's own origin, so local dev, tunnels and
  // preview deployments work while cross-site posts stay 403.
  const origin = request.headers.get("origin")
  if (!isAllowedUploadOrigin(origin, request.url)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()

  if (authError || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // Advertisements are platform-wide: only super admins may upload assets.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle()
  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Not authorized to upload advertisement assets" }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 })
    }

    // Never trust the client-supplied Content-Type alone — verify the bytes
    // actually match a known image format before storing anything.
    const detectedType = await sniffImageType(file)
    if (!detectedType || !ALLOWED_IMAGE_TYPES.has(detectedType)) {
      return NextResponse.json({ error: "File contents don't match a supported image type" }, { status: 400 })
    }

    // Random UUID filename under the admin's folder — no client-controlled
    // path, no user-supplied filename, no executables.
    const ext = detectedType.split("/")[1] ?? "jpg"
    const pathname = `ads/${userData.user.id}/${crypto.randomUUID()}.${ext}`

    const blob = await put(pathname, file, {
      access: "public",
      contentType: detectedType,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.log("[v0] ad upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
