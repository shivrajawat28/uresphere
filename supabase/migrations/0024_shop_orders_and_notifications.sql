-- ============================================================================
-- Uresphere — Add rejected status to marketplace_orders (migration 0024)
-- ============================================================================

-- Drop the existing constraint (whether named automatically or explicitly)
alter table public.marketplace_orders drop constraint if exists marketplace_orders_status_check;

-- Re-add the constraint with 'rejected' included
alter table public.marketplace_orders
  add constraint marketplace_orders_status_check
  check (status in ('pending', 'accepted', 'in_progress', 'delivered', 'cancelled', 'rejected'));
