# Uresphere

**Your Campus. Your Sphere. Your Community.**

Uresphere is a college/campus-oriented community platform. Every college has its
own isolated **Sphere**; members inside a Sphere interact anonymously under a
generated handle (e.g. `@SilentWolf482`) while their real name, email, and phone
stay private — visible only to themselves and their Sphere's administrators.

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Supabase (Auth, PostgreSQL, Realtime, RLS)
- shadcn/ui (base-nova) on Base UI
- Vercel Blob for image uploads

## Features

- Landing page with animated campus-network hero (light/dark/system themes) and
  a "Help shape what's coming next" roadmap section (star rating + feedback)
- **Admin-managed college directory**: signup uses a searchable autocomplete;
  free text never creates a Sphere. Unknown colleges → "Request your college"
- About page: team, work-with-us applications, advertise-on-UreSphere modal
- Registration → directory-based Sphere resolution → anonymous handle provisioning
- Sign in with **email or phone** + password; forgot/reset password; suspended state
- Dashboard, profile/settings, sphere-wide realtime chat
- Groups (create, invite by handle, accept/reject, group chat)
- Promotions (₹10, QR + UTR manual payment → admin verification → live)
- Academic with Degree → Year → Branch → Subject → Unit drill-down
- Clubs (admin-created, members join/leave)
- Events (admin-created, RSVPs, "Ask about this event" Q&A)
- Marketplace: student listings (₹, 5% fee modeled) with **buy-now orders** +
  UreSphere Shop (admin products)
- Global Listings (platform-wide, super-admin managed)
- Premium page (coming soon)
- Admin panel (two-level): platform sphere selector + per-Sphere administration
  (users, social/live chat with real-name moderation, groups, academic, clubs,
  events, marketplace/orders, listings, promotions, audit log) and platform-only
  sections (colleges, college requests, roles & permissions, roadmap plans,
  team, work-with-us, advertising, audit log)
- **RBAC**: role + permission + scope (`role_assignments`), permission-aware UI
  and DB enforcement via `has_permission()`
- Notifications (group invites, moderation, event updates, plan publications)
- Password reset flow

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase + Vercel Blob values
pnpm dev
```

### 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in order in the SQL editor (or `supabase db push`):

   ```
   supabase/migrations/0001_initial_schema.sql
   supabase/migrations/0002_platform_directory.sql
   supabase/migrations/0003_college_directory_hardening.sql
   supabase/migrations/0004_sphere_scoped_admin.sql
   supabase/migrations/0005_dashboard_community.sql
   supabase/migrations/0006_signup_trigger_repair.sql
   ```

   0001 creates all core tables, RLS policies, the signup provisioning trigger,
   the `regenerate_own_handle` RPC, notification triggers, and Realtime
   publications. 0002 adds the admin-managed college directory (replacing
   free-text Sphere creation), plans/feedback, team, work-with-us, advertising
   config, event Q&A, the Shop + marketplace orders, and RBAC
   (`role_assignments` + `has_permission()`). 0003 lets admins see inactive
   colleges and hardens `handle_new_user` against duplicate Spheres; 0004 turns
   the admin panel into a two-level (platform → sphere) architecture; 0005 adds
   plan-publish notifications (`notify_plan_published`) and sphere-admin chat
   read access for the admin Social tab; 0006 re-installs the college-directory
   `handle_new_user` trigger (repairing projects that still run the legacy
   free-text version) and applies the first-member-admin rule to legacy data.
   the admin panel into a two-level architecture (platform Sphere selector at
   `/admin`, sphere-scoped administration at `/admin/spheres/[sphereId]` and
   `/admin/spheres/[sphereId]/roles`) with permission-first roles and
   super-admin cross-Sphere SELECT policies.
   colleges (so they can reactivate them) and makes lazy Sphere creation
   race-safe (`on conflict (slug) do nothing`).

3. Copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` into `.env.local`.
4. In Supabase → Auth → URL Configuration, set:
   - **Site URL** to your app URL
   - **Redirect URLs** to include `https://your-app/auth/callback` (and
     `http://localhost:3000/auth/callback` for local dev)
5. **Email**: turn on email confirmations if you want verification (recommended).
   The signup trigger provisions the profile + Sphere + handle immediately, so
   users land on a working account the moment they confirm.

### 2. Vercel Blob (marketplace photos)

Create a Blob store at [vercel.com/docs/storage/vercel-blob](https://vercel.com/docs/storage/vercel-blob)
and set `BLOB_READ_WRITE_TOKEN` in `.env.local`.

## How Sphere resolution works

Colleges live in an **admin-managed directory** (`colleges` + `college_aliases`).
During signup the user searches the directory and picks one official institution
(autocomplete backed by `searchCollegesAction`). The signup action validates the
`college_id` server-side, so a raw string can never create a Sphere. Unknown
colleges go through `/request-college` and appear in the admin panel.

Each approved college maps to exactly one Sphere (created eagerly when the
super admin adds the college, or lazily on first signup for pre-existing rows).
The first member of a new Sphere becomes its admin (so every campus starts with
a moderator). The very first platform account becomes `super_admin` — you can
also promote yourself later:

```sql
update public.profiles set role = 'super_admin' where id = '<your-auth-user-id>';
```

## Security model

- **RLS everywhere**: every table has row-level policies; Sphere isolation is
  enforced at the database, not hidden in the UI.
- **Server actions re-check** ownership and Sphere membership (IDOR-safe).
- Anonymous handles are the only public identity; `profiles` (name/email/phone)
  is readable only by the owner and same-Sphere admins.
- **RBAC**: `role_assignments` (moderator/section_manager/ambassador) with a
  `scope.permissions` array and optional degree/year/branch narrowing;
  `has_permission()` is a security-definer SQL function used by RLS and
  mirrored by `requirePermission()` in server actions.
- Uploads validate type + size + origin; promotions validate URLs (http/https
  only, no IP literals/credentials); buy-now orders enforce buyer≠seller.
- Admin actions are written to `audit_logs`.

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build (runs TypeScript validation) |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint (next/core-web-vitals + typescript) |
| `npx tsc --noEmit` | Typecheck |
| `pnpm test` | Vitest unit tests |

## Testing

- **Unit tests** (`pnpm test`): validation logic (URL safety, college
  normalization + alias-aware matching, handles), promotion submission
  actions, signup (valid / invalid / inactive college) and email-or-phone
  login, with `next/cache`, `next/headers` and Supabase mocked.
- **Database verification**: all migrations have been applied and verified
  against a real PostgreSQL instance — `scripts/setup-supabase-stub.sql`
  recreates the Supabase plumbing (roles, `auth.uid()`, Realtime publication,
  default grants), and `scripts/verify-rls.sql` runs 50+ assertions as the
  `authenticated` role covering Sphere isolation, ownership, group membership,
  suspension blocking, notification triggers, the college directory (aliases,
  inactive-college blocking, duplicate-Sphere prevention), RBAC
  (`has_permission` scopes), plans feedback, orders, and event Q&A.

To run the DB verification yourself (requires a local Postgres):

```bash
# start a throwaway cluster, then:
psql -d postgres -f scripts/setup-supabase-stub.sql
psql -d postgres -f supabase/migrations/0001_initial_schema.sql
psql -d postgres -f supabase/migrations/0002_platform_directory.sql
psql -d postgres -f supabase/migrations/0003_college_directory_hardening.sql
psql -d postgres -f supabase/migrations/0004_sphere_scoped_admin.sql
psql -d postgres -f scripts/verify-rls.sql   # all assertions must return t
```

## Deployment

Deploy to Vercel: import the repo, set the environment variables from
`.env.example`, and ensure the Supabase migration has been applied.

## Roadmap / not yet implemented

- Payments & monetization (membership, promotion fees, marketplace commission,
  ad campaigns) — modeled (`platform_config`, `ad_campaigns`, order fee/settlement)
  but no gateway is integrated; promotion QR/UTR verification is manual.
- Marketplace listing detail pages; infinite chat history pagination.
- Live E2E against a hosted Supabase project (migration + unit + SQL-level
  tests all pass; see docs/IMPLEMENTATION-STATUS.md for the exact manual setup).
- Bottom mobile navigation bar (mobile uses a collapsible sidebar).
