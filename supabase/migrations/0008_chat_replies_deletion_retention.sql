-- ============================================================================
-- Uresphere — Sphere chat: replies, deleted-by attribution, 24h retention
-- (migration 0008)
--
-- Additive / idempotent. Nothing here weakens existing RLS or RBAC:
--
--   1. chat_messages.deleted_by_role — who removed the message ('user' /
--      'admin'). Never trusted from the client: it is written exclusively by
--      the SECURITY DEFINER RPC `delete_chat_message()`, which resolves the
--      actor from auth.uid() (message owner → 'user', Sphere admin →
--      'admin'). Legacy soft-deleted rows are backfilled as 'admin' (matching
--      the old UI) and their content is migrated into chat_message_archives.
--
--   2. chat_messages.reply_to_message_id — optional reply reference. A
--      BEFORE INSERT/UPDATE trigger enforces that a reply can only reference a
--      message in the SAME Sphere (cross-Sphere references are impossible at
--      the DB layer, even with a client-supplied id). ON DELETE SET NULL keeps
--      replies valid after their target is purged, leaving no orphan records.
--
--   3. chat_messages.expires_at — created_at + 24 hours, maintained by a
--      BEFORE INSERT/UPDATE OF created_at trigger (PostgreSQL has no immutable
--      `timestamptz + interval` expression, so a GENERATED column is
--      impossible). created_at stays the source of truth, so deleting a
--      message can never extend its lifetime. Indexed so the purge locates
--      expired rows without a table scan.
--
--   4. chat_message_archives — original body of deleted messages, RLS-gated
--      to Sphere admins / super admins for moderation & audit. Cascade-deleted
--      with the message so the 24h purge leaves nothing behind.
--
--   5. public.delete_chat_message(uuid) — SECURITY DEFINER RPC. The ONLY
--      path that soft-deletes a message: archives the original content,
--      blanks the public body (so deleted content is never served to normal
--      users, including via Realtime), and records who deleted it. Regular
--      users lose direct UPDATE on chat_messages (they could otherwise fake
--      deleted_by / deleted_by_role); Sphere admins keep direct update.
--
--   6. public.purge_expired_chat_messages(batch_size) — idempotent,
--      batch-limited purge of messages whose expires_at has passed. Not
--      grantable to app roles; executed only by the scheduled pg_cron job
--      (every 5 minutes, when pg_cron is available) or by a superuser.
--
--   7. RLS: `chat_update_author_or_admin` is replaced by `chat_update_admin`
--      (Sphere admin only) so the deleted_by / deleted_by_role columns can
--      never be forged by a message author.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Deletion attribution
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  add column if not exists deleted_by_role text not null default 'user'
  check (deleted_by_role in ('user', 'admin'));

-- Legacy rows: the old UI always rendered these as "Message deleted by admin".
update public.chat_messages set deleted_by_role = 'admin' where is_deleted;

-- ---------------------------------------------------------------------------
-- 2. Reply references (same-Sphere enforced by trigger below)
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  add column if not exists reply_to_message_id uuid
  references public.chat_messages (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. 24h retention — expires_at derived from created_at (trigger-maintained)
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  add column if not exists expires_at timestamptz;

-- Backfill legacy rows (also makes the NOT NULL below safe / idempotent).
update public.chat_messages
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.chat_messages
  alter column expires_at set not null;

create index if not exists chat_messages_expires_at_idx on public.chat_messages (expires_at);
create index if not exists chat_messages_created_at_idx on public.chat_messages (created_at);

-- ---------------------------------------------------------------------------
-- 4. Public body may be blanked on delete; original moves to the archive.
--    (The app still requires 1–1000 chars on send via validateMessageBody.)
-- ---------------------------------------------------------------------------

alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages
  add constraint chat_messages_body_check
  check (char_length(body) between 0 and 1000);

-- ---------------------------------------------------------------------------
-- 4b. Retention trigger — trivial arithmetic assignment, no table access, so
--     it adds no meaningful per-message cost. Without it, expires_at could
--     drift from created_at; with it, expires_at is always created_at + 24h.
-- ---------------------------------------------------------------------------

create or replace function public.chat_expires_at_maintain()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.expires_at := new.created_at + interval '24 hours';
  return new;
end $$;

drop trigger if exists chat_expires_at_maintain on public.chat_messages;
create trigger chat_expires_at_maintain
  before insert or update of created_at on public.chat_messages
  for each row execute function public.chat_expires_at_maintain();

-- ---------------------------------------------------------------------------
-- 5. Indexes (retention purge + reply preview lookups)
-- ---------------------------------------------------------------------------

create index if not exists chat_messages_reply_to_idx on public.chat_messages (reply_to_message_id);

-- ---------------------------------------------------------------------------
-- 6. chat_message_archives — admin-only original content for moderation
-- ---------------------------------------------------------------------------

create table if not exists public.chat_message_archives (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.chat_messages (id) on delete cascade,
  sphere_id uuid not null references public.spheres (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  body text not null,
  deleted_by uuid references auth.users (id),
  deleted_by_role text not null check (deleted_by_role in ('user', 'admin')),
  created_at timestamptz not null,
  deleted_at timestamptz not null default now()
);

create index if not exists chat_message_archives_sphere_idx
  on public.chat_message_archives (sphere_id, deleted_at desc);

alter table public.chat_message_archives enable row level security;

-- Members can never read archived content; Sphere admins / super admins can
-- (moderation & audit). Writes happen only inside the SECURITY DEFINER RPC —
-- there is deliberately no INSERT/UPDATE/DELETE policy.
drop policy if exists "chat_archives_select_admin" on public.chat_message_archives;
create policy "chat_archives_select_admin" on public.chat_message_archives
  for select to authenticated using (public.is_sphere_admin(sphere_id));

-- Migrate content of messages deleted BEFORE this migration shipped, then
-- blank their public bodies so deleted content is no longer served to anyone
-- (legacy rows kept their body intact; the old UI only hid it).
insert into public.chat_message_archives
  (message_id, sphere_id, author_id, body, deleted_by, deleted_by_role, created_at, deleted_at)
select
  id, sphere_id, author_id, body,
  coalesce(deleted_by, author_id), 'admin', created_at, now()
from public.chat_messages
where is_deleted
on conflict (message_id) do nothing;

update public.chat_messages set body = '' where is_deleted;

-- ---------------------------------------------------------------------------
-- 7. delete_chat_message — the single, server-side delete path
-- ---------------------------------------------------------------------------

create or replace function public.delete_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.chat_messages%rowtype;
  v_role text;
begin
  select * into v_message from public.chat_messages where id = p_message_id;
  if not found then
    raise exception 'Message not found.';
  end if;

  -- The actor is resolved from the authenticated session, never the client.
  -- Message owner → 'user'; Sphere admin (incl. super_admin) → 'admin'.
  if v_message.author_id = auth.uid() then
    v_role := 'user';
  elsif public.is_sphere_admin(v_message.sphere_id) then
    v_role := 'admin';
  else
    raise exception 'You can only delete your own messages.';
  end if;

  -- Idempotent: an already-deleted message needs no further work.
  if v_message.is_deleted then
    return;
  end if;

  -- Preserve the original content for authorized admins until the 24h purge.
  insert into public.chat_message_archives
    (message_id, sphere_id, author_id, body, deleted_by, deleted_by_role, created_at)
  values
    (v_message.id, v_message.sphere_id, v_message.author_id, v_message.body,
     auth.uid(), v_role, v_message.created_at);

  -- Blank the public body so deleted content is never served (incl. Realtime
  -- payloads) to normal users. created_at / expires_at are untouched: the
  -- 24-hour lifetime is NOT extended by deleting.
  update public.chat_messages
  set is_deleted = true,
      deleted_by = auth.uid(),
      deleted_by_role = v_role,
      body = ''
  where id = v_message.id;
end $$;

revoke all on function public.delete_chat_message(uuid) from public;
grant execute on function public.delete_chat_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Same-Sphere reply enforcement (fires only for rows with a reply ref)
-- ---------------------------------------------------------------------------

create or replace function public.chat_reply_same_sphere_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.chat_messages
    where id = new.reply_to_message_id and sphere_id = new.sphere_id
  ) then
    raise exception 'Reply target must belong to the same Sphere.';
  end if;
  return new;
end $$;

drop trigger if exists chat_reply_same_sphere_check on public.chat_messages;
create trigger chat_reply_same_sphere_check
  before insert or update of reply_to_message_id on public.chat_messages
  for each row
  when (new.reply_to_message_id is not null)
  execute function public.chat_reply_same_sphere_check();

-- ---------------------------------------------------------------------------
-- 9. 24h retention purge — batch-limited, idempotent, superuser-only
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_chat_messages(batch_size integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_deleted integer := 0;
begin
  loop
    select array_agg(id) into v_ids
    from (
      select id from public.chat_messages
      where expires_at < now()
      limit batch_size
    ) t;

    if v_ids is null or cardinality(v_ids) = 0 then
      exit;
    end if;

    -- Archives cascade with the message; reply references are SET NULL by
    -- the FK, so no orphaned reply records can remain.
    delete from public.chat_messages where id = any(v_ids);
    v_deleted := v_deleted + cardinality(v_ids);

    if cardinality(v_ids) < batch_size then
      exit;
    end if;
  end loop;

  return v_deleted;
end $$;

-- Only the scheduler (postgres / pg_cron) may run the purge. The app never
-- calls it, so there is no client-callable path to delete data at will.
revoke all on function public.purge_expired_chat_messages(integer) from public;
revoke all on function public.purge_expired_chat_messages(integer) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Scheduling — pg_cron every 5 minutes, when available
--     (Supabase hosts pg_cron; vanilla local Postgres usually does not, in
--     which case the migration applies cleanly and the job is simply skipped.
--     Enable pg_cron in your Supabase dashboard (Database → Extensions) to
--     activate the scheduled purge.)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    begin
      perform cron.unschedule('uresphere-purge-chat-messages');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'uresphere-purge-chat-messages',
      '*/5 * * * *',
      'select public.purge_expired_chat_messages(500)'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. RLS — authors can no longer UPDATE rows directly (would allow forging
--     deleted_by / deleted_by_role). Deletion flows through the RPC above;
--     Sphere admins keep direct update access.
-- ---------------------------------------------------------------------------

drop policy if exists "chat_update_author_or_admin" on public.chat_messages;
drop policy if exists "chat_update_admin" on public.chat_messages;
create policy "chat_update_admin" on public.chat_messages
  for update to authenticated using (public.is_sphere_admin(sphere_id));
