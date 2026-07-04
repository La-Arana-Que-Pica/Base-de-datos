# Comentarios con Supabase

Los comentarios de LAqP.website usan Supabase Auth y una tabla `comments`. Leer comentarios aprobados es público; comentar requiere iniciar sesión. Los comentarios nuevos quedan en `pending` para moderación.

## Tablas

```sql
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamp with time zone default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text not null,
  page_title text,
  section_type text,
  content text not null check (char_length(trim(content)) between 3 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'deleted')),
  parent_id uuid null references public.comments(id) on delete cascade,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone,
  edited boolean default false
);
```

## Función para moderadores

```sql
create or replace function public.is_comment_moderator()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'moderator')
  );
$$;
```

## Activar RLS

```sql
alter table public.user_roles enable row level security;
alter table public.comments enable row level security;
```

## Policies para user_roles

```sql
create policy "Users can read own role"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);
```

Los roles de admin/moderator conviene asignarlos manualmente desde Supabase SQL Editor o Dashboard.

## Policies para comments

Lectura pública de aprobados y lectura propia de pendientes:

```sql
create policy "Anyone can read approved comments"
on public.comments
for select
to anon, authenticated
using (status = 'approved');

create policy "Users can read own pending comments"
on public.comments
for select
to authenticated
using (auth.uid() = user_id and status = 'pending');

create policy "Moderators can read all comments"
on public.comments
for select
to authenticated
using (public.is_comment_moderator());
```

Inserción solo autenticada y siempre pendiente:

```sql
create policy "Authenticated users can insert pending comments"
on public.comments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and status = 'pending'
  and char_length(trim(content)) between 3 and 1000
  and exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
  )
);
```

Edición del dueño solo si sigue pendiente:

```sql
create policy "Users can edit own pending comments"
on public.comments
for update
to authenticated
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id and status = 'pending');
```

Moderadores pueden aprobar, rechazar o borrar:

```sql
create policy "Moderators can update comments"
on public.comments
for update
to authenticated
using (public.is_comment_moderator())
with check (public.is_comment_moderator());
```

Borrado del dueño para comentarios pendientes:

```sql
create policy "Users can delete own pending comments"
on public.comments
for delete
to authenticated
using (auth.uid() = user_id and status = 'pending');

create policy "Moderators can delete comments"
on public.comments
for delete
to authenticated
using (public.is_comment_moderator());
```

## Uso en la web

- `js/comments.js` detecta `page_id`, `page_title` y `section_type` según la página actual.
- No renderiza comentarios en páginas legales/institucionales.
- Los visitantes leen comentarios `approved`.
- Los usuarios logueados pueden enviar comentarios `pending`.
- Para comentar, el usuario debe completar `public.profiles`.
- El dueño ve sus comentarios pendientes con la etiqueta "Pendiente de aprobación".
- `admin-comments.html` es una base para moderar comentarios. La seguridad depende de RLS y `user_roles`.

## Seguridad

- No guardar comentarios en CSV ni localStorage como fuente principal.
- No confiar solo en validaciones del frontend.
- Mantener RLS activo.
- No mostrar `user_id` ni emails completos en pantalla.
- No poner `service_role key` en frontend.
