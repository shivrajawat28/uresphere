export const MAX_FILE_BYTES = 5 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

/**
 * Detects the real image type from magic bytes instead of trusting the
 * client-supplied Content-Type (which can be spoofed to smuggle non-image
 * bytes through). Returns null when the bytes don't look like a known image.
 */
export async function sniffImageType(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
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
  return null
}
