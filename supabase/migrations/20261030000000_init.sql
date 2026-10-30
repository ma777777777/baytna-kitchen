-- Baytna Kitchen: households, members, invites and synced household data.
-- Every household table has Row Level Security; a user only ever sees rows of
-- households they belong to. Joining is only possible with a valid, unexpired,
-- single-use invite code, through a SECURITY DEFINER function.

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '' check (char_length(name) <= 80),
  max_members int not null default 2 check (max_members between 1 and 8),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  -- references profiles (which cascade from auth.users) so the API can embed names
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.household_invites (
  code text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

-- All household data (plan, list, staples, leftovers, ratings, custom recipes, settings)
-- as JSON rows keyed by (collection, key). One generic table keeps sync and security simple.
create table public.household_rows (
  household_id uuid not null references public.households (id) on delete cascade,
  collection text not null check (collection in
    ('settings','plan','week','pantry','list_state','list_extra','leftover','rating','recipe')),
  key text not null check (char_length(key) between 1 and 200),
  data jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (household_id, collection, key),
  constraint row_size check (pg_column_size(data) < 64000)
);
create index household_rows_sync_idx on public.household_rows (household_id, updated_at);

-- ---------- helpers ----------

create or replace function public.is_member(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members m where m.household_id = h and m.user_id = auth.uid());
$$;

create or replace function public.touch_row()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  if tg_table_name = 'household_rows' then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

create trigger household_rows_touch before insert or update on public.household_rows
  for each row execute function public.touch_row();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_row();
create trigger households_touch before update on public.households
  for each row execute function public.touch_row();

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPCs ----------

create or replace function public.create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from household_members where user_id = uid) then
    raise exception 'already_in_household';
  end if;
  insert into profiles (id) values (uid) on conflict do nothing;
  insert into households (name, created_by) values (left(coalesce(p_name, ''), 80), uid) returning id into hid;
  insert into household_members (household_id, user_id) values (hid, uid);
  return hid;
end $$;

create or replace function public.create_invite(p_household uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text;
  i int;
begin
  if uid is null or not is_member(p_household) then raise exception 'not_a_member'; end if;
  if (select count(*) from household_members where household_id = p_household)
     >= (select max_members from households where id = p_household) then
    raise exception 'household_full';
  end if;
  -- one active invite at a time
  delete from household_invites where household_id = p_household and used_at is null;
  loop
    new_code := '';
    for i in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from household_invites where code = new_code);
  end loop;
  insert into household_invites (code, household_id, created_by) values (new_code, p_household, uid);
  return new_code;
end $$;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv household_invites%rowtype;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into inv from household_invites where code = upper(trim(p_code)) for update;
  if not found or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'invalid_or_expired_invite';
  end if;
  if exists (select 1 from household_members where household_id = inv.household_id and user_id = uid) then
    return inv.household_id;
  end if;
  if exists (select 1 from household_members where user_id = uid) then
    raise exception 'already_in_household';
  end if;
  if (select count(*) from household_members where household_id = inv.household_id)
     >= (select max_members from households where id = inv.household_id) then
    raise exception 'household_full';
  end if;
  insert into profiles (id) values (uid) on conflict do nothing;
  insert into household_members (household_id, user_id) values (inv.household_id, uid);
  update household_invites set used_by = uid, used_at = now() where code = inv.code;
  return inv.household_id;
end $$;

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_rows enable row level security;

create policy "profiles: read self and housemates" on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.household_members a join public.household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy "profiles: insert self" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles: update self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "households: members read" on public.households for select to authenticated using (public.is_member(id));
create policy "households: members rename" on public.households for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

create policy "members: read own household" on public.household_members for select to authenticated
  using (public.is_member(household_id));
create policy "members: leave" on public.household_members for delete to authenticated using (user_id = auth.uid());

create policy "invites: members read" on public.household_invites for select to authenticated
  using (public.is_member(household_id));

create policy "rows: members read" on public.household_rows for select to authenticated using (public.is_member(household_id));
create policy "rows: members insert" on public.household_rows for insert to authenticated with check (public.is_member(household_id));
create policy "rows: members update" on public.household_rows for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "rows: members delete" on public.household_rows for delete to authenticated using (public.is_member(household_id));

-- ---------- grants (least privilege) ----------

revoke all on public.profiles, public.households, public.household_members, public.household_invites, public.household_rows from anon;
revoke all on public.profiles, public.households, public.household_members, public.household_invites, public.household_rows from authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, update (name) on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
grant select on public.household_invites to authenticated;
grant select, insert, update, delete on public.household_rows to authenticated;

revoke execute on function public.create_household(text), public.create_invite(uuid), public.join_household(text), public.is_member(uuid) from public, anon;
grant execute on function public.create_household(text), public.create_invite(uuid), public.join_household(text), public.is_member(uuid) to authenticated;

-- ---------- realtime ----------

alter table public.household_rows replica identity full;
alter publication supabase_realtime add table public.household_rows;
