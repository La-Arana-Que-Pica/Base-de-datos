-- LAqP.website: favoritos, alineaciones privadas y valoraciones.
-- Ejecutar una sola vez en Supabase > SQL Editor.

begin;

create schema if not exists private;

create table if not exists public.saved_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,
  item_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id),
  constraint saved_items_type_check check (item_type in ('player', 'team', 'tactic')),
  constraint saved_items_id_length check (char_length(item_id) between 1 and 160)
);

create table if not exists public.saved_lineups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_lineups_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint saved_lineups_data_object check (jsonb_typeof(data) = 'object')
);

create table if not exists public.ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,
  item_id text not null,
  rating smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id),
  constraint ratings_type_check check (item_type in ('tactic', 'download')),
  constraint ratings_id_length check (char_length(item_id) between 1 and 160),
  constraint ratings_value_check check (rating between 1 and 5)
);

create index if not exists saved_lineups_user_updated_idx
  on public.saved_lineups (user_id, updated_at desc);
create index if not exists ratings_user_updated_idx
  on public.ratings (user_id, updated_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;

drop trigger if exists saved_lineups_touch_updated_at on public.saved_lineups;
create trigger saved_lineups_touch_updated_at
before update on public.saved_lineups
for each row execute function private.touch_updated_at();

drop trigger if exists ratings_touch_updated_at on public.ratings;
create trigger ratings_touch_updated_at
before update on public.ratings
for each row execute function private.touch_updated_at();

alter table public.saved_items enable row level security;
alter table public.saved_lineups enable row level security;
alter table public.ratings enable row level security;

revoke all on public.saved_items from public, anon, authenticated;
revoke all on public.saved_lineups from public, anon, authenticated;
revoke all on public.ratings from public, anon, authenticated;

grant select on public.saved_items to authenticated;
grant insert (user_id, item_type, item_id) on public.saved_items to authenticated;
grant delete on public.saved_items to authenticated;

grant select on public.saved_lineups to authenticated;
grant insert (user_id, name, data) on public.saved_lineups to authenticated;
grant update (name, data) on public.saved_lineups to authenticated;
grant delete on public.saved_lineups to authenticated;

grant select on public.ratings to authenticated;
grant insert (user_id, item_type, item_id, rating) on public.ratings to authenticated;
grant update (rating) on public.ratings to authenticated;
grant delete on public.ratings to authenticated;

drop policy if exists saved_items_owner_select on public.saved_items;
create policy saved_items_owner_select on public.saved_items
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists saved_items_owner_insert on public.saved_items;
create policy saved_items_owner_insert on public.saved_items
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists saved_items_owner_delete on public.saved_items;
create policy saved_items_owner_delete on public.saved_items
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists saved_lineups_owner_select on public.saved_lineups;
create policy saved_lineups_owner_select on public.saved_lineups
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists saved_lineups_owner_insert on public.saved_lineups;
create policy saved_lineups_owner_insert on public.saved_lineups
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists saved_lineups_owner_update on public.saved_lineups;
create policy saved_lineups_owner_update on public.saved_lineups
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists saved_lineups_owner_delete on public.saved_lineups;
create policy saved_lineups_owner_delete on public.saved_lineups
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists ratings_owner_select on public.ratings;
create policy ratings_owner_select on public.ratings
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists ratings_owner_insert on public.ratings;
create policy ratings_owner_insert on public.ratings
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists ratings_owner_update on public.ratings;
create policy ratings_owner_update on public.ratings
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists ratings_owner_delete on public.ratings;
create policy ratings_owner_delete on public.ratings
for delete to authenticated using (user_id = (select auth.uid()));

commit;
