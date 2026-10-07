-- LAqP.website: Migración incremental para Storage de Avatares
-- Proyecto Supabase: https://npyvbqzgcdoujfxefsdr.supabase.co
-- Ejecutar en Supabase > SQL Editor una sola vez.

begin;

-- 1. Actualizar la constraint de formato de avatar_url en public.profiles
-- Permite:
--  - null
--  - avatares locales (/assets/avatars/avatar-[1-4].svg)
--  - fotos de Google OAuth (https://lh3.googleusercontent.com/...)
--  - URLs de Supabase Storage del proyecto EXACTO (https://npyvbqzgcdoujfxefsdr.supabase.co/storage/v1/object/public/avatars/<uuid>/...)
alter table public.profiles drop constraint if exists profiles_avatar_url_format;

alter table public.profiles add constraint profiles_avatar_url_format check (
  avatar_url is null
  or avatar_url ~ '^/assets/avatars/avatar-[1-4]\.svg$'
  or avatar_url ~ '^https://lh3\.googleusercontent\.com/'
  or avatar_url ~ '^https://npyvbqzgcdoujfxefsdr\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$'
);

-- 2. Actualizar private.normalize_profile() para validar que las URLs de Storage
-- pertenezcan a la carpeta del propio usuario que actualiza el perfil.
create or replace function private.normalize_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_google_identity boolean;
  last_username_change timestamptz;
  storage_prefix text := '^https://npyvbqzgcdoujfxefsdr\.supabase\.co/storage/v1/object/public/avatars/';
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
    -- INSERT (manejado por triggers de auth o creación)
    insert into public.account_settings (user_id, username_changed_at)
    values (new.id, null)
    on conflict (user_id) do nothing;
  end if;

  -- Validación Supabase Storage: sólo puede apuntar a la subcarpeta del propio usuario (tanto en INSERT como en UPDATE)
  if new.avatar_url ~ storage_prefix then
    if new.avatar_url !~ ('^https://npyvbqzgcdoujfxefsdr\.supabase\.co/storage/v1/object/public/avatars/' || new.id::text || '/[A-Za-z0-9._-]+$') then
      raise exception 'La foto de perfil en Storage sólo puede pertenecer a tu propia cuenta.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 3. Configuración de Storage: Bucket 'avatars' y Policies RLS
-- Crear bucket público si no existe aún
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

-- RLS en storage.objects
-- Nota: En Supabase, RLS ya viene activado en storage.objects.

-- Lectura pública para cualquier visitante (anon y authenticated)
drop policy if exists "Avatares lectura publica" on storage.objects;
create policy "Avatares lectura publica" on storage.objects
for select to anon, authenticated
using (bucket_id = 'avatars');

-- Subida: sólo el usuario autenticado en su propia carpeta <user_id>/...
drop policy if exists "Avatares subida propia" on storage.objects;
create policy "Avatares subida propia" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Eliminación: sólo el usuario autenticado en su propia carpeta <user_id>/...
drop policy if exists "Avatares borrado propio" on storage.objects;
create policy "Avatares borrado propio" on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;
