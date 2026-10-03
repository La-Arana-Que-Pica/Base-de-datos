# Sistema de Directores Técnicos

## Fuente de verdad

`Herramientas/Recursos/Base-de-datos/DTs/config.csv` es el único CSV de configuración general. Cada fila es
una persona y conserva la URL pública mediante `carpeta`.

Campos de relación principales:

- `id`: identidad estable interna de LAQP; no depende del nombre visible.
- `transfermarkt_id`: identidad externa. Puede quedar vacío.
- `equipo_id`: club de contexto dentro de LAQP, cuando existe.
- `carpeta`: recursos propios y URL histórica ya publicada.
- `foto_override`: ruta local que tiene prioridad sobre las demás fotos.

`nombre`, `equipo` y `anio` son el contexto editorial de la ficha. Tienen prioridad
sobre el estado real actual para que una ficha histórica no cambie al actualizar
Transfermarkt. `trayectoria` y `palmares` siguen siendo overrides manuales; nunca se
inventan ni se sobrescriben automáticamente.

Las carpetas `database/DTs/<carpeta>/` contienen solo recursos: `face.csv`, fotos y
previews. Cara y Peinado continúan en `face.csv` y se muestran en paneles separados,
sin descartar ningún valor existente.

## Transfermarkt y cache

La integración está aislada en `Herramientas/Generadores/manager_external.py`. El cliente,
la normalización, el cache y el renderizado son capas separadas. La generación
normal no accede a internet.

El cache normalizado está en:

`Herramientas/Recursos/Base-de-datos/cache/entrenadores_transfermarkt.json`

La vigencia predeterminada es 14 días (`TRANSFERMARKT_CACHE_DAYS`). Una actualización
consulta secuencialmente solo entradas nuevas, vencidas o forzadas, con timeout,
reintentos limitados y pausa. Si falla la conexión o cambia la fuente, se registra un
warning y se reutiliza el cache anterior. Un DT sin `transfermarkt_id` no bloquea la
generación.

Prioridad de imagen:

1. `foto_override` local;
2. foto LAQP de la carpeta;
3. imagen externa ya descargada al cache local;
4. preview/placeholder local.

El HTML nunca hotlinkea la foto externa.

## Agregar un DT

1. Crear una sola fila en `Herramientas/Recursos/Base-de-datos/DTs/config.csv` con `id` y `carpeta` únicos.
2. Poner el número del perfil en `transfermarkt_id`, no el nombre ni la URL completa.
3. Usar `equipo_id` si el club existe en LAQP; dejarlo vacío si no existe.
4. Crear `database/DTs/<carpeta>/` únicamente si habrá fotos o `face.csv`.
5. Si hay tácticas, escribir el mismo `id` en `entrenador_id` de
   `database/tacticas-metadata.csv`.
6. Ejecutar la generación de DTs y, si cambió una relación, la de tácticas.

No es obligatorio tener Transfermarkt, táctica, Cara o Peinado. Los bloques vacíos se
ocultan o muestran una ausencia breve.

## Comandos

```powershell
# Rápido y completamente offline
python Herramientas/Generadores/generar_web.py --cli --managers-only

# Actualiza nuevos/vencidos y genera DTs
python Herramientas/Generadores/generar_web.py --cli --managers-only --refresh-coaches

# Fuerza uno por ID LAQP o Transfermarkt
python Herramientas/Generadores/generar_web.py --cli --managers-only --refresh-coach 63052

# Generación completa, reutilizando cache
python Herramientas/Generadores/generar_web.py --cli

# Publica enlaces modificados desde las tácticas
python Herramientas/Generadores/generar_web.py --cli --tactics-only
```

La interfaz gráfica ofrece generación completa o solo DTs, con y sin actualización
externa. `database/DTs/generar-index-dts.ps1` mantiene el acceso rápido equivalente.

## Datos automáticos y manuales

Automáticos cuando la fuente/cache los contiene: nombre completo, nacionalidad,
nacimiento, edad calculada, estado/club real, llegada, formación habitual, carrera e
imagen externa descargable.

Manuales y protegidos: contexto histórico (`nombre`, `equipo`, `anio`), descripción,
Cara, Peinado, valores PES, imágenes LAQP, tácticas, palmarés y textos editoriales.

## Migración y validación

`Herramientas/Mantenimiento/Migraciones/migrate_manager_system.py` centraliza datos, agrega IDs estables a
tácticas y crea un backup fechado en `Herramientas/Salidas/backups/` antes de escribir. Es
idempotente y admite `--no-backup` para ejecuciones controladas posteriores.

La carga valida IDs LAQP y Transfermarkt duplicados, carpetas duplicadas, equipos o DTs
inexistentes, imágenes faltantes, fechas externas incoherentes y relaciones tácticas.
Las advertencias no detienen páginas no afectadas.
