# Spider Patch: manual del editor e informe de importación/exportación

Actualización: 8 de noviembre de 2026. Esta documentación describe la implementación local, sus controles y sus límites. No implica que se haya publicado la web ni que se hayan importado ejemplos en tu biblioteca real.

## 1. Qué se incorporó

El editor puede **exportar una versión completa** e **importar una versión mediante revisión previa**. Es el equivalente del intercambio de Guías, adaptado al modelo de Spider Patch: temporada, versión, ediciones por plataforma, bloques editoriales, tutoriales, paquetes, partes obligatorias, enlaces alternativos y dependencias.

Una operación abarca una versión, con todas sus ediciones. No exporta una guía, una temporada entera ni toda la biblioteca. Así se puede compartir o preparar una publicación sin transferir el resto del proyecto ni sobrescribirlo accidentalmente.

Se agregaron:

- **Importar versión**, en la biblioteca lateral, debajo de Temporada/Versión.
- **Exportar versión**, junto a Duplicar en la cabecera de la versión seleccionada.
- Un diálogo de revisión con cantidades, conflictos y advertencias.
- Importación como versión nueva y reemplazo explícito de una versión compatible.
- Validación del JSON, dependencias, plataformas, imágenes y HTML editorial.
- Conservación de referencias de imágenes faltantes, con bloqueo de publicación mientras sigan pendientes.
- Una especificación autónoma, un esquema JSON Schema y un ejemplo importable.

No se incorporaron servicios externos ni dependencias de ejecución nuevas. El servidor sigue usando Python estándar y el navegador utiliza JavaScript nativo.

## 2. Abrir el editor y entender su organización

Abrí `Abrir Spider Patch.cmd` en esta carpeta. El servidor local utiliza por defecto `http://127.0.0.1:8776/admin/`. La consola debe permanecer abierta mientras editás. No es el administrador de Guías, que utiliza otro puerto y otro formato.

La biblioteca se organiza así:

1. **Proyecto:** identidad compartida de Spider Patch y metadatos de la portada.
2. **Temporada:** grupo editorial, por ejemplo 2026.
3. **Versión:** una publicación del parche, por ejemplo V3 o V4, o un complemento independiente.
4. **Edición:** PC, PlayStation o compartida. Tiene su propia URL, comentarios, contenido y descargas.
5. **Paquete:** distribución completa, actualización o complemento opcional de una edición.
6. **Parte:** archivo obligatorio de un paquete. Los mirrors son alternativas para esa misma parte.

Un mirror no es otra parte obligatoria. Un complemento no es una parte del paquete principal. Las dependencias identifican paquetes; no identifican archivos ni enlaces.

## 3. Exportar paso a paso

1. Seleccioná una versión en la biblioteca lateral.
2. Presioná **Exportar versión** en su cabecera.
3. El navegador descargará `spider-patch-<id-de-version>.json`.

Se exporta el estado que está abierto en el editor, **incluidos los cambios sin guardar**, todas las ediciones y el orden de sus listas. Exportar no guarda la biblioteca, no cambia la revisión, no genera HTML y no publica nada.

El archivo contiene datos editoriales y referencias a medios/enlaces. No contiene los PNG, videos, ZIP, RAR, CPK o archivos del parche. Tampoco contiene respaldos, tokens del servidor, calificaciones ejecutables ni datos privados de otras versiones.

Un archivo exportado no sustituye un respaldo completo del proyecto. Para trasladar la biblioteca y sus medios a otra computadora hay que conservar también las fuentes y archivos correspondientes mediante un respaldo separado.

## 4. Importar paso a paso

### Preparar y revisar

1. Guardá los cambios pendientes del editor. La importación no continúa si hay cambios sin guardar.
2. Presioná **Importar versión**.
3. Elegí un JSON UTF-8 de hasta 5 MiB del formato indicado en la especificación.
4. Revisá el título, temporada, cantidad de ediciones, bloques, paquetes, partes y mirrors.
5. Leé las advertencias de imágenes pendientes, dependencias externas o conflictos de identidad.

Seleccionar el archivo y revisar su resumen **no escribe la biblioteca**. Cancelar cierra el diálogo sin modificar contenido ni salida pública. La revisión vive temporalmente en memoria del servidor y tiene una duración máxima de 15 minutos; reiniciar el editor la invalida. Se conservan como máximo ocho revisiones pendientes por servidor.

### Importar como nueva versión

Esta es la opción predeterminada. Si los IDs o las direcciones ya están utilizados, el importador genera nuevos identificadores y un slug alternativo. Las dependencias internas se reescriben para que sigan apuntando a los paquetes de la nueva copia.

La temporada se crea como borrador sólo si no existe. Si ya existe, se conservan su nombre y estado; un nombre diferente en el archivo produce una advertencia. No se modifica la configuración general del proyecto.

La nueva versión, sus ediciones y todos sus paquetes quedan **en borrador**, aunque el JSON diga `published`. La importación se guarda automáticamente, incrementa la revisión y utiliza el mecanismo de respaldo del editor. No hace falta volver a pulsar Guardar para conservar el resultado importado.

### Reemplazar una versión

Sólo está disponible cuando el ID del archivo coincide con una versión existente y el reemplazo supera la validación. Debés elegir la opción y marcar una casilla adicional de confirmación.

El reemplazo exige:

- La misma versión y temporada.
- Incluir todas las ediciones existentes; no se eliminan ediciones por omisión.
- Conservar ID, slug, identidad de comentarios y plataforma de cada edición existente.
- No apropiarse de identidades o direcciones reservadas por otra publicación.
- Mantener válidas las dependencias de otras versiones.

Se conserva la integración local de calificaciones y los metadatos históricos de las ediciones coincidentes. No se acepta ese código desde el archivo importado.

El contenido editorial de la versión —bloques, descripciones, paquetes, etc.— sí puede reemplazarse: esa es la finalidad de esta opción y por eso requiere confirmación y respaldo. Si necesitás comparar ambas propuestas sin sustituir contenido, elegí nueva versión.

**Importante:** reemplazar una versión publicada la deja como borrador en la fuente editable. La web y la instantánea publicada no cambian al importar. Sin embargo, una generación posterior la dejará fuera de publicación si no volvés a activar los estados necesarios. El diálogo lo advierte antes de confirmar.

## 5. Revisar el resultado y publicarlo después

Al terminar se abre la versión importada en la pestaña Versión. La vista previa anterior se marca como desactualizada para que no parezca que está mostrando el contenido recién importado.

1. Comprobá temporada, número, título y plataformas.
2. Revisá cada publicación y su dirección.
3. Elegí las imágenes pendientes desde la biblioteca.
4. Completá los enlaces, compatibilidad y tutoriales que falten.
5. Actualizá la vista previa privada y revisá artículo, página principal y descargas.
6. Cuando corresponda, activá los estados Publicado de temporada, versión, ediciones y paquetes.
7. Guardá, presioná **Generar web local** y revisá el plan de archivos antes de confirmar.

Una copia importada conserva la etiqueta original, por ejemplo V3. No puede publicarse como otra versión de lanzamiento con la misma etiqueta y temporada si ya existe una publicada: elegí la etiqueta correcta antes de generar.

Generar produce archivos locales; subirlos a GitHub y desplegar son acciones separadas. Esta función no hace commits, push ni despliegues. Continúan vigentes los controles y bloqueos del comando de actualización de la web.

## 6. Imágenes y referencias pendientes

El JSON transporta referencias, no archivos. Una imagen local existente en la computadora receptora se reutiliza. Si no está disponible:

- La portada, imagen, galería o imagen SEO queda pendiente.
- Se conserva la referencia original internamente.
- Se conservan los textos alternativos y las leyendas.
- La siguiente exportación recupera esa referencia si todavía no la reemplazaste o descartaste.
- La publicación queda bloqueada mientras exista una referencia importada pendiente que siga sin resolver.

**Elegir imagen** reemplaza la referencia pendiente por el archivo seleccionado. **Quitar** la descarta intencionalmente. Ninguna de estas acciones elimina el archivo original del disco.

En HTML editorial, una imagen local ausente se sustituye temporalmente por texto de “Imagen pendiente”, manteniendo el resto del bloque. El HTML original se conserva para exportar. Si editás ese contenido enriquecido, se considera que elegiste la nueva redacción y se descarta la referencia pendiente del HTML anterior. Para preparar capturas que agregarás después, es más claro usar bloques `image` y `gallery` que imágenes embebidas en HTML.

Una referencia vacía significa “todavía no elegida”. Las reglas de publicación existentes también exigen archivo y alternativa en bloques de imagen o galería. Vaciar una portada opcional no equivale por sí solo a un error del formato.

## 7. Funciones de cada panel

### Proyecto y temporadas

El engranaje abre presentación general, imagen principal y SEO de la portada. No forman parte del intercambio de una versión. Los botones Temporada/Versión crean borradores; las flechas cambian el orden editorial. Importar una versión no elimina temporadas ni reorganiza el resto de la biblioteca.

### Versión

Administra título, etiqueta, temporada, estado, cobertura, fechas, tipo, resumen, portada y nota de descarga. La cobertura, por ejemplo 2026/27, es un metadato y no cambia el agrupamiento por temporada. Las fechas del JSON son `YYYY-MM-DD`; pueden quedar vacías para un borrador, pero la publicación necesita una fecha válida que no esté en el futuro.

### Publicación

Cada edición tiene título visible, descripción, portada, alternativa y bloques ordenados. Se pueden agregar, editar y ordenar bloques con arrastre o flechas. El intercambio admite texto, listas, instrucciones, advertencias, imágenes, galerías, videos y HTML editorial restringido. Descargas, calificaciones y comentarios siguen ocupando los lugares definidos por las plantillas.

### Descargas

Permite organizar paquetes completos, actualizaciones y complementos; sus partes; mirrors; tamaños textuales; instrucciones; advertencias; compatibilidad y relaciones con otros paquetes. El orden de partes y mirrors se conserva. No se descargan ni verifican por red los archivos referenciados.

Las actualizaciones y complementos publicados necesitan compatibilidad explícita. Una dependencia entre PC y PlayStation se rechaza, salvo que uno de los paquetes pertenezca a una edición compartida. Los ciclos y dependencias inexistentes se rechazan antes de confirmar la importación.

### Tutorial

Admite enlaces HTTPS de YouTube y un segundo de inicio explícito. El tiempo es un entero en segundos, no una cadena `mm:ss`. Una URL vacía y tiempo `null` representan un tutorial pendiente. La opción de mostrarlo en el artículo se conserva.

### SEO e identidades

Los títulos, descripciones e imagen SEO se intercambian. Los datos estructurados calculados no se transportan como instrucciones arbitrarias: el renderizador genera los de una publicación nueva y el reemplazo conserva la estructura local protegida.

El slug identifica una dirección pública y `comments_id` debe coincidir con él. Una importación nueva evita colisiones. Un reemplazo no puede cambiar la dirección, los comentarios ni la plataforma de una edición existente.

### Guardado, respaldos y vista previa

Guardar conserva la fuente editable con respaldo. La vista previa es privada y no publica. Respaldos permite recuperar una copia editable; restaurarla tampoco publica por sí sola. Si el contenido cambia en otra ventana entre revisar y confirmar un JSON, la operación se rechaza y debe revisarse otra vez.

## 8. Errores frecuentes

| Mensaje o situación | Qué hacer |
| --- | --- |
| Formato incompatible | Usar `laqp.spider-patch.version`, versión 1 o 2; no un JSON de Guías ni el archivo interno de la biblioteca. |
| Campo no admitido | Corregir la propiedad conforme a la especificación; no se ignoran campos desconocidos. |
| Cambios sin guardar | Guardar o cancelar la edición antes de importar. Exportar sí admite cambios sin guardar. |
| Dependencia inexistente | Importar primero la versión necesaria o corregir la referencia; no se inventan ni eliminan dependencias automáticamente. |
| Dependencias entre plataformas | Corregir los paquetes a los que apuntan los IDs; una URL parecida no convierte un archivo en compatible. |
| Reemplazo deshabilitado | Leer la razón del resumen. Se puede crear una copia nueva; no se fuerza una sustitución incompatible. |
| Revisión vencida o contenido cambiado | Seleccionar de nuevo el archivo y revisar el resumen actualizado. |
| Imágenes pendientes | Elegir archivos reales o descartar expresamente esas referencias. |
| HTML no admitido | Usar etiquetas editoriales permitidas o bloques estructurados; no incluir scripts, estilos libres ni atributos de eventos. |
| Error al exportar un ajuste desconocido | No se descarta silenciosamente. Revisar compatibilidad del formato antes de compartir. |

## 9. Idiomas de Spider Patch

La sección se publica en español (predeterminado, URLs históricas sin cambios) y en inglés, portugués, árabe e italiano bajo `/en/`, `/pt/`, `/ar/` y `/it/` (por ejemplo `/en/option-files/<slug>/` y `/en/downloads.html`). Cada página tiene selector de idioma, `lang`/`dir`, canonical propio, `hreflang` (incluido `x-default` en español) y entradas en el sitemap. El idioma elegido se recuerda en el navegador. Las redirecciones heredadas `/download/` siguen sólo en español.

Para traducir desde el editor:

1. Escribí el contenido original en español, como siempre.
2. En **Idioma editorial**, elegí otro idioma. Los campos editoriales muestran la traducción y, debajo, el original. En árabe los campos se editan de derecha a izquierda.
3. Editá lo necesario. Cualquier cambio (en español o en ese idioma) deja la traducción como borrador.
4. Presioná **Comprobar y marcar traducción revisada**: falla si falta algún campo. Guardá.
5. Generá la web local. Una traducción en borrador o desactualizada se publica mostrando el artículo español completo con un aviso.

Rutas, archivos, enlaces, imágenes, fechas, estados, calificaciones y comentarios son compartidos entre idiomas. Los textos fijos de la interfaz están en `Herramientas/Recursos/Spider-Patch/idiomas.json`.

**Contraseña de archivos:** en Descargas, el campo **Contraseña para descomprimir (opcional)** de cada paquete. Se muestra igual en todos los idiomas, con botón para copiar. Hoy sólo tienen contraseña los paquetes principales de la V4 2026 (PC y PS4/PS5): `LAqP`.

## 10. Formato, esquema y ejemplo

- [Especificación autónoma de todos los campos](FORMATO_INTERCAMBIO.md).
- [JSON Schema 2020-12](FORMATO_INTERCAMBIO.schema.json).
- [Ejemplo de versión importable](EJEMPLO_VERSION_INTERCAMBIO.json).

El ejemplo es una plantilla de trabajo en borrador, con enlaces e imágenes pendientes. No afirma que exista ese parche, no contiene archivos del juego y no se importa automáticamente.

## 11. Implementación y comprobaciones

| Archivo | Responsabilidad |
| --- | --- |
| `spider_exchange.py` | Parser estricto, contrato editorial, exportación, normalización, conflictos e integración. |
| `administrar.py` | Exportar, revisar y confirmar mediante API local autenticada; caché de revisión y guardado con respaldo. |
| `web/index.html` y `web/admin.js` | Botones, descarga JSON, selección del archivo, resumen y confirmaciones. |
| `model.py` | Conserva la validación existente y bloquea referencias importadas todavía pendientes al publicar. |

Rutas nuevas: `POST /api/export`, `POST /api/import/review` y `POST /api/import/confirm`. Se explican sus cuerpos y efectos en la especificación. Todas requieren el token local, Host permitido y política de Origin existente. No son endpoints públicos de LAqP.website.

Pruebas ejecutadas sobre copias temporales, sin modificar la biblioteca real:

```powershell
python Herramientas/Pruebas/test_spider_exchange.py
python Herramientas/Pruebas/test_spider_patch.py
python Herramientas/Pruebas/test_spider_i18n.py
node Herramientas/Pruebas/spider_exchange.browser.cjs
```

La batería nueva verifica las cinco versiones existentes, todos los bloques, referencias pendientes, dependencias internas/externas, ciclos, plataformas, reemplazo, conservación de identidades, revisiones vencidas, cambios concurrentes, respaldos, límites y entradas maliciosas. Las diez regresiones previas comprueban generación reproducible, paquetes y compatibilidad con los builds Python/Node. La prueba de Edge verifica exportación sin guardar, cancelación, importación nueva, reemplazo confirmado, conservación de la instantánea pública, rechazo de JSON incorrecto y diseño de 390/1600 píxeles.

No se hicieron imports sobre contenido real, cambios de URLs existentes, limpiezas de archivos, commits, push, despliegues ni escrituras en servicios externos. Para ver los botones nuevos, cerrá y volvé a abrir el servidor de Spider Patch y recargá su pestaña; dejar un proceso viejo abierto no carga las nuevas rutas Python.
