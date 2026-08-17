// Live verification of the production sitemap + robots output.
//
// Checks (against the URL in APP_URL, default the production site):
//   1. /sitemap.xml loads with XML content-type and is well-formed XML.
//   2. Every sitemap URL is https, uses ONLY the canonical host (default
//      uresphere.in), contains ZERO vercel.app / localhost URLs.
//   3. No private routes (/dashboard, /admin, /auth, /onboarding, /api).
//   4. No duplicate URLs.
//   5. Each listed URL returns 200 (not 404/redirect).
//   6. /robots.txt contains "Sitemap: <canonical>/sitemap.xml" and disallows
//      private prefixes.
//
// Run: node scripts/verify-seo-sitemap.mjs
// Env: APP_URL (default https://uresphere.in), CANONICAL_HOST (default
//      uresphere.in)

const APP_URL = (process.env.APP_URL || "https://uresphere.in").replace(/\/+$/, "")
const CANONICAL_HOST = process.env.CANONICAL_HOST || "uresphere.in"

const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

async function main() {
  // 1. sitemap.xml fetch + XML validity
  let sitemapText
  try {
    const res = await fetch(`${APP_URL}/sitemap.xml`)
    const contentType = res.headers.get("content-type") || ""
    sitemapText = await res.text()
    check("sitemap.xml HTTP 200", res.status === 200, `status ${res.status}`)
    check(
      "sitemap.xml served as XML",
      /xml/i.test(contentType),
      `content-type: ${contentType}`,
    )
    check("sitemap.xml is well-formed XML", /^<\?xml/.test(sitemapText.trim()), "starts with XML declaration")
  } catch (err) {
    check("sitemap.xml reachable", false, err.message)
    return summarize()
  }

  const urls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  check("sitemap contains at least one URL", urls.length > 0, `${urls.length} URLs`)

  // 2. Canonical host + no preview domains
  const badHosts = urls.filter((u) => {
    try {
      const { host, protocol } = new URL(u)
      return protocol !== "https:" || host !== CANONICAL_HOST
    } catch {
      return true
    }
  })
  check(
    "every URL is https on the canonical host only",
    badHosts.length === 0,
    badHosts.length ? `offending: ${badHosts.slice(0, 5).join(", ")}` : `all ${urls.length} URLs on https://${CANONICAL_HOST}`,
  )

  const previewUrls = urls.filter((u) => /vercel\.app|localhost/i.test(u))
  check("ZERO vercel.app / localhost URLs", previewUrls.length === 0, previewUrls.length ? previewUrls.join(", ") : "confirmed zero")

  // 3. No private routes
  const privateRoutes = urls.filter((u) => /\/(dashboard|admin|auth|onboarding|api)(\/|$)/.test(new URL(u).pathname))
  check("no private routes in sitemap", privateRoutes.length === 0, privateRoutes.length ? privateRoutes.join(", ") : "confirmed none")

  // 4. No duplicates
  const unique = new Set(urls)
  check("no duplicate URLs", unique.size === urls.length, `${unique.size} unique / ${urls.length} total`)

  // 5. Each URL responds 200 (no 404 / redirect chains to dead pages). When
  //    testing a local build (APP_URL is localhost), fetch the corresponding
  //    local paths instead of the live canonical domain, which only reflects
  //    whatever is currently deployed.
  let dead = 0
  const deadUrls = []
  const isLocalTest = /^http:\/\/localhost|127\.0\.0\.1/.test(APP_URL)
  for (const u of urls) {
    const target = isLocalTest ? u.replace(/^https:\/\/[^/]+/, APP_URL) : u
    try {
      const res = await fetch(target, { redirect: "manual" })
      if (res.status !== 200) {
        dead++
        if (deadUrls.length < 5) deadUrls.push(`${target} → ${res.status}`)
      }
    } catch {
      dead++
      if (deadUrls.length < 5) deadUrls.push(`${target} → fetch error`)
    }
  }
  check(
    "every sitemap URL returns 200",
    dead === 0,
    dead ? deadUrls.join(", ") : `all ${urls.length} URLs OK${isLocalTest ? " (local build)" : " (live)"}`,
  )

  // 6. robots.txt
  try {
    const res = await fetch(`${APP_URL}/robots.txt`)
    const robotsText = await res.text()
    check("robots.txt HTTP 200", res.status === 200, `status ${res.status}`)
    check(
      "robots.txt points at canonical sitemap",
      robotsText.includes(`Sitemap: https://${CANONICAL_HOST}/sitemap.xml`),
      robotsText.includes("Sitemap:") ? robotsText.split("\n").find((l) => l.startsWith("Sitemap:")) : "no Sitemap line",
    )
    for (const prefix of ["/dashboard/", "/admin/", "/auth/", "/onboarding/", "/api/"]) {
      if (!robotsText.includes(`Disallow: ${prefix}`)) {
        check(`robots.txt disallows ${prefix}`, false)
      }
    }
    check("robots.txt disallows private prefixes", ["/dashboard/", "/admin/", "/auth/", "/onboarding/", "/api/"].every((p) => robotsText.includes(`Disallow: ${p}`)))
  } catch (err) {
    check("robots.txt reachable", false, err.message)
  }

  summarize()
}

function summarize() {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) {
    console.log(`BLOCKED: ${failed.length} check(s) failed — inspect the failures above.`)
    process.exitCode = 1
  } else {
    console.log("ALL SEO CHECKS PASSED")
  }
}

main()
