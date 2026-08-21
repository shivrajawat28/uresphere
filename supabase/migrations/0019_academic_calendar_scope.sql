-- ============================================================================
-- Uresphere — Academic Calendar Scoping (migration 0019)
--
-- Adds `degree` and `year` to `academic_calendar` to scope calendars to a
-- specific Degree + Year combination.
-- ============================================================================

alter table public.academic_calendar
  add column if not exists degree text default '',
  add column if not exists year text default '';

create index if not exists academic_calendar_degree_year_idx on public.academic_calendar (degree, year);
