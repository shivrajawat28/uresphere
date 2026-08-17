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

  // The promotion payment QR is platform-level configuration: only the super
  // admin may upload it. Section admins and normal members never can.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle()
  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Not authorized to upload promotion payment assets" }, { status: 403 })
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
    const pathname = `promotions/${userData.user.id}/${crypto.randomUUID()}.${ext}`

    const blob = await put(pathname, file, {
      access: "public",
      contentType: detectedType,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.log("[v0] promotion payment upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
