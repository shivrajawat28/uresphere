-- ============================================================================
-- Uresphere — college directory hardening (migration 0003)
-- 1. Admins can see inactive colleges (so they can reactivate them); the
--    public `colleges_select_public` policy still hides them from everyone
--    else, including the signup autocomplete.
-- 2. `handle_new_user` is hardened so lazy Sphere creation can never
--    duplicate a slug, even when two signups race for a brand-new college.
-- Run AFTER 0002_platform_directory.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Admin directory visibility
-- ---------------------------------------------------------------------------

-- RLS policies OR together, so super admins (and anyone holding
-- colleges.update) see ALL colleges, active and inactive, while the public
-- policy continues to expose only active colleges to anon / regular users.
create policy "colleges_select_admin" on public.colleges
  for select to authenticated
  using (public.is_super_admin() or public.has_permission('colleges.update'));

-- ---------------------------------------------------------------------------
-- 2. Race-safe Sphere provisioning in the signup trigger
-- ---------------------------------------------------------------------------

-- Same resolution logic as 0002, but the lazy Sphere insert is idempotent:
-- `on conflict (slug) do nothing` + re-select guarantees one Sphere per
-- college no matter how many signups land at once for a new campus.
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
