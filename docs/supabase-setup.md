# Supabase Auth en LAqP.website

Esta web usa Supabase Auth solo como login opcional. La base de datos, guías, descargas, jugadores y Scouting deben seguir funcionando aunque el usuario no inicie sesión.

LAqP.website es una web estática con HTML, CSS y JavaScript. Por eso la integración usa la librería oficial desde CDN y `js/supabaseClient.js`. No hace falta usar `@supabase/ssr`, `page.tsx`, middleware de Next.js ni archivos de servidor mientras el proyecto siga siendo estático.

## 1. Crear proyecto

1. Entrar a Supabase y crear un proyecto.
2. Ir a **Project Settings > API**.
3. Copiar **Project URL**.
4. Copiar **anon public key**.
5. Pegar esos datos en `js/supabaseClient.js`:

```js
const SUPABASE_URL = 'https://npyvbqzgcdoujfxefsdr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DEkFKiLQFRQtkovGyNSA9g_6vk12ouU';
```

Nunca pegues la `service_role key` en el frontend.

## 2. Activar Email Auth

1. Ir a **Authentication > Providers**.
2. Activar **Email**.
3. Definir si querés exigir confirmación por email.
4. En **Authentication > URL Configuration**, configurar:
   - Site URL: `https://laqp.website`
   - Redirect URLs: `https://laqp.website/*`
   - Para desarrollo local, agregar también `http://127.0.0.1:5500/*` o el puerto que uses.

## 3. Tabla sugerida para favoritos

Cuando quieras guardar favoritos en la nube, crear la tabla:

```sql
create table public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id text not null,
  created_at timestamp with time zone default now()
);
```

Activar Row Level Security:

```sql
alter table public.user_favorites enable row level security;
```

Policies sugeridas:

```sql
create policy "Users can read own favorites"
on public.user_favorites
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own favorites"
on public.user_favorites
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
on public.user_favorites
for delete
to authenticated
using (auth.uid() = user_id);
```

## 4. Seguridad

- No guardar contraseñas en CSV, localStorage ni archivos del proyecto.
- No usar `service_role key` en frontend.
- Supabase Auth debe manejar registro, login, logout y recuperación.
- Para cualquier tabla de usuario, activar Row Level Security.
- Las policies deben impedir que un usuario vea o modifique datos de otro.
- Validar datos antes de guardarlos.
- Mostrar errores simples al usuario, no errores técnicos crudos.

## 5. Comentarios

El sistema de comentarios usa otra tabla y policies propias. Ver `docs/supabase-comments-setup.md` antes de activar comentarios en producción.

## 6. Perfiles

Los comentarios muestran perfiles públicos con username y avatar. Ver `docs/supabase-profiles-setup.md` para crear la tabla `profiles`, activar RLS y configurar las policies.
