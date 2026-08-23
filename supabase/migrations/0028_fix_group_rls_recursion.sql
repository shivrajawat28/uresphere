-- ============================================================================
-- Uresphere — Fix groups RLS infinite recursion (migration 0028)
--
-- Postgres throws 42P17 infinite recursion when:
-- 1. groups selects group_members (to check if user is a member)
-- 2. group_members selects groups (to check the sphere_id)
-- 
-- The solution is to use SECURITY DEFINER helper functions to perform the 
-- internal lookups without triggering RLS evaluation recursively.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper Functions (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace function public.get_group_sphere_id(gid uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select sphere_id from public.groups where id = gid;
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups where id = gid and created_by = auth.uid()
  ) or exists (
    select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.has_group_invite(gid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_invites 
    where group_id = gid and invitee_id = auth.uid() and status = 'pending'
  );
$$;

create or replace function public.is_group_public(gid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups where id = gid and is_private = false
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. groups policies
-- ---------------------------------------------------------------------------

drop policy if exists "groups_select_visibility" on public.groups;
create policy "groups_select_visibility" on public.groups
  for select to authenticated using (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (
      public.is_member(sphere_id) and (
        is_private = false
        or created_by = auth.uid()
        or public.is_group_member(id)
        or public.has_group_invite(id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. group_members policies
-- ---------------------------------------------------------------------------

drop policy if exists "group_members_select_member" on public.group_members;
create policy "group_members_select_member" on public.group_members
  for select to authenticated
  using (
    public.is_group_member(group_id)
    or public.is_sphere_admin(public.get_group_sphere_id(group_id))
  );

drop policy if exists "group_members_delete_self_or_admin" on public.group_members;
create policy "group_members_delete_self_or_admin" on public.group_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_sphere_admin(public.get_group_sphere_id(group_id))
  );

-- ---------------------------------------------------------------------------
-- 4. group_requests policies
-- ---------------------------------------------------------------------------

drop policy if exists "group_requests_select" on public.group_requests;
create policy "group_requests_select" on public.group_requests
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.is_sphere_admin(public.get_group_sphere_id(group_id))
    or public.is_group_admin(group_id)
  );

drop policy if exists "group_requests_insert" on public.group_requests;
create policy "group_requests_insert" on public.group_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member(public.get_group_sphere_id(group_id))
    and public.is_group_public(group_id)
  );

drop policy if exists "group_requests_update" on public.group_requests;
create policy "group_requests_update" on public.group_requests
  for update to authenticated
  using (
    public.is_super_admin()
    or public.is_sphere_admin(public.get_group_sphere_id(group_id))
    or public.is_group_admin(group_id)
  );

-- ---------------------------------------------------------------------------
-- 5. group_invites policies
-- ---------------------------------------------------------------------------

drop policy if exists "group_invites_select_related" on public.group_invites;
create policy "group_invites_select_related" on public.group_invites
  for select to authenticated
  using (
    invitee_id = auth.uid()
    or invited_by = auth.uid()
    or public.is_sphere_admin(public.get_group_sphere_id(group_id))
  );

drop policy if exists "group_invites_insert_member" on public.group_invites;
create policy "group_invites_insert_member" on public.group_invites
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and public.is_member(public.get_group_sphere_id(group_id))
    and public.is_group_member(group_id)
  );

-- ---------------------------------------------------------------------------
-- 6. group_messages policies
-- ---------------------------------------------------------------------------

drop policy if exists "group_messages_delete_admin" on public.group_messages;
create policy "group_messages_delete_admin" on public.group_messages
  for delete to authenticated
  using (
    public.is_sphere_admin(public.get_group_sphere_id(group_id))
  );
