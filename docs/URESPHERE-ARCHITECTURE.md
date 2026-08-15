# UreSphere Architecture

This document describes the architecture of the UreSphere web application: how
the frontend is organized, how data flows, how authorization is modeled, and how
the Supabase backend maps onto the UI.

## 1. Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript (strict)
- **Styling**: Tailwind CSS v4 + shadcn/ui components built on Base UI
- **Animation**: Motion (Framer Motion), respecting `prefers-reduced-motion`
- **Theming**: `next-themes` — Light (default), Dark, System
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **File uploads**: Vercel Blob (authenticated, server-side, 5 MB cap)
- **Testing**: Vitest (unit tests for validation + server actions with mocks)

## 2. Route map

### Public
| Route | Purpose |
|---|---|
| `/` | Landing — hero, how it works, sphere, features, trust, upcoming plans |
| `/about` | About, team, work-with-us form, advertise modal |
| `/auth/login` | Sign in (email or phone + password) |
| `/auth/sign-up` | Multi-step registration with college-directory autocomplete |
| `/auth/forgot-password`, `/auth/reset-password` | Password reset |
| `/auth/suspended` | Suspended account state |
| `/auth/sign-up-success` | Post-registration confirmation |
| `/request-college` | Public "Request your college" form |
| `/onboarding/pending` | Shown when provisioning hasn't finished |

### Authenticated (`/dashboard/*`)
| Route | Purpose |
|---|---|
| `/dashboard` | Sphere overview + quick links |
| `/dashboard/chat` | Sphere live discussion (realtime, text-only) |
| `/dashboard/groups` | Groups — invite by handle, accept/reject, group chat |
| `/dashboard/promotions` | Promotions — submit URL, manual payment (QR/UTR) flow |
| `/dashboard/academic` | Degree → Year → Branch → Subject → Units hierarchy |
| `/dashboard/clubs` | Sphere clubs (admin-created) |
| `/dashboard/events` | Upcoming/past events, RSVP, ask-a-question |
| `/dashboard/marketplace` | UreSphere Shop + student marketplace (buy-now orders) |
| `/dashboard/global-listings` | Global (non-Sphere) business listings |
| `/dashboard/premium` | Premium — Coming Soon |
| `/dashboard/notifications` | Notification center (read/unread, mark all read) |
| `/dashboard/settings` | Settings (theme, notification prefs, password, account) |
| `/dashboard/profile` | Own profile — handle, sphere, private details |

### Admin (`/admin/*`) — two-level, Sphere-scoped
| Route | Purpose |
|---|---|
| `/admin` | **Level 1 — platform / Sphere selector.** Cards for every accessible Sphere with member/club/event/listing counts (`admin_sphere_overview()` RPC). Super admins also get the platform tabs: Colleges, College requests, Platform plans, Platform team, Work with us, Advertising, platform-level Audit log. |
| `/admin/spheres/[sphereId]` | **Level 2 — Sphere administration.** Breadcrumb back to all Spheres, overview stats, and Sphere-scoped tabs: Users, Social (reports), Academic, Clubs, Events, Marketplace (orders), Listings, Promotions, Audit log. Every query is filtered by `sphere_id`; the page gate (`requireSphereAdmin`) validates the URL Sphere against the caller's permissions server-side. |
| `/admin/spheres/[sphereId]/roles` | Role management scoped to the Sphere: member search, role selector, degree/year/branch scope, permission picker, create/edit/revoke. Only Sphere administrators / super admins may enter. |

Sphere-scoped data is never exposed at Level 1, and Level 2 never mixes data
across Spheres — a Sphere admin who hand-edits a `sphereId` gets redirected
back to `/admin`.

## 3. Layering

```
┌────────────────────────────────────────────────────────┐
│  UI  — app/**, components/** (React Server/Client)     │
├────────────────────────────────────────────────────────┤
│  Server Actions — lib/actions/*.ts ("use server")      │
│  ── the repository layer: every mutation + read the     │
│     UI needs, auth-checked, ownership-checked          │
├────────────────────────────────────────────────────────┤
│  Data access — lib/data/session.ts (requireMember/     │
│  requireAdmin), lib/supabase/server.ts + client.ts     │
├────────────────────────────────────────────────────────┤
│  Pure logic — lib/validation.ts (dependency-free,      │
│  unit-tested: URL safety, normalization, validation)   │
├────────────────────────────────────────────────────────┤
│  Database — supabase/migrations/*.sql                  │
│  Tables + RLS + triggers + functions (Supabase)        │
└────────────────────────────────────────────────────────┘
```

**Mock vs. real data.** UreSphere has a *real* Supabase layer (migrations,
RLS, server actions), verified against a live PostgreSQL instance in
`scripts/verify-rls.sql`. There is deliberately **no parallel in-memory mock
layer**: the server actions in `lib/actions/*` *are* the repositories, and the
UI never touches the database directly — it only calls actions. That keeps the
UI backend-agnostic: swapping the action implementations (e.g. to a REST API)
requires no UI changes.

### Repository → action mapping

| Domain | Action module |
|---|---|
| Auth | `lib/auth/actions.ts` |
| Session | `lib/data/session.ts` |
| Chat / social | `lib/actions/chat.ts` |
| Groups | `lib/actions/groups.ts` |
| Promotions | `lib/actions/promotions.ts` |
| Marketplace | `lib/actions/marketplace.ts` |
| Events | `lib/actions/events.ts` |
| Clubs | `lib/actions/clubs.ts` |
| Academic | `lib/actions/academic.ts` |
| Notifications | `lib/actions/notifications.ts` |
| Admin (sphere-scoped gates + moderation) | `lib/actions/admin.ts` (`requireSphereAction`) |
| Platform (colleges, plans, team, work-with-us, advertising, orders, shop, RBAC) | `lib/actions/platform.ts` |
| Access gates | `lib/data/session.ts` (`requireAdminAccess`, `requireSphereAdmin`, `canAccessSphere`, `isSphereAdministrator`) |
| Role metadata | `lib/roles.ts` (shared by actions + roles UI) |

## 4. Data model (summary)

Core (migration 0001):
- `profiles` — real identity (private), `role`, `account_status`
- `spheres` — one per college (`slug`, `name`)
- `user_spheres` — membership + `anonymous_handle` (public identity)
- `chat_messages`, `group_invites`, `group_members`, `group_messages`
- `promotions` (+ UTR/payment fields in 0002)
- `academic_subjects`, `academic_resources`, `academic_calendar_events`
- `clubs`, `club_members`, `club_gallery`, `events`, `event_rsvps`
- `marketplace_listings`, `listing_images`
- `global_listings`, `reports`, `notifications`, `audit_logs`
- `platform_config` (single-row JSON config)

Platform (migration 0002):
- `colleges` + `college_aliases` + `college_requests` — admin-managed directory
- `platform_plans`, `plan_feedback` — "Help shape what's coming next"
- `team_members`, `work_with_us_applications`, `advertising_config`
- `event_questions` — event Q&A
- `shop_products` — UreSphere Shop
- `marketplace_orders` — buy-now requests (fee = 5% stored, no gateway)
- `role_assignments` — RBAC (role + permission set + scope)

## 5. Sphere isolation

Two layers enforce it (defense in depth):

1. **RLS (database)** — every Sphere-scoped table has policies that call
   `public.is_member(sphere_id)` / `is_sphere_admin(...)`, which check the
   caller's `user_spheres` membership. Verified live: `scripts/verify-rls.sql`
   (29 assertions as the `authenticated` role).
2. **Server actions** — every action loads the caller via `requireMember()`
   (never trusts client-passed `userId`/`sphereId`/`role`) and re-checks
   membership/ownership before mutating.

The client never sends `userId` or `role`; it only passes entity IDs, and the
server resolves authorization. RLS remains the backstop even if a client
forges an ID.

## 6. Anonymous identity

- `user_spheres.anonymous_handle` — `@AdjectiveAnimal###`, generated in the
  signup trigger (`random_handle()`), unique per Sphere.
- Public surfaces (chat, groups, marketplace, promotions) render only the
  handle. Real name/email/phone live in `profiles`, hidden by RLS.
- Users may regenerate their own handle via the `regenerate_own_handle` RPC;
  they cannot edit it freely.

## 7. RBAC (permission + scope, never giant role-name strings)

No hardcoded micro-roles. Roles are permission sets plus optional scope:

- **Profile role** (`profiles.role`): `user` | `admin` (Sphere admin) | `super_admin` (platform-global).
- **Assignable roles** (`role_assignments.role`, migration 0004): `sphere_admin`,
  `academic_manager`, `social_moderator`, `club_manager`, `event_manager`,
  `marketplace_moderator`, `listing_manager`, `promotion_moderator`. Nothing like
  `academic_first_year_btech_ambassador` — scope lives in the assignment, not the role name.
- **Permission** (string): `academic.update`, `social.moderate`, `events.create`,
  `promotions.review`, `listings.delete`, `marketplace.manage_orders`, …
- **Scope** (`role_assignments.scope` JSONB): optional narrowing, e.g.
  `{ "permissions": ["academic.create", "academic.delete"], "degree": "B.Tech", "year": "First Year", "branch": "CSE" }`

`public.has_permission(perm, scope_filter)` (SQL, security definer) checks:
Sphere admin / super admin ⇒ all permissions; a `sphere_admin` assignment ⇒
full access in that Sphere; otherwise a matching `role_assignments` row whose
`scope.permissions` include `perm` and whose scope matches the filter. The UI
calls the same rule via the server actions (`requireSphereAction` /
`requirePermission`) so controls only render for permissions the user actually
holds — and the database enforces it independently.

## 8. Realtime

- Publications: `chat_messages`, `group_messages`, `notifications` (added
  defensively — handles both empty and `FOR ALL TABLES` Supabase setups).
- Client subscriptions are created in `useEffect` and cleaned up on unmount.
- Realtime is a UX enhancement; persistence and authorization are always via
  the database.

## 9. Storage

- Vercel Blob; token server-only (`BLOB_READ_WRITE_TOKEN`).
- Upload route: `POST /api/listings/upload` — requires an authenticated,
  **active, Sphere-member** caller, enforces same-origin (Origin check), 5 MB
  cap, and a strict allow-list of image MIME types.
- File URLs are stored in the DB; listing images are tied to the listing's
  Sphere for RLS.

## 10. Security posture

- No secrets in client bundles (Supabase anon key is public by design; the
  service-role key and Blob token are server-only).
- No `ignoreBuildErrors` / lint suppressions; `tsc --noEmit`, `npm run lint`,
  `npm run build` all run in CI and locally.
- Server actions validate input (shared `lib/validation.ts`), enforce
  membership/ownership, and never echo raw DB errors.
- Destructive actions are confirmed in the UI and audit-logged for admins.

## 11. Key design decisions

1. **One college == one Sphere** — signup resolves the college via the
   admin-managed directory (`colleges` + aliases). Free text never creates a
   Sphere; unknown colleges go through `college_requests`.
2. **Two-level admin: platform selector → Sphere workspace** — `/admin` lists
   every Sphere the caller may administer (super admin: all active Spheres;
   Sphere admins / scoped managers: only theirs). Everything else is scoped
   under `/admin/spheres/[sphereId]`, gated server-side per request.
3. **Monetization modeled, not executed** — promotion price/QR, platform fee
   (5%) on marketplace orders, and future pricing live in the data model /
   `platform_config`, but no payment gateway is integrated.
