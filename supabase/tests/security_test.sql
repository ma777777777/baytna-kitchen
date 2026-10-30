-- Security tests for the Baytna Kitchen schema. Run with: npm run test:db
-- Each block acts as a specific user (via request.jwt.claim.sub) under the
-- "authenticated" role and asserts what they can and cannot see or do.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x'),  -- spouse A
  ('00000000-0000-0000-0000-00000000000b', 'b@x'),  -- spouse B
  ('00000000-0000-0000-0000-00000000000c', 'c@x'),  -- stranger in another household
  ('00000000-0000-0000-0000-00000000000d', 'd@x');  -- someone trying to join A's household

create temp table t (name text, value text);
grant all on t to authenticated;

-- A creates a household and an invite
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into t select 'hA', public.create_household('Home')::text;
insert into t select 'code', public.create_invite((select value::uuid from t where name = 'hA'));
insert into public.household_rows (household_id, collection, key, data)
  select value::uuid, 'plan', '2026-11-01', '{"type":"cook","recipeId":"foul"}' from t where name = 'hA';

-- B joins with the code
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  perform public.join_household((select value from t where name = 'code'));
  assert (select count(*) from public.household_rows) = 1, 'B should see the shared plan row';
  assert (select updated_by from public.household_rows limit 1) = '00000000-0000-0000-0000-00000000000a', 'updated_by set by trigger';
end $$;
-- B edits; updated_by/updated_at are stamped by the server
update public.household_rows set data = '{"type":"cook","recipeId":"mujaddara"}' where collection = 'plan';
do $$ begin
  assert (select updated_by from public.household_rows limit 1) = '00000000-0000-0000-0000-00000000000b', 'updated_by is the editor';
end $$;

-- C has their own household and must not see or touch A's
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ declare hid uuid; n int; begin
  hid := public.create_household('Other');
  assert (select count(*) from public.household_rows) = 0, 'C cannot read A''s rows';
  assert (select count(*) from public.households) = 1, 'C sees only their own household';
  assert (select count(*) from public.household_members) = 1, 'C sees only their own members';
  assert (select count(*) from public.household_invites) = 0, 'C cannot read A''s invites';
  update public.household_rows set data = '{}' where true;
  get diagnostics n = row_count;
  assert n = 0, 'C cannot update A''s rows';
  delete from public.household_rows where true;
  get diagnostics n = row_count;
  assert n = 0, 'C cannot delete A''s rows';
  begin
    insert into public.household_rows (household_id, collection, key, data)
      values ((select value::uuid from t where name = 'hA'), 'plan', 'x', '{}');
    raise exception 'C inserted into A''s household';
  exception when insufficient_privilege then null; -- RLS violation
  end;
  begin
    perform public.create_invite((select value::uuid from t where name = 'hA'));
    raise exception 'C created an invite for A''s household';
  exception when raise_exception then
    if sqlerrm <> 'not_a_member' then raise; end if;
  end;
  begin
    insert into public.household_members (household_id, user_id)
      values ((select value::uuid from t where name = 'hA'), '00000000-0000-0000-0000-00000000000c');
    raise exception 'C added themselves to A''s household';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The used invite cannot be reused, and a full household rejects new invites
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  begin
    perform public.join_household((select value from t where name = 'code'));
    raise exception 'D reused a used invite';
  exception when raise_exception then
    if sqlerrm <> 'invalid_or_expired_invite' then raise; end if;
  end;
  begin
    perform public.join_household('NOTACODE');
    raise exception 'D joined with a bogus code';
  exception when raise_exception then
    if sqlerrm <> 'invalid_or_expired_invite' then raise; end if;
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  begin
    perform public.create_invite((select value::uuid from t where name = 'hA'));
    raise exception 'invite created for a full two-person household';
  exception when raise_exception then
    if sqlerrm <> 'household_full' then raise; end if;
  end;
end $$;

-- Expired invites are rejected
reset role;
update public.households set max_members = 3 where id = (select value::uuid from t where name = 'hA');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into t select 'code2', public.create_invite((select value::uuid from t where name = 'hA'));
reset role;
update public.household_invites set expires_at = now() - interval '1 minute' where code = (select value from t where name = 'code2');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  begin
    perform public.join_household((select value from t where name = 'code2'));
    raise exception 'D joined with an expired invite';
  exception when raise_exception then
    if sqlerrm <> 'invalid_or_expired_invite' then raise; end if;
  end;
end $$;

-- Anonymous users see nothing and cannot call the RPCs
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.household_rows;
    raise exception 'anon read household_rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_household('x');
    raise exception 'anon created a household';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'ALL SECURITY TESTS PASSED' as result;
