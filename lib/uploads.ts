export const MAX_FILE_BYTES = 5 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"])

/**
 * Normalizes an origin string (trailing slashes stripped, scheme+host kept,
 * lowercased) so origin comparisons are exact instead of prefix-based.
 */
export function normalizeOrigin(raw: string): string {
  try {
    return new URL(raw).origin.toLowerCase()
  } catch {
    return raw.trim().replace(/\/+$/, "").toLowerCase()
  }
}

/**
 * Same-origin check for state-changing upload endpoints (CSRF defense).
 *
 * The request is allowed when the browser-supplied `Origin` header matches
 * EITHER the canonical app URL (NEXT_PUBLIC_APP_URL) OR the origin the
 * request was actually sent to (`new URL(request.url).origin`). The second
 * rule is what makes uploads work in local development and behind tunnels /
 * preview deployments: the app may be served from http://localhost:3000,
 * 127.0.0.1, an ngrok/cloudflared URL, or a Vercel preview domain, none of
 * which necessarily equal NEXT_PUBLIC_APP_URL. It stays safe because a
 * cross-site attacker page (evil.com) posting to the API carries Origin
 * `https://evil.com`, which matches neither the canonical URL nor the host
 * the request was addressed to.
 *
 * Requests without an Origin header (curl, server-to-server) are allowed;
 * browsers always send Origin on cross-origin and same-origin POSTs.
 * Localhost variants are additionally whitelisted in development so a
 * `NEXT_PUBLIC_APP_URL` pointing at a tunnel never blocks local work.
 */
export function isAllowedUploadOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true

  const allowed = new Set<string>()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) allowed.add(normalizeOrigin(appUrl))

  allowed.add(normalizeOrigin(requestUrl))

  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000")
    allowed.add("http://127.0.0.1:3000")
  }

  return allowed.has(normalizeOrigin(origin))
}

/**
 * Detects a PDF from its magic bytes (%PDF-). Returns true only for real
 * PDFs — the client-supplied Content-Type is never trusted on its own.
 */
export function sniffPdf(bytes: Uint8Array): boolean {
  // %PDF- at offset 0
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  )
}

/**
 * Detects the real file kind from magic bytes. Returns a validated MIME type
 * for images and PDFs, or null when the bytes match nothing known.
 */
export async function sniffFileType(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (sniffPdf(head)) return "application/pdf"
  return sniffImageTypeFromBytes(head)
}

export function sniffImageTypeFromBytes(head: Uint8Array): string | null {
  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg"
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png"
  // GIF87a / GIF89a
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return "image/gif"
  // WebP: "RIFF" .... "WEBP"
  if (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return "image/webp"
  }
  // ISOBMFF container (AVIF, HEIC, HEIF): "...." "ftyp" then brand at offset 8-11
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const b8 = String.fromCharCode(head[8], head[9], head[10], head[11])
    // AVIF brands
    if (b8 === "avif" || b8 === "avis") return "image/avif"
    // HEIC/HEIF brands — covers iPhones, Android HEIF, and generic HEIF containers
    if (
      b8 === "heic" || b8 === "heix" || b8 === "hevc" ||
      b8 === "mif1" || b8 === "msf1" || b8 === "hevx"
    ) {
      return "image/heic"
    }
  }
  return null
}

/**
 * Detects the real image type from magic bytes instead of trusting the
 * client-supplied Content-Type (which can be spoofed to smuggle non-image
 * bytes through). Returns null when the bytes don't look like a known image.
 */
export async function sniffImageType(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  return sniffImageTypeFromBytes(head)
}
