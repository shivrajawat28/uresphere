-- Migration 0025: Fix order_items CHECK constraint to allow safe product deletion

-- Drop the existing constraint dynamically by finding its name
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'order_items'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%item_type = ''listing''%';

  if constraint_name is not null then
    execute 'alter table public.order_items drop constraint "' || constraint_name || '"';
  end if;
end $$;

-- Add the corrected constraint allowing ON DELETE SET NULL to work safely
-- This ensures that a listing order item never has a shop_product_id and vice versa,
-- but allows the referenced IDs to become NULL when a product/listing is deleted,
-- preserving the order history snapshots (title, quantity, price).
alter table public.order_items
add constraint order_items_type_check
check (
  (item_type = 'listing' and shop_product_id is null)
  or (item_type = 'shop' and listing_id is null)
);
