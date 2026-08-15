-- Advertising management (Phase 3).
--
-- The `ad_campaigns` table was created in 0001 but never wired to the app.
-- This migration ADDS the columns the product needs (description, multiple
-- placements, timestamptz scheduling, archive flag) and replaces the table's
-- RLS policies so that:
--   - normal users can only READ live ads (active, not archived, inside the
--     schedule window) — placement targeting is applied by the query/helper;
--   - ONLY super admins can create/update/delete (platform-wide advertising).
--
-- Nothing existing is dropped except the four 0001 ad policies below (they
-- predate the feature and would otherwise let users read expired/future ads).

alter table public.ad_campaigns
  add column if not exists description text,
  add column if not exists placements text[] not null default '{}'::text[],
  add column if not exists starts_at_ts timestamptz,
  add column if not exists ends_at_ts timestamptz,
  add column if not exists archived boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Placement lookup (PostgREST `.contains` → `cs` operator) and schedule scan.
create index if not exists ad_campaigns_placements_idx
  on public.ad_campaigns using gin (placements);
create index if not exists ad_campaigns_schedule_idx
  on public.ad_campaigns (active, archived, starts_at_ts, ends_at_ts);

-- --- RLS ------------------------------------------------------------------
-- The legacy 0001 policies only gated on `active = true` — they would leak
-- expired/future active ads, so they are replaced here.
drop policy if exists "ad_campaigns_select_public" on public.ad_campaigns;
drop policy if exists "ad_campaigns_insert_super_admin" on public.ad_campaigns;
drop policy if exists "ad_campaigns_update_super_admin" on public.ad_campaigns;
drop policy if exists "ad_campaigns_delete_super_admin" on public.ad_campaigns;

-- Members may read only advertisements that are currently eligible:
-- active, not archived, start <= now <= end. Placement matching is layered
-- on top by the application query (`placements cs '{<placement>}'`), since a
-- placement is a request-time value, not part of the session.
create policy "ad_campaigns_select_live" on public.ad_campaigns
  for select to authenticated
  using (
    active = true
    and archived = false
    and starts_at_ts is not null
    and ends_at_ts is not null
    and starts_at_ts <= now()
    and ends_at_ts >= now()
  );

-- Super admins may read every campaign (inactive, scheduled, expired,
-- archived) for management.
create policy "ad_campaigns_select_super_admin" on public.ad_campaigns
  for select to authenticated
  using (public.is_super_admin());

create policy "ad_campaigns_insert_super_admin" on public.ad_campaigns
  for insert to authenticated
  with check (public.is_super_admin());

create policy "ad_campaigns_update_super_admin" on public.ad_campaigns
  for update to authenticated
  using (public.is_super_admin());

create policy "ad_campaigns_delete_super_admin" on public.ad_campaigns
  for delete to authenticated
  using (public.is_super_admin());
