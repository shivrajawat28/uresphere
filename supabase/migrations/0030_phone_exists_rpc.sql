-- 0030_phone_exists_rpc.sql
-- Bypasses RLS to allow the signup flow to check if a phone number is already registered
-- without exposing the entire profiles table to unauthenticated users.

create or replace function public.check_phone_exists(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles where phone = p_phone
  );
end;
$$;
