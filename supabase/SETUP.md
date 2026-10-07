# Activar cuentas y comentarios en LAqP.website

La web queda desactivada de forma segura hasta completar estos pasos. No necesitás instalar npm, crear un servidor ni cambiar GitHub Pages.

## 1. Crear el proyecto

1. Entrá a [Supabase](https://supabase.com/dashboard) y elegí **New project**.
2. Elegí organización, nombre, región y una contraseña fuerte para la base.
3. Esperá a que el proyecto termine de crearse.

## 2. Crear las tablas y la seguridad

1. En el menú del proyecto abrí **SQL Editor**.
2. Elegí **New query**.
3. Copiá todo el contenido de `supabase/schema.sql`, pegalo y presioná **Run**.
4. Debe finalizar sin errores. El archivo crea tablas, índices, triggers, permisos y todas las policies RLS.

Conviene ejecutar `schema.sql` en un proyecto nuevo. Si el proyecto ya tenía tablas de una prueba anterior con los mismos nombres, eliminá o migrá esas tablas antes de ejecutar el esquema definitivo.

## 3. Copiar Project URL y publishable key

1. Abrí el botón **Connect** del proyecto. También podés ir a **Project Settings > API Keys**.
2. Copiá **Project URL**.
3. Copiá la **Publishable key** (`sb_publishable_...`). En proyectos antiguos puede aparecer una clave pública `anon` heredada; funciona, pero se prefiere la publishable key.
4. Abrí `js/supabaseClient.js` y reemplazá:

   - `PEGAR_SUPABASE_PROJECT_URL_ACA`
   - `PEGAR_SUPABASE_PUBLISHABLE_KEY_ACA`

5. Guardá y publicá esos cambios en GitHub Pages.

> **Nunca pegues `service_role`, secret key ni la contraseña de la base en la web.** `service_role` evita RLS y debe permanecer exclusivamente en un entorno servidor. LAqP no necesita esa clave.

## 4. Configurar las URLs de Auth

1. En Supabase abrí **Authentication > URL Configuration**.
2. En **Site URL** colocá exactamente:

   `https://laqp.website/`

3. En **Redirect URLs** agregá:

   - `https://laqp.website/`
   - `https://laqp.website/**` para que Google OAuth pueda volver a la página interna donde empezó el login
   - `https://laqp.website/?laqp-recovery=1`
   - `http://localhost:8000/**` para pruebas locales
   - `http://127.0.0.1:8000/**` para pruebas locales

Si LAqP realmente se publica o recibe tráfico con `www`, agregá también `https://www.laqp.website/`, `https://www.laqp.website/**` y `https://www.laqp.website/?laqp-recovery=1`. Si `www` no se utiliza, no hace falta agregarlas.

La recuperación de contraseña vuelve explícitamente a `https://laqp.website/?laqp-recovery=1`. En local vuelve al mismo origen local y queda cubierta por los comodines anteriores.

## 5. Registro por correo

1. Abrí **Authentication > Providers > Email**.
2. Dejá habilitado Email.
3. Para producción, mantené activada la confirmación de correo.
4. Configurá una longitud mínima razonable para las contraseñas en la configuración de seguridad de Authentication.
5. **Leaked Password Protection** está disponible únicamente en Supabase Pro o superior. Como la organización actual usa el plan Free, no es un requisito para publicar; queda como mejora opcional si más adelante se actualiza a Pro.
6. Si querés personalizar el mensaje, usá **Authentication > Email Templates**.

### SMTP antes del lanzamiento público

El envío incorporado de Supabase sirve sólo para desarrollo y pruebas: tiene límites muy bajos y únicamente envía a direcciones previamente autorizadas, normalmente miembros del equipo del proyecto. Podés usarlo mientras verificás registro, confirmación y recuperación con una de esas direcciones.

**Antes de abrir el registro por email a usuarios reales, configurá Custom SMTP.** En el Dashboard se encuentra en **Authentication > Emails > SMTP Settings** (también puede aparecer como **Authentication > Settings > Custom SMTP**, según la versión de la interfaz). Ahí se cargan host, puerto, usuario, contraseña, remitente y nombre del remitente del servicio que elijas más adelante.

Las credenciales SMTP quedan exclusivamente guardadas en Supabase. Nunca deben copiarse a `js/supabaseClient.js`, GitHub Pages, otro archivo frontend ni este repositorio.

Google OAuth funciona de manera independiente y no necesita este SMTP. Custom SMTP sólo afecta los correos de Auth, como confirmación de cuenta y recuperación de contraseña.

## 6. Habilitar Google

1. En [Google Cloud Console](https://console.cloud.google.com/) creá o elegí un proyecto.
2. Configurá **Google Auth Platform / OAuth consent screen** con el nombre LAqP y los datos públicos del sitio.
3. Creá credenciales **OAuth client ID** de tipo **Web application**.
4. En **Authorized JavaScript origins** agregá:

   `https://laqp.website`

5. En **Authorized redirect URIs** agregá la callback exacta de tu proyecto:

   `https://TU_PROJECT_REF.supabase.co/auth/v1/callback`

   Reemplazá `TU_PROJECT_REF` por la referencia visible en tu Project URL. Ejemplo: si la URL es `https://abcxyz.supabase.co`, la callback es `https://abcxyz.supabase.co/auth/v1/callback`.

6. Copiá el **Client ID** y **Client secret** de Google.
7. En Supabase abrí **Authentication > Providers > Google**, habilitalo, pegá ambos valores y guardá.

El botón **Continuar con Google** ya está implementado con `signInWithOAuth({ provider: 'google' })` y vuelve a la página interna desde la que comenzó el acceso.

Para permitir **Vincular Google** desde Mi cuenta, activá **Authentication > Settings > General configuration > Allow manual linking**. La desvinculación sólo se ofrece cuando Supabase confirma que la cuenta conserva otra identidad de acceso.

Para una base ya creada, ejecutá también `supabase/account-features-production.sql` una sola vez en el SQL Editor. Crea `saved_items`, `saved_lineups` y `ratings` con RLS owner-only; `anon` no recibe permisos.

Para habilitar fotos de perfil personalizadas en una base ya creada, ejecutá `supabase/storage-avatars-setup.sql` en el SQL Editor una sola vez. Configura el bucket `avatars` (público, límite 2MB, tipos jpeg/png/webp) y sus policies RLS para que cada usuario sólo suba y borre en `<user_id>/...`.

## 7. Convertir tu usuario en admin

1. Registrate normalmente en LAqP.
2. En Supabase abrí **Authentication > Users** y copiá el UUID de tu usuario.
3. En **SQL Editor** ejecutá, reemplazando el UUID:

```sql
insert into public.staff_roles (user_id, role)
values ('UUID_DE_AGUSTIN', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

Para agregar un moderador, usá `moderator` en lugar de `admin`. No existe ninguna operación del navegador que permita asignarse esos roles.

## 8. Comprobar RLS

En **Database > Tables** verificá que `profiles`, `account_settings`, `comments`, `comment_reports`, `staff_roles`, `saved_items`, `saved_lineups` y `ratings` indiquen RLS habilitado.

`account_settings` es privada: un usuario autenticado sólo puede leer su propia fila y no puede insertar, modificar ni eliminar registros desde el frontend. Ahí se guarda el cooldown de username; `anon` no tiene acceso.

Luego probá desde dos ventanas o perfiles de navegador:

1. Sin iniciar sesión, los comentarios visibles se leen, pero no aparece un formulario para publicar.
2. Con el usuario A, publicá un comentario.
3. Con el usuario B, comprobá que no podés editar ni eliminar el comentario de A.
4. Con B, reportá el comentario. Intentá reportarlo otra vez: la base debe rechazar el duplicado.
5. En **Table Editor > comment_reports**, confirmá que el reporte existe. Un usuario normal no puede listar esa tabla desde la API.
6. Como admin, abrí `/admin-comments.html` para revisar reportes, ocultar comentarios, restaurar los que estén `hidden` y eliminar definitivamente.

En moderación, `hidden` es reversible y puede volver a `visible`. `deleted` es definitivo: el trigger vacía el contenido y ni el panel ni las policies permiten restaurarlo.

La seguridad no depende de los botones: las policies y triggers de PostgreSQL verifican `auth.uid()`, propietarios, roles, parentesco de respuestas y estados.

## 9. Prueba funcional completa

Probá en escritorio y celular:

1. Registro con username, correo y dos contraseñas iguales.
2. Confirmación del correo.
3. Login y persistencia al cambiar de página.
4. Logout.
5. **Olvidé mi contraseña** y elección de contraseña nueva al volver al sitio.
6. Login con Google.
7. Edición de username, nombre visible, selección entre los cuatro avatares locales, bio y subida/eliminación de foto de perfil personalizada en `/mi-cuenta.html`. Las fotos de perfil se guardan en el bucket `avatars` de Supabase Storage. Una cuenta de Google puede conservar su foto de Google existente, pero no pegar URLs externas.
8. Comentario principal y respuesta.
9. Edición y eliminación propia.
10. Reporte desde otro usuario.
11. Botón **Cargar más comentarios** cuando haya más de 20 comentarios principales.
12. Escribí literalmente `<script>alert(1)</script>`: debe verse como texto y nunca ejecutarse.
13. Intentá superar 1000 caracteres y publicar dos veces en menos de 10 segundos: debe rechazarse.
14. Cambiá el email y confirmalo desde el mensaje enviado por Supabase.
15. Vinculá y desvinculá Google; la interfaz no debe permitir quitar la única identidad disponible.
16. Guardá y quitá un jugador, un equipo y una táctica; deben aparecer en **Mi cuenta > Actividad**.
17. Guardá, abrí, actualizá y eliminá una alineación desde el Squad Builder.
18. Creá, cambiá y quitá una valoración de una táctica y un Option File.

## 10. Prueba local

No abras los HTML con doble clic. Desde la raíz del repositorio ejecutá un servidor estático, por ejemplo:

```text
python -m http.server 8000
```

Después abrí `http://localhost:8000/`. Las URLs locales indicadas arriba deben estar cargadas en la lista de redirects de Supabase.

## 11. Si Supabase falla o todavía no está configurado

LAqP continúa funcionando sin cuentas ni comentarios. El cargador detecta placeholders, no descarga la librería de Supabase, no hace consultas y deja un único aviso útil en la consola. Si Supabase está temporalmente inaccesible, el error queda aislado y el contenido principal, navegación, SEO y base de datos siguen disponibles.
