# Uresphere — Implementation Audit

> Generated during takeover of the partially-built v0 project. Statuses:
> **COMPLETE** · **PARTIAL** · **UI-ONLY** · **MOCK** · **BROKEN** · **MISSING**

## Stack (verified from source)

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16.3 (App Router) | `next.config.mjs` — TS build errors currently **ignored** (`ignoreBuildErrors: true`) |
| Language | TypeScript 5.7, strict mode | 1 `as any` + a few untyped joins |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | Dark-only theme; light mode missing |
| UI | shadcn/ui (base-nova style) on `@base-ui/react` | Button, Card, Dialog, Input, Select, Tabs, etc. |
| Backend | Supabase (auth, Postgres, Realtime) | **No schema/migrations exist in the repo** |
| Storage | Vercel Blob (`@vercel/blob`) | Marketplace listing images |
| Fonts | `next/font/google` — Fraunces + Geist | |
| Analytics | `@vercel/analytics` (prod only) | |
| Package manager | pnpm (`pnpm-lock.yaml`) | |

**Critical gap:** the application references tables/functions (`profiles`, `spheres`,
`user_spheres`, `chat_messages`, `marketplace_listings`, `reports`, RPC
`regenerate_own_handle`, Realtime publication on `chat_messages`) but **no SQL schema,
migration, RLS policy, or trigger exists anywhere in the repository**. The app cannot
run against a fresh Supabase project without first creating the schema.

---

## Feature audit

| Feature | Status | Existing Implementation | Missing | Bugs | Priority |
|---------|--------|-------------------------|---------|------|----------|
| Landing page | PARTIAL | Hero, How it works, Sphere explainer, Features, Trust, CTA + nav (dark, static) | Light theme, animated campus visualization, motion/parallax, reduced-motion support, SEO | Generic static hero; hardcoded dark theme | HIGH |
| Registration | PARTIAL | 3-step form + `signUpAction` (validates name/phone/college/email/password) | Backend trigger to create profile + sphere + user_spheres + handle (SQL missing) | `console.log` of raw errors; no server-side rate limit | HIGH |
| Login | COMPLETE | `loginAction` + login page + `next` redirect | Password reset flow | — | HIGH |
| Logout | COMPLETE | `logoutAction` (server action) | — | — | LOW |
| Password reset | MISSING | — | Forgot-password page, reset page, callback handling | — | MED |
| Sphere resolution | PARTIAL | `college_input` captured in signup metadata | Deterministic normalization + find/create Sphere SQL (missing) | Fuzzy matching not used (good); normalization undefined | HIGH |
| Anonymous identity | PARTIAL | `anonymous_handle` on `user_spheres`; regenerate RPC referenced | SQL for handle generation + uniqueness | `regenerate_own_handle` RPC missing | HIGH |
| Dashboard | PARTIAL | Overview with member/listing counts, chat preview, marketplace CTA | Groups/promotions/academic/clubs/events links; realtime data | Counts are cheap head-queries (ok) | MED |
| Profile | PARTIAL | `/dashboard/settings` shows handle + private verified details | Public profile page; avatar upload | — | MED |
| Social — Live Chat | PARTIAL | `chat-room.tsx`: realtime insert/update, handle cache, rate limit, report, admin delete, pagination limited to 200 | Infinite pagination/older history; message-level moderation UI | **Delete has no ownership/admin check** (IDOR); send doesn't verify membership server-side | HIGH |
| Social — Groups | MISSING | — | groups, group_members, invites, group chat | — | MED |
| Promotions | MISSING | — | URL submission, review/approve/reject, validation | — | MED |
| Academic | MISSING | — | subjects, resources, calendar, admin upload | — | MED |
| Clubs | MISSING | — | clubs CRUD, gallery, members | — | MED |
| Events | MISSING | — | events list/detail, upcoming/past | — | MED |
| Marketplace | PARTIAL | Listing CRUD, image upload (Blob), search/filter, report, mark sold | Detail page; ₹ pricing (currently USD); spec categories differ | **update/delete actions lack ownership check** (IDOR); upload trusts content-type header only | HIGH |
| Global Listings | MISSING | — | Global (non-sphere) listings, admin CRUD | — | MED |
| Premium | MISSING | — | Premium page (coming soon) | — | LOW |
| Admin Panel | MISSING | Nav link exists when role=admin, but `/admin` route absent | Full admin panel (users, spheres, chat, groups, promotions, academic, clubs, events, marketplace, global listings, reports, audit logs, settings) | — | MED |
| Moderation | PARTIAL | Reports table insert from chat + listings | Admin review/resolve/reject UI; moderation actions | No server-side membership check on report | MED |
| Notifications | MISSING | — | Notifications for invites, moderation, events | — | LOW |
| Search | PARTIAL | Marketplace client-side filter (title/description/category) | Debounce, search across clubs/events/academic/global listings | — | MED |
| Storage | PARTIAL | Vercel Blob upload route (auth-gated, 5MB, type allowlist) | Magic-byte validation; storage for academic/clubs/events images | Content-type is client-supplied | MED |
| Realtime | PARTIAL | Chat channel with INSERT/UPDATE filters | Group chat channels; presence | Channel relies on RLS for isolation | HIGH |
| RLS | MISSING | — | **All** row-level security policies | — | CRITICAL |
| Security | PARTIAL | No secrets in code; generic auth errors; secure cookies in prod | Sphere-isolation enforcement in server actions; ownership checks; CSRF review; rate limiting | See Bugs column | CRITICAL |
| Responsive UI | PARTIAL | Mobile nav on landing + dashboard | Mobile chat/forms check; tablet layouts | — | MED |
| SEO | MISSING | Layout metadata only | Per-page metadata, OG/Twitter, sitemap, robots, noindex on auth pages | — | MED |
| Testing | MISSING | No tests, no test script | Unit/integration tests | — | MED |
| Deployment | MISSING | — | `.env.example`, README, deployment instructions | — | HIGH |

---

## Phase 0 signal scan (search results)

| Pattern | Count | Notes |
|---------|-------|-------|
| `as any` | 1 | `lib/data/session.ts` sphere join |
| `console.log` | 12 | Server actions logging raw errors (acceptable but noisy; some log sensitive-ish info) |
| `@ts-ignore` / `eslint-disable` | 0 | Clean |
| `throw new Error` | 1 | Client-side upload failure handling (fine) |
| `mock` / `dummy` | 0 | No fake data in code (v0-generated SQL/DB was the "mock" layer) |
| `localStorage` / `sessionStorage` | 0 | Clean |
| `any` types in app code | 1 | Above |
| TODO/FIXME | 0 | Clean |

---

## Categorized issues

### Dependency / config
1. No `.env.example`; app requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BLOB_READ_WRITE_TOKEN` (+ optional `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`).
2. `next.config.mjs` sets `typescript.ignoreBuildErrors: true` — hides real type errors from CI.
3. No README, no test script, no lint config file visible (`eslint .` needs config — verify).
4. `next-themes` installed but unused; app hardcodes dark mode.

### TypeScript
5. `(membership as any).spheres?.name` — untyped join in `lib/data/session.ts`.
6. Several action return types are implicit unions of `{error}` / `undefined` — tighten once touched.

### Database
7. **Entire schema missing** — tables, RLS, triggers (profile/sphere/handle provisioning on signup), RPC `regenerate_own_handle`, Realtime publication.
8. Marketplace categories/conditions don't match product spec (Books/Calculators/Cycles/Electronics/College supplies/Other; spec has no USD).
9. Pricing modeled in cents + displayed USD — product is INR (₹).

### Security
10. `deleteListingAction` / `updateListingStatusAction` — **no ownership/sphere check** (IDOR: any user can delete or mark any listing sold).
11. `deleteMessageAction` — **no author/admin/sphere check** (any user can soft-delete any message).
12. `sendMessageAction` / `reportMessageAction` / `reportListingAction` — rely on RLS alone; server should verify sphere membership.
13. Upload route trusts `file.type` (content sniffing possible); no sphere membership check (minor, images are public).
14. Suspend status (`account_status`) is stored but never enforced.
15. Admin role is stored client-readable; all authorization must be enforced in RLS + server actions.

### UI / UX
16. Light theme entirely missing (`:root` is dark; `html` forced `dark`).
17. Landing hero is static text + dot grid — misses the required animated campus visualization.
18. Marketplace shows USD and non-spec categories.
19. No loading/error/empty states on some pages (dashboard counts fine; chat initial load has none).

### Missing product areas (all from spec)
Groups · Promotions · Academic · Clubs · Events · Global Listings · Premium · Admin panel ·
Moderation UI · Notifications · Search beyond marketplace · Password reset · Profile page ·
Audit logs · Ads foundation · Monetization architecture.

---

## What is production-ready today
- Supabase session proxy middleware (`lib/supabase/proxy.ts`) — correct pattern.
- Generic, non-enumerable auth error messages.
- Chat UI with IME-safe Enter handling, handle caching, per-user rate limiting.
- shadcn component set on Base UI (accessible primitives).
- Security headers in `next.config.mjs`.

## Phase 1 command results (after fixes)

| Check | Before | After |
|-------|--------|-------|
| `pnpm install` | Timeouts on npm registry | ✅ installed (retried with longer fetch timeout) |
| `npx tsc --noEmit` | 19 errors (13 `asChild` on Base UI, Select typing, chat handle narrowing) | ✅ 0 errors |
| `npm run lint` | **Command broken** — eslint not installed, no config | ✅ 0 errors, 0 warnings (added eslint + flat config) |
| `npm run build` | ❌ Failed — `useSearchParams` without Suspense; `middleware` deprecated; TS suppression hid errors | ✅ 24 routes, type validation on |

Root causes fixed:
- `asChild` doesn't exist on Base UI — our shadcn wrappers now translate `asChild` → `render`.
- `next.config` had `typescript.ignoreBuildErrors: true` — removed.
- `middleware.ts` → `proxy.ts` (Next 16 convention).
- Login page `useSearchParams` wrapped in `<Suspense>`.

## Changes made during takeover

- **Database**: full schema + RLS + provisioning trigger + RPC + realtime publication in `supabase/migrations/0001_initial_schema.sql` (was entirely missing).
- **Security**: fixed IDORs (listing update/delete, message delete, report spoofing); server actions now verify Sphere membership and ownership behind RLS; suspended accounts are blocked in `requireMember`.
- **Branding**: Sphere → Uresphere; hero copy + CTAs per spec.
- **Theme**: light (primary) + dark + system via next-themes; cyan/aqua on warm off-white.
- **Landing**: animated campus-network hero (SVG graph, orbits, particles, parallax, reduced-motion support).
- **Features added**: Groups, Promotions, Academic, Clubs, Events, Global Listings, Premium, Notifications, Admin panel (users/reports/promotions/listings/events/clubs/academic/audit), password reset, suspended page.
- **Marketplace**: spec categories + INR pricing.
- **Docs**: README, `.env.example`, audit doc.

## Remaining external requirements
- Apply the migration to a real Supabase project and set env vars.
- Configure Supabase Auth URL settings (site URL + redirect URLs).
- Automated test suite (none exists in the project yet).
