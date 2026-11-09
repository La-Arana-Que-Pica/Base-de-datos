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

Si esas tablas ya existen y vas a habilitar favoritos/comentarios en fichas de DT, ejecutá además `supabase/manager-social-production.sql`. La migración solamente amplía los tipos admitidos a `manager`; no cambia datos, RLS ni permisos.

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

## 12. Rankings de videojuegos: Supabase exclusivamente, sin CAPTCHA

El backend está instalado en `npyvbqzgcdoujfxefsdr`: migraciones `20261108205806_laqp_football_rankings_schema` y `20261108205907_laqp_football_rankings_catalog`, cinco tablas con RLS, cuatro RPC exclusivos del servidor y 1441 versiones votables de 802 juegos. No repetir las migraciones iniciales ni usar un `db push` general. El catálogo se amplía de forma aditiva mediante `rankings-catalog.sql`.

Estado verificado después de que el propietario configuró `RANKINGS_RATE_SECRET`: el endpoint real devuelve `votingEnabled:true` y `environment:"global"`; GET y CORS funcionan para ambos dominios de LAqP, OPTIONS responde 204 y un Origin ajeno recibe 403. Se verificaron los permisos privados y las validaciones rechazando solicitudes inválidas, sin crear votos. El catálogo mantiene 1441 versiones y el ranking permanece vacío. La configuración **local** `js/football-rankings/config.js` quedó con `enabled:true`, lista para la publicación que decida el propietario; no se publicó la web ni se modificó GitHub.

La función `football-rankings` usa `verify_jwt:false`, valida todos los votos y no consulta cuentas o sesiones Auth. No requiere CAPTCHA, site key ni servicios de verificación externos. La URL es `https://npyvbqzgcdoujfxefsdr.supabase.co/functions/v1/football-rankings`. El frontend permanece en `/tier-list.html`; Scouting conserva `/rankings.html`.

### Único secreto adicional: RANKINGS_RATE_SECRET

Generarlo en una terminal PowerShell local con Node instalado:

```powershell
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

Este comando copia 64 caracteres hexadecimales al portapapeles sin imprimirlos. En Supabase → proyecto LAqP.website → Edge Functions → Secrets, crear `RANKINGS_RATE_SECRET`, pegar el contenido como valor y guardar. No compartirlo por chat ni guardarlo en Git o archivos públicos. Una vez guardado, se puede vaciar el portapapeles con `Set-Clipboard -Value ''`.

No se necesita configurar ningún otro secreto adicional. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables privadas que proporciona Supabase al runtime de Edge; nunca deben copiarse al frontend. Los orígenes admitidos ya están definidos en el servidor: `https://laqp.website`, `https://www.laqp.website` y `http://127.0.0.1:5500`. Estos tres se conservan incluso si `RANKINGS_ALLOWED_ORIGINS` contiene la lista pública anterior. La variable es configuración pública, no una credencial, y permite agregar orígenes explícitos administrativamente; no se utiliza un comodín.

Mientras falte el secreto, las lecturas siguen disponibles y todos los POST devuelven 503. El GET público incluye `votingEnabled:false`; al cargar un secreto válido de al menos 32 caracteres devuelve `votingEnabled:true`, sin exponerlo. Permite comprobar la disponibilidad sin registrar votos. No se puede afirmar que la recepción real está habilitada hasta observar ese valor y verificar el endpoint desplegado.

### Verificación antes de publicar

1. GET anónimo con `Origin: https://laqp.website`: 200, `environment:"global"`, puntajes correctos y `votingEnabled:true` después de configurar el secreto. Conservar cero votos y `rows:[]` antes del lanzamiento; no usar votaciones ficticias para probar producción.
2. OPTIONS con ese Origin: 204, CORS para GET/POST/OPTIONS y cabeceras Content-Type/apikey. Comprobar también `www`; un Origin no permitido recibe 403.
3. Una solicitud vacía `{}` no puede generar un voto: devuelve 400 cuando la función está habilitada, o 503 si aún falta el secreto. Las pruebas de votos válidos se ejecutan exclusivamente en entornos aislados.
4. Verificar SQL de solo lectura:

   ```sql
   select (select count(*) from laqp_rankings_private.versions) as versiones,
          (select count(*) from laqp_rankings_private.ballots) as votos,
          (select count(*) from laqp_rankings_private.totals) as totales;
   select has_schema_privilege('anon','laqp_rankings_private','usage') as anon_schema,
          has_function_privilege('anon','public.laqp_rankings_vote(text,smallint,text[])','execute') as anon_vote,
          has_function_privilege('authenticated','public.laqp_rankings_vote(text,smallint,text[])','execute') as account_vote;
   ```

   Deben seguir presentes 1441 versiones y los tres permisos deben ser false. El esquema privado no debe exponerse a Data API. Las cinco tablas tienen RLS sin políticas públicas, de forma intencional: solo el servidor posee permisos.
5. Una vez verificado el secreto y el endpoint, poner `enabled:true` en `js/football-rankings/config.js`. La URL y la clave publishable ya están preparadas. No agregar secretos al navegador ni `localTest:true` a la configuración de publicación. La publicación de la web la decide el propietario.

El procedimiento habitual incluye HTML, CSS, JS, catálogo y portadas, y conserva explícitamente SQL/Edge/configuración/documentación de Rankings en Git. `_config.yml` mantiene `supabase/` fuera del sitio generado por Pages. El servidor no depende de esta computadora: corre en Supabase. El actualizador no instala SQL ni despliega funciones.

### Seguridad y límites

- Identificador aleatorio persistente de 256 bits, cuyo hash es la identidad anónima del voto. No se guardan nombres, correos, user_id ni IP; no se usa fingerprinting.
- Primera contribución entre Top 5 y Top 10, arbitrada por una restricción única en PostgreSQL. Voto y puntos se guardan en la misma transacción y los totales se bloquean en orden estable. Un reintento no vuelve a sumar.
- Veinte intentos por identificador y ventana de diez minutos, mediante HMAC con el secreto del servidor. Personas de una misma conexión no comparten cuota. Los buckets vencidos se purgan en el siguiente intento; una purga programada opcional debe limitarse a `laqp_rankings_private.throttles`.
- Formato, tamaño, modo, cantidad, versiones válidas y ausencia de duplicados se validan en servidor. Los puntos enviados desde el navegador no se utilizan. Los RPC no son ejecutables directamente por `anon` ni `authenticated`.
- Los alias regionales no crean votos adicionales. Las versiones conservan `game_id + plataforma`; no renumerar ni reasignar IDs que tengan votos. Regeneración de semilla local: `node Herramientas/Generadores/rankings-catalog.mjs`.
- El sistema limita duplicados accidentales y frecuencia por identificador; un atacante puede evadirlo generando identificadores nuevos. Se acepta esta limitación del anonimato para una votación recreativa. Los orígenes CORS no equivalen a una identidad humana.
- Los puntos se ajustan administrativamente en `laqp_rankings_private.scoring` y los cambios afectan votos futuros. Los ya emitidos conservan su puntuación histórica.
- Ante caída de Supabase, el Top personal permanece guardado y el servidor no habilita escrituras directas. Para suspender la interfaz, usar `enabled:false`; no borrar votos ni desactivar RLS.

### Conexión desde Live Server: diagnóstico y corrección verificados

Se reprodujo el error desde `http://127.0.0.1:5500/tier-list.html#tier-list`: la función anterior devolvía 403 tanto en GET como en OPTIONS, con `Access-Control-Allow-Origin: null`. Edge registró el rechazo CORS y el frontend solo podía mostrar un error genérico de conexión. El endpoint, los IDs y el formato de las votaciones eran correctos. El fragmento `#tier-list` no participa del Origin.

Se desplegó exclusivamente `football-rankings` versión 4, agregando el origen exacto `http://127.0.0.1:5500` en `service.mjs`, sin cambiar secretos, SQL ni otras funciones. GET devuelve 200 y OPTIONS 204 para los tres orígenes permitidos; `http://localhost:5500`, `http://127.0.0.1:5501` y dominios ajenos continúan rechazados con 403. El cliente añade el origen local al mensaje si la red falla para facilitar el diagnóstico, sin atribuir automáticamente todos los fallos a CORS.

**Live Server usa el backend productivo:** un clic real en Aportar desde esa dirección registra un voto permanente y consume la primera contribución del identificador. El origen local no es un sandbox. Para probar escrituras sin afectar el ranking mundial, usar el servidor aislado indicado abajo.

La prueba `football-rankings-origin.browser.mjs` utiliza el servidor local ya abierto en el puerto 5500. Comprueba lecturas y estado anónimo contra Supabase real, con un bloqueo expreso de cualquier solicitud de voto productivo. Verifica persistencia, recarga y fallo de red. Los votos válidos de Top 5/10 y sus reintentos se interceptan y ejecutan únicamente en PostgreSQL embebido aislado; comprueba 30 + 55 puntos y unicidad entre modos. Conserva el HTML, CSS y módulos del rediseño.

```text
node Herramientas/Pruebas/football-rankings-origin.browser.mjs
```

La prueba se ejecutó con el rediseño actual: cero solicitudes de voto a producción y dos votos solo en la base aislada. La consulta posterior mantuvo cero votos y cero totales en el ranking mundial.

### Pruebas locales sin servicios adicionales

Dependencias temporales en `.tmp`, con Node 24+, Edge/Playwright y Deno:

```text
npm install --prefix .tmp/laqp-rankings @electric-sql/pglite@0.5.15 @embedded-postgres/windows-x64@18.6.0-beta.19 pg@8.16.3 --ignore-scripts --no-audit --no-fund
deno check supabase/functions/football-rankings/index.ts
node --test Herramientas/Pruebas/football-rankings.test.mjs Herramientas/Pruebas/football-rankings-release.test.mjs
node Herramientas/Pruebas/football-rankings.browser.mjs
node Herramientas/Pruebas/tier-list.browser.cjs
node Herramientas/Pruebas/football-rankings-concurrency.mjs
```

La integración `football-rankings-production.mjs` ejecuta el código real en Deno, PostgreSQL nativo y PostgREST 16.5, con Edge. Requiere el [binario oficial de Windows](https://github.com/PostgREST/postgrest/releases/download/v16.5/postgrest-v16.5-windows-x86-64.zip) en `.tmp/laqp-rankings/production/postgrest/postgrest.exe`:

```text
node Herramientas/Pruebas/football-rankings-production.mjs
```

Prueba Top 5 y Top 10 sin cuenta ni CAPTCHA, puntajes, duplicados, simultaneidad, RLS/permisos reales por REST, persistencia tras reiniciar PostgreSQL, CORS y caída de red. Intercepta en Edge las URLs reales para servir la copia local; no envía votos a producción. No utiliza respuestas simuladas de ningún proveedor de verificación. Inicia y detiene solo sus procesos temporales.

Vista manual de PostgreSQL en memoria: `node Herramientas/Pruebas/rankings-local.mjs`. Muestra PRUEBAS LOCALES y sus votos desaparecen al cerrar el proceso. No modifica la configuración pública.

### Ranking por juego canónico (`rankings-games.sql`) — pendiente de aplicar en producción

Regla: **un videojuego = una entrada en el ranking = una sola aparición por Top**. El ranking suma los puntos de todas las versiones de un mismo `game_id` y conserva el desglose por plataforma. Un Top que repite el juego en otra plataforma se rechaza en la base de datos (`DUPLICATE_GAME`, HTTP 400).

- Migración aditiva: reemplaza solo `laqp_rankings_vote` y `laqp_rankings_results` (mismas firmas y permisos). No borra, mueve ni reescribe filas de `ballots` ni de `totals`.
- El ranking se calcula desde `ballots`. Si un voto histórico tuviera el mismo juego dos veces, solo cuenta la aparición con más puntos, con su puesto y su plataforma originales.
- `totals` se sigue actualizando por versión, así que la reversión no necesita recalcular nada.
- Auditoría de solo lectura del 8/11/2026, hecha con el GET público: 3 votaciones, 140 puntos, y ninguna votación con un juego repetido. Las dos versiones de PES 2013 y PES 2012 vienen de votantes distintos. El ranking nuevo usa todos los puntos existentes sin descartar nada.

Pasos (SQL Editor, rol propietario):
1. `rankings-games-audit.sql`: consultas de solo lectura. La consulta 2 tiene que devolver 0 filas o listar los votos repetidos que el cálculo va a ignorar. La consulta 3 tiene que devolver 0 filas.
2. `rankings-games.sql`.
3. Verificar que `select public.laqp_rankings_results()` devuelve `aggregation:"game"` y que la suma de los puntos de las filas coincide con `ballot_points` de la auditoría.
4. Opcional: volver a desplegar `football-rankings`. Solo cambia el texto del error 400.
5. Reversión: `rankings-games-rollback.sql`.

El frontend funciona con las dos versiones del backend. Si la migración todavía no está aplicada, agrupa por juego en el navegador y marca los votantes como «aprox.», porque no se puede saber cuántos son únicos.
