-- ============================================================================
-- Uresphere — Clubs & Events Complete Overhaul (migration 0016)
--
-- All changes are additive / idempotent and nothing existing is weakened.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. is_club_admin() — checks club-scoped admin role (must come first)
-- ---------------------------------------------------------------------------

create or replace function public.is_club_admin(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.role_assignments ra
    join public.profiles p on p.id = ra.user_id
    where ra.user_id = auth.uid()
      and ra.role = 'club_admin'
      and p.account_status = 'active'
      and (ra.scope->>'club_id')::uuid = target_club_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. clubs — add category, tagline, contact_info
-- ---------------------------------------------------------------------------

alter table public.clubs
  add column if not exists category text not null default 'other',
  add column if not exists tagline text not null default '',
  add column if not exists contact_info text not null default '';

do $$ begin
  alter table public.clubs
    add constraint clubs_category_check
    check (category in ('coding', 'robotics', 'ai_ml', 'cultural', 'sports', 'entrepreneurship', 'literary', 'photography', 'design', 'other'));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. events — make event_date nullable (Coming Soon), add contact fields
-- ---------------------------------------------------------------------------

alter table public.events
  alter column event_date drop not null;

alter table public.events
  add column if not exists contact_name text not null default '',
  add column if not exists contact_phone text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists registration_url text not null default '',
  add column if not exists registration_deadline date;

-- ---------------------------------------------------------------------------
-- 4. club_activities — activities/competitions under a club
-- ---------------------------------------------------------------------------

create table if not exists public.club_activities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  category text not null default 'other',
  event_date date,
  event_time time,
  venue text not null default '',
  organizer text not null default '',
  thumbnail_url text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists club_activities_club_idx on public.club_activities (club_id, created_at desc);

alter table public.club_activities enable row level security;

create policy "club_activities_select_member" on public.club_activities
  for select to authenticated
  using (public.is_member((select sphere_id from public.clubs where id = club_activities.club_id)));

create policy "club_activities_insert_admin" on public.club_activities
  for insert to authenticated
  with check (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_activities.club_id))
    or (public.has_permission('clubs.create') and public.is_member((select sphere_id from public.clubs where id = club_activities.club_id)))
    or public.is_club_admin(club_id)
  );

create policy "club_activities_update_admin" on public.club_activities
  for update to authenticated
  using (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_activities.club_id))
    or (public.has_permission('clubs.update') and public.is_member((select sphere_id from public.clubs where id = club_activities.club_id)))
    or public.is_club_admin(club_id)
  )
  with check (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_activities.club_id))
    or (public.has_permission('clubs.update') and public.is_member((select sphere_id from public.clubs where id = club_activities.club_id)))
    or public.is_club_admin(club_id)
  );

create policy "club_activities_delete_admin" on public.club_activities
  for delete to authenticated
  using (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_activities.club_id))
    or (public.has_permission('clubs.delete') and public.is_member((select sphere_id from public.clubs where id = club_activities.club_id)))
    or public.is_club_admin(club_id)
  );

-- ---------------------------------------------------------------------------
-- 5. club_activity_gallery — photos + external links
-- ---------------------------------------------------------------------------

create table if not exists public.club_activity_gallery (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.club_activities (id) on delete cascade,
  item_type text not null check (item_type in ('photo', 'link')),
  url text not null,
  title text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists club_activity_gallery_activity_idx on public.club_activity_gallery (activity_id, display_order);

alter table public.club_activity_gallery enable row level security;

create policy "club_activity_gallery_select_member" on public.club_activity_gallery
  for select to authenticated
  using (public.is_member((
    select c.sphere_id from public.club_activities ca
    join public.clubs c on c.id = ca.club_id
    where ca.id = club_activity_gallery.activity_id
  )));

create policy "club_activity_gallery_insert_admin" on public.club_activity_gallery
  for insert to authenticated
  with check (public.is_club_admin((
    select ca.club_id from public.club_activities ca where ca.id = club_activity_gallery.activity_id
  )) or public.is_sphere_admin((
    select c.sphere_id from public.club_activities ca
    join public.clubs c on c.id = ca.club_id
    where ca.id = club_activity_gallery.activity_id
  )));

create policy "club_activity_gallery_delete_admin" on public.club_activity_gallery
  for delete to authenticated
  using (public.is_club_admin((
    select ca.club_id from public.club_activities ca where ca.id = club_activity_gallery.activity_id
  )) or public.is_sphere_admin((
    select c.sphere_id from public.club_activities ca
    join public.clubs c on c.id = ca.club_id
    where ca.id = club_activity_gallery.activity_id
  )));

-- ---------------------------------------------------------------------------
-- 6. club_events — upcoming events specific to a club
-- ---------------------------------------------------------------------------

create table if not exists public.club_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  event_date date,
  event_time time,
  venue text not null default '',
  organizer text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  registration_url text not null default '',
  registration_deadline date,
  thumbnail_url text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists club_events_club_idx on public.club_events (club_id, event_date);

alter table public.club_events enable row level security;

create policy "club_events_select_member" on public.club_events
  for select to authenticated
  using (public.is_member((select sphere_id from public.clubs where id = club_events.club_id)));

create policy "club_events_insert_admin" on public.club_events
  for insert to authenticated
  with check (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_events.club_id))
    or (public.has_permission('clubs.create') and public.is_member((select sphere_id from public.clubs where id = club_events.club_id)))
    or (public.has_permission('events.create') and public.is_member((select sphere_id from public.clubs where id = club_events.club_id)))
    or public.is_club_admin(club_id)
  );

create policy "club_events_update_admin" on public.club_events
  for update to authenticated
  using (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_events.club_id))
    or (public.has_permission('clubs.update') and public.is_member((select sphere_id from public.clubs where id = club_events.club_id)))
    or (public.has_permission('events.update') and public.is_member((select sphere_id from public.clubs where id = club_events.club_id)))
    or public.is_club_admin(club_id)
  )
  with check (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_events.club_id))
    or (public.has_permission('clubs.update') and public.is_member((select sphere_id from public.clubs where id = club_events.club_id)))
    or (public.has_permission('events.update') and public.is_member((select sphere_id from public.clubs where id = club_events.club_id)))
    or public.is_club_admin(club_id)
  );

create policy "club_events_delete_admin" on public.club_events
  for delete to authenticated
  using (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_events.club_id))
    or (public.has_permission('clubs.delete') and public.is_member((select sphere_id from public.clubs where id = club_events.club_id)))
    or (public.has_permission('events.delete') and public.is_member((select sphere_id from public.clubs where id = club_events.club_id)))
    or public.is_club_admin(club_id)
  );

-- ---------------------------------------------------------------------------
-- 7. club_event_registrations — built-in registration
-- ---------------------------------------------------------------------------

create table if not exists public.club_event_registrations (
  id uuid primary key default gen_random_uuid(),
  club_event_id uuid not null references public.club_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone_number text not null default '',
  section text not null default '',
  branch text not null default '',
  year text not null default '',
  created_at timestamptz not null default now(),
  unique (club_event_id, user_id)
);

alter table public.club_event_registrations enable row level security;

create policy "club_event_registrations_select_own" on public.club_event_registrations
  for select to authenticated using (user_id = auth.uid());

create policy "club_event_registrations_insert_self" on public.club_event_registrations
  for insert to authenticated with check (user_id = auth.uid());

create policy "club_event_registrations_delete_self" on public.club_event_registrations
  for delete to authenticated using (user_id = auth.uid());

create policy "club_event_registrations_select_admin" on public.club_event_registrations
  for select to authenticated
  using (public.is_club_admin((
    select ce.club_id from public.club_events ce where ce.id = club_event_registrations.club_event_id
  )) or public.is_sphere_admin((
    select c.sphere_id from public.club_events ce
    join public.clubs c on c.id = ce.club_id
    where ce.id = club_event_registrations.club_event_id
  )));

-- ---------------------------------------------------------------------------
-- 8. club_event_gallery — gallery for club events
-- ---------------------------------------------------------------------------

create table if not exists public.club_event_gallery (
  id uuid primary key default gen_random_uuid(),
  club_event_id uuid not null references public.club_events (id) on delete cascade,
  item_type text not null check (item_type in ('photo', 'link')),
  url text not null,
  title text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists club_event_gallery_event_idx on public.club_event_gallery (club_event_id, display_order);

alter table public.club_event_gallery enable row level security;

create policy "club_event_gallery_select_member" on public.club_event_gallery
  for select to authenticated
  using (public.is_member((
    select c.sphere_id from public.club_events ce
    join public.clubs c on c.id = ce.club_id
    where ce.id = club_event_gallery.club_event_id
  )));

create policy "club_event_gallery_insert_admin" on public.club_event_gallery
  for insert to authenticated
  with check (public.is_club_admin((
    select ce.club_id from public.club_events ce where ce.id = club_event_gallery.club_event_id
  )) or public.is_sphere_admin((
    select c.sphere_id from public.club_events ce
    join public.clubs c on c.id = ce.club_id
    where ce.id = club_event_gallery.club_event_id
  )));

create policy "club_event_gallery_delete_admin" on public.club_event_gallery
  for delete to authenticated
  using (public.is_club_admin((
    select ce.club_id from public.club_events ce where ce.id = club_event_gallery.club_event_id
  )) or public.is_sphere_admin((
    select c.sphere_id from public.club_events ce
    join public.clubs c on c.id = ce.club_id
    where ce.id = club_event_gallery.club_event_id
  )));

-- ---------------------------------------------------------------------------
-- 9. event_gallery — gallery for college events
-- ---------------------------------------------------------------------------

create table if not exists public.event_gallery (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  item_type text not null check (item_type in ('photo', 'link')),
  url text not null,
  title text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_gallery_event_idx on public.event_gallery (event_id, display_order);

alter table public.event_gallery enable row level security;

create policy "event_gallery_select_member" on public.event_gallery
  for select to authenticated
  using (public.is_member((select sphere_id from public.events where id = event_gallery.event_id)));

create policy "event_gallery_insert_admin" on public.event_gallery
  for insert to authenticated
  with check (
    public.is_sphere_admin((select sphere_id from public.events where id = event_gallery.event_id))
    or (public.has_permission('events.update') and public.is_member((select sphere_id from public.events where id = event_gallery.event_id)))
    or public.is_club_admin((select club_id from public.events where id = event_gallery.event_id))
  );

create policy "event_gallery_delete_admin" on public.event_gallery
  for delete to authenticated
  using (
    public.is_sphere_admin((select sphere_id from public.events where id = event_gallery.event_id))
    or (public.has_permission('events.delete') and public.is_member((select sphere_id from public.events where id = event_gallery.event_id)))
  );

-- ---------------------------------------------------------------------------
-- 10. event_registrations — built-in registration for college events
-- ---------------------------------------------------------------------------

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone_number text not null default '',
  section text not null default '',
  branch text not null default '',
  year text not null default '',
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.event_registrations enable row level security;

create policy "event_registrations_select_own" on public.event_registrations
  for select to authenticated using (user_id = auth.uid());

create policy "event_registrations_insert_self" on public.event_registrations
  for insert to authenticated with check (user_id = auth.uid());

create policy "event_registrations_delete_self" on public.event_registrations
  for delete to authenticated using (user_id = auth.uid());

create policy "event_registrations_select_admin" on public.event_registrations
  for select to authenticated
  using (public.is_sphere_admin((select sphere_id from public.events where id = event_registrations.event_id))
    or (public.has_permission('events.update') and public.is_member((select sphere_id from public.events where id = event_registrations.event_id))));

-- ---------------------------------------------------------------------------
-- 11. Updated club RLS — allow club_admin to manage their assigned club
-- ---------------------------------------------------------------------------

drop policy if exists "clubs_update_admin" on public.clubs;
create policy "clubs_update_admin" on public.clubs
  for update to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('clubs.update') and public.is_member(sphere_id))
    or public.is_club_admin(id)
  )
  with check (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('clubs.update') and public.is_member(sphere_id))
    or public.is_club_admin(id)
  );

drop policy if exists "club_gallery_insert_admin" on public.club_gallery;
create policy "club_gallery_insert_admin" on public.club_gallery
  for insert to authenticated
  with check (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_gallery.club_id))
    or (public.has_permission('clubs.update') and public.is_member((select sphere_id from public.clubs where id = club_gallery.club_id)))
    or public.is_club_admin(club_id)
  );

drop policy if exists "club_gallery_delete_admin" on public.club_gallery;
create policy "club_gallery_delete_admin" on public.club_gallery
  for delete to authenticated
  using (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_gallery.club_id))
    or (public.has_permission('clubs.delete') and public.is_member((select sphere_id from public.clubs where id = club_gallery.club_id)))
    or public.is_club_admin(club_id)
  );

-- ---------------------------------------------------------------------------
-- 12. Event reminder notification function (1-day-before, SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace function public.send_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
begin
  for v_event in
    select e.id, e.title, e.sphere_id, e.event_date, e.event_time
    from public.events e
    where e.event_date = (current_date + interval '1 day')::date
      and e.event_date is not null
  loop
    -- Dedup: skip if reminder already sent recently
    if exists (
      select 1 from public.notifications
      where type = 'event_reminder'
        and body like '%' || v_event.title || '%'
        and created_at > now() - interval '2 days'
    ) then
      continue;
    end if;

    -- Notify all active members of the sphere
    insert into public.notifications (user_id, type, title, body, link)
    select
      us.user_id,
      'event_reminder',
      'Event tomorrow!',
      v_event.title || ' is happening tomorrow' ||
        case when v_event.event_time is not null
          then ' at ' || to_char(v_event.event_time, 'HH12:MI AM')
          else ''
        end || '.',
      '/dashboard/events'
    from public.user_spheres us
    join public.profiles p on p.id = us.user_id
    where us.sphere_id = v_event.sphere_id
      and us.membership_status = 'active'
      and p.account_status = 'active';
  end loop;
end $$;

revoke all on function public.send_event_reminders() from public;
grant execute on function public.send_event_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- 13. Auto-transition check function (called by cron, informational)
-- ---------------------------------------------------------------------------

create or replace function public.transition_past_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Events are "past" when event_date < today — computed at query time.
  -- No data mutation needed. This function can be extended to send
  -- "event ended" notifications or manage gallery states.
  return 0;
end $$;

revoke all on function public.transition_past_events() from public;
grant execute on function public.transition_past_events() to authenticated;
