-- ============================================================================
-- Uresphere — initial schema
-- Run this against a Supabase project (SQL Editor or `supabase db push`).
-- Applies: tables, indexes, helper functions, signup provisioning trigger,
-- RLS policies, and Realtime publication.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Core identity & Sphere membership
-- ---------------------------------------------------------------------------

create table if not exists public.spheres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists spheres_slug_idx on public.spheres (slug);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  real_name text not null default '',
  phone text not null default '',
  college_input text not null default '',
  role text not null default 'user' check (role in ('user', 'admin', 'super_admin')),
  account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_spheres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  anonymous_handle text not null unique,
  membership_status text not null default 'active' check (membership_status in ('active', 'left', 'suspended')),
  avatar_url text,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists user_spheres_user_idx on public.user_spheres (user_id);
create index if not exists user_spheres_sphere_idx on public.user_spheres (sphere_id);

-- ---------------------------------------------------------------------------
-- 2. Social — Sphere chat, groups, group chat
-- ---------------------------------------------------------------------------

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  is_deleted boolean not null default false,
  deleted_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_sphere_idx on public.chat_messages (sphere_id, created_at desc);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists groups_sphere_idx on public.groups (sphere_id);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  invited_by uuid not null references auth.users (id),
  invitee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (group_id, invitee_id)
);

create index if not exists group_invites_invitee_idx on public.group_invites (invitee_id, status);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at asc);

-- ---------------------------------------------------------------------------
-- 3. Promotions
-- ---------------------------------------------------------------------------

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  title text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  fee_status text not null default 'free' check (fee_status in ('free', 'due', 'paid')),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists promotions_sphere_idx on public.promotions (sphere_id, status);

-- ---------------------------------------------------------------------------
-- 4. Academic
-- ---------------------------------------------------------------------------

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  name text not null,
  code text not null default '',
  description text not null default '',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists subjects_sphere_idx on public.subjects (sphere_id);

create table if not exists public.academic_resources (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null,
  type text not null default 'notes' check (type in ('notes', 'handwritten', 'syllabus', 'paper', 'other')),
  url text not null,
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists academic_resources_sphere_idx on public.academic_resources (sphere_id);
create index if not exists academic_resources_subject_idx on public.academic_resources (subject_id);

create table if not exists public.academic_calendar (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  title text not null,
  event_date date not null,
  description text not null default '',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists academic_calendar_sphere_idx on public.academic_calendar (sphere_id, event_date);

-- ---------------------------------------------------------------------------
-- 5. Clubs
-- ---------------------------------------------------------------------------

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  name text not null,
  description text not null default '',
  president_id uuid references auth.users (id),
  logo_url text,
  banner_url text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists clubs_sphere_idx on public.clubs (sphere_id);

create table if not exists public.club_gallery (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 6. Events
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  title text not null,
  description text not null default '',
  event_date date not null,
  event_time time,
  venue text not null default '',
  organizer text not null default '',
  club_id uuid references public.clubs (id) on delete set null,
  image_url text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists events_sphere_idx on public.events (sphere_id, event_date);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 7. Marketplace (Sphere-scoped) & Global Listings
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 2000),
  price_cents integer not null check (price_cents >= 0),
  category text not null check (category in ('books', 'calculators', 'cycles', 'electronics', 'college_supplies', 'other')),
  condition text not null check (condition in ('new', 'like_new', 'used', 'fair')),
  image_urls text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'sold', 'removed')),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_listings_sphere_idx on public.marketplace_listings (sphere_id, status, created_at desc);

-- Global listings are GLOBAL: every Sphere sees the same set. Admin-managed.
create table if not exists public.global_listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null check (category in ('hostel', 'pg', 'cafe', 'restaurant', 'gym', 'services', 'business', 'other')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  price_note text not null default '',
  address text not null default '',
  city text not null default '',
  contact text not null default '',
  image_urls text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists global_listings_status_idx on public.global_listings (status, category);

-- ---------------------------------------------------------------------------
-- 8. Moderation & reporting
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id),
  target_type text not null check (target_type in ('user', 'chat_message', 'group', 'group_message', 'promotion', 'listing', 'event', 'club')),
  target_id uuid not null,
  sphere_id uuid references public.spheres (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  resolution text,
  resolved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_sphere_idx on public.reports (sphere_id);

-- ---------------------------------------------------------------------------
-- 9. Notifications
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'general',
  title text not null,
  body text not null default '',
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- 10. Admin — audit logs, ads foundation, platform config
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id),
  sphere_id uuid references public.spheres (id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- Advertising foundation (no payments yet).
create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null,
  creative_url text,
  destination_url text not null,
  placement text not null default 'sidebar',
  starts_at date,
  ends_at date,
  active boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- Monetization configuration — prices live here, never hardcoded in the frontend.
create table if not exists public.platform_config (
  key text primary key,
  value jsonb not null
);

insert into public.platform_config (key, value) values
  ('promotion_fee_inr', '10'::jsonb),
  ('membership_fee_inr', '1'::jsonb),
  ('marketplace_commission_percent', '5'::jsonb),
  ('global_listing_fees_inr', '{"hostel": 2500, "pg": 1500, "cafe": 1500, "restaurant": 1500, "gym": 550, "services": 500, "business": 1000, "other": 500}'::jsonb)
on conflict (key) do nothing;

-- ============================================================================
-- Helper functions
-- ============================================================================

-- Deterministic college normalization. Deliberately conservative: strips common
-- suffixes and punctuation, then exact-matches on the result. No fuzzy matching,
-- so unrelated colleges can never be merged.
create or replace function public.normalize_college(input text)
returns text
language plpgsql
immutable
strict
as $$
declare
  v text;
begin
  v := lower(coalesce(input, ''));
  -- Collapse all whitespace FIRST so suffix matching below is robust against
  -- double spaces / tabs in user input (e.g. "ITS  Engineering  College").
  v := regexp_replace(v, '\s+', ' ', 'g');
  -- Punctuation to spaces.
  v := regexp_replace(v, '[^a-z0-9 ]+', ' ', 'g');
  -- Drop trailing institution-type suffixes (longest first).
  v := regexp_replace(v, '\s*(group of institutions|engineering college|institute of technology|institute of engineering|group of colleges|university|institute|colleges?|academy|school)\s*$', '', 'g');
  -- Drop filler words.
  v := regexp_replace(v, '\b(the|of|and|at|in|for)\b', ' ', 'g');
  -- URL-safe slug: single spaces -> hyphens, then trim.
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := trim(both '-' from v);
  return v;
end $$;

create or replace function public.random_handle()
returns text
language plpgsql
volatile
as $$
declare
  adjectives text[] := array['Silent','Dark','Crazy','Shadow','Brave','Clever','Swift','Fierce','Gentle','Lucky','Mystic','Noble','Rapid','Sly','Witty','Cosmic','Daring','Electric','Golden','Hidden','Vivid','Lunar','Neon','Quiet','Stormy'];
  animals text[] := array['Wolf','Panda','Fox','Lion','Tiger','Eagle','Owl','Falcon','Bear','Deer','Hawk','Lynx','Otter','Raven','Shark','Turtle','Zebra','Leopard','Dolphin','Cougar','Panther','Phoenix','Viper','Wolverine'];
  v text;
begin
  loop
    v := '@' || adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
             || animals[1 + floor(random() * array_length(animals, 1))::int]
             || lpad(floor(random() * 1000)::int::text, 3, '0');
    exit when not exists (select 1 from public.user_spheres where anonymous_handle = v);
  end loop;
  return v;
end $$;

-- Signup provisioning: profile + Sphere (find/create) + anonymous handle.
-- SECURITY DEFINER so it can write rows that RLS would otherwise block.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_college text;
  v_slug text;
  v_sphere_id uuid;
  v_handle text;
begin
  insert into public.profiles (id, email, real_name, phone, college_input, role, account_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'real_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'college_input', ''),
    case when not exists (select 1 from public.profiles) then 'super_admin' else 'user' end,
    'active'
  )
  on conflict (id) do nothing;

  v_college := coalesce(nullif(trim(new.raw_user_meta_data->>'college_input'), ''), '');
  v_slug := public.normalize_college(v_college);
  if v_slug = '' then
    v_slug := 'campus-' || substr(new.id::text, 1, 8);
  end if;

  select id into v_sphere_id from public.spheres where slug = v_slug;
  if v_sphere_id is null then
    insert into public.spheres (name, slug)
    values (nullif(v_college, ''), v_slug)
    returning id into v_sphere_id;

    -- First member of a brand-new Sphere becomes its admin so every campus
    -- has a moderator from day one.
    update public.profiles
    set role = 'admin'
    where id = new.id and role = 'user';
  end if;

  v_handle := public.random_handle();

  insert into public.user_spheres (user_id, sphere_id, anonymous_handle, membership_status)
  values (new.id, v_sphere_id, v_handle, 'active');

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RPC used by the "regenerate handle" UI.
create or replace function public.regenerate_own_handle()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text;
begin
  v_handle := public.random_handle();
  update public.user_spheres
  set anonymous_handle = v_handle
  where user_id = auth.uid()
    and membership_status = 'active';
  if not found then
    raise exception 'No active membership found';
  end if;
  return v_handle;
end $$;

-- ============================================================================
-- RLS helpers
-- ============================================================================

create or replace function public.is_member(target_sphere uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Membership requires BOTH an active membership AND a non-suspended account,
  -- so suspension is enforced at the database layer, not just in the UI.
  select exists (
    select 1
    from public.user_spheres us
    join public.profiles p on p.id = us.user_id
    where us.user_id = auth.uid()
      and us.sphere_id = target_sphere
      and us.membership_status = 'active'
      and p.account_status = 'active'
  );
$$;

create or replace function public.is_sphere_admin(target_sphere uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_spheres us
    join public.profiles p on p.id = us.user_id
    where us.user_id = auth.uid()
      and us.sphere_id = target_sphere
      and us.membership_status = 'active'
      and p.account_status = 'active'
      and p.role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and account_status = 'active'
  );
$$;

-- SECURITY DEFINER membership check to avoid infinite recursion in
-- self-referencing policies (group_members / group_messages).
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Suspended accounts cannot read/write group content either.
  select exists (
    select 1
    from public.group_members gm
    join public.user_spheres us on us.user_id = gm.user_id and us.membership_status = 'active'
    join public.profiles p on p.id = gm.user_id and p.account_status = 'active'
    where gm.group_id = gid
      and gm.user_id = auth.uid()
  );
$$;

create or replace function public.shares_sphere_with(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Used by admins to see private details of members inside their own Sphere.
  select exists (
    select 1
    from public.user_spheres me
    join public.user_spheres them on them.sphere_id = me.sphere_id
    where me.user_id = auth.uid()
      and them.user_id = uid
      and me.membership_status = 'active'
      and them.membership_status = 'active'
  );
$$;

-- ============================================================================
-- Enable RLS
-- ============================================================================

alter table public.spheres enable row level security;
alter table public.profiles enable row level security;
alter table public.user_spheres enable row level security;
alter table public.chat_messages enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_messages enable row level security;
alter table public.promotions enable row level security;
alter table public.subjects enable row level security;
alter table public.academic_resources enable row level security;
alter table public.academic_calendar enable row level security;
alter table public.clubs enable row level security;
alter table public.club_gallery enable row level security;
alter table public.club_members enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.global_listings enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.platform_config enable row level security;

-- ============================================================================
-- Policies
-- ============================================================================

-- --- spheres ----------------------------------------------------------------
-- Names are not sensitive; any authenticated user may read them. Only the
-- provisioning trigger writes (SECURITY DEFINER), so no INSERT policy needed.
create policy "spheres_select_auth" on public.spheres
  for select to authenticated using (true);

-- --- profiles ---------------------------------------------------------------
-- Users see their own row; sphere admins / super admins see rows of members
-- who share their Sphere (needed for moderation + private detail access).
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "profiles_select_admin_same_sphere" on public.profiles
  for select to authenticated
  using (
    (role = 'admin' and public.shares_sphere_with(id))
    or public.is_super_admin()
  );

create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (
    (role = 'admin' and public.shares_sphere_with(id))
    or public.is_super_admin()
  );

-- --- user_spheres -----------------------------------------------------------
-- Members of the same Sphere see each other's anonymous handles (public
-- identity inside the Sphere) but never private profile fields.
create policy "user_spheres_select_own" on public.user_spheres
  for select to authenticated using (user_id = auth.uid());

create policy "user_spheres_select_same_sphere" on public.user_spheres
  for select to authenticated
  using (public.is_member(sphere_id));

create policy "user_spheres_select_admin" on public.user_spheres
  for select to authenticated
  using (public.is_sphere_admin(sphere_id));

create policy "user_spheres_update_own" on public.user_spheres
  for update to authenticated using (user_id = auth.uid());

create policy "user_spheres_update_admin" on public.user_spheres
  for update to authenticated
  using (public.is_sphere_admin(sphere_id));

-- --- chat_messages ----------------------------------------------------------
create policy "chat_select_member" on public.chat_messages
  for select to authenticated using (public.is_member(sphere_id));

create policy "chat_insert_member" on public.chat_messages
  for insert to authenticated
  with check (public.is_member(sphere_id) and author_id = auth.uid());

create policy "chat_update_author_or_admin" on public.chat_messages
  for update to authenticated
  using (author_id = auth.uid() or public.is_sphere_admin(sphere_id));

create policy "chat_delete_admin" on public.chat_messages
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

-- --- groups -----------------------------------------------------------------
create policy "groups_select_member" on public.groups
  for select to authenticated using (public.is_member(sphere_id));

create policy "groups_insert_member" on public.groups
  for insert to authenticated
  with check (public.is_member(sphere_id) and created_by = auth.uid());

create policy "groups_update_admin_or_creator" on public.groups
  for update to authenticated
  using (public.is_sphere_admin(sphere_id) or created_by = auth.uid());

create policy "groups_delete_admin" on public.groups
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

-- --- group_members ----------------------------------------------------------
create policy "group_members_select_member" on public.group_members
  for select to authenticated
  using (
    public.is_group_member(group_id)
    or public.is_sphere_admin((select sphere_id from public.groups where id = group_id))
  );

create policy "group_members_insert_creator_or_invite" on public.group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      -- Accepted invitee.
      exists (
        select 1 from public.group_invites
        where group_id = group_members.group_id
          and invitee_id = auth.uid()
          and status = 'accepted'
      )
      -- Group creator joining their own group as the first member.
      or exists (
        select 1 from public.groups g
        where g.id = group_members.group_id
          and g.created_by = auth.uid()
      )
    )
  );

create policy "group_members_delete_self_or_admin" on public.group_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_sphere_admin((select sphere_id from public.groups where id = group_members.group_id))
  );

-- --- group_invites ----------------------------------------------------------
create policy "group_invites_select_related" on public.group_invites
  for select to authenticated
  using (
    invitee_id = auth.uid()
    or invited_by = auth.uid()
    or public.is_sphere_admin((select sphere_id from public.groups where id = group_invites.group_id))
  );

create policy "group_invites_insert_member" on public.group_invites
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and public.is_member((select sphere_id from public.groups where id = group_invites.group_id))
    and public.is_group_member(group_invites.group_id)
  );

create policy "group_invites_update_invitee" on public.group_invites
  for update to authenticated
  using (invitee_id = auth.uid());

-- --- group_messages ---------------------------------------------------------
create policy "group_messages_select_member" on public.group_messages
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_messages_insert_member" on public.group_messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_group_member(group_id));

create policy "group_messages_update_author" on public.group_messages
  for update to authenticated using (author_id = auth.uid());

create policy "group_messages_delete_admin" on public.group_messages
  for delete to authenticated
  using (public.is_sphere_admin((select sphere_id from public.groups where id = group_messages.group_id)));

-- --- promotions -------------------------------------------------------------
create policy "promotions_select_member" on public.promotions
  for select to authenticated using (public.is_member(sphere_id));

create policy "promotions_insert_member" on public.promotions
  for insert to authenticated
  with check (public.is_member(sphere_id) and user_id = auth.uid());

create policy "promotions_update_admin_or_own" on public.promotions
  for update to authenticated
  using (public.is_sphere_admin(sphere_id) or user_id = auth.uid());

create policy "promotions_delete_admin" on public.promotions
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

-- --- academic ---------------------------------------------------------------
create policy "subjects_select_member" on public.subjects
  for select to authenticated using (public.is_member(sphere_id));

create policy "subjects_insert_admin" on public.subjects
  for insert to authenticated with check (public.is_sphere_admin(sphere_id));

create policy "subjects_update_admin" on public.subjects
  for update to authenticated using (public.is_sphere_admin(sphere_id));

create policy "subjects_delete_admin" on public.subjects
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

create policy "resources_select_member" on public.academic_resources
  for select to authenticated using (public.is_member(sphere_id));

create policy "resources_insert_admin" on public.academic_resources
  for insert to authenticated with check (public.is_sphere_admin(sphere_id));

create policy "resources_update_admin" on public.academic_resources
  for update to authenticated using (public.is_sphere_admin(sphere_id));

create policy "resources_delete_admin" on public.academic_resources
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

create policy "calendar_select_member" on public.academic_calendar
  for select to authenticated using (public.is_member(sphere_id));

create policy "calendar_insert_admin" on public.academic_calendar
  for insert to authenticated with check (public.is_sphere_admin(sphere_id));

create policy "calendar_update_admin" on public.academic_calendar
  for update to authenticated using (public.is_sphere_admin(sphere_id));

create policy "calendar_delete_admin" on public.academic_calendar
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

-- --- clubs ------------------------------------------------------------------
create policy "clubs_select_member" on public.clubs
  for select to authenticated using (public.is_member(sphere_id));

create policy "clubs_insert_admin" on public.clubs
  for insert to authenticated with check (public.is_sphere_admin(sphere_id));

create policy "clubs_update_admin" on public.clubs
  for update to authenticated using (public.is_sphere_admin(sphere_id));

create policy "clubs_delete_admin" on public.clubs
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

create policy "club_gallery_select_member" on public.club_gallery
  for select to authenticated
  using (public.is_member((select sphere_id from public.clubs where id = club_gallery.club_id)));

create policy "club_gallery_insert_admin" on public.club_gallery
  for insert to authenticated
  with check (public.is_sphere_admin((select sphere_id from public.clubs where id = club_gallery.club_id)));

create policy "club_gallery_delete_admin" on public.club_gallery
  for delete to authenticated
  using (public.is_sphere_admin((select sphere_id from public.clubs where id = club_gallery.club_id)));

create policy "club_members_select_member" on public.club_members
  for select to authenticated
  using (public.is_member((select sphere_id from public.clubs where id = club_members.club_id)));

create policy "club_members_insert_self" on public.club_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member((select sphere_id from public.clubs where id = club_members.club_id))
  );

create policy "club_members_delete_self" on public.club_members
  for delete to authenticated
  using (user_id = auth.uid());

-- --- events -----------------------------------------------------------------
create policy "events_select_member" on public.events
  for select to authenticated using (public.is_member(sphere_id));

create policy "events_insert_admin" on public.events
  for insert to authenticated with check (public.is_sphere_admin(sphere_id));

create policy "events_update_admin" on public.events
  for update to authenticated using (public.is_sphere_admin(sphere_id));

create policy "events_delete_admin" on public.events
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

create policy "rsvps_select_member" on public.event_rsvps
  for select to authenticated
  using (public.is_member((select sphere_id from public.events where id = event_rsvps.event_id)));

create policy "rsvps_insert_self" on public.event_rsvps
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member((select sphere_id from public.events where id = event_rsvps.event_id))
  );

create policy "rsvps_delete_self" on public.event_rsvps
  for delete to authenticated using (user_id = auth.uid());

-- --- marketplace ------------------------------------------------------------
create policy "listings_select_member" on public.marketplace_listings
  for select to authenticated using (public.is_member(sphere_id));

create policy "listings_insert_member" on public.marketplace_listings
  for insert to authenticated
  with check (public.is_member(sphere_id) and seller_id = auth.uid());

create policy "listings_update_seller_or_admin" on public.marketplace_listings
  for update to authenticated
  using (seller_id = auth.uid() or public.is_sphere_admin(sphere_id));

create policy "listings_delete_seller_or_admin" on public.marketplace_listings
  for delete to authenticated
  using (seller_id = auth.uid() or public.is_sphere_admin(sphere_id));

-- --- global listings --------------------------------------------------------
create policy "global_listings_select_auth" on public.global_listings
  for select to authenticated using (status = 'active');

create policy "global_listings_insert_super_admin" on public.global_listings
  for insert to authenticated with check (public.is_super_admin());

create policy "global_listings_update_super_admin" on public.global_listings
  for update to authenticated using (public.is_super_admin());

create policy "global_listings_delete_super_admin" on public.global_listings
  for delete to authenticated using (public.is_super_admin());

-- --- reports ----------------------------------------------------------------
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

create policy "reports_select_related" on public.reports
  for select to authenticated
  using (
    reporter_id = auth.uid()
    or public.is_super_admin()
    or (sphere_id is not null and public.is_sphere_admin(sphere_id))
  );

create policy "reports_update_admin" on public.reports
  for update to authenticated
  using (public.is_super_admin() or (sphere_id is not null and public.is_sphere_admin(sphere_id)));

-- --- notifications ----------------------------------------------------------
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid());

create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- --- audit_logs -------------------------------------------------------------
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using (public.is_super_admin() or (sphere_id is not null and public.is_sphere_admin(sphere_id)));

create policy "audit_logs_insert_admin" on public.audit_logs
  for insert to authenticated
  with check (public.is_super_admin() or (sphere_id is not null and public.is_sphere_admin(sphere_id)));

-- --- ad_campaigns -----------------------------------------------------------
create policy "ad_campaigns_select_public" on public.ad_campaigns
  for select to authenticated using (active = true);

create policy "ad_campaigns_insert_super_admin" on public.ad_campaigns
  for insert to authenticated with check (public.is_super_admin());

create policy "ad_campaigns_update_super_admin" on public.ad_campaigns
  for update to authenticated using (public.is_super_admin());

create policy "ad_campaigns_delete_super_admin" on public.ad_campaigns
  for delete to authenticated using (public.is_super_admin());

-- --- platform_config --------------------------------------------------------
create policy "platform_config_select_auth" on public.platform_config
  for select to authenticated using (true);

create policy "platform_config_update_super_admin" on public.platform_config
  for update to authenticated using (public.is_super_admin());

-- ============================================================================
-- Realtime
-- ============================================================================

-- Supabase's `supabase_realtime` publication is environment-dependent: on a
-- fresh project it may already be FOR ALL TABLES (making ALTER ... ADD TABLE
-- fail) or may be empty (which PG < 15 refuses to ALTER). Add each table
-- defensively so the migration applies cleanly everywhere.
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when others then
  raise notice 'supabase_realtime already covers chat_messages';
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception when others then
  raise notice 'supabase_realtime already covers group_messages';
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then
  raise notice 'supabase_realtime already covers notifications';
end $$;

-- ============================================================================
-- Notifications (via DB triggers, SECURITY DEFINER so RLS doesn't block writes)
-- ============================================================================

create or replace function public.notify_group_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.invitee_id,
    'group_invite',
    'You have a new group invitation',
    'Someone invited you to join a group in your Sphere.',
    '/dashboard/groups'
  );
  return new;
end $$;

drop trigger if exists on_group_invite_created on public.group_invites;
create trigger on_group_invite_created
  after insert on public.group_invites
  for each row execute function public.notify_group_invite();

create or replace function public.notify_group_join_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select
    gi.invited_by,
    'group_invite_accepted',
    'Invitation accepted',
    'A member accepted your group invitation.',
    '/dashboard/groups'
  from public.group_invites gi
  where gi.id = new.id
    and gi.status = 'accepted';
  return new;
end $$;

drop trigger if exists on_group_invite_accepted on public.group_invites;
create trigger on_group_invite_accepted
  after update of status on public.group_invites
  for each row
  when (new.status = 'accepted')
  execute function public.notify_group_join_accepted();
