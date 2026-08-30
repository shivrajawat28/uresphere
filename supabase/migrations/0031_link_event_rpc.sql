-- Migration: 0031_link_event_rpc.sql
-- Description: Adds RPCs to allow Club Admins to attach/detach existing college events to their clubs safely.

create or replace function link_event_to_club(p_event_id uuid, p_club_id uuid)
returns void as $$
begin
  -- Validate caller is a club admin or sphere admin for this club
  if not (public.is_club_admin(p_club_id) or public.is_sphere_admin((select sphere_id from public.clubs where id = p_club_id))) then
    raise exception 'Unauthorized';
  end if;

  -- Ensure event belongs to the same sphere and isn't already attached
  update public.events
  set club_id = p_club_id
  where id = p_event_id
    and club_id is null
    and sphere_id = (select sphere_id from public.clubs where id = p_club_id);
end;
$$ language plpgsql security definer;

create or replace function unlink_event_from_club(p_event_id uuid, p_club_id uuid)
returns void as $$
begin
  -- Validate caller is a club admin or sphere admin for this club
  if not (public.is_club_admin(p_club_id) or public.is_sphere_admin((select sphere_id from public.clubs where id = p_club_id))) then
    raise exception 'Unauthorized';
  end if;

  -- Ensure the event is actually attached to THIS club before setting to null
  update public.events
  set club_id = null
  where id = p_event_id
    and club_id = p_club_id;
end;
$$ language plpgsql security definer;
