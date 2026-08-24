-- ============================================================================
-- UreSphere — Allow group admins to insert members from accepted requests (0029)
-- ============================================================================

-- A group admin needs to be able to accept a join request and insert the requester
-- into the group_members table. The existing insert policy stricted user_id to auth.uid(),
-- which prevents a group admin from adding someone else.

create policy "group_members_insert_admin_accepts_request" on public.group_members
  for insert to authenticated
  with check (
    public.is_group_admin(group_id)
    and exists (
      select 1 from public.group_requests
      where group_id = group_members.group_id
        and user_id = group_members.user_id
        and status = 'accepted'
    )
  );
