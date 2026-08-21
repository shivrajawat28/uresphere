-- Migration 0022: Migrate Shop Name to shop_products and drop shop_profiles

-- 1. Add shop_name to shop_products
alter table public.shop_products add column if not exists shop_name text not null default 'ÙreSphere Shop';

-- 2. Migrate existing shop names from shop_profiles (if it exists)
do $$
begin
  if exists (select from information_schema.tables where table_schema = 'public' and table_name = 'shop_profiles') then
    update public.shop_products sp
    set shop_name = coalesce((
      select shop_name from public.shop_profiles p 
      where p.user_id = sp.created_by and p.sphere_id = sp.sphere_id 
      limit 1
    ), 'ÙreSphere Shop');
  end if;
end $$;

-- 3. Drop shop_profiles and its dependencies
drop table if exists public.shop_profiles cascade;
