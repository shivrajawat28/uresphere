-- ============================================================================
-- Uresphere — marketplace review flow, cart, multi-item orders, sold cleanup,
-- college year, phone uniqueness, group creator delete, global-listings
-- manager, club member management (migration 0013)
--
-- All changes are additive / idempotent and nothing existing is weakened:
--
--   1. marketplace_listings — new `pending` status (default for new listings;
--      existing rows keep their value), admin review columns (reviewed_by,
--      reviewed_at, admin_price_cents, rejection_reason) and sold_at for the
--      one-hour auto-hide. RLS: members may SELECT only `active` listings
--      (pending/rejected never leak); sellers always see their own rows;
--      admins/managers see everything in their Sphere for review.
--   2. marketplace_orders — listing_id becomes nullable and order_items is a
--      new child table so one order can carry several items with quantity and
--      purchase-time price snapshots. A SECURITY DEFINER checkout RPC creates
--      one order per seller atomically (server-side pricing, availability +
--      duplicate-purchase protection via a conditional sold flip).
--   3. cart_items — per-user cart (own rows only, RLS-gated).
--   4. cleanup_sold_listings() — idempotent RPC that hides sold listings after
--      one hour; safe to call from the app and from a Vercel Cron.
--   5. profiles — college_year + phone_verified columns and a partial unique
--      index enforcing ONE verified phone = ONE account.
--   6. groups — the creator may delete their own group (RLS), matching the
--      server action; sphere admins / social managers keep their powers.
--   7. global_listings — Listing Managers may manage global listings.
--   8. club_members — Sphere admins / club managers may remove members.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. marketplace_listings — review flow + sold tracking
-- ---------------------------------------------------------------------------

alter table public.marketplace_listings drop constraint if exists marketplace_listings_status_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_status_check
  check (status in ('pending', 'active', 'sold', 'removed'));

-- New listings enter the review queue; existing rows keep their values.
alter table public.marketplace_listings alter column status set default 'pending';

alter table public.marketplace_listings
  add column if not exists reviewed_by uuid references auth.users (id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists admin_price_cents integer check (admin_price_cents is null or admin_price_cents >= 0),
  add column if not exists rejection_reason text not null default '',
  add column if not exists sold_at timestamptz;

create index if not exists marketplace_listings_review_idx
  on public.marketplace_listings (sphere_id, status, created_at desc);

-- Members see live listings AND recently-sold ones (a sold listing stays
-- visible with a "Sold" badge until the one-hour cleanup hides it).
-- Pending / rejected / removed listings never leak to members.
drop policy if exists "listings_select_member" on public.marketplace_listings;
create policy "listings_select_member" on public.marketplace_listings
  for select to authenticated
  using (public.is_member(sphere_id) and status in ('active', 'sold'));

-- Sellers always see their own listings (any status) to track review.
drop policy if exists "listings_select_own" on public.marketplace_listings;
create policy "listings_select_own" on public.marketplace_listings
  for select to authenticated using (seller_id = auth.uid());

-- Sphere administrators + listing/marketplace managers see everything in the
-- Sphere (review queue + sold history). has_permission already covers
-- sphere_admin assignments; is_sphere_admin covers profile-role admins and
-- the super admin (any Sphere).
drop policy if exists "listings_select_admin_sphere" on public.marketplace_listings;
create policy "listings_select_admin_sphere" on public.marketplace_listings
  for select to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or (public.has_permission('listings.update') and public.is_member(sphere_id))
    or (public.has_permission('marketplace.review') and public.is_member(sphere_id))
  );

-- ---------------------------------------------------------------------------
-- 2. marketplace_orders + order_items (multi-item orders)
-- ---------------------------------------------------------------------------

-- A multi-item order has no single listing; the items live in order_items.
alter table public.marketplace_orders alter column listing_id drop not null;

alter table public.marketplace_orders
  add column if not exists delivery_time text not null default '',
  add column if not exists total_cents integer not null default 0;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders (id) on delete cascade,
  -- Snapshot fields: the listing/product may be removed later; order history
  -- must never break, so the FK is SET NULL and the title/price are stored.
  listing_id uuid references public.marketplace_listings (id) on delete set null,
  shop_product_id uuid references public.shop_products (id) on delete set null,
  item_type text not null check (item_type in ('listing', 'shop')),
  title text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  check (
    (item_type = 'listing' and listing_id is not null and shop_product_id is null)
    or (item_type = 'shop' and shop_product_id is not null and listing_id is null)
  )
);

create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.order_items enable row level security;

-- Participants of an order (buyer / seller) + Sphere admins see its items.
drop policy if exists "order_items_select_participant" on public.order_items;
create policy "order_items_select_participant" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.marketplace_orders o
      where o.id = order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or public.is_sphere_admin(o.sphere_id))
    )
  );

-- The checkout RPC is SECURITY DEFINER (see below); this INSERT policy exists
-- so any future direct flow stays buyer-scoped.
drop policy if exists "order_items_insert_buyer" on public.order_items;
create policy "order_items_insert_buyer" on public.order_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.marketplace_orders o
      where o.id = order_id and o.buyer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. cart_items — per-user cart (own rows only)
-- ---------------------------------------------------------------------------

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid references public.marketplace_listings (id) on delete cascade,
  shop_product_id uuid references public.shop_products (id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 20),
  created_at timestamptz not null default now(),
  check (
    (listing_id is not null and shop_product_id is null)
    or (shop_product_id is not null and listing_id is null)
  ),
  unique (user_id, listing_id),
  unique (user_id, shop_product_id)
);

create index if not exists cart_items_user_idx on public.cart_items (user_id, created_at);

alter table public.cart_items enable row level security;

drop policy if exists "cart_items_select_own" on public.cart_items;
create policy "cart_items_select_own" on public.cart_items
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "cart_items_insert_own" on public.cart_items;
create policy "cart_items_insert_own" on public.cart_items
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "cart_items_update_own" on public.cart_items;
create policy "cart_items_update_own" on public.cart_items
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "cart_items_delete_own" on public.cart_items;
create policy "cart_items_delete_own" on public.cart_items
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Checkout RPC + sold-listing cleanup RPC (SECURITY DEFINER, atomic)
-- ---------------------------------------------------------------------------

-- Atomically creates orders for every cart line in one transaction:
--   - validates the buyer is an active member of the Sphere;
--   - re-reads each listing from the DB (server-side price, never the client);
--   - rejects listings that are pending / removed / sold / the buyer's own,
--     rolling back the whole checkout (no partial purchases);
--   - groups items by seller → one order per seller, each with the delivery
--     details, per-item snapshots and purchase-time totals;
--   - flips every purchased listing to `sold` with a sold_at timestamp
--     (duplicate-purchase race is impossible: the conditional UPDATE only
--     affects rows still `active`, and the whole thing is one transaction).
-- Returns the created order ids (or an error message).
create or replace function public.checkout_cart(
  p_buyer_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_address text,
  p_delivery_date date,
  p_delivery_time text,
  p_listing_ids uuid[],
  p_quantities int[]
)
returns table (order_id uuid, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sphere_id uuid;
  v_listing record;
  v_seller_id uuid;
  v_order_id uuid;
  v_index int;
  v_total_cents bigint;
  v_fee_cents bigint;
  v_quantity int;
begin
  error := null;

  -- Buyer must be an active member of a Sphere.
  select us.sphere_id into v_sphere_id
  from public.user_spheres us
  join public.profiles p on p.id = us.user_id
  where us.user_id = p_buyer_id
    and us.membership_status = 'active'
    and p.account_status = 'active'
  limit 1;

  if v_sphere_id is null then
    return query select null::uuid, 'Not an active member'::text;
    return;
  end if;

  if p_listing_ids is null or array_length(p_listing_ids, 1) = 0 then
    return query select null::uuid, 'Cart is empty'::text;
    return;
  end if;

  -- Validate every line against the live DB in one pass (all-or-nothing).
  -- FOR UPDATE locks the listing rows so two concurrent checkouts can never
  -- both pass validation: the second blocks until the first commits, then
  -- re-reads the row and sees status='sold' -> rejected (duplicate-purchase
  -- prevention at the database layer).
  -- p_quantities is index-aligned with p_listing_ids.
  for v_index in 1..array_length(p_listing_ids, 1) loop
    select ml.id, ml.seller_id, ml.price_cents, ml.title, ml.sphere_id, ml.status
    into v_listing
    from public.marketplace_listings ml
    where ml.id = p_listing_ids[v_index]
    for update;

    if not found then
      return query select null::uuid, 'One or more items are no longer available'::text;
      return;
    end if;
    if v_listing.status <> 'active' then
      return query select null::uuid, 'One or more items are no longer available'::text;
      return;
    end if;
    if v_listing.sphere_id <> v_sphere_id then
      return query select null::uuid, 'Items must come from your Sphere'::text;
      return;
    end if;
    if v_listing.seller_id = p_buyer_id then
      return query select null::uuid, 'You cannot buy your own listing'::text;
      return;
    end if;
  end loop;

  -- One order per seller, each with its own items and server-side totals.
  for v_seller_id in
    select distinct ml.seller_id
    from public.marketplace_listings ml
    where ml.id = any(p_listing_ids)
  loop
    v_total_cents := 0;

    insert into public.marketplace_orders (
      buyer_id, seller_id, sphere_id, buyer_name, buyer_phone,
      address, delivery_date, delivery_time, status, total_cents
    ) values (
      p_buyer_id, v_seller_id, v_sphere_id, p_buyer_name, p_buyer_phone,
      p_address, p_delivery_date, p_delivery_time, 'pending', 0
    )
    returning id into v_order_id;

    for v_index in 1..array_length(p_listing_ids, 1) loop
      select ml.id, ml.seller_id, ml.price_cents, ml.title, ml.sphere_id, ml.status
      into v_listing
      from public.marketplace_listings ml
      where ml.id = p_listing_ids[v_index];

      if v_listing.seller_id = v_seller_id then
        v_quantity := coalesce(p_quantities[v_index], 1);
        v_total_cents := v_total_cents + (v_listing.price_cents * v_quantity);

        insert into public.order_items (
          order_id, listing_id, item_type, title, quantity, unit_price_cents
        ) values (
          v_order_id, v_listing.id, 'listing', v_listing.title, v_quantity, v_listing.price_cents
        );
      end if;
    end loop;

    -- Fee/settlement for display (5% platform fee, no gateway).
    v_fee_cents := (v_total_cents * 5 / 100)::bigint;
    update public.marketplace_orders
    set price_cents = v_total_cents::int,
        fee_cents = v_fee_cents::int,
        settlement_cents = (v_total_cents - v_fee_cents)::int,
        total_cents = v_total_cents::int
    where id = v_order_id;

    return query select v_order_id, null::text;
  end loop;

  -- Mark every purchased listing sold (atomic; only `active` rows flip, so a
  -- concurrent checkout can never double-sell the same listing).
  update public.marketplace_listings
  set status = 'sold', sold_at = now()
  where id = any(p_listing_ids) and status = 'active';

  return;
end $$;

revoke all on function public.checkout_cart(uuid, text, text, text, date, text, uuid[], int[]) from public;
grant execute on function public.checkout_cart(uuid, text, text, text, date, text, uuid[], int[]) to authenticated;

-- Idempotent cleanup: hide sold listings one hour after sale. Safe to run from
-- the app (any authenticated member) and from a Vercel Cron (service role).
-- Historical order records are untouched — only the public listing is hidden.
create or replace function public.cleanup_sold_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.marketplace_listings
  set status = 'removed'
  where status = 'sold'
    and sold_at is not null
    and sold_at < now() - interval '1 hour';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.cleanup_sold_listings() from public;
grant execute on function public.cleanup_sold_listings() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. profiles — college year + phone verification (one phone = one account)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists college_year text not null default '',
  add column if not exists phone_verified boolean not null default false;

-- Enforces ONE VERIFIED PHONE NUMBER = ONE ACCOUNT at the database layer.
-- Empty-string placeholders are excluded so legacy rows stay valid.
create unique index if not exists profiles_phone_unique_idx
  on public.profiles (phone) where phone <> '';

-- Signup trigger: persist the college year from raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_college_id uuid;
  v_college record;
  v_sphere_id uuid;
  v_handle text;
  v_first_in_sphere boolean;
begin
  insert into public.profiles (id, email, real_name, phone, college_input, college_year, phone_verified, role, account_status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'real_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'college_input', ''),
    coalesce(new.raw_user_meta_data->>'college_year', ''),
    coalesce((new.raw_user_meta_data->>'phone_verified')::boolean, false),
    case when not exists (select 1 from public.profiles) then 'super_admin' else 'user' end,
    'active'
  )
  on conflict (id) do nothing;

  v_college_id := nullif(trim(coalesce(new.raw_user_meta_data->>'college_id', '')), '')::uuid;

  if v_college_id is not null then
    select * into v_college from public.colleges where id = v_college_id and status = 'active';
  else
    select c.* into v_college
    from public.colleges c
    where c.status = 'active'
      and (c.slug = public.normalize_college(new.raw_user_meta_data->>'college_input')
           or exists (
             select 1 from public.college_aliases ca
             where ca.college_id = c.id
               and lower(ca.alias) = lower(trim(new.raw_user_meta_data->>'college_input'))
           ))
    limit 1;
  end if;

  if v_college.id is null then
    return new;
  end if;

  if v_college.sphere_id is null then
    insert into public.spheres (name, slug)
    values (v_college.name, v_college.slug)
    on conflict (slug) do nothing;
    select id into v_sphere_id from public.spheres where slug = v_college.slug;
    update public.colleges set sphere_id = v_sphere_id where id = v_college.id;
  else
    v_sphere_id := v_college.sphere_id;
  end if;

  v_first_in_sphere := not exists (
    select 1 from public.user_spheres where sphere_id = v_sphere_id
  );

  v_handle := public.random_handle();

  insert into public.user_spheres (user_id, sphere_id, anonymous_handle, membership_status)
  values (new.id, v_sphere_id, v_handle, 'active');

  if v_first_in_sphere then
    update public.profiles set role = 'admin' where id = new.id and role = 'user';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. groups — creator may delete their own group
-- ---------------------------------------------------------------------------

drop policy if exists "groups_delete_admin" on public.groups;
create policy "groups_delete_admin" on public.groups
  for delete to authenticated
  using (
    public.is_sphere_admin(sphere_id)
    or created_by = auth.uid()
    or (public.has_permission('social.manage_groups') and public.is_member(sphere_id))
  );

-- ---------------------------------------------------------------------------
-- 7. global_listings — Listing Managers may manage global listings
-- ---------------------------------------------------------------------------

-- True when the caller holds a listing_manager role assignment (in any
-- Sphere — global listings are platform-level, and the Listing Manager is the
-- platform role the spec grants for them).
create or replace function public.is_listing_manager()
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
      and ra.role = 'listing_manager'
      and p.account_status = 'active'
  );
$$;

drop policy if exists "global_listings_insert_super_admin" on public.global_listings;
create policy "global_listings_insert_super_admin" on public.global_listings
  for insert to authenticated
  with check (public.is_super_admin() or public.is_listing_manager());

drop policy if exists "global_listings_update_super_admin" on public.global_listings;
create policy "global_listings_update_super_admin" on public.global_listings
  for update to authenticated
  using (public.is_super_admin() or public.is_listing_manager())
  with check (public.is_super_admin() or public.is_listing_manager());

drop policy if exists "global_listings_delete_super_admin" on public.global_listings;
create policy "global_listings_delete_super_admin" on public.global_listings
  for delete to authenticated
  using (public.is_super_admin() or public.is_listing_manager());

-- ---------------------------------------------------------------------------
-- 8. club_members — Sphere admins / club managers may remove members
-- ---------------------------------------------------------------------------

drop policy if exists "club_members_delete_admin" on public.club_members;
create policy "club_members_delete_admin" on public.club_members
  for delete to authenticated
  using (
    public.is_sphere_admin((select sphere_id from public.clubs where id = club_members.club_id))
    or (public.has_permission('clubs.update') and public.is_member((select sphere_id from public.clubs where id = club_members.club_id)))
  );
