-- ============================================================================
-- Uresphere — platform directory & community features
-- Adds: admin-managed college directory (replaces free-text Sphere creation),
-- upcoming-plans feedback, team members, work-with-us applications,
-- advertising contact config, event Q&A, UreSphere Shop, marketplace orders,
-- and RBAC (role + permission + scope).
-- Run AFTER 0001_initial_schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. College directory (admin-managed). One approved college == one Sphere.
-- ---------------------------------------------------------------------------

create table if not exists public.colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null default '',
  slug text not null unique,
  city text not null default '',
  state text not null default '',
  country text not null default 'India',
  logo_url text,
  cover_url text,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  sphere_id uuid references public.spheres (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists colleges_slug_idx on public.colleges (slug);
create index if not exists colleges_status_idx on public.colleges (status);

create table if not exists public.college_aliases (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges (id) on delete cascade,
  alias text not null,
  unique (college_id, alias)
);

create index if not exists college_aliases_alias_idx on public.college_aliases (lower(alias));

-- Public "Request your college" submissions (no account needed).
create table if not exists public.college_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists college_requests_status_idx on public.college_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. "Help shape what's coming next" — plans + one feedback entry per user
-- ---------------------------------------------------------------------------

create table if not exists public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_feedback (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.platform_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, user_id)
);

create index if not exists plan_feedback_plan_idx on public.plan_feedback (plan_id);

-- ---------------------------------------------------------------------------
-- 3. About: team, work-with-us, advertising contact
-- ---------------------------------------------------------------------------

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Member' check (role in ('Founder', 'Co-Founder', 'Member', 'Advisor')),
  photo_url text,
  short_bio text not null default '',
  bio text not null default '',
  social_links jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.work_with_us_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null default '',
  college text not null default '',
  year text not null default '',
  skills text not null default '',
  experience text not null default '',
  portfolio text not null default '',
  motivation text not null default '',
  links text not null default '',
  resume_url text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'shortlisted', 'rejected')),
  admin_note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists work_with_us_status_idx on public.work_with_us_applications (status, created_at desc);

-- Single-row advertising contact configuration ("Advertise on UreSphere" modal).
create table if not exists public.advertising_config (
  id integer primary key default 1 check (id = 1),
  contact_phone text not null default '',
  contact_email text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.advertising_config (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Events — "Ask about this event" Q&A
-- ---------------------------------------------------------------------------

create table if not exists public.event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 500),
  answer text,
  answered_by uuid references auth.users (id),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_questions_event_idx on public.event_questions (event_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. UreSphere Shop (admin-managed products) & student marketplace orders
-- ---------------------------------------------------------------------------

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default 'essentials' check (category in ('food', 'stationery', 'essentials', 'other')),
  price_cents integer not null check (price_cents >= 0),
  image_urls text[] not null default '{}',
  availability text not null default 'in_stock' check (availability in ('in_stock', 'out_of_stock')),
  delivery_info text not null default '',
  payment_info text not null default '',
  active boolean not null default true,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists shop_products_sphere_idx on public.shop_products (sphere_id, active, category);

-- Buy-now requests on student listings. Fee/settlement are stored for display
-- only; no payment gateway exists yet.
create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid not null references auth.users (id),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  buyer_name text not null,
  buyer_phone text not null,
  address text not null,
  delivery_date date,
  price_cents integer not null default 0,
  fee_cents integer not null default 0,
  settlement_cents integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'in_progress', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_orders_seller_idx on public.marketplace_orders (seller_id, status, created_at desc);
create index if not exists marketplace_orders_sphere_idx on public.marketplace_orders (sphere_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. RBAC — role + permission + scope (no hardcoded micro-roles)
-- ---------------------------------------------------------------------------

create table if not exists public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  role text not null check (role in ('moderator', 'section_manager', 'ambassador')),
  -- scope shape: { "permissions": ["academic.update", ...], "degree": "...",
  --                "year": "...", "branch": "...", "club_id": "..." }
  scope jsonb not null default '{}'::jsonb,
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (user_id, sphere_id, role)
);

create index if not exists role_assignments_user_idx on public.role_assignments (user_id);
create index if not exists role_assignments_sphere_idx on public.role_assignments (sphere_id);

-- ---------------------------------------------------------------------------
-- 6b. RBAC helper — permission check with scope.
--     Defined here (before any policy that references it) so migrations and
--     policies can use it regardless of their position in this file.
-- ---------------------------------------------------------------------------

-- Permission is granted when the user is a Sphere admin / super admin (full
-- access) OR holds a role_assignment whose scope.permissions include it.
-- A scope filter (e.g. degree/year/branch) can be passed as a second argument;
-- when provided, the assignment's scope must match on all present keys.
create or replace function public.has_permission(perm text, scope_filter jsonb default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.user_spheres us
      join public.profiles p on p.id = us.user_id
      where us.user_id = auth.uid()
        and us.membership_status = 'active'
        and p.account_status = 'active'
        and p.role in ('admin', 'super_admin')
    )
    or exists (
      select 1
      from public.role_assignments ra
      join public.user_spheres us on us.user_id = ra.user_id and us.sphere_id = ra.sphere_id
      join public.profiles p on p.id = ra.user_id
      where ra.user_id = auth.uid()
        and us.membership_status = 'active'
        and p.account_status = 'active'
        and (ra.scope->'permissions') ? perm
        and (
          scope_filter is null
          or (scope_filter->>'degree') is null
          or (ra.scope->>'degree') = (scope_filter->>'degree')
        )
        and (
          scope_filter is null
          or (scope_filter->>'year') is null
          or (ra.scope->>'year') = (scope_filter->>'year')
        )
        and (
          scope_filter is null
          or (scope_filter->>'branch') is null
          or (ra.scope->>'branch') = (scope_filter->>'branch')
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 7. Promotions — manual payment verification (QR + UTR) fields
-- ---------------------------------------------------------------------------

alter table public.promotions
  add column if not exists utr text,
  add column if not exists payment_note text not null default '',
  add column if not exists paid_at timestamptz;

-- Extend fee_status to include 'payment_pending' (submitted UTR, awaiting review).
alter table public.promotions drop constraint if exists promotions_fee_status_check;
alter table public.promotions
  add constraint promotions_fee_status_check
  check (fee_status in ('free', 'due', 'payment_pending', 'paid'));

-- Promotion payment config (QR image + instructions + price + duration days)
-- lives in platform_config under the 'promotion_payment' key; admin updates it.

-- ---------------------------------------------------------------------------
-- 7b. Academic hierarchy: Degree → Year → Branch → Subject → Unit
--     (subjects table gains taxonomy columns; units are a new child table)
-- ---------------------------------------------------------------------------

alter table public.subjects
  add column if not exists degree text not null default '',
  add column if not exists year text not null default '',
  add column if not exists branch text not null default '',
  add column if not exists display_order integer not null default 0;

create index if not exists subjects_taxonomy_idx on public.subjects (sphere_id, degree, year, branch, display_order);

create table if not exists public.academic_units (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists academic_units_subject_idx on public.academic_units (subject_id, display_order);

-- Resources can be pinned to a unit within a subject.
alter table public.academic_resources
  add column if not exists unit_id uuid references public.academic_units (id) on delete set null;

alter table public.academic_units enable row level security;

create policy "academic_units_select_member" on public.academic_units
  for select to authenticated using (public.is_member(sphere_id));

create policy "academic_units_insert_admin" on public.academic_units
  for insert to authenticated
  with check (public.is_sphere_admin(sphere_id) or public.has_permission('academic.create'));

create policy "academic_units_update_admin" on public.academic_units
  for update to authenticated
  using (public.is_sphere_admin(sphere_id) or public.has_permission('academic.update'));

create policy "academic_units_delete_admin" on public.academic_units
  for delete to authenticated
  using (public.is_sphere_admin(sphere_id) or public.has_permission('academic.delete'));

-- ---------------------------------------------------------------------------
-- 8. Rework signup provisioning: resolve the Sphere via the college directory.
--    No arbitrary free-text Sphere creation anymore. If no approved college
--    matches, the user gets NO Sphere (the signup action validates first).
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_college_id uuid;
  v_college record;
  v_sphere_id uuid;
  v_handle text;
  v_first_in_sphere boolean;
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

  v_college_id := nullif(trim(coalesce(new.raw_user_meta_data->>'college_id', '')), '')::uuid;

  if v_college_id is not null then
    select * into v_college from public.colleges where id = v_college_id and status = 'active';
  else
    -- Legacy/free-text path: match deterministically against the directory only.
    select c.* into v_college
    from public.colleges c
    where c.status = 'active'
      and (c.slug = public.normalize_college(new.raw_user_meta_data->>'college_input')
           or exists (
             select 1 from public.college_aliases ca
             where ca.college_id = c.id
               and lower(ca.alias) = lower(trim(new.raw_user_meta_data->>'college_input'))
           ))
    limit 1;
  end if;

  -- No approved college -> leave the user without a Sphere. The signup action
  -- validates college_id before creating the account, so this is defensive only.
  if v_college.id is null then
    return new;
  end if;

  -- One college == one Sphere. Create the Sphere lazily if the college was
  -- added before this migration (otherwise admin creation creates it eagerly).
  if v_college.sphere_id is null then
    insert into public.spheres (name, slug)
    values (v_college.name, v_college.slug)
    returning id into v_sphere_id;
    update public.colleges set sphere_id = v_sphere_id where id = v_college.id;
  else
    v_sphere_id := v_college.sphere_id;
  end if;

  v_first_in_sphere := not exists (
    select 1 from public.user_spheres where sphere_id = v_sphere_id
  );

  v_handle := public.random_handle();

  insert into public.user_spheres (user_id, sphere_id, anonymous_handle, membership_status)
  values (new.id, v_sphere_id, v_handle, 'active');

  -- First member of a brand-new Sphere becomes its admin so every campus
  -- starts with a moderator.
  if v_first_in_sphere then
    update public.profiles set role = 'admin' where id = new.id and role = 'user';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Enable RLS on the new tables
-- ---------------------------------------------------------------------------

alter table public.colleges enable row level security;
alter table public.college_aliases enable row level security;
alter table public.college_requests enable row level security;
alter table public.platform_plans enable row level security;
alter table public.plan_feedback enable row level security;
alter table public.team_members enable row level security;
alter table public.work_with_us_applications enable row level security;
alter table public.advertising_config enable row level security;
alter table public.event_questions enable row level security;
alter table public.shop_products enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.role_assignments enable row level security;

-- ---------------------------------------------------------------------------
-- 11. Policies
-- ---------------------------------------------------------------------------

-- --- spheres ----------------------------------------------------------------
-- The signup trigger writes spheres via SECURITY DEFINER; this policy lets
-- super admins create a college's Sphere eagerly through the admin UI.
create policy "spheres_insert_super_admin" on public.spheres
  for insert to authenticated with check (public.is_super_admin());

-- --- colleges ---------------------------------------------------------------
-- Directory is public (needed by the signup autocomplete, which runs before
-- authentication). Private fields are not exposed; admin edits are gated below.
create policy "colleges_select_public" on public.colleges
  for select to anon, authenticated using (status = 'active');

create policy "colleges_insert_admin" on public.colleges
  for insert to authenticated with check (public.is_super_admin() or public.has_permission('colleges.create'));

create policy "colleges_update_admin" on public.colleges
  for update to authenticated using (public.is_super_admin() or public.has_permission('colleges.update'));

create policy "colleges_delete_admin" on public.colleges
  for delete to authenticated using (public.is_super_admin() or public.has_permission('colleges.delete'));

-- --- college_aliases --------------------------------------------------------
create policy "college_aliases_select_public" on public.college_aliases
  for select to anon, authenticated using (true);

create policy "college_aliases_insert_admin" on public.college_aliases
  for insert to authenticated
  with check (public.is_super_admin() or public.has_permission('colleges.update'));

create policy "college_aliases_delete_admin" on public.college_aliases
  for delete to authenticated
  using (public.is_super_admin() or public.has_permission('colleges.update'));

-- --- college_requests (public submission, admin review) ---------------------
create policy "college_requests_insert_public" on public.college_requests
  for insert to anon, authenticated with check (true);

create policy "college_requests_select_admin" on public.college_requests
  for select to authenticated
  using (public.is_super_admin() or public.has_permission('colleges.update'));

create policy "college_requests_update_admin" on public.college_requests
  for update to authenticated
  using (public.is_super_admin() or public.has_permission('colleges.update'));

-- --- platform_plans ---------------------------------------------------------
create policy "plans_select_public" on public.platform_plans
  for select to anon, authenticated using (active = true);

create policy "plans_insert_admin" on public.platform_plans
  for insert to authenticated with check (public.is_super_admin() or public.has_permission('feedback.manage'));

create policy "plans_update_admin" on public.platform_plans
  for update to authenticated using (public.is_super_admin() or public.has_permission('feedback.manage'));

create policy "plans_delete_admin" on public.platform_plans
  for delete to authenticated using (public.is_super_admin() or public.has_permission('feedback.manage'));

-- --- plan_feedback (own row only) -------------------------------------------
create policy "plan_feedback_select_own" on public.plan_feedback
  for select to authenticated using (user_id = auth.uid());

create policy "plan_feedback_select_admin" on public.plan_feedback
  for select to authenticated
  using (public.is_super_admin() or public.has_permission('feedback.view'));

create policy "plan_feedback_upsert_own" on public.plan_feedback
  for insert to authenticated with check (user_id = auth.uid());

create policy "plan_feedback_update_own" on public.plan_feedback
  for update to authenticated using (user_id = auth.uid());

-- --- team_members -----------------------------------------------------------
create policy "team_select_public" on public.team_members
  for select to anon, authenticated using (active = true);

create policy "team_insert_admin" on public.team_members
  for insert to authenticated with check (public.is_super_admin() or public.has_permission('team.manage'));

create policy "team_update_admin" on public.team_members
  for update to authenticated using (public.is_super_admin() or public.has_permission('team.manage'));

create policy "team_delete_admin" on public.team_members
  for delete to authenticated using (public.is_super_admin() or public.has_permission('team.manage'));

-- --- work_with_us_applications (public submit, admin review) ----------------
create policy "work_with_us_insert_public" on public.work_with_us_applications
  for insert to anon, authenticated with check (true);

create policy "work_with_us_select_admin" on public.work_with_us_applications
  for select to authenticated
  using (public.is_super_admin() or public.has_permission('work_with_us.manage'));

create policy "work_with_us_update_admin" on public.work_with_us_applications
  for update to authenticated
  using (public.is_super_admin() or public.has_permission('work_with_us.manage'));

-- --- advertising_config -----------------------------------------------------
create policy "advertising_select_public" on public.advertising_config
  for select to anon, authenticated using (true);

create policy "advertising_update_admin" on public.advertising_config
  for update to authenticated using (public.is_super_admin() or public.has_permission('advertising.manage'));

-- --- event_questions --------------------------------------------------------
create policy "event_questions_select_member" on public.event_questions
  for select to authenticated
  using (public.is_member((select sphere_id from public.events where id = event_questions.event_id)));

create policy "event_questions_insert_member" on public.event_questions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member((select sphere_id from public.events where id = event_questions.event_id))
  );

create policy "event_questions_update_admin" on public.event_questions
  for update to authenticated
  using (public.is_sphere_admin((select sphere_id from public.events where id = event_questions.event_id)));

-- --- shop_products ----------------------------------------------------------
create policy "shop_select_member" on public.shop_products
  for select to authenticated using (public.is_member(sphere_id));

create policy "shop_insert_admin" on public.shop_products
  for insert to authenticated with check (public.is_sphere_admin(sphere_id));

create policy "shop_update_admin" on public.shop_products
  for update to authenticated using (public.is_sphere_admin(sphere_id));

create policy "shop_delete_admin" on public.shop_products
  for delete to authenticated using (public.is_sphere_admin(sphere_id));

-- --- marketplace_orders -----------------------------------------------------
create policy "orders_select_related" on public.marketplace_orders
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or public.is_sphere_admin(sphere_id)
  );

create policy "orders_insert_buyer" on public.marketplace_orders
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and public.is_member(sphere_id)
  );

create policy "orders_update_related" on public.marketplace_orders
  for update to authenticated
  using (
    seller_id = auth.uid()
    or public.is_sphere_admin(sphere_id)
  );

-- --- role_assignments -------------------------------------------------------
create policy "role_assignments_select_admin" on public.role_assignments
  for select to authenticated
  using (public.is_sphere_admin(sphere_id) or public.is_super_admin());

create policy "role_assignments_insert_admin" on public.role_assignments
  for insert to authenticated
  with check (public.is_sphere_admin(sphere_id) or public.is_super_admin());

create policy "role_assignments_update_admin" on public.role_assignments
  for update to authenticated
  using (public.is_sphere_admin(sphere_id) or public.is_super_admin());

create policy "role_assignments_delete_admin" on public.role_assignments
  for delete to authenticated
  using (public.is_sphere_admin(sphere_id) or public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 12. Seed — promotional payment defaults + a sample plan/team only if empty
-- ---------------------------------------------------------------------------

insert into public.platform_config (key, value) values
  ('promotion_payment', '{"price_inr": 10, "duration_days": 1, "qr_image_url": null, "instructions": "Scan the QR and pay the promotion fee. Enter the UTR/reference number below so we can verify it."}'::jsonb)
on conflict (key) do nothing;
