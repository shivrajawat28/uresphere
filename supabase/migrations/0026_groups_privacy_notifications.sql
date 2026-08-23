-- ---------------------------------------------------------------------------
-- 1. Add is_private to public.groups
-- ---------------------------------------------------------------------------

alter table public.groups
add column if not exists is_private boolean not null default false;

-- Drop the old select policy
drop policy if exists "groups_select_member" on public.groups;

-- Create the new select policy: 
-- Visible if:
--   - User is super admin
--   - User is sphere admin
--   - Group is public (is_private = false) AND user is sphere member
--   - Group is private AND user is group member
--   - Group is private AND user has a pending invite (so they can see the name to accept)
--   - Group is private AND user is the creator
create policy "groups_select_visibility" on public.groups
  for select to authenticated using (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (
      public.is_member(sphere_id) and (
        is_private = false
        or created_by = auth.uid()
        or exists (select 1 from public.group_members where group_id = id and user_id = auth.uid())
        or exists (select 1 from public.group_invites where group_id = id and invitee_id = auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Create group_requests table
-- ---------------------------------------------------------------------------

create table if not exists public.group_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_requests_user_idx on public.group_requests (user_id);
create index if not exists group_requests_group_idx on public.group_requests (group_id);

alter table public.group_requests enable row level security;

-- Users can see their own requests, or requests for groups they created/admin
create policy "group_requests_select" on public.group_requests
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.is_sphere_admin((select sphere_id from public.groups where id = group_id))
    or exists (select 1 from public.groups where id = group_id and created_by = auth.uid())
    or exists (select 1 from public.group_members where group_id = public.group_requests.group_id and user_id = auth.uid() and role = 'admin')
  );

-- Users can insert their own requests (for public groups in their sphere)
create policy "group_requests_insert" on public.group_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member((select sphere_id from public.groups where id = group_id))
    and (select is_private from public.groups where id = group_id) = false
  );

-- Group admins/creators can update requests (accept/reject)
create policy "group_requests_update" on public.group_requests
  for update to authenticated
  using (
    public.is_super_admin()
    or public.is_sphere_admin((select sphere_id from public.groups where id = group_id))
    or exists (select 1 from public.groups where id = group_id and created_by = auth.uid())
    or exists (select 1 from public.group_members where group_id = public.group_requests.group_id and user_id = auth.uid() and role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 3. Notification RPC for broadcasting to Sphere Users
-- ---------------------------------------------------------------------------

create or replace function public.notify_sphere_users(
  p_sphere_id uuid,
  p_type text,
  p_title text,
  p_body text default '',
  p_link text default null,
  p_exclude_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select
    user_id,
    p_type,
    p_title,
    p_body,
    p_link
  from public.user_spheres
  where sphere_id = p_sphere_id
    and membership_status = 'active'
    and (p_exclude_user_id is null or user_id != p_exclude_user_id)
    and not exists (
      select 1 from public.notification_preferences np
      where np.user_id = public.user_spheres.user_id
        and np.muted = true
    );
end;
$$;
