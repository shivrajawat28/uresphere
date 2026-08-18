# UreSphere — Implementation Status

Status of every feature requested in the build spec, as of this session. Legend:
**DONE** = implemented and wired to the database layer · **MOCK** = UI present,
no real backend wiring · **SOON** = intentionally "Coming Soon" per spec ·
**REQUIRES** = needs an external setup to function.

## Public surface

| Feature | Status | Notes |
|---|---|---|
| Landing hero + campus network animation | DONE | Light-first, dark/system supported, reduced-motion respected |
| Landing sections (how it works, sphere, features, trust) | DONE | |
| "Help shape what's coming next" plans | DONE | `platform_plans` + per-user star feedback (`plan_feedback`, one per user, editable) |
| About page (story, vision, how it works) | DONE | `/about` |
| Team section | DONE | `team_members`, admin-managed, shown when active |
| Work with Us form | DONE | `work_with_us_applications`, admin statuses: new / reviewed / shortlisted / rejected |
| Advertise modal | DONE | `advertising_config` contact phone/email, admin-editable |
| College directory autocomplete in signup | DONE | Alias-aware, case/whitespace/punctuation-tolerant matching (`normalizeSearchTerm` + token-prefix scoring); keyboard nav, loading/empty/selected states, clear button; free text never creates a Sphere |
| Request your college | DONE | `/request-college`, public form → `college_requests` → admin panel; “Add to directory” creates the college + Sphere and approves the request |
| Nav: How it works / Sphere / Features / Trust / About | DONE | |
| Theme toggle (light/dark/system, light default) | DONE | next-themes |

## Authentication

| Feature | Status | Notes |
|---|---|---|
| Signup (name, phone, email, college, password, confirm) | DONE | Phone is profile information only (no SMS/OTP verification); email confirmation enabled — successful signup shows "Account created. Please check your email…"; validation only ever runs on Continue/Submit, never on page load |
| Signin with email | DONE | Email-only (phone is profile information per spec). The previous phone→email lookup never worked against the live DB — `profiles` is RLS-gated to authenticated users, so the anonymous lookup always returned nothing — and a working version would need a SECURITY DEFINER backdoor that exposes private emails by phone, so the broken branch was removed and the form says "Email". Super admins are redirected to `/admin` server-side after login |
| Forgot / reset password | DONE | Supabase native `resetPasswordForEmail` → recovery link → `/auth/callback` (PKCE code exchange) → `/auth/reset-password` → `updateUser({ password })`. Reset requires a valid recovery session; invalid/expired links get a friendly error. Confirm-password field added |
| Session persistence | DONE | `@supabase/ssr` 400-day auth cookies (library default), auto token refresh, `proxy.ts` session refresh — closing/reopening the browser, refresh, and normal navigation keep the user signed in |
| 48-hour inactivity logout | DONE | `profiles.last_activity_at` (server-side, migration 0014) refreshed by a throttled client tracker (initial load, refresh, focus, visibility change, throttled interaction); `requireMember` checks it on every protected page and signs out + redirects to login after 48h without use. Inactivity timeout, not an absolute cap — active users are never logged out |
| Logout | DONE | |
| Suspended account state | DONE | `/auth/suspended`, enforced at app + DB layer (checked before onboarding, so even super admins are blocked) |
| Onboarding bypass for super admin | DONE | `requireMember` never sends a `super_admin` to `/onboarding/pending` — even without a college membership row (e.g. user created via Supabase dashboard); `sphereId` is `null` so no sphere-scoped access is possible |
| Session restore | DONE | `proxy.ts` session refresh; session cookies persist across close/reopen/refresh (library 400-day maxAge + auto refresh). Live-verified: reopen, refresh, navigation all keep the user signed in |

## Authenticated app

| Feature | Status | Notes |
|---|---|---|
| Dashboard overview | DONE | Campus-community redesign: “Hello, {display name} 👋” + “Here's what's happening in your Sphere today”, latest published plan + star feedback (plan → “What's coming next”), live promotions highlight, upcoming events + recent activity, compact Sphere stats (members/events/groups/clubs), quick-action cards; entrance animations gated by `prefers-reduced-motion`; Marketplace no longer a large overview card |
| Sidebar / mobile nav | DONE | Grouped nav (Your Sphere / Campus / Community / Other + Admin), live unread-notification badge (server count + realtime); **mobile = bottom navigation** (Home / Chat / Marketplace / Alerts) + More sheet with backdrop close, body scroll lock, auto-close on route change, safe-area padding |
| Live discussion (Sphere chat) | DONE | Realtime, text-only, anonymous handles, report, own-delete, admin "Message deleted by admin". Sender sees their message instantly via optimistic bubble + server-row reconciliation; realtime inserts are deduped by id. **Chat opens at the newest messages**: the server fetches only the newest window (`ORDER BY created_at DESC LIMIT 51`, +1 row to detect older), the client jumps to the bottom on mount, and “Load earlier messages” prepends older rows while anchoring the reading position (verified live, desktop + mobile, `scripts/verify-chat-latest.mjs` 11/11). Fixed a latent bug where `hasMore` was always false (the page capped the fetch at the window size, so the button never appeared) |
| Plan feedback on dashboard | DONE | Latest published plan shown in “What's coming next” with star rating + comment (one row per user per plan, editable); publish action notifies every active member once (`notify_plan_published` RPC, idempotent per plan); notification links to the Dashboard Roadmap deep link (`/dashboard/roadmap?plan=<id>`, migration 0009) which scrolls to + briefly highlights the exact plan; admin Plans section supports create / edit / publish state |
| Dashboard Roadmap page | DONE | `/dashboard/roadmap` — dedicated authenticated roadmap inside the dashboard shell: “ROADMAP / Help shape what's coming next.” header, all published platform plans (same data source + RLS as the public landing roadmap), per-plan 1–5 star + optional comment feedback via the shared `PlanFeedbackForm` (one editable row per user per plan), no “Join your Sphere to vote” prompt; deep links (`?plan=<id>`) scroll to and highlight the target card; added to the desktop sidebar (Other group) and mobile More sheet |
| Groups | DONE | Create, invite by handle, accept/reject, group chat (text-only), member-gated. Group chat now loads the newest window (same pattern as Sphere chat) with “Load earlier messages”, opens at the latest message, and doesn't yank the reader to the bottom on every realtime append |
| Promotions | DONE | ₹10 fee, QR + UTR manual payment → "payment verification pending" → admin approve/reject. Page now shows a public **“Live in {Sphere}”** section (approved + payment-verified + not expired only) and a richer “Your submissions” list (approval, payment, expiry, review date) |
| Academic hierarchy | DONE | Degree → Year → Branch → Subject → Unit drill-down, resources + calendar. Drill-down state lives in the URL query params (`?degree=&year=&branch=&subject=&unit=`), so in-app Back, browser Back, refresh, mobile, and direct links all preserve the degree/year/subject context; resources open in the same tab so Back returns to the exact subject/year view |
| Clubs | DONE | Admin-created, browse, join |
| Events | DONE | Upcoming/past, RSVP, "Ask about this event" Q&A with admin replies |
| Marketplace — student listings | DONE | Categories (books/calculators/cycles/electronics/college_supplies/other), INR pricing, image upload, search/filter |
| Marketplace — buy now orders | DONE | Buyer name/phone/address/date → order in admin + seller; statuses pending→delivered; 5% fee + settlement shown (no gateway) |
| UreSphere Shop | DONE | Admin-managed products (food/stationery/essentials/other), availability, "Coming Soon" when empty |
| Global listings | DONE | Global (non-Sphere), admin CRUD, search/filters, "Coming Soon" empty state |
| Premium | SOON | Coming Soon page with future feature list — no fake paid features |
| Notifications center | DONE | Types incl. group invites, moderation, `plan_published`; unread count in sidebar (server count + realtime), mark all read, cards link to their target when a `link` exists |
| Profile / settings | DONE | Own handle, sphere, theme, notification prefs, password change |
| Admin panel — Level 1 (platform) | DONE | `/admin` = Sphere selector (`admin_sphere_overview()` RPC): cards per accessible Sphere with member/club/upcoming-event/listing counts + “Open Sphere”. Super admins also get platform tabs: Colleges, College requests, Platform plans, Platform team, Work with us, Advertising, platform-level Audit log |
| Advertising management | DONE | Platform-wide ad system (`ad_campaigns`, migration 0007): super-admin-only CRUD on the Advertising tab (stats: Total/Active/Scheduled/Expired; thumbnail table with status badges, Live/Scheduled/Expired/Inactive/Archived, start→end dates, actions: create / edit / preview / activate / deactivate / archive / delete-with-confirm). Create/edit form: title (≤120), description (≤300), image upload with live preview, safe http(s) destination URL, **multi-select placements (Academic / Social / Marketplace, ≥1 required)**, start/end datetime (end must be after start), active toggle, image required. Frontend: `AdCard` (clearly labeled “Sponsored”, lazy images) shown on `/dashboard/academic`, `/dashboard/chat`, `/dashboard/groups`, `/dashboard/marketplace` via a single server-side `fetchLiveAds(supabase, placement, limit)` that filters **in the database** (active, not archived, inside schedule window, placement contains) — never in JS. RLS: members may only SELECT live+in-schedule ads; all writes are super-admin-gated in SQL **and** re-checked server-side in every action (`requireAdAdmin`); audit-logged. Upload route (`/api/ads/upload`) reuses the shared magic-byte/MIME/size/same-origin gates from `lib/uploads.ts`. **Real image upload verified end-to-end against the live Vercel Blob store** (`BLOB_READ_WRITE_TOKEN` configured): the UI upload returns a real `*.public.blob.vercel-storage.com` URL, it's persisted to `ad_campaigns.creative_url`, and the image renders from that URL on the Academic / Social (chat + groups) / Marketplace placements; security gates confirmed live (non-super-admin 403, spoofed MIME 400, disallowed MIME 400, oversized 400); deactivate/reactivate/archive/delete verified; all temp rows + uploaded blobs cleaned up after verification (`scripts/verify-ads-browser.mjs` 29/29). Found + fixed a real bug during verification: the create/edit dialog kept stale form state between consecutive opens (placements leaked between ads) — the form now resets every field on open |
| Admin panel — Level 2 (Sphere) | DONE | `/admin/spheres/[sphereId]` = breadcrumb “← All Spheres”, overview stats, Sphere-scoped tabs (Users, Social, Groups, Academic, Clubs, Events, Marketplace/orders, Listings, Promotions, Audit). Every query filters by `sphere_id`; `requireSphereAdmin` validates the URL Sphere server-side. Social tab = live discussion (realtime recent messages — anonymous handle + **admin-only real name badge**; click a member for an admin-only details modal with name/handle/email/phone/status/roles/join date; delete → “Message deleted by admin”) plus a separate Reports section. Groups tab = name, creator handle, member count, admin delete (`social.manage_groups`). Events/Clubs/Academic tabs gained create forms (explicit `sphereId`) so super admins can actually create Sphere-scoped content |
| Role management per Sphere | DONE | `/admin/spheres/[sphereId]/roles`: member search, role selector, degree/year/branch scope, permission picker, create/edit/revoke; only Sphere administrators / super admin |
| College CRUD in admin | DONE | Create / edit / activate / deactivate; add/edit/delete aliases (wholesale replace); see the linked Sphere; super-admin gated (`migration 0003` adds a select-all policy so admins can see inactive colleges) |
| Plan feedback in admin | DONE | Platform Plans tab shows per-plan feedback count + average star rating (`summarizePlanFeedback`, tested) |

## RBAC

| Feature | Status | Notes |
|---|---|---|
| Role + permission + scope model | DONE | `role_assignments` with permission-first roles (migration 0004): `sphere_admin`, `academic_manager`, `social_moderator`, `club_manager`, `event_manager`, `marketplace_moderator`, `listing_manager`, `promotion_moderator` — scope (degree/year/branch) lives in the assignment, never in the role name |
| DB enforcement | DONE | `has_permission(perm, scope)` + `is_sphere_admin(sphere)` security-definer functions used by RLS policies; `sphere_admin` assignment = full Sphere powers; `is_sphere_admin` also true for super admin in any Sphere |
| Server-side gates | DONE | `requireSphereAction(sphereId, perm, scope)` on every sphere-scoped mutation; super admin may write any Sphere **only with an explicit `sphereId`** (never null = “all Spheres”); `canAccessSphere` / `isSphereAdministrator` / `requireSphereAdmin` on reads; hand-editing a `sphereId` URL is rejected server-side |
| Sphere-scoped role assignment UI | DONE | `/admin/spheres/[sphereId]/roles` — user search, role selector, scope config, permission picker, create/edit/revoke |
| Super admin gating | DONE | Colleges / college-requests / global listings / platform tabs are super-admin only; super admin can open any active Sphere |
| Cross-Sphere admin isolation | DONE | `academic_units` write policies made Sphere-aware (was `has_permission` only — a campus-A admin could write campus-B units); all other `has_permission`-gated policies are platform-level tables with a `is_super_admin()` escape |

## Security

| Feature | Status | Notes |
|---|---|---|
| Sphere isolation (RLS) | DONE | Live SQL assertions in `scripts/verify-rls.sql` (incl. new section 13: sphere-scoped admin — super admin sees all Spheres, Sphere admin only their own, plain user none, scoped-manager scope enforcement) |
| Ownership checks in actions | DONE | Marketplace, chat, groups, orders — server-side, never trust client IDs |
| Suspended users blocked | DONE | App (`requireMember`) + DB (`is_member`) |
| Upload auth + origin check | DONE | 5 MB cap, MIME allow-list, **magic-byte sniffing (never trusts the client Content-Type)**, Sphere membership + same-origin |
| No secrets in client bundles | DONE | Service-role key & Blob token server-only |
| Audit log | DONE | Admin actions recorded; surfaced in admin panel |

## SEO / infra

| Feature | Status | Notes |
|---|---|---|
| Metadata / OG | PARTIAL | Landing + about have metadata; per-dashboard pages are private by design |
| sitemap.xml / robots.txt | DONE | Public pages only; `/dashboard/`, `/admin/`, `/api/` disallowed |
| Error / loading / 404 | DONE | `app/error.tsx`, `app/loading.tsx`, `app/dashboard/loading.tsx`, `app/not-found.tsx` |

## Requires external setup (no credentials available in this session)

- **REQUIRES Supabase project**: apply `supabase/migrations/0001_initial_schema.sql` → `0002_platform_directory.sql` → `0003_college_directory_hardening.sql` → `0004_sphere_scoped_admin.sql` → `0005_dashboard_community.sql` → `0006_signup_trigger_repair.sql`; set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; configure Auth redirect URLs. Migrations were validated against a real local PostgreSQL instance; 0006 was applied to the live project to repair the legacy signup trigger.
- **REQUIRES Supabase migration 0007** (`supabase/migrations/0007_advertising.sql`): additive columns on `ad_campaigns` (`description`, `placements text[]`, `starts_at_ts`, `ends_at_ts`, `archived`, `updated_at`) + GIN/indexes + RLS policies (members select only live ads; super admins full CRUD). **Applied to the live project in this session**; validated locally first against a scratch PostgreSQL cluster (RLS positive + negative cases), then verified live via the browser script.
- **REQUIRES Vercel Blob**: `BLOB_READ_WRITE_TOKEN` for image uploads (marketplace, listings, shop, team photos, promotion QR, advertisements). **Configured in the local `.env.local` this session and verified live for the advertising upload path** (real `*.public.blob.vercel-storage.com` URLs, persisted + rendered + cleaned up). Note: the local dev shell must not export an empty `BLOB_READ_WRITE_TOKEN` — an empty-but-set process env var shadows `.env.local` because dotenv never overrides existing variables (start the dev server with `env -u BLOB_READ_WRITE_TOKEN pnpm dev` if that happens).
- **REQUIRES seed**: add colleges to the directory (super admin UI or SQL), set `promotion_payment` config (QR image URL), `advertising_config` contact details.
- **REQUIRES payment gateway** (future): promotion ₹10 fee, marketplace 5% fee, global-listing fees — modeled in the schema/UI but no gateway integrated by design.

## Mock / not yet wired

- Nothing in the UI is mocked: all pages read through server actions → Supabase. Pages render honest empty states when the database is empty.

## Known limitations

1. Marketplace listing detail page (`/dashboard/marketplace/[id]`) is not a separate route; cards open the buy dialog inline.
2. Chat pagination loads the newest window and older pages on demand via “Load earlier messages” (cursor-based `created_at < oldest`). No full-history fetch on open. Group chat uses the same pattern.
3. Live E2E against a hosted Supabase project: **done for the realtime flow** (two real users in the live ITS Sphere, 14/14 checks passed after the `and`-filter fix).
4. Resolved: mobile now uses a bottom navigation bar (Home / Chat / Marketplace / Alerts) + a More sheet; no collapsed desktop sidebar on phones.
5. "UreSphere Shop" products are admin-created but buying a shop product is display-only (no order flow) — student marketplace has the full buy-now order flow.
6. Resolved: admin UI creates a college's Sphere eagerly (and "approve request → add to directory" does too); `handle_new_user` still resolves signups to the existing Sphere and is race-safe against duplicate Spheres (`on conflict (slug) do nothing`).
7. Resolved (migration 0004): admin is now two-level — `/admin` is a Sphere selector, and all sphere-scoped administration lives under `/admin/spheres/[sphereId]` (incl. `/roles`). Role names are permission-first (`academic_manager` + scope, never `academic_first_year_btech_ambassador`).
8. Resolved: the previous realtime bug (sender didn't see their own message; admin Social didn't reflect chat) — root cause was Supabase Realtime silently matching nothing for `and`-combined filters; ChatRoom now uses a single-condition Sphere filter + optimistic-bubble swap, verified live in the browser.
9. Resolved (live verification, Aug 2026): several admin page queries embedded cross-table relationships (`chat_messages.user_spheres(...)`, `user_spheres.profiles(...)`, `promotions.user_spheres(...)`) that don't exist as FKs in the schema — PostgREST failed the whole query and the pages silently showed empty data (Social showed "No messages" despite messages existing). Fixed by fetching the related rows in separate queries and joining client-side (same pattern as the dashboard). Verified live: Social tab now shows real messages + admin-only real names + member-details modal.
10. **BLOCKED on a manual step**: `notify_plan_published` does not exist in the live project — migration **0005 was never applied** there (only 0006). Plan publish + feedback + admin rating all work live; only the member notification broadcast is missing until `supabase/migrations/0005_dashboard_community.sql` is run in the Supabase SQL editor.
11. **Live-verified (Aug 2026, `scripts/verify-auth-flows-browser.mjs`)**: signup (no errors on load, submit-only validation; lands on /dashboard when email confirmation is OFF, on /auth/sign-up-success with the confirmation message when it's ON — the script auto-detects the live mode), profile storage (phone E.164 + college + college_year + last_activity_at), session persistence (reopen/refresh/navigate), 48-hour inactivity logout (backdated `last_activity_at` → signs out + redirects to login; session actually cleared), academic back navigation (browser Back from a note restores the exact degree/year/subject URL context; in-app Back pops one level; direct deep links render; desktop + mobile), forgot/reset password UX, email-only login, super-admin redirect, and no mobile overflow. Latest runs: 29/29 (reused test account) repeated 3×. The live project now has **"Confirm email" ON**; a fresh confirmation-ON signup was attempted but blocked by external Supabase rate limits — first the signup per-IP limiter ("Too many attempts"), and once that cleared, the **email-send limiter** (`429 over_email_send_rate_limit`: "email rate limit exceeded") because every confirmation-ON signup sends a confirmation email. The app mapped both provider errors to friendly inline messages (verified live), and the confirmation-required login mapping ("Email not confirmed" → "Please confirm your email…") is unit-tested. Test accounts (`codebuff.verify.*@example.com`) were created in the live ITS Sphere — deleting them needs the service-role key, which the env files don't carry.
