/**
 * Canonical site-URL resolution.
 *
 * Every public URL the app emits (sitemap.xml, robots.txt, metadataBase,
 * canonical/OG tags) must use the production origin in production:
 *
 *   https://uresphere.in
 *
 * The root cause of the earlier sitemap bug was a chain of fallbacks that
 * ended in a `vercel.app` preview URL (or `http://localhost:3000`) whenever
 * `NEXT_PUBLIC_APP_URL` was empty on Vercel. This helper:
 *
 *   1. Uses `NEXT_PUBLIC_APP_URL` when it is set to a real https/http origin
 *      (the intended production value is `https://uresphere.in`).
 *   2. Otherwise uses Vercel's injected `VERCEL_PROJECT_PRODUCTION_URL`
 *      (always the production domain, e.g. `uresphere.in` — never the
 *      per-deployment `*.vercel.app` URL).
 *   3. Falls back to `http://localhost:3000` outside production.
 *   4. In production with no config at all, defaults to the known production
 *      domain — a sitemap must never contain `vercel.app` or `localhost`
 *      URLs, so the last resort is the real domain, not a preview host.
 *
 * `vercel.app` origins are deliberately rejected in step 1 even if someone
 * sets NEXT_PUBLIC_APP_URL to a preview URL, so preview deploys can never
 * leak into canonical output.
 */

const PRODUCTION_DOMAIN = "uresphere.in"

/** Returns a normalized `scheme://host[:port]` or null for invalid/unsupported input. */
export function cleanOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin.replace(/\/+$/, "")
  } catch {
    return null
  }
}

function isPreviewHost(origin: string): boolean {
  return origin.includes(".vercel.app") || origin.includes(".vercel.app/")
}

function isLocalhostHost(origin: string): boolean {
  try {
    const host = new URL(origin).hostname
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0"
  } catch {
    return false
  }
}

export function getSiteUrl(): string {
  const inProduction = process.env.NODE_ENV === "production"

  // 1. Explicit override. Reject preview hosts (and localhost in production)
  //    so a mis-set env var can't poison production sitemap/canonical output.
  const explicit = cleanOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (explicit && !isPreviewHost(explicit) && !(inProduction && isLocalhostHost(explicit))) return explicit

  // 2. Vercel injects the production domain automatically. It is a bare
  //    hostname (e.g. "uresphere.in"), never a deployment URL.
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (productionUrl) {
    const host = productionUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "").trim()
    if (host && !host.includes(".vercel.app")) return `https://${host}`
  }

  // 3. Local development.
  if (!inProduction) return "http://localhost:3000"

  // 4. Production safety net: never emit localhost/preview URLs.
  return `https://${PRODUCTION_DOMAIN}`
}

/** Convenience for Next.js `metadataBase` (needs a URL instance). */
export function getMetadataBase(): URL {
  return new URL(getSiteUrl())
}
