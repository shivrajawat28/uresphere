-- ============================================================================
-- Uresphere — academic section managers (migration 0010)
--
-- Makes `academic_manager` a real, section-scoped authorization inside the
-- dashboard. No new tables: the authorization record already lives in
-- `role_assignments` (role = 'academic_manager', scope = { permissions,
-- sections: [{degree, year, branch}, ...] }, with the legacy scalar
-- degree/year/branch kept as the first section for backward compatibility).
--
-- Changes (all idempotent / additive — nothing is weakened):
--   1. role_assignments_select_own — a user may read their OWN assignments.
--      Without this, a manager's session could never resolve their own role
--      (the old policy only allowed sphere admins / super admins to read
--      role_assignments), so the dashboard had no way to surface the
--      workspace and every server action gate failed for managers.
--   2. can_manage_academic(sphere, degree, year, branch) — SECURITY DEFINER
--      helper: true for sphere administrators OR an academic_manager whose
--      scope covers the requested section (sections array, with legacy
--      scalar fallback; blank fields are wildcards).
--   3. Academic write policies re-created so an authorized academic manager
--      can manage ONLY the academic rows in their assigned section(s):
--      subjects (row carries degree/year/branch), units and resources
--      (section comes from the linked subject), calendar (sphere-wide — no
--      section taxonomy, same rule as the existing server action).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Users read their own role assignments (drives the dashboard workspace)
-- ---------------------------------------------------------------------------

create policy "role_assignments_select_own" on public.role_assignments
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. can_manage_academic — section-scoped academic authorization
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_academic(target_sphere uuid, p_degree text, p_year text, p_branch text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Sphere administrators (profile role / super admin / sphere_admin
    -- assignment) keep full academic powers inside the Sphere.
    public.is_sphere_admin(target_sphere)
    or exists (
      select 1
      from public.role_assignments ra
      join public.user_spheres us on us.user_id = ra.user_id and us.sphere_id = ra.sphere_id
      join public.profiles p on p.id = ra.user_id
      where ra.user_id = auth.uid()
        and ra.sphere_id = target_sphere
        and ra.role = 'academic_manager'
        and us.membership_status = 'active'
        and p.account_status = 'active'
        and (
          -- Preferred: a `sections` array in the assignment scope. A blank
          -- field inside a section is a wildcard, so { year: 'First Year' }
          -- covers every degree/branch in First Year.
          (
            jsonb_typeof(ra.scope->'sections') = 'array'
            and jsonb_array_length(ra.scope->'sections') > 0
            and exists (
              select 1
              from jsonb_array_elements(ra.scope->'sections') s
              where (coalesce(s->>'degree', '') = '' or lower(s->>'degree') = lower(coalesce(p_degree, '')))
                and (coalesce(s->>'year', '') = '' or lower(s->>'year') = lower(coalesce(p_year, '')))
                and (coalesce(s->>'branch', '') = '' or lower(s->>'branch') = lower(coalesce(p_branch, '')))
            )
          )
          -- Legacy scalar degree/year/branch (single section).
          or (
            jsonb_typeof(ra.scope->'sections') is distinct from 'array'
            and (coalesce(ra.scope->>'degree', '') = '' or lower(ra.scope->>'degree') = lower(coalesce(p_degree, '')))
            and (coalesce(ra.scope->>'year', '') = '' or lower(ra.scope->>'year') = lower(coalesce(p_year, '')))
            and (coalesce(ra.scope->>'branch', '') = '' or lower(ra.scope->>'branch') = lower(coalesce(p_branch, '')))
          )
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. Academic write policies — section-scoped academic managers
-- ---------------------------------------------------------------------------

-- --- subjects (section comes from the row itself) --------------------------
drop policy if exists "subjects_insert_admin" on public.subjects;
create policy "subjects_insert_admin" on public.subjects
  for insert to authenticated
  with check (public.can_manage_academic(sphere_id, degree, year, branch));

drop policy if exists "subjects_update_admin" on public.subjects;
create policy "subjects_update_admin" on public.subjects
  for update to authenticated
  using (public.can_manage_academic(sphere_id, degree, year, branch))
  with check (public.can_manage_academic(sphere_id, degree, year, branch));

drop policy if exists "subjects_delete_admin" on public.subjects;
create policy "subjects_delete_admin" on public.subjects
  for delete to authenticated
  using (public.can_manage_academic(sphere_id, degree, year, branch));

-- --- academic_units (section comes from the linked subject) ----------------
drop policy if exists "academic_units_insert_admin" on public.academic_units;
create policy "academic_units_insert_admin" on public.academic_units
  for insert to authenticated
  with check (
    public.can_manage_academic(
      sphere_id,
      coalesce((select degree from public.subjects where id = subject_id), ''),
      coalesce((select year from public.subjects where id = subject_id), ''),
      coalesce((select branch from public.subjects where id = subject_id), '')
    )
  );

drop policy if exists "academic_units_update_admin" on public.academic_units;
create policy "academic_units_update_admin" on public.academic_units
  for update to authenticated
  using (
    public.can_manage_academic(
      sphere_id,
      coalesce((select degree from public.subjects where id = subject_id), ''),
      coalesce((select year from public.subjects where id = subject_id), ''),
      coalesce((select branch from public.subjects where id = subject_id), '')
    )
  )
  with check (
    public.can_manage_academic(
      sphere_id,
      coalesce((select degree from public.subjects where id = subject_id), ''),
      coalesce((select year from public.subjects where id = subject_id), ''),
      coalesce((select branch from public.subjects where id = subject_id), '')
    )
  );

drop policy if exists "academic_units_delete_admin" on public.academic_units;
create policy "academic_units_delete_admin" on public.academic_units
  for delete to authenticated
  using (
    public.can_manage_academic(
      sphere_id,
      coalesce((select degree from public.subjects where id = subject_id), ''),
      coalesce((select year from public.subjects where id = subject_id), ''),
      coalesce((select branch from public.subjects where id = subject_id), '')
    )
  );

-- --- academic_resources (section from the linked subject; General = sphere) -
drop policy if exists "resources_insert_admin" on public.academic_resources;
create policy "resources_insert_admin" on public.academic_resources
  for insert to authenticated
  with check (
    (
      subject_id is not null
      and public.can_manage_academic(
        sphere_id,
        coalesce((select degree from public.subjects where id = subject_id), ''),
        coalesce((select year from public.subjects where id = subject_id), ''),
        coalesce((select branch from public.subjects where id = subject_id), '')
      )
    )
    or (subject_id is null and public.has_permission('academic.create') and public.is_member(sphere_id))
  );

drop policy if exists "resources_update_admin" on public.academic_resources;
create policy "resources_update_admin" on public.academic_resources
  for update to authenticated
  using (
    (
      subject_id is not null
      and public.can_manage_academic(
        sphere_id,
        coalesce((select degree from public.subjects where id = subject_id), ''),
        coalesce((select year from public.subjects where id = subject_id), ''),
        coalesce((select branch from public.subjects where id = subject_id), '')
      )
    )
    or (subject_id is null and public.has_permission('academic.update') and public.is_member(sphere_id))
  )
  with check (
    (
      subject_id is not null
      and public.can_manage_academic(
        sphere_id,
        coalesce((select degree from public.subjects where id = subject_id), ''),
        coalesce((select year from public.subjects where id = subject_id), ''),
        coalesce((select branch from public.subjects where id = subject_id), '')
      )
    )
    or (subject_id is null and public.has_permission('academic.update') and public.is_member(sphere_id))
  );

drop policy if exists "resources_delete_admin" on public.academic_resources;
create policy "resources_delete_admin" on public.academic_resources
  for delete to authenticated
  using (
    (
      subject_id is not null
      and public.can_manage_academic(
        sphere_id,
        coalesce((select degree from public.subjects where id = subject_id), ''),
        coalesce((select year from public.subjects where id = subject_id), ''),
        coalesce((select branch from public.subjects where id = subject_id), '')
      )
    )
    or (subject_id is null and public.has_permission('academic.delete') and public.is_member(sphere_id))
  );

-- --- academic_calendar (sphere-wide — no section taxonomy) -----------------
drop policy if exists "calendar_insert_admin" on public.academic_calendar;
create policy "calendar_insert_admin" on public.academic_calendar
  for insert to authenticated
  with check (public.is_sphere_admin(sphere_id) or (public.has_permission('academic.create') and public.is_member(sphere_id)));

drop policy if exists "calendar_update_admin" on public.academic_calendar;
create policy "calendar_update_admin" on public.academic_calendar
  for update to authenticated
  using (public.is_sphere_admin(sphere_id) or (public.has_permission('academic.update') and public.is_member(sphere_id)))
  with check (public.is_sphere_admin(sphere_id) or (public.has_permission('academic.update') and public.is_member(sphere_id)));

drop policy if exists "calendar_delete_admin" on public.academic_calendar;
create policy "calendar_delete_admin" on public.academic_calendar
  for delete to authenticated
  using (public.is_sphere_admin(sphere_id) or (public.has_permission('academic.delete') and public.is_member(sphere_id)));
