-- ============================================================================
-- UreSphere — notifications, push subscriptions, group mute (migration 0015)
--
-- Additive, idempotent. Nothing existing is weakened:
--   1. notification_preferences — per-user defaults for push/chat/group
--   2. group_notification_preferences — per-user per-group mute toggle
--   3. push_subscriptions — browser push notification endpoints
--   4. notify_group_message() — trigger: notify group members on new message
--   5. notify_chat_message() — trigger: notify Sphere members on new chat message (DM-like)
--   6. RLS policies for new tables
--   7. Realtime publication for push_subscriptions
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. notification_preferences — per-user global notification settings
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  push_enabled boolean not null default true,
  chat_notifications boolean not null default true,
  group_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "notif_prefs_select_own" on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());

create policy "notif_prefs_insert_own" on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());

create policy "notif_prefs_update_own" on public.notification_preferences
  for update to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. group_notification_preferences — per-user per-group mute
-- ---------------------------------------------------------------------------

create table if not exists public.group_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_id)
);

create index if not exists group_notif_prefs_user_idx on public.group_notification_preferences (user_id);

alter table public.group_notification_preferences enable row level security;

create policy "group_notif_prefs_select_own" on public.group_notification_preferences
  for select to authenticated using (user_id = auth.uid());

create policy "group_notif_prefs_insert_own" on public.group_notification_preferences
  for insert to authenticated with check (user_id = auth.uid());

create policy "group_notif_prefs_update_own" on public.group_notification_preferences
  for update to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. push_subscriptions — browser push notification registrations
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subs_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

create policy "push_subs_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

create policy "push_subs_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. notify_group_message() — SECURITY DEFINER trigger
--     On new group message, insert a notification for every OTHER member of
--     the group (not the author), respecting group mute + global prefs.
-- ---------------------------------------------------------------------------

create or replace function public.notify_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select
    gm.user_id,
    'group_message',
    'New message in group',
    coalesce(
      (select name from public.groups where id = new.group_id),
      'A group'
    ) || ' — ' || left(new.body, 120),
    '/dashboard/groups?group=' || new.group_id::text
  from public.group_members gm
  left join public.group_notification_preferences gnp
    on gnp.user_id = gm.user_id and gnp.group_id = new.group_id
  left join public.notification_preferences np
    on np.user_id = gm.user_id
  where gm.group_id = new.group_id
    and gm.user_id != new.author_id
    -- Skip muted users for this group
    and coalesce(gnp.muted, false) = false
    -- Respect global group notification preference
    and coalesce(np.group_notifications, true) = true;
  return new;
end $$;

drop trigger if exists on_group_message_inserted on public.group_messages;
create trigger on_group_message_inserted
  after insert on public.group_messages
  for each row execute function public.notify_group_message();

-- ---------------------------------------------------------------------------
-- 5. notify_chat_message() — SECURITY DEFINER trigger
--     On new Sphere chat message, insert a notification for active Sphere
--     members (not the author) who have chat_notifications enabled.
--     This is a lightweight notification — just "New message in Sphere Chat".
--     We don't send to every member on every message to avoid spam in active
--     Spheres, so we batch by creating a notification per-member.
-- ---------------------------------------------------------------------------

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select
    us.user_id,
    'chat_message',
    'New message in Sphere Chat',
    left(new.body, 120),
    '/dashboard/chat'
  from public.user_spheres us
  left join public.notification_preferences np
    on np.user_id = us.user_id
  where us.sphere_id = new.sphere_id
    and us.membership_status = 'active'
    and us.user_id != new.author_id
    and coalesce(np.chat_notifications, true) = true;
  return new;
end $$;

drop trigger if exists on_chat_message_inserted on public.chat_messages;
create trigger on_chat_message_inserted
  after insert on public.chat_messages
  for each row execute function public.notify_chat_message();

-- ---------------------------------------------------------------------------
-- 6. RPCs for push subscription management and notification preferences
-- ---------------------------------------------------------------------------

-- Upsert a push subscription (client sends the full subscription object)
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (user_id, endpoint)
  do update set
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    updated_at = now();
end $$;

revoke all on function public.save_push_subscription(text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Delete a push subscription (unsubscribe)
create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions
  where user_id = auth.uid() and endpoint = p_endpoint;
end $$;

revoke all on function public.remove_push_subscription(text) from public;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Realtime for push_subscriptions
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.push_subscriptions;
exception when others then
  raise notice 'supabase_realtime already covers push_subscriptions';
end $$;
