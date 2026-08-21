-- ============================================================================
-- UreSphere — Shop Admin Roles and Unified Checkout (migration 0021)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update role_assignments_role_check
-- ---------------------------------------------------------------------------
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments
  add constraint role_assignments_role_check
  check (role in (
    'moderator', 'section_manager', 'ambassador',
    'sphere_admin', 'academic_manager', 'social_moderator', 'club_manager',
    'club_admin',
    'event_manager', 'marketplace_moderator', 'listing_manager', 'promotion_moderator',
    'shop_admin'
  ));

-- ---------------------------------------------------------------------------
-- 2. Create shop_profiles table
-- ---------------------------------------------------------------------------
create table if not exists public.shop_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  shop_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sphere_id)
);

create index if not exists shop_profiles_sphere_idx on public.shop_profiles (sphere_id);

alter table public.shop_profiles enable row level security;

-- Only super admins, sphere admins, or the user themselves can read
create policy "shop_profiles_select" on public.shop_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or public.has_permission('shop.read')
  );

-- Only the assigned Shop Admin (or higher) can upsert
create policy "shop_profiles_upsert" on public.shop_profiles
  for all to authenticated
  using (
    (user_id = auth.uid() and public.has_permission('shop.update'))
    or public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
  )
  with check (
    (user_id = auth.uid() and public.has_permission('shop.update'))
    or public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Update shop_products RLS
-- ---------------------------------------------------------------------------

-- The previous policy only allowed super/sphere admins to manage shop products.
-- Now we need to allow Shop Admins to manage their own products.

drop policy if exists "shop_products_insert_admin" on public.shop_products;
drop policy if exists "shop_products_update_admin" on public.shop_products;
drop policy if exists "shop_products_delete_admin" on public.shop_products;

create policy "shop_products_insert_admin" on public.shop_products
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (created_by = auth.uid() and public.has_permission('shop.products.create'))
  );

create policy "shop_products_update_admin" on public.shop_products
  for update to authenticated
  using (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (created_by = auth.uid() and public.has_permission('shop.products.update'))
  )
  with check (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (created_by = auth.uid() and public.has_permission('shop.products.update'))
  );

create policy "shop_products_delete_admin" on public.shop_products
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (created_by = auth.uid() and public.has_permission('shop.products.delete'))
  );


-- ---------------------------------------------------------------------------
-- 4. Unified Checkout RPC (checkout_mixed_cart)
-- ---------------------------------------------------------------------------

create or replace function public.checkout_mixed_cart(
  p_buyer_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_address text,
  p_delivery_date date,
  p_delivery_time text,
  p_listing_ids uuid[],
  p_listing_quantities int[],
  p_shop_product_ids uuid[],
  p_shop_quantities int[]
)
returns table (order_id uuid, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sphere_id uuid;
  v_item record;
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

  if (p_listing_ids is null or array_length(p_listing_ids, 1) = 0) and
     (p_shop_product_ids is null or array_length(p_shop_product_ids, 1) = 0) then
    return query select null::uuid, 'Cart is empty'::text;
    return;
  end if;

  -- Validate marketplace listings
  if p_listing_ids is not null and array_length(p_listing_ids, 1) > 0 then
    for v_index in 1..array_length(p_listing_ids, 1) loop
      select ml.id, ml.seller_id, ml.price_cents, ml.title, ml.sphere_id, ml.status
      into v_item
      from public.marketplace_listings ml
      where ml.id = p_listing_ids[v_index]
      for update;

      if not found or v_item.status <> 'active' then
        return query select null::uuid, 'One or more items are no longer available'::text;
        return;
      end if;
      if v_item.sphere_id <> v_sphere_id then
        return query select null::uuid, 'Items must come from your Sphere'::text;
        return;
      end if;
      if v_item.seller_id = p_buyer_id then
        return query select null::uuid, 'You cannot buy your own listing'::text;
        return;
      end if;
    end loop;
  end if;

  -- Validate shop products
  if p_shop_product_ids is not null and array_length(p_shop_product_ids, 1) > 0 then
    for v_index in 1..array_length(p_shop_product_ids, 1) loop
      select sp.id, sp.created_by as seller_id, sp.price_cents, sp.name as title, sp.sphere_id, sp.active, sp.availability
      into v_item
      from public.shop_products sp
      where sp.id = p_shop_product_ids[v_index]
      for update;

      if not found or v_item.active = false or v_item.availability <> 'in_stock' then
        return query select null::uuid, 'One or more shop products are no longer available'::text;
        return;
      end if;
      if v_item.sphere_id <> v_sphere_id then
        return query select null::uuid, 'Shop products must come from your Sphere'::text;
        return;
      end if;
      if v_item.seller_id = p_buyer_id then
        return query select null::uuid, 'You cannot buy your own shop product'::text;
        return;
      end if;
    end loop;
  end if;

  -- Group sellers (from listings and shop products)
  for v_seller_id in
    select distinct seller_id from (
      select seller_id from public.marketplace_listings where id = any(p_listing_ids)
      union
      select created_by as seller_id from public.shop_products where id = any(p_shop_product_ids)
    ) as combined_sellers
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

    -- Add Listing Items
    if p_listing_ids is not null and array_length(p_listing_ids, 1) > 0 then
      for v_index in 1..array_length(p_listing_ids, 1) loop
        select ml.id, ml.seller_id, ml.price_cents, ml.title
        into v_item
        from public.marketplace_listings ml
        where ml.id = p_listing_ids[v_index];

        if v_item.seller_id = v_seller_id then
          v_quantity := coalesce(p_listing_quantities[v_index], 1);
          v_total_cents := v_total_cents + (v_item.price_cents * v_quantity);

          insert into public.order_items (
            order_id, listing_id, item_type, title, quantity, unit_price_cents
          ) values (
            v_order_id, v_item.id, 'listing', v_item.title, v_quantity, v_item.price_cents
          );
        end if;
      end loop;
    end if;

    -- Add Shop Product Items
    if p_shop_product_ids is not null and array_length(p_shop_product_ids, 1) > 0 then
      for v_index in 1..array_length(p_shop_product_ids, 1) loop
        select sp.id, sp.created_by as seller_id, sp.price_cents, sp.name as title
        into v_item
        from public.shop_products sp
        where sp.id = p_shop_product_ids[v_index];

        if v_item.seller_id = v_seller_id then
          v_quantity := coalesce(p_shop_quantities[v_index], 1);
          v_total_cents := v_total_cents + (v_item.price_cents * v_quantity);

          insert into public.order_items (
            order_id, shop_product_id, item_type, title, quantity, unit_price_cents
          ) values (
            v_order_id, v_item.id, 'shop', v_item.title, v_quantity, v_item.price_cents
          );
        end if;
      end loop;
    end if;

    -- Fee/settlement for display (5% platform fee)
    v_fee_cents := (v_total_cents * 5 / 100)::bigint;
    update public.marketplace_orders
    set price_cents = v_total_cents::int,
        fee_cents = v_fee_cents::int,
        settlement_cents = (v_total_cents - v_fee_cents)::int,
        total_cents = v_total_cents::int
    where id = v_order_id;

    return query select v_order_id, null::text;
  end loop;

  -- Mark every purchased listing sold (atomic)
  if p_listing_ids is not null and array_length(p_listing_ids, 1) > 0 then
    update public.marketplace_listings
    set status = 'sold', sold_at = now()
    where id = any(p_listing_ids) and status = 'active';
  end if;

  return;
end $$;

revoke all on function public.checkout_mixed_cart(uuid, text, text, text, date, text, uuid[], int[], uuid[], int[]) from public;
grant execute on function public.checkout_mixed_cart(uuid, text, text, text, date, text, uuid[], int[], uuid[], int[]) to authenticated;
