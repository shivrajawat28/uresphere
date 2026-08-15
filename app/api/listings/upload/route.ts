import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ALLOWED_IMAGE_TYPES, MAX_FILE_BYTES, sniffImageType } from "@/lib/uploads"

export async function POST(request: NextRequest) {
  // Reject cross-origin requests (CSRF defense for a state-changing endpoint).
  const origin = request.headers.get("origin")
  if (origin) {
    const allowed = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    if (!origin.startsWith(allowed)) {
      return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
    }
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

    const ext = detectedType.split("/")[1] ?? "jpg"
    const pathname = `listings/${userData.user.id}/${crypto.randomUUID()}.${ext}`

    const blob = await put(pathname, file, {
      access: "public",
      contentType: detectedType,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.log("[v0] listing upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
