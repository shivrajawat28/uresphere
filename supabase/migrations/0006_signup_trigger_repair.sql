-- ============================================================================
-- Uresphere — signup trigger repair (migration 0006)
--
-- Live verification exposed that the connected project is running the LEGACY
-- 0001 `handle_new_user` (free-text Sphere creation) instead of the
-- college-directory version from 0002/0003. Symptoms:
--   * the first member of a pre-existing Sphere never became its admin
--     (the legacy trigger only promotes when IT creates the Sphere), and
--   * the DB would happily mint a Sphere from arbitrary free text.
-- The app validates college_id server-side, so signup is safe, but the DB
-- trigger must match the app's model. This migration:
--   1. Re-creates `handle_new_user` with the 0003 college-directory version
--      (active-college resolution, race-safe lazy Sphere creation, and
--      first-member-admin promotion).
--   2. Repairs legacy data: for every Sphere that has active members but NO
--      admin, promotes its earliest active member — the same rule the
--      trigger applies going forward. Idempotent: once a Sphere has an
--      admin, it no longer matches.
-- Run AFTER 0005_dashboard_community.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. handle_new_user — college-directory version (identical to 0003)
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
  -- added without one; the ON CONFLICT makes concurrent signups safe and
  -- guarantees no duplicate Sphere is ever created for the same slug.
  if v_college.sphere_id is null then
    insert into public.spheres (name, slug)
    values (v_college.name, v_college.slug)
    on conflict (slug) do nothing;
    select id into v_sphere_id from public.spheres where slug = v_college.slug;
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
-- 2. Legacy data repair — first-member admin promotion
-- ---------------------------------------------------------------------------

-- For every Sphere that has at least one active member but no active
-- admin/super_admin, promote its earliest active member. Matches the rule the
-- trigger applies to new Spheres; idempotent and safe to re-run.
update public.profiles p
set role = 'admin'
from public.user_spheres us
where us.user_id = p.id
  and us.membership_status = 'active'
  and p.role = 'user'
  and p.id = (
    select us2.user_id
    from public.user_spheres us2
    where us2.sphere_id = us.sphere_id
      and us2.membership_status = 'active'
    order by us2.created_at asc
    limit 1
  )
  and not exists (
    select 1
    from public.user_spheres us3
    join public.profiles p3 on p3.id = us3.user_id
    where us3.sphere_id = us.sphere_id
      and us3.membership_status = 'active'
      and p3.account_status = 'active'
      and p3.role in ('admin', 'super_admin')
  );
