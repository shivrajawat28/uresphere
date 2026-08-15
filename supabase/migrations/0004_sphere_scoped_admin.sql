-- ============================================================================
-- Uresphere — sphere-scoped admin (migration 0004)
--
-- Turns the admin panel into a two-level architecture:
--   Level 1  /admin                      → platform sphere selector + global sections
--   Level 2  /admin/spheres/[sphereId]   → sphere-scoped administration
--
-- Changes (all idempotent / additive — nothing is weakened):
--   1. role_assignments.role accepts the new permission-first role names
--      (sphere_admin, academic_manager, social_moderator, club_manager,
--      event_manager, marketplace_moderator, listing_manager,
--      promotion_moderator) while keeping legacy names valid.
--   2. is_sphere_admin() now also returns true for a super_admin (any Sphere)
--      and for users holding a `sphere_admin` role assignment in that Sphere —
--      so the existing write policies keep working for platform admins across
--      all Spheres without touching each policy.
--   3. has_permission() grants a `sphere_admin` assignment full Sphere scope.
--   4. admin_sphere_overview() — a SECURITY DEFINER RPC that returns every
--      Sphere the caller may administer plus member/club/event/listing counts.
--      Super admins see all active Spheres; sphere admins / scoped managers see
--      only the Spheres they belong to or hold an assignment in.
--   5. SELECT-only policies let a super_admin read sphere-scoped data in any
--      Sphere (needed by the Level-2 admin UI). Writes stay gated by the
--      existing is_sphere_admin / has_permission policies + server actions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. role_assignments — permission-first role names
-- ---------------------------------------------------------------------------

alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments
  add constraint role_assignments_role_check
  check (role in (
    -- Legacy roles (kept so existing data stays valid).
    'moderator', 'section_manager', 'ambassador',
    -- New permission-first roles.
    'sphere_admin', 'academic_manager', 'social_moderator', 'club_manager',
    'event_manager', 'marketplace_moderator', 'listing_manager', 'promotion_moderator'
  ));

-- ---------------------------------------------------------------------------
-- 2. is_sphere_admin — super_admin (any Sphere) + sphere_admin assignment
-- ---------------------------------------------------------------------------

create or replace function public.is_sphere_admin(target_sphere uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Platform owner: administrative powers in every Sphere.
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'super_admin'
        and p.account_status = 'active'
    )
    or exists (
      select 1
      from public.user_spheres us
      join public.profiles p on p.id = us.user_id
      where us.user_id = auth.uid()
        and us.sphere_id = target_sphere
        and us.membership_status = 'active'
        and p.account_status = 'active'
        and p.role in ('admin', 'super_admin')
    )
    -- User assigned the `sphere_admin` role for this Sphere.
    or exists (
      select 1 from public.role_assignments ra
      where ra.user_id = auth.uid()
        and ra.sphere_id = target_sphere
        and ra.role = 'sphere_admin'
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. has_permission — sphere_admin assignment grants full Sphere scope
-- ---------------------------------------------------------------------------

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
    -- sphere_admin: full administrative access inside the assigned Sphere.
    or exists (
      select 1
      from public.role_assignments ra
      join public.user_spheres us on us.user_id = ra.user_id and us.sphere_id = ra.sphere_id
      join public.profiles p on p.id = ra.user_id
      where ra.user_id = auth.uid()
        and ra.role = 'sphere_admin'
        and us.membership_status = 'active'
        and p.account_status = 'active'
    )
    -- Scoped manager: permission present in the assignment's scope.permissions,
    -- optionally narrowed by degree/year/branch when a scope filter is passed.
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
-- 4. admin_sphere_overview — Level-1 sphere selector data (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace function public.admin_sphere_overview()
returns table (
  sphere_id uuid,
  name text,
  slug text,
  city text,
  state text,
  college_status text,
  member_count bigint,
  club_count bigint,
  upcoming_event_count bigint,
  listing_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.slug,
    coalesce(c.city, ''),
    coalesce(c.state, ''),
    coalesce(c.status, 'active'),
    (select count(*) from public.user_spheres us
      where us.sphere_id = s.id and us.membership_status = 'active'),
    (select count(*) from public.clubs cl where cl.sphere_id = s.id),
    (select count(*) from public.events ev
      where ev.sphere_id = s.id and ev.event_date >= current_date),
    (select count(*) from public.marketplace_listings ml
      where ml.sphere_id = s.id and ml.status = 'active')
  from public.spheres s
  left join public.colleges c on c.sphere_id = s.id
  where (
    -- Platform owner sees every active Sphere.
    public.is_super_admin()
    -- Sphere admins (profile role) see Spheres they actively belong to.
    or exists (
      select 1
      from public.user_spheres us
      join public.profiles p on p.id = us.user_id
      where us.user_id = auth.uid()
        and us.sphere_id = s.id
        and us.membership_status = 'active'
        and p.account_status = 'active'
        and p.role = 'admin'
    )
    -- Scoped managers see Spheres they hold an assignment in.
    or exists (
      select 1 from public.role_assignments ra
      where ra.user_id = auth.uid() and ra.sphere_id = s.id
    )
  )
  -- Hidden Spheres (deactivated college) are not offered to anyone.
  and (c.status is null or c.status = 'active')
  order by s.name
$$;

grant execute on function public.admin_sphere_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 4b. profiles — same-Sphere admin visibility for sphere_admin assignments
-- ---------------------------------------------------------------------------

-- True when the caller has administrative visibility over `uid`: a super
-- admin (any member), a Sphere admin (profile role) sharing a Sphere with the
-- target, or a `sphere_admin` role-assignment holder in a Sphere the target
-- belongs to. Replaces the old profile-admin policies so role-based sphere
-- administrators work at the RLS layer too.
create or replace function public.is_sphere_admin_for_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin' and p.account_status = 'active'
    )
    or exists (
      select 1
      from public.user_spheres me
      join public.user_spheres them on them.sphere_id = me.sphere_id
      join public.profiles mep on mep.id = me.user_id
      where me.user_id = auth.uid()
        and them.user_id = uid
        and me.membership_status = 'active'
        and them.membership_status = 'active'
        and mep.account_status = 'active'
        and mep.role = 'admin'
    )
    or exists (
      select 1
      from public.role_assignments ra
      join public.user_spheres them on them.sphere_id = ra.sphere_id
      where ra.user_id = auth.uid()
        and ra.role = 'sphere_admin'
        and them.user_id = uid
        and them.membership_status = 'active'
    );
$$;

drop policy if exists "profiles_select_admin_same_sphere" on public.profiles;
create policy "profiles_select_admin_same_sphere" on public.profiles
  for select to authenticated
  using (public.is_sphere_admin_for_member(id));

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.is_sphere_admin_for_member(id));

-- ---------------------------------------------------------------------------
-- 4c. Close a pre-existing cross-Sphere write hole in the academic_units
--     policies: they gated writes on has_permission(...) alone, which never
--     checks the row's Sphere. A Sphere admin from campus A could therefore
--     insert/update/delete units in campus B's academic content. Re-create
--     them Sphere-aware: an admin may write ONLY rows in a Sphere they belong
--     to (is_member) or administer (is_sphere_admin).
-- ---------------------------------------------------------------------------

drop policy if exists "academic_units_insert_admin" on public.academic_units;
create policy "academic_units_insert_admin" on public.academic_units
  for insert to authenticated
  with check (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('academic.create') and public.is_member(sphere_id))
  );

drop policy if exists "academic_units_update_admin" on public.academic_units;
create policy "academic_units_update_admin" on public.academic_units
  for update to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('academic.update') and public.is_member(sphere_id))
  );

drop policy if exists "academic_units_delete_admin" on public.academic_units;
create policy "academic_units_delete_admin" on public.academic_units
  for delete to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('academic.delete') and public.is_member(sphere_id))
  );

-- ---------------------------------------------------------------------------
-- 5. Super admin read access across Spheres (SELECT only — writes stay gated)
-- ---------------------------------------------------------------------------

create policy "user_spheres_select_super_admin" on public.user_spheres
  for select to authenticated using (public.is_super_admin());

create policy "chat_select_super_admin" on public.chat_messages
  for select to authenticated using (public.is_super_admin());

create policy "groups_select_super_admin" on public.groups
  for select to authenticated using (public.is_super_admin());

create policy "group_members_select_super_admin" on public.group_members
  for select to authenticated using (public.is_super_admin());

create policy "group_invites_select_super_admin" on public.group_invites
  for select to authenticated using (public.is_super_admin());

create policy "group_messages_select_super_admin" on public.group_messages
  for select to authenticated using (public.is_super_admin());

create policy "promotions_select_super_admin" on public.promotions
  for select to authenticated using (public.is_super_admin());

create policy "listings_select_super_admin" on public.marketplace_listings
  for select to authenticated using (public.is_super_admin());

create policy "events_select_super_admin" on public.events
  for select to authenticated using (public.is_super_admin());

create policy "rsvps_select_super_admin" on public.event_rsvps
  for select to authenticated using (public.is_super_admin());

create policy "event_questions_select_super_admin" on public.event_questions
  for select to authenticated using (public.is_super_admin());

create policy "clubs_select_super_admin" on public.clubs
  for select to authenticated using (public.is_super_admin());

create policy "club_gallery_select_super_admin" on public.club_gallery
  for select to authenticated using (public.is_super_admin());

create policy "club_members_select_super_admin" on public.club_members
  for select to authenticated using (public.is_super_admin());

create policy "subjects_select_super_admin" on public.subjects
  for select to authenticated using (public.is_super_admin());

create policy "resources_select_super_admin" on public.academic_resources
  for select to authenticated using (public.is_super_admin());

create policy "calendar_select_super_admin" on public.academic_calendar
  for select to authenticated using (public.is_super_admin());

create policy "academic_units_select_super_admin" on public.academic_units
  for select to authenticated using (public.is_super_admin());

create policy "orders_select_super_admin" on public.marketplace_orders
  for select to authenticated using (public.is_super_admin());

create policy "shop_select_super_admin" on public.shop_products
  for select to authenticated using (public.is_super_admin());
