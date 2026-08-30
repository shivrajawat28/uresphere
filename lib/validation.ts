/**
 * Pure validation helpers shared by server actions. Kept dependency-free so
 * they can be unit-tested without a Supabase or Next.js runtime.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Deterministic college slug for the directory. Mirrors the SQL
 * `public.normalize_college()` helper exactly so the app and the signup
 * trigger agree on what "the same campus" means: lowercase, whitespace
 * collapsed, punctuation stripped, common institution-type suffixes and
 * filler words dropped, then slugified. Exact-match only — never fuzzy, so
 * unrelated colleges can't collide into one Sphere.
 */
export function normalizeCollegeForSlug(input: string): string {
  let v = input.toLowerCase()
  v = v.replace(/\s+/g, " ").trim()
  v = v.replace(/[^a-z0-9 ]+/g, " ")
  v = v.replace(
    /\s*(group of institutions|engineering college|institute of technology|institute of engineering|group of colleges|university|institute|colleges?|academy|school)\s*$/,
    "",
  )
  v = v.replace(/\b(the|of|and|at|in|for)\b/g, " ")
  v = v.replace(/[^a-z0-9]+/g, "-")
  v = v.replace(/-+/g, "-")
  return v.replace(/^-|-$/g, "")
}

/**
 * Splits a raw query / name into match tokens, tolerantly:
 * - lowercase, whitespace collapsed, punctuation separated;
 * - hyphenated words split into their parts ("ITS-Engineering" → its, engineering);
 * - dotted abbreviations collapse into a single token ("I.T.S" → its).
 */
function searchTokens(input: string): string[] {
  const pieces = input
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const tokens: string[] = []
  for (const piece of pieces) {
    const parts = piece.split(".").filter(Boolean)
    if (parts.length > 1 && parts.every((p) => p.length === 1)) {
      // "I.T.S" → "its" — an abbreviation, not separate words.
      tokens.push(parts.join(""))
    } else {
      // "ITS.Engineering" → its, engineering
      tokens.push(...parts)
    }
  }
  return tokens
}

/**
 * Normalizes a college name, alias, or free-text search query for tolerant
 * matching: lowercases, collapses whitespace, and is punctuation tolerant —
 * "I.T.S", "I.T.S." and "ITS" all normalize to "its".
 */
export function normalizeSearchTerm(input: string): string {
  return searchTokens(input).join(" ")
}

function tokensOf(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean)
}

/**
 * Scores one candidate string (a college field or alias) against the query
 * tokens. Returns 0 when there is no match. Every query token must be a
 * prefix of a candidate token, in order — so "ITS College" matches
 * "ITS Engineering College" (tokens: its, college), but "College ITS" does
 * not. Exact tokens and whole-string prefixes score higher.
 */
function tokenMatchScore(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || queryTokens.length > candidateTokens.length) return 0

  let ci = 0
  let score = 0
  for (const qt of queryTokens) {
    while (ci < candidateTokens.length && !candidateTokens[ci].startsWith(qt)) ci++
    if (ci >= candidateTokens.length) return 0
    score += candidateTokens[ci] === qt ? 4 : 2
    ci++
  }

  const joinedQuery = queryTokens.join(" ")
  const joinedCandidate = candidateTokens.join(" ")
  if (joinedCandidate === joinedQuery) score += 20
  else if (joinedCandidate.startsWith(joinedQuery)) score += 8
  return score
}

export type CollegeLike = {
  name: string
  short_name?: string
  slug?: string
}

/**
 * Scores how well a directory college matches a free-text query. Returns 0
 * when there is no match. Matching is case / whitespace / punctuation
 * insensitive and alias-aware. Higher scores are better matches.
 */
export function collegeMatchScore(college: CollegeLike, aliases: string[], query: string): number {
  const queryTokens = tokensOf(normalizeSearchTerm(query))
  if (queryTokens.length === 0) return 0

  const candidates: { text: string; weight: number }[] = [
    { text: college.name, weight: 100 },
    { text: college.short_name ?? "", weight: 90 },
    { text: college.slug ?? "", weight: 80 },
    ...aliases.map((alias) => ({ text: alias, weight: 85 })),
  ]

  let best = 0
  for (const { text, weight } of candidates) {
    const candidateTokens = tokensOf(normalizeSearchTerm(text))
    if (candidateTokens.length === 0) continue
    const score = tokenMatchScore(queryTokens, candidateTokens)
    if (score > 0) best = Math.max(best, weight + score)
  }
  return best
}

export type ScopeFilter = {
  degree?: string
  year?: string
  branch?: string
  /** academic_manager: one entry per assigned academic section. */
  sections?: ScopeFilter[]
}

/**
 * Whether an assignment scope (a mask) covers a target academic scope.
 * A manager with `{ degree: "btech", year: "1", branch: "cse" }` manages ONLY
 * B.Tech 1st-year CSE content: every field the mask defines must match the
 * target (case-insensitive); fields the mask leaves blank are unrestricted.
 * academic_manager scopes may also carry a `sections` array (one entry per
 * assigned section, e.g. First Year + Second Year) — the target is covered
 * when ANY section covers it, with the legacy scalar fields kept as the
 * first section for backward compatibility. Used by the admin actions so a
 * scoped academic manager can never modify content outside their assigned
 * degree/year/branch.
 */
export function scopeCovers(assignmentScope: ScopeFilter | null | undefined, target: ScopeFilter): boolean {
  if (!assignmentScope) return false
  const coversScalar = (mask: ScopeFilter | null | undefined, t: ScopeFilter): boolean => {
    if (!mask) return false
    const norm = (v: string | undefined) => (v ?? "").trim().toLowerCase()
    if (mask.degree && norm(mask.degree) !== norm(t.degree)) return false
    if (mask.year && norm(mask.year) !== norm(t.year)) return false
    if (mask.branch && norm(mask.branch) !== norm(t.branch)) return false
    return true
  }
  const sections = Array.isArray((assignmentScope as { sections?: unknown }).sections)
    ? ((assignmentScope as { sections: unknown[] }).sections as ScopeFilter[])
    : null
  if (sections && sections.length > 0) {
    return sections.some((s) => coversScalar(s, target))
  }
  return coversScalar(assignmentScope, target)
}

export type CollegeDirectoryEntry = {
  id: string
  name: string
  short_name?: string
  slug?: string
}

/**
 * Deterministically resolves a free-text query to a single directory entry
 * (used by tests and the legacy free-text signup path). Returns null when
 * nothing matches. Ties break alphabetically so results are stable and
 * duplicates are never produced for spelling / capitalisation / punctuation
 * variations of the same college.
 */
export function resolveCollegeMatch<T extends CollegeDirectoryEntry>(
  colleges: T[],
  aliasesByCollegeId: Record<string, string[]>,
  query: string,
): T | null {
  const scored = colleges
    .map((college) => ({ college, score: collegeMatchScore(college, aliasesByCollegeId[college.id] ?? [], query) }))
    .filter((m) => m.score > 0)
  if (scored.length === 0) return null
  scored.sort((a, b) => b.score - a.score || a.college.name.localeCompare(b.college.name))
  return scored[0].college
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Normalizes an Indian phone number to E.164 (+91XXXXXXXXXX) or null.
 * Accepts 10 digits (starting 6–9), with optional 91/0/091 prefixes.
 * Shared by the signup page (client) and the server actions (server).
 */
export function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return `+${digits}`
  if (digits.length === 13 && digits.startsWith("091") && /^[6-9]/.test(digits.slice(3))) return `+91${digits.slice(3)}`
  return null
}

export type SignupInput = {
  realName: string
  phone: string
  college: string
  email: string
  password: string
  confirmPassword: string
}

/** Returns a user-friendly error message, or null when valid. */
export function validateSignup(input: SignupInput): string | null {
  if (!input.realName || input.realName.trim().length < 2) {
    return "Please enter your full name."
  }
  if (!input.phone || input.phone.trim().length < 7) {
    return "Please enter a valid phone number."
  }
  if (!input.college || input.college.trim().length < 2) {
    return "Please enter your college or university."
  }
  if (!isValidEmail(input.email)) {
    return "Please enter a valid email address."
  }
  if (!input.password || input.password.length < 8) {
    return "Password must be at least 8 characters."
  }
  if (input.password !== input.confirmPassword) {
    return "Passwords don't match."
  }
  return null
}

export function validateLogin(email: string, password: string): string | null {
  if (!email.trim() || !password) return "Please enter your email and password."
  return null
}

/**
 * Validates a promotion URL. Returns the normalized URL string when safe,
 * or null when it should be rejected. Blocks non-http(s) schemes, hosts
 * without a dot (e.g. localhost/IP literals used for SSRF-style abuse is
 * acceptable in MVP but we still require a real hostname), and any URL
 * carrying embedded credentials.
 */
export function validatePromotionUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (!url.hostname || url.hostname.includes(" ")) return null
  if (url.username || url.password) return null
  // Must be a real domain: no single-label hosts (localhost, intranet) and no
  // IP literals (pointless to other students, and SSRF-prone for admins).
  if (url.hostname.length < 4 || !url.hostname.includes(".")) return null
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) return null
  return url.toString()
}

export function validateMessageBody(body: string, maxLength = 1000): string | null {
  const trimmed = body.trim()
  if (!trimmed) return "Message can't be empty."
  if (trimmed.length > maxLength) return `Message is too long (max ${maxLength} characters).`
  return null
}

/** Maps raw Supabase auth error messages to safe, non-enumerable text. */
export function mapAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before signing in. Check your inbox for the verification link."
  }
  if (lower.includes("already registered") || lower.includes("user already exists")) {
    return "We couldn't create your account. Please try signing in instead."
  }
  if (lower.includes("password")) {
    return "Your password doesn't meet the minimum requirements (at least 8 characters)."
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again."
  }
  return "Invalid email or password."
}

/**
 * Validates and sanitizes a relative redirect path, preventing open redirect vulnerabilities.
 * Only allows relative paths on the same origin (e.g. "/dashboard").
 * Rejects protocol-relative URLs ("//evil.com"), backslashes ("/\\evil.com"), and schemes ("https://evil.com").
 */
export function sanitizeRedirectPath(path: string | null | undefined, fallback = "/dashboard"): string {
  if (!path) return fallback
  const trimmed = path.trim()
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("://") ||
    trimmed.includes("\r") ||
    trimmed.includes("\n")
  ) {
    return fallback
  }
  return trimmed
}

