import { handleUpload } from "@vercel/blob/client"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// 10 MB per-image cap for client uploads.
const MAX_CLIENT_UPLOAD_BYTES = 10 * 1024 * 1024

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
]

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json()

  const response = await handleUpload({
    request,
    body,
    onBeforeGenerateToken: async (pathname: string) => {
      // Verify the user is authenticated before issuing a client token.
      const supabase = await createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        throw new Error("Not authenticated")
      }

      // Verify active sphere membership.
      const { data: membership } = await supabase
        .from("user_spheres")
        .select("sphere_id")
        .eq("user_id", user.id)
        .eq("membership_status", "active")
        .maybeSingle()
      if (!membership) {
        throw new Error("Not a member of a Sphere")
      }

      // Client uploads use paths like listings/temp/{uuid}.{ext} or
      // uploads/temp/{uuid}.{ext}. The user is already authenticated and
      // has active sphere membership checked above, so the path convention
      // is defense-in-depth, not a security boundary. Accept any path that
      // starts with the expected top-level prefix.
      const validPrefixes = ["listings/", "uploads/", "clubs/", "events/", "activities/"]
      const pathIsValid = validPrefixes.some((prefix) => pathname.startsWith(prefix))
      if (!pathIsValid) {
        throw new Error("Invalid upload path")
      }

      return {
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_CLIENT_UPLOAD_BYTES,
        // Token expires in 1 hour.
        validUntil: Date.now() + 60 * 60 * 1000,
        addRandomSuffix: false,
        allowOverwrite: false,
      }
    },
    onUploadCompleted: async () => {
      // Optional: we could log or track uploads here.
      // For now the client returns the URL directly to the listing form.
    },
  })

  // handleUpload returns a Response-compatible object.
  return NextResponse.json(response, {
    status: response.type === "blob.generate-client-token" ? 200 : 200,
  })
}
