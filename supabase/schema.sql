-- LAqP.website: cuentas, perfiles, comentarios, respuestas y reportes.
-- Ejecutar como una sola consulta en Supabase > SQL Editor.
-- El frontend usa solamente la publishable/anon key; nunca service_role.

begin;

create schema if not exists extensions;
create schema if not exists private;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- Tablas
-- -------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext not null unique,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username::text ~ '^[A-Za-z0-9._]{3,24}$'),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 60),
  constraint profiles_avatar_url_format check (
    avatar_url is null
    or avatar_url ~ '^/assets/avatars/avatar-[1-4]\.svg$'
    or avatar_url ~ '^https://lh3\.googleusercontent\.com/'
    or avatar_url ~ '^https://npyvbqzgcdoujfxefsdr\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$'
  ),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 280)
);

create table if not exists public.account_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username_changed_at timestamptz
);

-- Compatibilidad con instalaciones que guardaban el cooldown en profiles.
-- En una instalación nueva la columna anterior no existe y este bloque no hace nada.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'username_changed_at'
  ) then
    execute $migration$
      insert into public.account_settings as settings (user_id, username_changed_at)
      select id, username_changed_at
      from public.profiles
      on conflict (user_id) do update
        set username_changed_at = greatest(
          settings.username_changed_at,
          excluded.username_changed_at
        )
    $migration$;
  end if;
end;
$$;

create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  constraint staff_roles_role_check check (role in ('moderator', 'admin'))
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  page_type text not null,
  page_id text not null,
  parent_id uuid references public.comments(id) on delete restrict,
  content text not null,
  status text not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint comments_page_type_check check (page_type in ('player', 'team', 'tactic', 'download')),
  constraint comments_page_id_length check (char_length(page_id) between 1 and 160),
  constraint comments_content_length check (
    (status = 'deleted' and content = '')
    or (status <> 'deleted' and char_length(content) between 1 and 1000)
  ),
  constraint comments_status_check check (status in ('visible', 'hidden', 'deleted'))
);

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint comment_reports_reason_check check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  constraint comment_reports_status_check check (status in ('pending', 'reviewed', 'dismissed', 'actioned')),
  constraint comment_reports_once unique (comment_id, reporter_id)
);

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

create index if not exists comments_page_top_created_idx
  on public.comments (page_type, page_id, created_at desc)
  where parent_id is null;
create index if not exists comments_parent_created_idx
  on public.comments (parent_id, created_at asc)
  where parent_id is not null;
create index if not exists comments_user_created_idx
  on public.comments (user_id, created_at desc);
create index if not exists comment_reports_status_created_idx
  on public.comment_reports (status, created_at desc);
create index if not exists comment_reports_reporter_idx
  on public.comment_reports (reporter_id);
create index if not exists saved_lineups_user_updated_idx
  on public.saved_lineups (user_id, updated_at desc);
create index if not exists ratings_user_updated_idx
  on public.ratings (user_id, updated_at desc);

-- -------------------------------------------------------------------------
-- Funciones privadas de autorización. No se exponen como RPC.
-- -------------------------------------------------------------------------

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles sr
    where sr.user_id = (select auth.uid())
      and sr.role in ('moderator', 'admin')
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles sr
    where sr.user_id = (select auth.uid())
      and sr.role = 'admin'
  );
$$;

revoke all on schema private from public;
revoke all on function private.is_staff() from public;
revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- -------------------------------------------------------------------------
-- Perfiles: normalización y alta automática desde Auth.
-- -------------------------------------------------------------------------

create or replace function private.normalize_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_google_identity boolean;
  last_username_change timestamptz;
begin
  new.username := btrim(new.username::text);
  new.display_name := nullif(btrim(new.display_name), '');
  new.avatar_url := nullif(btrim(new.avatar_url), '');
  new.bio := nullif(btrim(regexp_replace(coalesce(new.bio, ''), '[[:space:]]+', ' ', 'g')), '');
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
    if lower(new.username::text) <> lower(old.username::text) then
      insert into public.account_settings (user_id)
      values (old.id)
      on conflict (user_id) do nothing;

      select settings.username_changed_at
      into last_username_change
      from public.account_settings settings
      where settings.user_id = old.id
      for update;

      if last_username_change is not null
         and last_username_change > now() - interval '30 days' then
        raise exception 'username_change_cooldown'
          using errcode = 'P0001',
                detail = 'El nombre de usuario sólo puede cambiarse cada 30 días.';
      end if;

      update public.account_settings
      set username_changed_at = now()
      where user_id = old.id;
    end if;
    if new.avatar_url ~ '^https://lh3\.googleusercontent\.com/' then
      select exists (
        select 1
        from auth.identities i
        where i.user_id = old.id
          and i.provider = 'google'
      )
      into has_google_identity;
      if new.avatar_url is distinct from old.avatar_url or not has_google_identity then
        raise exception 'La foto externa sólo puede conservarse desde Google OAuth.' using errcode = '42501';
      end if;
    end if;
    new.updated_at := now();
  else
    -- Todo perfil tiene una fila owner-only de configuración. NULL habilita
    -- el primer cambio real de username inmediatamente.
    insert into public.account_settings (user_id, username_changed_at)
    values (new.id, null)
    on conflict (user_id) do nothing;
  end if;

  if new.avatar_url ~ '^https://npyvbqzgcdoujfxefsdr\.supabase\.co/storage/v1/object/public/avatars/' then
    if new.avatar_url !~ ('^https://npyvbqzgcdoujfxefsdr\.supabase\.co/storage/v1/object/public/avatars/' || new.id::text || '/[A-Za-z0-9._-]+$') then
      raise exception 'La foto de perfil en Storage sólo puede pertenecer a tu propia cuenta.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_profile() from public;
drop trigger if exists profiles_normalize_before_write on public.profiles;
create trigger profiles_normalize_before_write
before insert or update on public.profiles
for each row execute function private.normalize_profile();

drop function if exists public.get_my_username_changed_at();
alter table public.profiles drop column if exists username_changed_at;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  fallback_username text := 'usuario_' || substr(replace(new.id::text, '-', ''), 1, 12);
  public_name text;
  picture_url text;
begin
  candidate := regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^A-Za-z0-9._]+', '', 'g');
  if char_length(candidate) < 3 or char_length(candidate) > 24 then
    candidate := fallback_username;
  end if;

  public_name := left(nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  )), ''), 60);

  picture_url := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  )), '');
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google'
     or picture_url is null
     or picture_url !~ '^https://lh3\.googleusercontent\.com/' then
    picture_url := null;
  end if;

  begin
    insert into public.profiles (id, username, display_name, avatar_url)
    values (new.id, candidate, public_name, picture_url);
  exception when unique_violation then
    insert into public.profiles (id, username, display_name, avatar_url)
    values (new.id, fallback_username, public_name, picture_url);
  end;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- Backfill seguro si Auth ya tenía usuarios antes de instalar este esquema.
insert into public.profiles (id, username, display_name, avatar_url)
select
  u.id,
  'usuario_' || substr(replace(u.id::text, '-', ''), 1, 12),
  left(nullif(btrim(coalesce(
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  )), ''), 60),
  case
    when coalesce(u.raw_app_meta_data ->> 'provider', '') = 'google'
      and coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture', '') ~ '^https://lh3\.googleusercontent\.com/'
    then coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
    else null
  end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- Comentarios: texto plano, un nivel de respuesta y anti-spam simple.
-- -------------------------------------------------------------------------

create or replace function private.validate_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_row public.comments%rowtype;
begin
  new.content := btrim(regexp_replace(coalesce(new.content, ''), '[[:space:]]+', ' ', 'g'));
  new.page_id := btrim(new.page_id);
  new.user_id := (select auth.uid());
  new.status := 'visible';
  new.created_at := now();
  new.updated_at := new.created_at;

  if new.user_id is null then
    raise exception 'Debés iniciar sesión para comentar.' using errcode = '42501';
  end if;
  if char_length(new.content) < 1 or char_length(new.content) > 1000 then
    raise exception 'El comentario debe tener entre 1 y 1000 caracteres.' using errcode = '22001';
  end if;
  if exists (
    select 1 from public.comments c
    where c.user_id = new.user_id
      and c.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Estás comentando demasiado rápido.' using errcode = 'P0001';
  end if;

  if new.parent_id is not null then
    select * into parent_row from public.comments where id = new.parent_id;
    if not found or parent_row.parent_id is not null or parent_row.status <> 'visible' then
      raise exception 'La respuesta debe apuntar a un comentario principal visible.' using errcode = '23514';
    end if;
    if parent_row.page_type <> new.page_type or parent_row.page_id <> new.page_id then
      raise exception 'La respuesta debe pertenecer a la misma página.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_comment_insert() from public;
drop trigger if exists comments_validate_before_insert on public.comments;
create trigger comments_validate_before_insert
before insert on public.comments
for each row execute function private.validate_comment_insert();

create or replace function private.validate_comment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  staff boolean := private.is_staff();
begin
  new.user_id := old.user_id;
  new.page_type := old.page_type;
  new.page_id := old.page_id;
  new.parent_id := old.parent_id;
  new.created_at := old.created_at;

  if old.status = 'deleted' and new.status <> 'deleted' then
    raise exception 'Un comentario eliminado no puede restaurarse.' using errcode = '42501';
  end if;

  -- SQL Editor/administración directa no lleva un JWT de usuario.
  if actor is null then
    new.updated_at := now();
    if new.status = 'deleted' then new.content := ''; end if;
    return new;
  end if;

  if actor <> old.user_id then
    if not staff then
      raise exception 'No podés modificar comentarios ajenos.' using errcode = '42501';
    end if;
    if new.content is distinct from old.content then
      raise exception 'Moderación puede cambiar el estado, no el contenido.' using errcode = '42501';
    end if;
  elsif not staff then
    if old.status <> 'visible' then
      raise exception 'No podés restaurar un comentario eliminado u oculto.' using errcode = '42501';
    end if;
    if new.status not in ('visible', 'deleted') then
      raise exception 'Estado de comentario no permitido.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'deleted' then
    new.content := '';
  else
    new.content := btrim(regexp_replace(coalesce(new.content, ''), '[[:space:]]+', ' ', 'g'));
    if char_length(new.content) < 1 or char_length(new.content) > 1000 then
      raise exception 'El comentario debe tener entre 1 y 1000 caracteres.' using errcode = '22001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.validate_comment_update() from public;
drop trigger if exists comments_validate_before_update on public.comments;
create trigger comments_validate_before_update
before update on public.comments
for each row execute function private.validate_comment_update();

create or replace function private.validate_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_owner uuid;
  comment_status text;
begin
  new.reporter_id := (select auth.uid());
  new.status := 'pending';
  new.created_at := now();
  if new.reporter_id is null then
    raise exception 'Debés iniciar sesión para reportar.' using errcode = '42501';
  end if;
  select c.user_id, c.status into comment_owner, comment_status
  from public.comments c where c.id = new.comment_id;
  if comment_owner is null or comment_status <> 'visible' then
    raise exception 'Sólo se pueden reportar comentarios visibles.' using errcode = '23514';
  end if;
  if comment_owner = new.reporter_id then
    raise exception 'No podés reportar tu propio comentario.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_report_insert() from public;
drop trigger if exists comment_reports_validate_before_insert on public.comment_reports;
create trigger comment_reports_validate_before_insert
before insert on public.comment_reports
for each row execute function private.validate_report_insert();

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

-- -------------------------------------------------------------------------
-- RLS y privilegios mínimos.
-- -------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.account_settings enable row level security;
alter table public.comments enable row level security;
alter table public.comment_reports enable row level security;
alter table public.staff_roles enable row level security;
alter table public.saved_items enable row level security;
alter table public.saved_lineups enable row level security;
alter table public.ratings enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.account_settings from public, anon, authenticated;
revoke all on public.comments from anon, authenticated;
revoke all on public.comment_reports from anon, authenticated;
revoke all on public.staff_roles from anon, authenticated;
revoke all on public.saved_items from public, anon, authenticated;
revoke all on public.saved_lineups from public, anon, authenticated;
revoke all on public.ratings from public, anon, authenticated;

grant select (id, username, display_name, avatar_url, bio, created_at)
  on public.profiles to anon, authenticated;
grant update (username, display_name, avatar_url, bio) on public.profiles to authenticated;

grant select (user_id, username_changed_at)
  on public.account_settings to authenticated;

grant select on public.comments to anon, authenticated;
grant insert (user_id, page_type, page_id, parent_id, content) on public.comments to authenticated;
grant update (content, status) on public.comments to authenticated;

grant insert (comment_id, reporter_id, reason) on public.comment_reports to authenticated;
grant select on public.comment_reports to authenticated;
grant update (status) on public.comment_reports to authenticated;

grant select (user_id, role) on public.staff_roles to anon, authenticated;

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

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
for select to anon, authenticated using (true);

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists account_settings_owner_read on public.account_settings;
create policy account_settings_owner_read on public.account_settings
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists comments_public_read on public.comments;
create policy comments_public_read on public.comments
for select to anon
using (status in ('visible', 'deleted'));

drop policy if exists comments_authenticated_read on public.comments;
create policy comments_authenticated_read on public.comments
for select to authenticated
using (
  status in ('visible', 'deleted')
  or user_id = (select auth.uid())
  or (select private.is_staff())
);

drop policy if exists comments_owner_insert on public.comments;
create policy comments_owner_insert on public.comments
for insert to authenticated
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
  and status = 'visible'
);

drop policy if exists comments_owner_or_staff_update on public.comments;
create policy comments_owner_or_staff_update on public.comments
for update to authenticated
using (user_id = (select auth.uid()) or (select private.is_staff()))
with check (user_id = (select auth.uid()) or (select private.is_staff()));

drop policy if exists reports_authenticated_insert on public.comment_reports;
create policy reports_authenticated_insert on public.comment_reports
for insert to authenticated
with check (reporter_id = (select auth.uid()));

drop policy if exists reports_staff_read on public.comment_reports;
create policy reports_staff_read on public.comment_reports
for select to authenticated
using ((select private.is_staff()));

drop policy if exists reports_staff_update on public.comment_reports;
create policy reports_staff_update on public.comment_reports
for update to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));

drop policy if exists staff_roles_self_or_staff_read on public.staff_roles;
drop policy if exists staff_roles_public_read on public.staff_roles;
create policy staff_roles_public_read on public.staff_roles
for select to anon, authenticated
using (true);

drop policy if exists saved_items_owner_select on public.saved_items;
create policy saved_items_owner_select on public.saved_items
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists saved_items_owner_insert on public.saved_items;
create policy saved_items_owner_insert on public.saved_items
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists saved_items_owner_delete on public.saved_items;
create policy saved_items_owner_delete on public.saved_items
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists saved_lineups_owner_select on public.saved_lineups;
create policy saved_lineups_owner_select on public.saved_lineups
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists saved_lineups_owner_insert on public.saved_lineups;
create policy saved_lineups_owner_insert on public.saved_lineups
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists saved_lineups_owner_update on public.saved_lineups;
create policy saved_lineups_owner_update on public.saved_lineups
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists saved_lineups_owner_delete on public.saved_lineups;
create policy saved_lineups_owner_delete on public.saved_lineups
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists ratings_owner_select on public.ratings;
create policy ratings_owner_select on public.ratings
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists ratings_owner_insert on public.ratings;
create policy ratings_owner_insert on public.ratings
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists ratings_owner_update on public.ratings;
create policy ratings_owner_update on public.ratings
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists ratings_owner_delete on public.ratings;
create policy ratings_owner_delete on public.ratings
for delete to authenticated
using (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------
-- Supabase Storage: Bucket de avatares públicos y policies RLS
-- -------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Avatares lectura publica" on storage.objects;
create policy "Avatares lectura publica" on storage.objects
for select to anon, authenticated
using (bucket_id = 'avatars');

drop policy if exists "Avatares subida propia" on storage.objects;
create policy "Avatares subida propia" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Avatares borrado propio" on storage.objects;
create policy "Avatares borrado propio" on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;

-- Agregar un admin (ejecutar después, reemplazando el UUID):
-- insert into public.staff_roles (user_id, role)
-- values ('UUID_DEL_USUARIO', 'admin')
-- on conflict (user_id) do update set role = excluded.role;
