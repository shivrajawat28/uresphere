\set ON_ERROR_STOP on
set role postgres;
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@c.edu', '{"real_name":"Alice","college_input":"ITS Engineering College"}'),
  ('33333333-3333-3333-3333-333333333333', 'c@o.edu', '{"real_name":"Carol","college_input":"Delhi Technological University"}');
set role authenticated;
set app.uid = '11111111-1111-1111-1111-111111111111';
insert into public.groups (sphere_id, name, created_by)
select id, 'SG', '11111111-1111-1111-1111-111111111111' from public.spheres where slug = 'its';
insert into public.group_members (group_id, user_id, role)
select id, '11111111-1111-1111-1111-111111111111', 'admin' from public.groups;
insert into public.group_messages (group_id, author_id, body)
select id, '11111111-1111-1111-1111-111111111111', 'hi' from public.groups;
select 'Alice sees' as who, count(*) from public.group_messages;

set app.uid = '33333333-3333-3333-3333-333333333333';
select 'Carol is_group_member' as check, public.is_group_member((select id from public.groups limit 1)) as result;
select 'Carol sees' as who, count(*) from public.group_messages;
