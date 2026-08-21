-- ============================================================================
-- Uresphere — Academic Management Extensions (migration 0018)
--
-- 1. Adds academic_chapters table.
-- 2. Modifies academic_resources to support chapter_id.
-- 3. Adds pdf_url and external_url to academic_calendar.
-- 4. Creates academic_syllabuses table for year-wise syllabus.
-- 5. Implements RLS policies reusing can_manage_academic().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Academic Chapters
-- ---------------------------------------------------------------------------

create table if not exists public.academic_chapters (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  unit_id uuid not null references public.academic_units (id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists academic_chapters_unit_idx on public.academic_chapters (unit_id, display_order);

alter table public.academic_chapters enable row level security;

create policy "academic_chapters_select_member" on public.academic_chapters
  for select to authenticated using (public.is_member(sphere_id));

create policy "academic_chapters_insert_admin" on public.academic_chapters
  for insert to authenticated
  with check (
    public.can_manage_academic(
      sphere_id,
      coalesce((select degree from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), ''),
      coalesce((select year from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), ''),
      coalesce((select branch from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), '')
    )
  );

create policy "academic_chapters_update_admin" on public.academic_chapters
  for update to authenticated
  using (
    public.can_manage_academic(
      sphere_id,
      coalesce((select degree from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), ''),
      coalesce((select year from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), ''),
      coalesce((select branch from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), '')
    )
  )
  with check (
    public.can_manage_academic(
      sphere_id,
      coalesce((select degree from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), ''),
      coalesce((select year from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), ''),
      coalesce((select branch from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), '')
    )
  );

create policy "academic_chapters_delete_admin" on public.academic_chapters
  for delete to authenticated
  using (
    public.can_manage_academic(
      sphere_id,
      coalesce((select degree from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), ''),
      coalesce((select year from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), ''),
      coalesce((select branch from public.subjects where id = (select subject_id from public.academic_units where id = unit_id)), '')
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Academic Resources -> Chapter Support
-- ---------------------------------------------------------------------------

alter table public.academic_resources
  add column if not exists chapter_id uuid references public.academic_chapters (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Academic Calendar enhancements
-- ---------------------------------------------------------------------------

alter table public.academic_calendar
  add column if not exists pdf_url text,
  add column if not exists external_url text;

-- ---------------------------------------------------------------------------
-- 4. Academic Syllabuses
-- ---------------------------------------------------------------------------

create table if not exists public.academic_syllabuses (
  id uuid primary key default gen_random_uuid(),
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  degree text not null default '',
  year text not null default '',
  branch text not null default '',
  title text not null,
  pdf_url text,
  external_url text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists academic_syllabuses_taxonomy_idx on public.academic_syllabuses (sphere_id, degree, year, branch);

alter table public.academic_syllabuses enable row level security;

create policy "academic_syllabuses_select_member" on public.academic_syllabuses
  for select to authenticated using (public.is_member(sphere_id));

create policy "academic_syllabuses_insert_admin" on public.academic_syllabuses
  for insert to authenticated
  with check (public.can_manage_academic(sphere_id, degree, year, branch));

create policy "academic_syllabuses_update_admin" on public.academic_syllabuses
  for update to authenticated
  using (public.can_manage_academic(sphere_id, degree, year, branch))
  with check (public.can_manage_academic(sphere_id, degree, year, branch));

create policy "academic_syllabuses_delete_admin" on public.academic_syllabuses
  for delete to authenticated
  using (public.can_manage_academic(sphere_id, degree, year, branch));
