-- ============================================================================
-- Uresphere — dashboard roadmap (migration 0009)
--
-- Makes roadmap plans a first-class dashboard feature. Plan-publish
-- notifications ("New UreSphere update") now deep-link to the dedicated
-- Dashboard Roadmap page (/dashboard/roadmap?plan=<id>) instead of the
-- dashboard overview anchor. No schema change is needed — the notifications
-- `link` column already carries the target route and the plan's UUID.
--
-- Idempotent / additive:
--   1. Recreates notify_plan_published so new broadcasts use the roadmap
--      deep link (per-plan idempotency preserved via type + link dedupe).
--   2. Rewrites existing plan_published notification links in place (same
--      ids, same read state, no duplicates) so the per-plan dedupe keeps
--      working after this migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Recreate the plan-publish broadcast with the Dashboard Roadmap link
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

  v_link := '/dashboard/roadmap?plan=' || p_plan_id::text;

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
-- 2. Rewrite existing plan-publish notifications to the new deep link.
--    Only rows still using the old overview anchor format are touched, so
--    re-running this migration is a no-op. The plan UUID is extracted from
--    the old link (/dashboard#plan-<uuid>) so the plan reference is kept.
-- ---------------------------------------------------------------------------

update public.notifications
set link = '/dashboard/roadmap?plan=' || substring(link from '#plan-([0-9a-f-]{36})')
where type = 'plan_published'
  and link like '/dashboard#plan-%'
  and substring(link from '#plan-([0-9a-f-]{36})') is not null;
