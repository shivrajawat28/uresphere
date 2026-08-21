-- Drop old overlapping policies from 0011
drop policy if exists "shop_insert_admin" on public.shop_products;
drop policy if exists "shop_update_admin" on public.shop_products;
drop policy if exists "shop_delete_admin" on public.shop_products;

-- Recreate the correct ones from 0021 just to be safe
drop policy if exists "shop_products_insert_admin" on public.shop_products;
drop policy if exists "shop_products_update_admin" on public.shop_products;
drop policy if exists "shop_products_delete_admin" on public.shop_products;

create policy "shop_products_insert_admin" on public.shop_products
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (
      created_by = auth.uid()
      and exists (
        select 1 from public.role_assignments ra
        join public.user_spheres us on us.user_id = ra.user_id and us.sphere_id = ra.sphere_id
        join public.profiles p on p.id = ra.user_id
        where ra.user_id = auth.uid()
          and ra.sphere_id = shop_products.sphere_id
          and us.membership_status = 'active'
          and p.account_status = 'active'
          and (ra.scope->'permissions') ? 'shop.products.create'
      )
    )
  );

create policy "shop_products_update_admin" on public.shop_products
  for update to authenticated
  using (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (
      created_by = auth.uid()
      and exists (
        select 1 from public.role_assignments ra
        join public.user_spheres us on us.user_id = ra.user_id and us.sphere_id = ra.sphere_id
        join public.profiles p on p.id = ra.user_id
        where ra.user_id = auth.uid()
          and ra.sphere_id = shop_products.sphere_id
          and us.membership_status = 'active'
          and p.account_status = 'active'
          and (ra.scope->'permissions') ? 'shop.products.update'
      )
    )
  )
  with check (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (
      created_by = auth.uid()
      and exists (
        select 1 from public.role_assignments ra
        join public.user_spheres us on us.user_id = ra.user_id and us.sphere_id = ra.sphere_id
        join public.profiles p on p.id = ra.user_id
        where ra.user_id = auth.uid()
          and ra.sphere_id = shop_products.sphere_id
          and us.membership_status = 'active'
          and p.account_status = 'active'
          and (ra.scope->'permissions') ? 'shop.products.update'
      )
    )
  );

create policy "shop_products_delete_admin" on public.shop_products
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.is_sphere_admin(sphere_id)
    or (
      created_by = auth.uid()
      and exists (
        select 1 from public.role_assignments ra
        join public.user_spheres us on us.user_id = ra.user_id and us.sphere_id = ra.sphere_id
        join public.profiles p on p.id = ra.user_id
        where ra.user_id = auth.uid()
          and ra.sphere_id = shop_products.sphere_id
          and us.membership_status = 'active'
          and p.account_status = 'active'
          and (ra.scope->'permissions') ? 'shop.products.delete'
      )
    )
  );
