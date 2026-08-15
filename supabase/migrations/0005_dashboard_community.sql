-- ============================================================================
-- Uresphere — dashboard & community (migration 0005)
--
-- Additive / idempotent. Nothing here weakens RLS or RBAC:
--   1. notify_plan_published(uuid) — SECURITY DEFINER RPC that inserts one
--      notification per active member when a platform plan is published.
--      Authorized callers only (super admin / feedback.manage). Idempotent
--      per plan (a plan can only ever generate one broadcast), so editing an
--      already-published plan never duplicates notifications.
--   2. chat_select_sphere_admin — lets a `sphere_admin` role-assignment holder
--      (who may not be an active member row) read chat in their assigned
--      Sphere for the admin Social tab. Super admins were already covered by
--      0004's chat_select_super_admin; this closes the same gap for
--      role-based Sphere administrators without touching write policies.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Plan-publish notifications
-- ---------------------------------------------------------------------------

create or replace function public.notify_plan_published(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_description text;
  v_link text;
begin
  -- Only platform owners or feedback managers may broadcast. The function is
  -- SECURITY DEFINER, so we re-check the caller's authorization inside it.
  if not (public.is_super_admin() or public.has_permission('feedback.manage')) then
    raise exception 'Not authorized';
  end if;

  select title, description into v_title, v_description
  from public.platform_plans
  where id = p_plan_id and active = true;

  -- Unpublished or missing plan → no notification.
  if v_title is null then
    return;
  end if;

  v_link := '/dashboard#plan-' || p_plan_id::text;

  -- Idempotency: each plan can produce at most one broadcast. Editing an
  -- already-published plan (title/description/order) must not re-notify.
  if exists (
    select 1 from public.notifications
    where type = 'plan_published' and link = v_link
  ) then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  select
    us.user_id,
    'plan_published',
    'New UreSphere update',
    v_title || coalesce(' — ' || nullif(trim(v_description), ''), '') || ' Share your feedback.',
    v_link
  from public.user_spheres us
  join public.profiles p on p.id = us.user_id
  where us.membership_status = 'active'
    and p.account_status = 'active';
end $$;

revoke all on function public.notify_plan_published(uuid) from public;
grant execute on function public.notify_plan_published(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sphere-admin read access to chat (admin Social tab)
-- ---------------------------------------------------------------------------

create policy "chat_select_sphere_admin" on public.chat_messages
  for select to authenticated
  using (public.is_sphere_admin(sphere_id));
