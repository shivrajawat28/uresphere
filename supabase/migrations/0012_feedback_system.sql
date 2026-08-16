-- ============================================================================
-- Uresphere — user feedback system (migration 0012)
--
-- Additive and idempotent. Adds two tables for the dashboard Feedback section
-- and the platform admin Feedback panel:
--
--   1. `feedback` — one row per submission. Owned by the authenticated user
--      (user_id is written from the session server-side, never the client),
--      scoped to the user's own Sphere (sphere_id), with a category, subject,
--      message and a lifecycle status.
--
--   2. `feedback_replies` — the conversation thread. Each reply carries the
--      author (the feedback owner OR a Sphere administrator); users see admin
--      replies as "Admin", admins see full identities via the existing admin
--      profile model.
--
-- RLS follows the existing sphere-scoped admin model (super_admin / profile
-- admin / sphere_admin assignment via public.is_sphere_admin):
--   - users: INSERT their own feedback in a Sphere they are an active member
--     of; SELECT only their own feedback and replies on it; reply only as
--     themselves on feedback they own or administer;
--   - admins: SELECT/UPDATE feedback in their own Sphere (status changes),
--     reply on it, and see the full identity through the existing profiles /
--     user_spheres admin policies.
-- No DELETE policy exists on either table: feedback is never deleted by users
-- or admins through the API.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. feedback
-- ---------------------------------------------------------------------------

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  -- Owner is ALWAYS derived from the session server-side. RLS rejects any
  -- insert where user_id <> auth.uid(), so a client can never file feedback
  -- on someone else's behalf.
  user_id uuid not null references auth.users (id) on delete cascade,
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  category text not null check (
    category in ('general', 'bug', 'feature', 'improvement', 'add', 'remove', 'other')
  ),
  subject text not null,
  message text not null,
  status text not null default 'open' check (
    status in ('open', 'in_review', 'replied', 'resolved', 'closed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A user's history (newest first) and an admin's sphere-scoped work queue.
create index if not exists feedback_user_idx
  on public.feedback (user_id, created_at desc);
create index if not exists feedback_sphere_status_idx
  on public.feedback (sphere_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. feedback_replies — the conversation thread
-- ---------------------------------------------------------------------------

create table if not exists public.feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  -- The reply author: the feedback owner or a Sphere administrator of the
  -- feedback's Sphere. Always derived from the session server-side; RLS
  -- rejects inserts where author_user_id <> auth.uid().
  author_user_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists feedback_replies_feedback_idx
  on public.feedback_replies (feedback_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. RLS — feedback
-- ---------------------------------------------------------------------------

alter table public.feedback enable row level security;

-- Users see only their own submissions; Sphere admins (super_admin / profile
-- admin / sphere_admin assignment) see the ones in their Sphere.
create policy "feedback_select_own" on public.feedback
  for select to authenticated
  using (user_id = auth.uid());

create policy "feedback_select_admin" on public.feedback
  for select to authenticated
  using (public.is_sphere_admin(sphere_id));

-- Insert is tied to the session user AND an active membership in the target
-- Sphere (public.is_member checks account_status + membership_status), so a
-- user can never file feedback into another Sphere or as another user.
create policy "feedback_insert_own" on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(sphere_id));

-- Status changes (and any future admin edits) are Sphere-admin only. There is
-- intentionally no user UPDATE policy: users cannot edit or delete their
-- submissions, matching the existing moderation model.
create policy "feedback_update_admin" on public.feedback
  for update to authenticated
  using (public.is_sphere_admin(sphere_id))
  with check (public.is_sphere_admin(sphere_id));

-- ---------------------------------------------------------------------------
-- 4. RLS — feedback_replies
-- ---------------------------------------------------------------------------

alter table public.feedback_replies enable row level security;

-- Replies are visible to the feedback owner and to administrators of the
-- feedback's Sphere only — never to other users.
create policy "feedback_replies_select_participant" on public.feedback_replies
  for select to authenticated
  using (
    exists (
      select 1 from public.feedback f
      where f.id = feedback_id
        and (f.user_id = auth.uid() or public.is_sphere_admin(f.sphere_id))
    )
  );

-- A user may reply only as themselves, and only on feedback they own or
-- administer. The status gate (users may reply only to open/in_review
-- threads) is enforced in the server action so the DB stays simple.
create policy "feedback_replies_insert_participant" on public.feedback_replies
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_id
        and (f.user_id = auth.uid() or public.is_sphere_admin(f.sphere_id))
    )
  );
