set role authenticated;
set app.uid = '33333333-3333-3333-3333-333333333333';
do $$
declare v_state text; v_msg text;
begin
  begin
    insert into public.group_members (group_id, user_id)
    select id, '33333333-3333-3333-3333-333333333333' from public.groups;
    raise notice 'INSERT SUCCEEDED (unexpected)';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    raise notice 'RLS state=% msg=%', v_state, v_msg;
  end;
end $$;
reset role;
