# Perfiles de usuario con Supabase

Los perfiles públicos permiten mostrar `username` y avatar en comentarios sin exponer emails ni `user_id`.

## Tabla profiles

```sql
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_id text not null default 'avatar-1',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint username_length check (char_length(username) between 3 and 20),
  constraint username_format check (username ~ '^[a-zA-Z0-9._]+$'),
  constraint avatar_id_allowed check (avatar_id in ('avatar-1', 'avatar-2', 'avatar-3', 'avatar-4'))
);
```

Si querés evitar usuarios duplicados por mayúsculas/minúsculas, guardá usernames en minúscula desde el frontend, como ya hace `js/auth.js`.

## Activar RLS

```sql
alter table public.profiles enable row level security;
```

## Policies

```sql
create policy "Anyone can read profiles"
on public.profiles
for select
using (true);

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
```

## Avatares predeterminados

La web no permite subir imágenes propias. El usuario solo elige `avatar_id` de la lista definida en `js/auth.js`.

Archivos actuales:

- `assets/avatars/avatar-1.svg`
- `assets/avatars/avatar-2.svg`
- `assets/avatars/avatar-3.svg`
- `assets/avatars/avatar-4.svg`

Si más adelante reemplazás por PNG, actualizá las URLs en `DEFAULT_AVATARS`.

## Flujo

1. El usuario inicia sesión con Supabase Auth.
2. `ensureUserProfile()` revisa `public.profiles`.
3. Si no existe perfil, abre el modal obligatorio "Configurá tu perfil".
4. El usuario elige username y avatar.
5. Los comentarios usan ese perfil para mostrar avatar y username.

## Seguridad

- No mostrar emails completos en comentarios.
- No permitir `avatar_url` libre desde input del usuario.
- Mantener RLS activo.
- El `username` debe ser único por constraint de base de datos.
- Validar en frontend y en Supabase con constraints.
