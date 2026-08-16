-- Uresphere functional + RLS verification. Connect as a superuser.
-- Data-shape checks run as postgres; RLS checks run as `authenticated` with
-- app.uid simulating a logged-in user.
\set ON_ERROR_STOP on

-- ── 1. Provisioning: Sphere resolution + handle generation ────────────────
select '1. provisioning' as test;
delete from public.user_spheres; delete from public.groups; delete from public.chat_messages;
delete from public.marketplace_listings; delete from public.reports; delete from public.notifications;
delete from public.college_aliases; delete from public.colleges;
delete from public.profiles; delete from public.spheres;
delete from auth.users;

-- Directory is admin-managed. Three official colleges, each with one Sphere.
insert into public.colleges (name, short_name, slug, city, status) values
  ('ITS Engineering College', 'ITS', 'its', 'Greater Noida', 'active'),
  ('Delhi Technological University', 'DTU', 'delhi-technological', 'Delhi', 'active'),
  ('ITS Engineering College Greater Noida', 'ITSGN', 'its-engineering-college-greater-noida', 'Greater Noida', 'active');

-- Aliases resolve to the same college/Sphere.
insert into public.college_aliases (college_id, alias)
select id, 'I.T.S' from public.colleges where slug = 'its';

-- Users pick a directory college (college_id); the trigger resolves the Sphere.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@college.edu',
   ('{"real_name":"Alice","phone":"999","college_id":"' || (select id::text from public.colleges where slug = 'its') || '","college_input":"ITS Engineering College"}')::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'b@college.edu',
   ('{"real_name":"Bob","phone":"888","college_id":"' || (select id::text from public.colleges where slug = 'its') || '","college_input":"ITS Engineering College"}')::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'c@other.edu',
   ('{"real_name":"Carol","phone":"777","college_id":"' || (select id::text from public.colleges where slug = 'delhi-technological') || '","college_input":"Delhi Technological University"}')::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'd@west.edu',
   ('{"real_name":"Dana","phone":"666","college_id":"' || (select id::text from public.colleges where slug = 'its') || '","college_input":"ITS Engineering College"}')::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'e@inst.edu',
   ('{"real_name":"Eve","phone":"555","college_id":"' || (select id::text from public.colleges where slug = 'its-engineering-college-greater-noida') || '","college_input":"ITS Engineering College Greater Noida"}')::jsonb);

-- One approved college == one Sphere; distinct campuses never merge.
select (select count(*) from public.spheres) = 3 as spheres_created,
       exists (select 1 from public.spheres where slug = 'delhi-technological') as dtu_slug_hyphenated,
       exists (select 1 from public.spheres where slug = 'its') as its_slug,
       exists (select 1 from public.spheres where slug = 'its-engineering-college-greater-noida') as distinct_campus_not_merged,
       (select count(*) from public.user_spheres where sphere_id = (select id from public.spheres where slug = 'its')) = 3 as its_members;

-- First-ever platform user is super_admin; first member of a NEW sphere is admin.
select (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'super_admin' as first_platform_user_super_admin,
       (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333') = 'admin' as first_new_sphere_member_admin,
       (select role from public.profiles where id = '44444444-4444-4444-4444-444444444444') = 'user' as second_member_stays_user;

-- Handles match @AdjectiveAnimal### and are unique.
select bool_and(anonymous_handle ~ '^@[A-Z][a-zA-Z]+\d{3}$') as handle_format,
       (select count(distinct anonymous_handle) from public.user_spheres) = 5 as handles_unique
from public.user_spheres;

-- ── 2. Handle regeneration ─────────────────────────────────────────────────
select '2. regenerate handle' as test;
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
select (select public.regenerate_own_handle() ~ '^@[A-Z][a-zA-Z]+\d{3}$') as regen_format;
reset role;

-- ── 3. RLS: Sphere isolation (chat) ────────────────────────────────────────
select '3. sphere isolation' as test;
insert into public.chat_messages (sphere_id, author_id, body)
select id, '11111111-1111-1111-1111-111111111111', 'hello its' from public.spheres where slug = 'its';
insert into public.chat_messages (sphere_id, author_id, body)
select id, '33333333-3333-3333-3333-333333333333', 'hello dtu' from public.spheres where slug = 'delhi-technological';

set role authenticated;
-- Dana (ITS) sees only ITS chat.
set app.uid = '44444444-4444-4444-4444-444444444444';
select (select count(*) from public.chat_messages) = 1 as its_member_sees_only_own_sphere;

-- Carol (DTU) sees only DTU chat.
set app.uid = '33333333-3333-3333-3333-333333333333';
select (select count(*) from public.chat_messages) = 1 as dtu_member_sees_only_own_sphere;

-- Carol cannot write into ITS chat even with a spoofed sphere_id (RLS error).
do $$
begin
  begin
    insert into public.chat_messages (sphere_id, author_id, body)
    select id, '33333333-3333-3333-3333-333333333333', 'hacked' from public.spheres where slug = 'its';
    raise exception 'FAIL: cross-sphere chat insert allowed';
  exception when insufficient_privilege then
    raise notice 'OK: cross-sphere insert blocked';
  end;
end $$;

-- ── 4. RLS: private profile isolation ──────────────────────────────────────
select '4. private profile isolation' as test;
-- Carol cannot read Alice's private profile (different sphere).
select (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 0 as profile_hidden_cross_sphere;
-- Carol sees only her own sphere's handles.
select (select count(*) from public.user_spheres) = 1 as handles_scoped_to_sphere;

-- ── 5. RLS: marketplace ownership ──────────────────────────────────────────
select '5. marketplace ownership' as test;
reset role;
insert into public.marketplace_listings (sphere_id, seller_id, title, description, price_cents, category, condition)
select id, '11111111-1111-1111-1111-111111111111', 'My book', 'desc', 100, 'books', 'used'
from public.spheres where slug = 'its';

-- Bob (same sphere, NOT the owner): RLS silently filters UPDATE/DELETE to 0 rows.
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';
update public.marketplace_listings set title = 'hijacked' where title = 'My book';
delete from public.marketplace_listings where title = 'hijacked';
reset role;
select (select count(*) from public.marketplace_listings where title = 'My book') = 1 as non_owner_cannot_edit_or_delete,
       (select count(*) from public.marketplace_listings where title = 'hijacked') = 0 as no_row_leaked;

-- Owner can update.
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
update public.marketplace_listings set status = 'sold' where title = 'My book';
select (select status from public.marketplace_listings limit 1) = 'sold' as owner_can_update;
reset role;

-- ── 6. Chat delete attribution (migration 0008) ────────────────────────────
select '6. chat delete attribution' as test;

-- Give Bob a message so an admin-delete of a NON-author row can be tested.
reset role;
insert into public.chat_messages (sphere_id, author_id, body)
select id, '22222222-2222-2222-2222-222222222222', 'bob message' from public.spheres where slug = 'its';

-- Bob (plain member, NOT the author) cannot delete Alice's message via RPC.
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_msg uuid;
  v_err text;
begin
  select id into v_msg from public.chat_messages where author_id = '11111111-1111-1111-1111-111111111111' limit 1;
  begin
    perform public.delete_chat_message(v_msg);
    v_err := 'none';
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err = 'none' then
    raise exception 'FAIL: non-author delete allowed';
  end if;
  if v_err not like '%own messages%' then
    raise exception 'FAIL: unexpected error: %', v_err;
  end if;
end $$;
reset role;

-- Bob cannot forge deleted_by / deleted_by_role via a direct UPDATE either
-- (migration 0008 removed author-level UPDATE; only Sphere admins may update).
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';
update public.chat_messages set deleted_by_role = 'admin' where author_id = '11111111-1111-1111-1111-111111111111';
reset role;
select (select count(*) from public.chat_messages where deleted_by_role = 'admin') = 0 as author_cannot_forge_deleted_by_role;

-- Admin (Alice, super_admin) deletes Bob's message → attributed to ADMIN.
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
select public.delete_chat_message((select id from public.chat_messages where author_id = '22222222-2222-2222-2222-222222222222' limit 1));
reset role;
select (select deleted_by_role from public.chat_messages where author_id = '22222222-2222-2222-2222-222222222222') = 'admin' as admin_delete_attributed_to_admin,
       (select body from public.chat_messages where author_id = '22222222-2222-2222-2222-222222222222') = '' as admin_deleted_body_blanked;

-- Author (Alice) deletes her OWN message → attributed to USER.
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
select public.delete_chat_message((select id from public.chat_messages where author_id = '11111111-1111-1111-1111-111111111111' limit 1));
reset role;
select (select count(*) from public.chat_message_archives) = 2 as archives_created,
       (select deleted_by_role from public.chat_message_archives where author_id = '11111111-1111-1111-1111-111111111111') = 'user' as archive_user_role,
       (select deleted_by_role from public.chat_message_archives where author_id = '22222222-2222-2222-2222-222222222222') = 'admin' as archive_admin_role;

-- Normal users cannot read archived deleted content; they only see the
-- blanked public body.
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';  -- Bob: plain member
select (select count(*) from public.chat_message_archives) = 0 as member_cannot_read_archives,
       (select body from public.chat_messages where is_deleted limit 1) = '' as member_sees_blanked_body;
reset role;

-- Cross-Sphere admin (Carol, DTU) cannot read ITS archives.
set role authenticated;
set app.uid = '33333333-3333-3333-3333-333333333333';
select (select count(*) from public.chat_message_archives) = 0 as cross_sphere_admin_cannot_read_archives;
reset role;

-- Same-Sphere admin (Alice, super) CAN read archives.
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
select (select count(*) from public.chat_message_archives) = 2 as admin_reads_archives;
reset role;

-- ── 6b. Replies (migration 0008) ───────────────────────────────────────────
select '6b. replies' as test;
reset role;
insert into public.chat_messages (sphere_id, author_id, body)
select id, '11111111-1111-1111-1111-111111111111', 'tomorrow event?' from public.spheres where slug = 'its';

-- Same-Sphere reply by Dana (ITS member) works.
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';
insert into public.chat_messages (sphere_id, author_id, body, reply_to_message_id)
select id, '44444444-4444-4444-4444-444444444444', 'yes 10am',
       (select id from public.chat_messages where body = 'tomorrow event?')
from public.spheres where slug = 'its';
select (select count(*) from public.chat_messages where reply_to_message_id is not null) = 1 as same_sphere_reply_allowed;

-- Cross-Sphere reply is blocked by the DB trigger even with a client-supplied
-- id. Run as postgres so the DTU target id actually resolves: a normal ITS
-- member cannot even read the DTU message (RLS), so the trigger is the second
-- line of defense and must reject the reference outright.
reset role;
do $$
begin
  begin
    insert into public.chat_messages (sphere_id, author_id, body, reply_to_message_id)
    select id, '44444444-4444-4444-4444-444444444444', 'cross sphere',
           (select id from public.chat_messages where author_id = '33333333-3333-3333-3333-333333333333' and body = 'hello dtu' limit 1)
    from public.spheres where slug = 'its';
    raise exception 'FAIL: cross-sphere reply allowed';
  exception when others then
    if sqlerrm like '%FAIL%' then raise; end if;
  end;
end $$;
select (select count(*) from public.chat_messages where body = 'cross sphere') = 0 as cross_sphere_reply_blocked;

-- ── 6c. 24h retention (migration 0008) ─────────────────────────────────────
select '6c. 24h retention' as test;
reset role;

-- expires_at is exactly created_at + 24 hours (immutable generated column).
select (select expires_at = created_at + interval '24 hours' from public.chat_messages where body = 'tomorrow event?') as expires_at_is_created_plus_24h;

-- One expired (25h old) and one fresh (1h old) message. The fresh message's
-- id/created_at are pinned in psql variables (its body gets blanked on delete).
insert into public.chat_messages (sphere_id, author_id, body, created_at)
select id, '11111111-1111-1111-1111-111111111111', 'old message', now() - interval '25 hours'
from public.spheres where slug = 'its';
insert into public.chat_messages (sphere_id, author_id, body, created_at)
select id, '11111111-1111-1111-1111-111111111111', 'fresh message', now() - interval '1 hour'
from public.spheres where slug = 'its';
select id as fresh_msg_id, created_at as fresh_msg_created
from public.chat_messages where body = 'fresh message' \gset
select (select count(*) from public.chat_messages where expires_at < now()) = 1 as exactly_one_expired;

-- Deleting a message does NOT extend its lifetime: created_at (and therefore
-- expires_at) is untouched by the RPC.
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
select public.delete_chat_message(:'fresh_msg_id');
reset role;
select (select expires_at = created_at + interval '24 hours' from public.chat_messages where id = :'fresh_msg_id') as delete_does_not_extend_lifetime,
       (select created_at = :'fresh_msg_created'::timestamptz from public.chat_messages where id = :'fresh_msg_id') as created_at_not_rewritten;

-- Purge removes ONLY expired rows (idempotent, batch-safe) and cascades
-- archives / nulls reply references — no orphans remain.
select (select count(*) from public.chat_messages where body = 'old message') = 1 as expired_present_before_purge;
select public.purge_expired_chat_messages(10) >= 1 as purge_removed_expired;
select (select count(*) from public.chat_messages where expires_at < now()) = 0 as no_expired_rows_remain;
select (select count(*) from public.chat_messages where body = 'old message') = 0 as expired_message_gone;
select (select count(*) from public.chat_messages where id = :'fresh_msg_id') = 1 as fresh_message_survives;
select (select count(*) from public.chat_message_archives a
        where not exists (select 1 from public.chat_messages m where m.id = a.message_id)) = 0 as no_orphan_archives;

-- ── 7. Groups: membership gating ───────────────────────────────────────────
select '7. group membership' as test;
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
insert into public.groups (sphere_id, name, created_by)
select id, 'Study group', '11111111-1111-1111-1111-111111111111' from public.spheres where slug = 'its';
insert into public.group_members (group_id, user_id, role)
select id, '11111111-1111-1111-1111-111111111111', 'admin' from public.groups;

-- Invite Bob → notification created for him (count as postgres: users can
-- only ever see their own notifications via RLS).
insert into public.group_invites (group_id, invited_by, invitee_id)
select g.id, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'
from public.groups g;
reset role;
select (select count(*) from public.notifications where user_id = '22222222-2222-2222-2222-222222222222' and type = 'group_invite') = 1 as invite_notification_created;
set role authenticated;

-- Carol (different sphere) cannot see ITS groups.
set app.uid = '33333333-3333-3333-3333-333333333333';
select (select count(*) from public.groups) = 0 as group_hidden_cross_sphere;

-- Carol cannot join the group: she sees no groups (RLS) and even a direct
-- insert is gated on an accepted invite, so no membership row appears.
insert into public.group_members (group_id, user_id)
select id, '33333333-3333-3333-3333-333333333333' from public.groups;
select (select count(*) from public.group_members where user_id = '33333333-3333-3333-3333-333333333333') = 0 as non_invitee_cannot_join;

-- Bob accepts invite → member; inviter notified (count as postgres).
set app.uid = '22222222-2222-2222-2222-222222222222';
update public.group_invites set status = 'accepted', responded_at = now();
insert into public.group_members (group_id, user_id)
select group_id, '22222222-2222-2222-2222-222222222222' from public.group_invites where status = 'accepted';
reset role;
select (select count(*) from public.notifications where user_id = '11111111-1111-1111-1111-111111111111' and type = 'group_invite_accepted') = 1 as accept_notification_created;
set role authenticated;

-- Bob can now post in the group.
insert into public.group_messages (group_id, author_id, body)
select id, '22222222-2222-2222-2222-222222222222', 'hi' from public.groups;
select (select count(*) from public.group_messages) = 1 as member_can_post;

-- Carol still can't read or post (no membership): silent filter.
set app.uid = '33333333-3333-3333-3333-333333333333';
select (select count(*) from public.group_messages) = 0 as group_chat_gated_cross_sphere;
insert into public.group_messages (group_id, author_id, body)
select id, '33333333-3333-3333-3333-333333333333', 'lurking' from public.groups;
select (select count(*) from public.group_messages where author_id = '33333333-3333-3333-3333-333333333333') = 0 as non_member_cannot_post;
reset role;

-- ── 8. Admin powers ────────────────────────────────────────────────────────
select '8. admin powers' as test;
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';  -- Alice: super_admin (global by design)
select (select count(*) from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 1 as super_admin_sees_all_profiles;
-- Even super_admin cannot grant suspension it cannot enforce: this update is
-- allowed (global role) so assert the DB-level suspension block separately.
update public.profiles set account_status = 'suspended' where id = '22222222-2222-2222-2222-222222222222';
select (select account_status from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 'suspended' as admin_can_suspend;

-- Carol is a plain Sphere admin (DTU): she may read and moderate her OWN
-- Sphere but must not read profiles or suspend users of another Sphere.
set app.uid = '33333333-3333-3333-3333-333333333333';
select (select count(*) from public.profiles where id = '33333333-3333-3333-3333-333333333333') = 1 as sphere_admin_sees_own_profile;
select (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 0 as sphere_admin_cannot_read_cross_sphere_profile;
update public.profiles set account_status = 'suspended' where id = '11111111-1111-1111-1111-111111111111';
select (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111' and account_status = 'suspended') = 0 as cross_sphere_suspend_blocked;
reset role;

-- ── 9. Reports ─────────────────────────────────────────────────────────────
select '9. reports' as test;
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
insert into public.reports (reporter_id, target_type, target_id, sphere_id, reason)
select '11111111-1111-1111-1111-111111111111', 'listing',
       (select id from public.marketplace_listings limit 1), id, 'test report'
from public.spheres where slug = 'its';

-- Non-admin Bob sees only his own reports (none).
set app.uid = '22222222-2222-2222-2222-222222222222';
select (select count(*) from public.reports) = 0 as reporter_only_sees_own;
-- ITS admin sees sphere reports.
set app.uid = '11111111-1111-1111-1111-111111111111';
select (select count(*) from public.reports) = 1 as admin_sees_sphere_reports;
-- A USER cannot resolve reports (silent filter).
set app.uid = '22222222-2222-2222-2222-222222222222';
update public.reports set status = 'resolved';
reset role;
select (select count(*) from public.reports where status = 'open') = 1 as user_cannot_resolve_reports;

-- ── 10. Suspended user ─────────────────────────────────────────────────────
select '10. suspended user' as test;
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';  -- Bob is suspended
select (select count(*) from public.chat_messages) = 0 as suspended_cannot_read;
-- Suspended user cannot insert into chat (RLS error on the WITH CHECK).
set app.uid = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    insert into public.chat_messages (sphere_id, author_id, body)
    select id, '22222222-2222-2222-2222-222222222222', 'still here' from public.spheres where slug = 'its';
    raise exception 'FAIL: suspended user posted';
  exception when insufficient_privilege then
    raise notice 'OK: suspended user insert blocked';
  end;
end $$;
reset role;

-- ── 11. College directory + RBAC (migration 0002) ─────────────────────────
select '11. directory + rbac' as test;

-- Super admin can create a college; its Sphere is created eagerly.
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';  -- first user is super_admin
insert into public.colleges (name, short_name, slug, city, status)
values ('Sharda University', 'SU', 'sharda-university', 'Greater Noida', 'active');
select (select count(*) from public.colleges where slug = 'sharda-university') = 1 as super_admin_creates_college;

-- A plain user cannot create a college (RLS WITH CHECK raises).
set app.uid = '44444444-4444-4444-4444-444444444444';  -- Dana is a USER
do $$
begin
  begin
    insert into public.colleges (name, short_name, slug, city, status)
    values ('Fake University', 'FU', 'fake-university', 'Nowhere', 'active');
    raise exception 'FAIL: user created a college';
  exception when insufficient_privilege then
    raise notice 'OK: user college insert blocked';
  end;
end $$;
select (select count(*) from public.colleges where slug = 'fake-university') = 0 as user_cannot_create_college;

-- Anonymous visitors can read active colleges (signup autocomplete).
set role anon;
select (select count(*) from public.colleges where status = 'active') >= 1 as anon_reads_active_colleges;
set role authenticated;

-- has_permission: plain user without assignments gets denied.
set app.uid = '44444444-4444-4444-4444-444444444444';
select (select public.has_permission('academic.create')) = false as user_denied_permission;

-- Grant a section_manager scope; now the permission passes.
set role postgres;
insert into public.role_assignments (user_id, sphere_id, role, scope)
select '44444444-4444-4444-4444-444444444444', id, 'section_manager',
       '{"permissions":["academic.create"],"degree":"B.Tech","year":"First Year","branch":"CSE"}'::jsonb
from public.spheres where slug = 'its';
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';
select (select public.has_permission('academic.create')) = true as scoped_permission_granted;
-- Out-of-scope permission still denied.
select (select public.has_permission('academic.create', '{"degree":"MBA"}'::jsonb)) = false as out_of_scope_denied;

-- Role assignment is admin-only: a USER cannot assign roles (RLS raises).
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    insert into public.role_assignments (user_id, sphere_id, role, scope)
    select '22222222-2222-2222-2222-222222222222', id, 'moderator', '{"permissions":["social.moderate"]}'::jsonb
    from public.spheres where slug = 'its';
    raise exception 'FAIL: user assigned a role';
  exception when insufficient_privilege then
    raise notice 'OK: user role insert blocked';
  end;
end $$;
reset role;
select (select count(*) from public.role_assignments where role = 'moderator') = 0 as user_cannot_assign_roles;

-- Plans: only admins manage; users can submit one feedback row per plan.
set role postgres;
insert into public.platform_plans (title, description, display_order, active)
values ('Campus leaderboards', 'Rank the most active members.', 1, true);
reset role;
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';
insert into public.plan_feedback (plan_id, user_id, rating, comment)
select id, '44444444-4444-4444-4444-444444444444', 5, 'love it'
from public.platform_plans limit 1;
select (select count(*) from public.plan_feedback where user_id = '44444444-4444-4444-4444-444444444444') = 1 as user_submits_feedback;
-- Duplicate upsert (same plan+user) replaces rather than duplicates.
insert into public.plan_feedback (plan_id, user_id, rating, comment)
select id, '44444444-4444-4444-4444-444444444444', 4, 'still love it'
from public.platform_plans limit 1
on conflict (plan_id, user_id) do update set rating = excluded.rating, comment = excluded.comment;
select (select count(*) from public.plan_feedback where user_id = '44444444-4444-4444-4444-444444444444') = 1 as feedback_upserts_single_row;

-- Orders: buyer creates order; non-related user cannot see it.
set role postgres;
insert into public.marketplace_orders (listing_id, buyer_id, seller_id, sphere_id, buyer_name, buyer_phone, address, price_cents, fee_cents, settlement_cents)
select id, '22222222-2222-2222-2222-222222222222', seller_id, sphere_id, 'Bob Buyer', '888888', 'Hostel 2', 10000, 500, 9500
from public.marketplace_listings limit 1;
reset role;
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';
select (select count(*) from public.marketplace_orders) = 0 as unrelated_user_cannot_see_orders;
set app.uid = '22222222-2222-2222-2222-222222222222';  -- Bob, the buyer
select (select count(*) from public.marketplace_orders) = 1 as buyer_sees_own_orders;
reset role;

-- Event questions: member can ask, non-member cannot see the event's Q&A.
set role postgres;
insert into public.event_questions (event_id, user_id, question)
select id, '11111111-1111-1111-1111-111111111111', 'Will there be food?'
from public.events limit 1;
reset role;
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';  -- ITS member
select (select count(*) from public.event_questions) >= 1 as member_sees_event_questions;
reset role;

-- ── 12. College directory hardening (migration 0003) ────────────────────
select '12. directory hardening' as test;

-- Legacy free-text resolution via alias: "I.T.S" (no college_id) resolves to
-- the ITS college through the alias and reuses its Sphere — no new Sphere.
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'f@college.edu',
   '{"real_name":"Fay","phone":"444","college_input":"I.T.S"}'::jsonb);
select (select count(*) from public.spheres) = 3 as alias_resolution_no_new_sphere,
       exists (select 1 from public.user_spheres us
               join public.spheres s on s.id = us.sphere_id
               where us.user_id = '66666666-6666-6666-6666-666666666666' and s.slug = 'its') as alias_resolves_to_its;

-- Legacy free-text path for an unknown college: no membership, no Sphere.
insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-7777-7777-7777-777777777777', 'g@unknown.edu',
   '{"real_name":"Gia","phone":"333","college_input":"Harvard University"}'::jsonb);
select (select count(*) from public.user_spheres where user_id = '77777777-7777-7777-7777-777777777777') = 0 as unknown_college_no_membership;

-- Duplicate Sphere prevention: another user picks the same college_id as an
-- existing member — one college == one Sphere, count stays stable.
insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-9999-9999-9999-999999999999', 'i@college.edu',
   ('{"real_name":"Ira","phone":"111","college_id":"' || (select id::text from public.colleges where slug = 'delhi-technological') || '","college_input":"Delhi Technological University"}')::jsonb);
select (select count(*) from public.spheres) = 3 as duplicate_sphere_prevented,
       (select count(*) from public.user_spheres
        where sphere_id = (select id from public.spheres where slug = 'delhi-technological')) = 2 as same_sphere_shared;

-- Deactivate ITS: anon stops seeing it, super admin still can (reactivation).
set role postgres;
update public.colleges set status = 'inactive' where slug = 'its';
set role anon;
select (select count(*) from public.colleges where slug = 'its') = 0 as anon_hides_inactive_college;
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';  -- super_admin
select (select count(*) from public.colleges where slug = 'its') = 1 as admin_sees_inactive_college;
reset role;

-- Signup with an inactive college_id is blocked defensively (no membership).
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'j@inactive.edu',
   ('{"real_name":"Jill","phone":"000","college_id":"' || (select id::text from public.colleges where slug = 'its') || '","college_input":"ITS Engineering College"}')::jsonb);
select (select count(*) from public.user_spheres where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0 as inactive_college_signup_blocked;

-- Legacy free-text path is also blocked while the college is inactive.
insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'k@inactive.edu',
   '{"real_name":"Kay","phone":"123","college_input":"ITS"}'::jsonb);
select (select count(*) from public.user_spheres where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 0 as inactive_college_legacy_blocked;

-- Re-activate for tidiness (rest of the script already ran; keep state clean).
set role postgres;
update public.colleges set status = 'active' where slug = 'its';
reset role;

-- ── 13. Sphere-scoped admin (migration 0004) ────────────────────────────
select '13. sphere-scoped admin' as test;

-- admin_sphere_overview: super admin sees EVERY active Sphere (Level-1 selector).
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';  -- Alice: super_admin
select (select count(*) from public.admin_sphere_overview()) = 3 as super_admin_sees_all_spheres;

-- Sphere admin (profile role) sees ONLY their own Sphere.
set app.uid = '33333333-3333-3333-3333-333333333333';  -- Carol: DTU admin
select (select count(*) from public.admin_sphere_overview()) = 1 as sphere_admin_sees_only_own_sphere,
       (select name from public.admin_sphere_overview()) = 'Delhi Technological University' as sphere_admin_sees_only_dtu;

-- A plain user sees NO Spheres (they cannot open the admin selector).
set app.uid = '44444444-4444-4444-4444-444444444444';  -- Dana: plain user
select (select count(*) from public.admin_sphere_overview()) = 0 as plain_user_sees_no_spheres;

-- Super admin can read sphere-scoped data in ANY Sphere (Level-2 UI), e.g.
-- DTU events even though Alice belongs to ITS. RLS SELECT policies grant this.
set role postgres;
insert into public.events (sphere_id, title, event_date, created_by)
select id, 'DTU Tech Fest', current_date + 7, '33333333-3333-3333-3333-333333333333'
from public.spheres where slug = 'delhi-technological';
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
select (select count(*) from public.events where sphere_id = (select id from public.spheres where slug = 'delhi-technological')) = 1 as super_admin_reads_any_sphere;

-- Carol (DTU sphere admin) cannot read ITS events by changing a URL param:
-- her query is RLS-filtered even if she knows the ITS sphere id.
set app.uid = '33333333-3333-3333-3333-333333333333';
select (select count(*) from public.events where sphere_id = (select id from public.spheres where slug = 'its')) = 0 as sphere_admin_cannot_read_other_sphere;
reset role;

-- New permission-first role names are accepted by the constraint, and a
-- `sphere_admin` assignment grants full administrative powers in that Sphere.
set role postgres;
insert into public.role_assignments (user_id, sphere_id, role, scope)
select '44444444-4444-4444-4444-444444444444', id, 'sphere_admin', '{"permissions":["academic.create","events.create"]}'::jsonb
from public.spheres where slug = 'its';
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';  -- Dana now a sphere_admin of ITS
select (select public.is_sphere_admin((select id from public.spheres where slug = 'its'))) = true as sphere_admin_assignment_grants_powers;
-- …but NOT in DTU.
select (select public.is_sphere_admin((select id from public.spheres where slug = 'delhi-technological'))) = false as sphere_admin_not_cross_sphere;
-- The selector now offers Dana the ITS Sphere.
select (select count(*) from public.admin_sphere_overview()) = 1 as sphere_admin_assignment_sees_own_sphere;

-- Scoped academic manager: permission inside scope granted, outside denied.
set role postgres;
insert into public.role_assignments (user_id, sphere_id, role, scope)
select '22222222-2222-2222-2222-222222222222', id, 'academic_manager',
       '{"permissions":["academic.create","academic.delete"],"degree":"B.Tech","year":"First Year","branch":"CSE"}'::jsonb
from public.spheres where slug = 'its';
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';  -- Bob: scoped academic manager (ITS)
select (select public.has_permission('academic.create', '{"degree":"B.Tech","year":"First Year","branch":"CSE"}'::jsonb)) = true as scoped_manager_in_scope_granted;
select (select public.has_permission('academic.delete', '{"degree":"B.Tech","year":"First Year","branch":"CSE"}'::jsonb)) = true as scoped_manager_delete_in_scope_granted;
select (select public.has_permission('academic.create', '{"degree":"MBA"}'::jsonb)) = false as scoped_manager_out_of_scope_denied;
select (select public.has_permission('events.create')) = false as scoped_manager_no_other_sections;
-- Bob is NOT a Sphere administrator and cannot manage roles.
select (select public.is_sphere_admin((select id from public.spheres where slug = 'its'))) = false as scoped_manager_not_sphere_admin;
reset role;

-- ── 13b. Academic section managers (migration 0010) ──────────────────────
select '13b. academic section managers' as test;

-- Ira (plain user, DTU member) is assigned academic_manager with a `sections`
-- array — the new multi-section scope. She manages First Year of any
-- degree/branch in DTU, and nothing else.
set role postgres;
insert into public.role_assignments (user_id, sphere_id, role, scope)
select '99999999-9999-9999-9999-999999999999', id, 'academic_manager',
       '{"permissions":["academic.create","academic.update","academic.delete"],"sections":[{"degree":"","year":"First Year","branch":""}]}'::jsonb
from public.spheres where slug = 'delhi-technological';
set role authenticated;
set app.uid = '99999999-9999-9999-9999-999999999999';  -- Ira

-- can_manage_academic: in-scope (any degree/branch of First Year) → true.
select (select public.can_manage_academic((select id from public.spheres where slug = 'delhi-technological'), '', 'First Year', '')) = true as in_scope_section_granted,
       (select public.can_manage_academic((select id from public.spheres where slug = 'delhi-technological'), 'B.Tech', 'First Year', 'CSE')) = true as wildcard_year_covers_degree_branch;
-- Out-of-scope section (Second Year) → false.
select (select public.can_manage_academic((select id from public.spheres where slug = 'delhi-technological'), '', 'Second Year', '')) = false as other_section_denied;
-- Same section in ANOTHER Sphere → false (sphere + section both enforced).
select (select public.can_manage_academic((select id from public.spheres where slug = 'its'), '', 'First Year', '')) = false as cross_sphere_denied;

-- RLS: Ira can insert a First Year subject in DTU (any degree/branch).
insert into public.subjects (sphere_id, name, code, degree, year, branch, created_by)
select id, 'Intro to Computing', 'CS-101', 'B.Tech', 'First Year', 'CSE', '99999999-9999-9999-9999-999999999999'
from public.spheres where slug = 'delhi-technological';
select (select count(*) from public.subjects where name = 'Intro to Computing') = 1 as manager_inserts_in_assigned_section;

-- RLS: the SAME manager cannot insert into an unassigned section (WITH CHECK
-- raises, even with a forged year).
do $$
begin
  begin
    insert into public.subjects (sphere_id, name, code, degree, year, branch, created_by)
    select id, 'Sneaky Second Year', 'X', 'B.Tech', 'Second Year', 'CSE', '99999999-9999-9999-9999-999999999999'
    from public.spheres where slug = 'delhi-technological';
    raise exception 'FAIL: manager inserted outside assigned section';
  exception when insufficient_privilege then
    raise notice 'OK: out-of-section insert blocked';
  end;
end $$;
select (select count(*) from public.subjects where name = 'Sneaky Second Year') = 0 as out_of_section_insert_blocked;

-- RLS: manager cannot touch another Sphere's academic content even with a
-- forged sphere_id (WITH CHECK raises).
do $$
begin
  begin
    insert into public.subjects (sphere_id, name, code, degree, year, branch, created_by)
    select id, 'Hack ITS', 'X', 'B.Tech', 'First Year', 'CSE', '99999999-9999-9999-9999-999999999999'
    from public.spheres where slug = 'its';
    raise exception 'FAIL: manager wrote into another Sphere';
  exception when insufficient_privilege then
    raise notice 'OK: cross-sphere insert blocked';
  end;
end $$;
select (select count(*) from public.subjects where name = 'Hack ITS') = 0 as cross_sphere_insert_blocked;

-- role_assignments_select_own: Ira can read her OWN assignment (needed by the
-- dashboard workspace) but never anyone else's.
select (select count(*) from public.role_assignments where user_id = '99999999-9999-9999-9999-999999999999') = 1 as manager_reads_own_assignment,
       (select count(*) from public.role_assignments where user_id <> '99999999-9999-9999-9999-999999999999') = 0 as manager_cannot_read_others_assignments;

-- A plain member (no assignment) cannot write academic content at all.
set app.uid = '66666666-6666-6666-6666-666666666666';  -- Fay: ITS member, no role
select (select public.can_manage_academic((select id from public.spheres where slug = 'its'), '', 'First Year', '')) = false as plain_member_denied;
do $$
begin
  begin
    insert into public.subjects (sphere_id, name, code, degree, year, branch, created_by)
    select id, 'Fay subject', 'F', '', 'First Year', '', '66666666-6666-6666-6666-666666666666'
    from public.spheres where slug = 'its';
    raise exception 'FAIL: plain member inserted a subject';
  exception when insufficient_privilege then
    raise notice 'OK: plain member insert blocked';
  end;
end $$;
select (select count(*) from public.subjects where name = 'Fay subject') = 0 as plain_member_insert_blocked;

-- Legacy scalar scope still works through can_manage_academic (Bob's 0004-era
-- assignment: B.Tech First Year CSE in ITS). Bob was suspended by the earlier
-- section-7 suspend test, so re-activate him first — can_manage_academic
-- correctly refuses suspended users.
set role postgres;
update public.profiles set account_status = 'active' where id = '22222222-2222-2222-2222-222222222222';
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';  -- Bob
select (select public.can_manage_academic((select id from public.spheres where slug = 'its'), 'B.Tech', 'First Year', 'CSE')) = true as legacy_scalar_scope_still_granted,
       (select public.can_manage_academic((select id from public.spheres where slug = 'its'), '', 'Second Year', '')) = false as legacy_scalar_out_of_scope_denied;
reset role;

-- ── 13c. Section admins + promotions (migration 0011) ────────────────────
select '13c. section admins + promotions' as test;

-- Fay (ITS member, no role) becomes an event_manager of ITS. She can create
-- events in HER Sphere but never in another Sphere, even with a forged
-- sphere_id (WITH CHECK raises).
set role postgres;
insert into public.role_assignments (user_id, sphere_id, role, scope)
select '66666666-6666-6666-6666-666666666666', id, 'event_manager',
       '{"permissions":["events.read","events.create","events.update","events.delete"]}'::jsonb
from public.spheres where slug = 'its';
set role authenticated;
set app.uid = '66666666-6666-6666-6666-666666666666';  -- Fay
insert into public.events (sphere_id, title, event_date, created_by)
select id, 'ITS Hackathon', current_date + 3, '66666666-6666-6666-6666-666666666666'
from public.spheres where slug = 'its';
select (select count(*) from public.events where title = 'ITS Hackathon') = 1 as event_manager_creates_in_own_sphere;
do $$
begin
  begin
    insert into public.events (sphere_id, title, event_date, created_by)
    select id, 'DTU Hack', current_date + 3, '66666666-6666-6666-6666-666666666666'
    from public.spheres where slug = 'delhi-technological';
    raise exception 'FAIL: event manager wrote into another Sphere';
  exception when insufficient_privilege then
    raise notice 'OK: cross-sphere event insert blocked';
  end;
end $$;
select (select count(*) from public.events where title = 'DTU Hack') = 0 as cross_sphere_event_insert_blocked;

-- A plain member (no assignment) still cannot create events.
set app.uid = '44444444-4444-4444-4444-444444444444';  -- Dana
select (select public.has_permission('events.create')) = false as plain_member_no_event_permission;
reset role;

-- Bob (ITS) becomes a promotion_moderator: he may review (UPDATE) promotions
-- inside ITS, but RLS silently filters updates to promotions in DTU.
set role postgres;
insert into public.role_assignments (user_id, sphere_id, role, scope)
select '22222222-2222-2222-2222-222222222222', id, 'promotion_moderator',
       '{"permissions":["promotions.review","promotions.approve","promotions.reject"]}'::jsonb
from public.spheres where slug = 'its';
insert into public.promotions (sphere_id, user_id, url, title, status, fee_status, utr)
select id, '44444444-4444-4444-4444-444444444444', 'https://its.example.com', 'ITS promo', 'pending', 'payment_pending', 'UTR12345'
from public.spheres where slug = 'its';
insert into public.promotions (sphere_id, user_id, url, title, status, fee_status, utr)
select id, '33333333-3333-3333-3333-333333333333', 'https://dtu.example.com', 'DTU promo', 'pending', 'payment_pending', 'UTR67890'
from public.spheres where slug = 'delhi-technological';
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';  -- Bob
update public.promotions set fee_status = 'paid' where title = 'ITS promo';
select (select fee_status from public.promotions where title = 'ITS promo') = 'paid' as promotion_moderator_reviews_own_sphere;
update public.promotions set fee_status = 'paid' where title = 'DTU promo';
select (select fee_status from public.promotions where title = 'DTU promo') = 'payment_pending' as promotion_moderator_cannot_touch_other_sphere;
reset role;

-- Social moderation: Bob also holds social_moderator and can resolve ITS
-- reports, but a DTU report is invisible to him (RLS filters the UPDATE).
set role postgres;
insert into public.role_assignments (user_id, sphere_id, role, scope)
select '22222222-2222-2222-2222-222222222222', id, 'social_moderator',
       '{"permissions":["social.moderate"]}'::jsonb
from public.spheres where slug = 'its';
insert into public.reports (reporter_id, target_type, target_id, sphere_id, reason)
select '33333333-3333-3333-3333-333333333333', 'event',
       (select id from public.events where title = 'DTU Tech Fest'), id, 'dtu report'
from public.spheres where slug = 'delhi-technological';
set role authenticated;
set app.uid = '22222222-2222-2222-2222-222222222222';  -- Bob
update public.reports set status = 'resolved' where sphere_id = (select id from public.spheres where slug = 'its');
select (select count(*) from public.reports where sphere_id = (select id from public.spheres where slug = 'its') and status = 'resolved') = 1 as social_moderator_resolves_own_sphere_reports;
update public.reports set status = 'resolved' where sphere_id = (select id from public.spheres where slug = 'delhi-technological');
select (select count(*) from public.reports where sphere_id = (select id from public.spheres where slug = 'delhi-technological') and status = 'open') = 1 as social_moderator_cannot_touch_other_sphere_reports;
reset role;

-- notify_user RPC: inserts a notification even though authenticated users have
-- no direct INSERT policy on notifications (SECURITY DEFINER).
set role authenticated;
set app.uid = '66666666-6666-6666-6666-666666666666';  -- Fay
select public.notify_user('66666666-6666-6666-6666-666666666666', 'test', 'Hello', 'Body', '/dashboard');
reset role;
select (select count(*) from public.notifications where user_id = '66666666-6666-6666-6666-666666666666' and type = 'test') = 1 as notify_user_rpc_inserts;
-- A plain user has no INSERT policy on notifications — direct insert raises.
set role authenticated;
set app.uid = '44444444-4444-4444-4444-444444444444';  -- Dana
select (select count(*) from public.notifications where user_id = '44444444-4444-4444-4444-444444444444') = 0 as user_sees_only_own_notifications;
do $$
begin
  begin
    insert into public.notifications (user_id, type, title) values ('44444444-4444-4444-4444-444444444444', 'general', 'spam');
    raise exception 'FAIL: user inserted a notification directly';
  exception when insufficient_privilege then
    raise notice 'OK: direct notification insert blocked';
  end;
end $$;
reset role;

select 'ALL SQL VERIFICATION COMPLETE' as done;
