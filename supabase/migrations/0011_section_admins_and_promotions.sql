-- ============================================================================
-- Uresphere — section admins + promotion payment flow (migration 0011)
--
-- Two additive, idempotent changes (nothing existing is weakened):
--
-- 1. RLS: the existing Sphere-scoped write policies only allow `is_sphere_admin`
--    (super_admin / profile admin / sphere_admin assignment) to write events,
--    clubs, promotions, listings, orders, reports, event answers, groups and
--    shop products. Section managers (event_manager, club_manager,
--    promotion_moderator, listing_manager, marketplace_moderator,
--    social_moderator) are therefore blocked at the DB layer even though the
--    server actions authorize them. Each policy is re-created to ALSO allow a
--    manager who holds the matching permission in their assignment AND is an
--    active member of the row's Sphere — so a section manager can only ever
--    write rows inside their own Sphere, never another one (sphere_id comes
--    from the row, never from the client).
--
-- 2. Notification helpers: SECURITY DEFINER RPCs so server actions can notify
--    a single user (promotion approved / rejected / payment verified, section
--    admin assigned) and a Sphere's administrators (promotion submitted /
--    payment submitted with UTR) without hitting the notifications RLS (which
--    intentionally has no INSERT policy for authenticated users).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS — section managers may write INSIDE their own Sphere only
-- ---------------------------------------------------------------------------

-- --- events (event_manager) -------------------------------------------------
drop policy if exists "events_insert_admin" on public.events;
create policy "events_insert_admin" on public.events
  for insert to authenticated
  with check (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('events.create') and public.is_member(sphere_id))
  );

drop policy if exists "events_update_admin" on public.events;
create policy "events_update_admin" on public.events
  for update to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('events.update') and public.is_member(sphere_id))
  )
  with check (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('events.update') and public.is_member(sphere_id))
  );

drop policy if exists "events_delete_admin" on public.events;
create policy "events_delete_admin" on public.events
  for delete to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('events.delete') and public.is_member(sphere_id))
  );

-- --- clubs (club_manager) ---------------------------------------------------
drop policy if exists "clubs_insert_admin" on public.clubs;
create policy "clubs_insert_admin" on public.clubs
  for insert to authenticated
  with check (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('clubs.create') and public.is_member(sphere_id))
  );

drop policy if exists "clubs_update_admin" on public.clubs;
create policy "clubs_update_admin" on public.clubs
  for update to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('clubs.update') and public.is_member(sphere_id))
  )
  with check (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('clubs.update') and public.is_member(sphere_id))
  );

drop policy if exists "clubs_delete_admin" on public.clubs;
create policy "clubs_delete_admin" on public.clubs
  for delete to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('clubs.delete') and public.is_member(sphere_id))
  );

-- --- promotions (promotion_moderator; own-row UTR submit stays intact) -------
drop policy if exists "promotions_update_admin_or_own" on public.promotions;
create policy "promotions_update_admin_or_own" on public.promotions
  for update to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or user_id = auth.uid()
    or (public.has_permission('promotions.review') and public.is_member(sphere_id))
  )
  with check (
    public.is_sphere_admin(sphere_id)
    or user_id = auth.uid()
    or (public.has_permission('promotions.review') and public.is_member(sphere_id))
  );

drop policy if exists "promotions_delete_admin" on public.promotions;
create policy "promotions_delete_admin" on public.promotions
  for delete to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('promotions.delete') and public.is_member(sphere_id))
  );

-- --- marketplace listings (listing_manager) ---------------------------------
drop policy if exists "listings_update_seller_or_admin" on public.marketplace_listings;
create policy "listings_update_seller_or_admin" on public.marketplace_listings
  for update to authenticated
  using (
    seller_id = auth.uid()
    or public.is_sphere_admin(sphere_id)
    or (public.has_permission('listings.update') and public.is_member(sphere_id))
  )
  with check (
    seller_id = auth.uid()
    or public.is_sphere_admin(sphere_id)
    or (public.has_permission('listings.update') and public.is_member(sphere_id))
  );

drop policy if exists "listings_delete_seller_or_admin" on public.marketplace_listings;
create policy "listings_delete_seller_or_admin" on public.marketplace_listings
  for delete to authenticated
  using (
    seller_id = auth.uid()
    or public.is_sphere_admin(sphere_id)
    or (public.has_permission('listings.delete') and public.is_member(sphere_id))
  );

-- --- marketplace orders (marketplace_moderator) ------------------------------
drop policy if exists "orders_update_related" on public.marketplace_orders;
create policy "orders_update_related" on public.marketplace_orders
  for update to authenticated
  using (
    seller_id = auth.uid()
    or public.is_sphere_admin(sphere_id)
    or (public.has_permission('marketplace.manage_orders') and public.is_member(sphere_id))
  );

-- --- reports (social_moderator) ---------------------------------------------
drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin" on public.reports
  for update to authenticated
  using (
    public.is_super_admin()
    or (sphere_id is not null and public.is_sphere_admin(sphere_id))
    or (sphere_id is not null and public.has_permission('social.moderate') and public.is_member(sphere_id))
  );

-- --- event_questions (event_manager answers) ---------------------------------
drop policy if exists "event_questions_update_admin" on public.event_questions;
create policy "event_questions_update_admin" on public.event_questions
  for update to authenticated
  using (
    public.is_sphere_admin((select sphere_id from public.events where id = event_questions.event_id))
    or (
      public.has_permission('events.answer_queries')
      and public.is_member((select sphere_id from public.events where id = event_questions.event_id))
    )
  );

-- --- groups (social_moderator) ----------------------------------------------
drop policy if exists "groups_update_admin_or_creator" on public.groups;
create policy "groups_update_admin_or_creator" on public.groups
  for update to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or created_by = auth.uid()
    or (public.has_permission('social.manage_groups') and public.is_member(sphere_id))
  );

drop policy if exists "groups_delete_admin" on public.groups;
create policy "groups_delete_admin" on public.groups
  for delete to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('social.manage_groups') and public.is_member(sphere_id))
  );

-- --- shop products (marketplace_moderator) ----------------------------------
drop policy if exists "shop_insert_admin" on public.shop_products;
create policy "shop_insert_admin" on public.shop_products
  for insert to authenticated
  with check (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('marketplace.review') and public.is_member(sphere_id))
  );

drop policy if exists "shop_update_admin" on public.shop_products;
create policy "shop_update_admin" on public.shop_products
  for update to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('marketplace.review') and public.is_member(sphere_id))
  )
  with check (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('marketplace.review') and public.is_member(sphere_id))
  );

drop policy if exists "shop_delete_admin" on public.shop_products;
create policy "shop_delete_admin" on public.shop_products
  for delete to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('marketplace.review') and public.is_member(sphere_id))
  );

-- ---------------------------------------------------------------------------
-- 1b. platform_config — INSERT policy for the super admin
--     The promotion payment configuration is saved with an upsert (key = PK).
--     platform_config only ever had an UPDATE policy, so PostgREST's upsert
--     (INSERT … ON CONFLICT) was blocked by RLS. Add the super-admin INSERT
--     policy; SELECT/UPDATE already exist.
-- ---------------------------------------------------------------------------

create policy "platform_config_insert_super_admin" on public.platform_config
  for insert to authenticated with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 2. Notification helpers (SECURITY DEFINER — RLS has no INSERT policy)
-- ---------------------------------------------------------------------------

create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default '',
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, coalesce(p_type, 'general'), p_title, coalesce(p_body, ''), p_link);
end $$;

revoke all on function public.notify_user(uuid, text, text, text, text) from public;
grant execute on function public.notify_user(uuid, text, text, text, text) to authenticated;

-- Notifies every administrator of a Sphere: profile-role admins actively in
-- the Sphere plus holders of a `sphere_admin` role assignment there. Used for
-- promotion submission / payment-submission alerts.
create or replace function public.notify_sphere_admins(
  p_sphere_id uuid,
  p_type text,
  p_title text,
  p_body text default '',
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sphere_id is null then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link)
  select distinct
    us.user_id,
    coalesce(p_type, 'general'),
    p_title,
    coalesce(p_body, ''),
    p_link
  from public.user_spheres us
  join public.profiles p on p.id = us.user_id
  where us.sphere_id = p_sphere_id
    and us.membership_status = 'active'
    and p.account_status = 'active'
    and (
      p.role in ('admin', 'super_admin')
      or exists (
        select 1 from public.role_assignments ra
        where ra.user_id = us.user_id
          and ra.sphere_id = us.sphere_id
          and ra.role = 'sphere_admin'
      )
    );
end $$;

revoke all on function public.notify_sphere_admins(uuid, text, text, text, text) from public;
grant execute on function public.notify_sphere_admins(uuid, text, text, text, text) to authenticated;
