# Formato de intercambio editorial Spider Patch — versiones 1 y 2

Esta especificación es autónoma: puede entregarse a ChatGPT o a otra persona para preparar un archivo sin conocer el código del editor. La autoridad de ejecución es `spider_exchange.py`; el esquema JSON complementa sus controles.

## 1. Instrucción sugerida para preparar contenido con ChatGPT

> Prepará un JSON UTF-8 del formato `laqp.spider-patch.version`, `schema_version: 1`, siguiendo esta especificación. Incluí una versión y sus ediciones, bloques y paquetes. Usá únicamente información que yo te haya proporcionado o que esté verificada. No inventes características, compatibilidades, enlaces, tamaños, videos ni pasos de instalación. Dejá vacías las referencias de medios y descargas todavía pendientes. Usá `status: "draft"`. Si hay dependencias, referencialas mediante IDs de paquetes y no como nombres libres. No incluyas HTML ejecutable, datos internos del editor ni código de calificaciones. Entregá un archivo JSON válido, sin comentarios, comas finales o cercos Markdown dentro del archivo.

Para editar una publicación existente, conviene exportarla primero y entregar ese archivo como referencia, indicando qué cambiar. No pedirle al asistente que invente slugs o identidades históricas para reemplazar una versión.

## 2. Envoltorio y límites

```json
{
  "format": "laqp.spider-patch.version",
  "schema_version": 1,
  "season": {"id": "2027", "title": "Temporada 2027"},
  "version": {
    "title": "Borrador de una nueva versión",
    "editions": []
  }
}
```

Es un esqueleto mínimo válido como borrador, no una publicación completa.

| Regla | Valor |
| --- | --- |
| Extensión recomendada | `.json` |
| Codificación | UTF-8 con o sin BOM |
| Tamaño máximo | 5 MiB: 5.242.880 bytes, también después de normalizar valores predeterminados |
| Unidad | Una versión completa con sus ediciones |
| Profundidad JSON | Hasta 20 niveles de objetos/listas |
| Ediciones | Hasta 20 por versión |
| Bloques | Hasta 1.000 en total entre todas las ediciones |
| Paquetes | Hasta 200 en total entre todas las ediciones |
| Imágenes de una galería | Hasta 200 |
| Elementos de lista/pasos | Hasta 2.000 por lista |
| Partes de un paquete | Hasta 500 |
| Mirrors de una parte | Hasta 50 |
| Referencias en requires/install_before | Hasta 200 por lista, sin duplicados |

Se rechazan claves JSON duplicadas, `NaN`, `Infinity`, JSON incompleto, campos desconocidos, caracteres de control no admitidos y cadenas Unicode inválidas. Los textos generales admiten hasta 100.000 caracteres; hay límites menores para títulos, IDs, fechas y URLs. Los valores predeterminados los aplica el importador; JSON Schema no los incorpora automáticamente.

El objeto raíz admite exactamente `format`, `schema_version`, `season` y `version`. No incluir `revision`, `product`, `identities`, `legacy`, rutas de respaldo, código del servidor ni una lista de toda la biblioteca.

## 3. Identificadores, orden y relaciones

Los IDs y slugs tienen hasta 120 caracteres: letras ASCII mayúsculas/minúsculas, números, guiones y guiones bajos. Empiezan con letra o número. Ejemplos sintácticos: `sp-2027-v4`, `edicion-pc`, `paquete-base-pc`.

- Los IDs de temporada, versión, ediciones y paquetes no se pueden repetir dentro del documento.
- Los IDs de bloque son únicos dentro de cada edición.
- Los IDs de parte son únicos dentro de cada paquete.
- Los slugs de las ediciones son únicos dentro del documento.
- `comments_id` siempre debe coincidir con el slug de su edición.
- Todos los órdenes de listas se conservan: ediciones, bloques, paquetes, partes, mirrors y referencias.

Si se omite el ID de versión, se deriva del título. Los IDs omitidos de ediciones, bloques, paquetes y partes se generan. Para construir dependencias entre paquetes conviene declarar sus IDs expresamente. La revisión guarda el documento ya normalizado para que la confirmación no cambie esos IDs arbitrariamente.

## 4. Temporada: objeto season

| Campo | Obligatorio | Tipo y significado |
| --- | --- | --- |
| id | Sí | ID estable de temporada. |
| title | Sí | Texto no vacío de hasta 300 caracteres. |

No admite `status`. Una temporada nueva queda en borrador. Si existe ese ID, se reutiliza sin cambiar título ni estado. Si el título recibido difiere, se avisa y se conserva el local.

## 5. Versión: objeto version

Sólo `title` y `editions` son obligatorios. Los campos omitidos reciben los valores descritos.

| Campo | Tipo / valor predeterminado | Uso |
| --- | --- | --- |
| id | ID; derivado del título | Identidad editorial de la versión. |
| season_id | ID; season.id | Debe coincidir con la temporada del envoltorio. |
| version | Texto; vacío | Etiqueta como V4 o V4.1. Para publicar debe cumplir las reglas del editor, sin espacios o barras. |
| kind | release o addon; release | Lanzamiento del parche o complemento independiente. |
| title | Texto obligatorio no vacío; máximo 300 | Título compartido de la versión. |
| summary | Texto; vacío | Resumen de portada y listados. |
| cover | Referencia de imagen; vacía | Portada general. |
| status | draft, published o hidden; draft | Se exporta el estado existente; al importar siempre se convierte a draft. |
| published_at | YYYY-MM-DD o vacío | Fecha de publicación real. |
| updated_at | YYYY-MM-DD o vacío | Fecha real de actualización. |
| download_note | Texto; vacío | Nota junto a descargas. |
| editions | Lista obligatoria | Ediciones y todo su contenido. Puede estar vacía en un borrador. |
| archive_title | Texto; vacío | Título editorial conservado para listados históricos. |
| date_line | Texto; vacío | Línea editorial adicional de fecha, si la publicación existente la utiliza. |
| home_description | Texto; vacío | Descripción para el inicio. El renderizador admite `{version}` como marcador del título. |
| coverage | Texto; vacío | Cobertura como 2026/27; no cambia la temporada de organización. |

El formato admite fechas vacías y futuras en un borrador, pero una fecha no vacía debe ser real y usar exactamente YYYY-MM-DD. Antes de publicar se aplican los controles adicionales del editor: fecha válida no futura, título/etiqueta, edición disponible y no duplicación de un lanzamiento ya publicado en la temporada.

## 6. Ediciones: version.editions

Cada objeto exige `platform`; los demás campos tienen valores predeterminados.

| Campo | Tipo / predeterminado | Uso |
| --- | --- | --- |
| id | ID generado | Identidad de la edición. |
| slug | ID; id de edición | Segmento de `/option-files/<slug>/`. |
| comments_id | ID; slug | Identidad de comentarios; debe ser exactamente el slug. |
| platform | pc, playstation o all; obligatorio | Plataforma lógica de la edición. |
| platforms | Lista | PC usa `["PC"]`; PlayStation una lista no vacía de PS4/PS5; all permite PC/PS4/PS5. Sin duplicados. |
| status | Estado; draft | Toda edición importada termina en draft. |
| heading | Texto; título de versión | Título visible de la publicación. |
| description | Texto; vacío | Descripción de la edición; necesaria antes de publicar. |
| cover | Imagen; vacía | Portada específica. |
| cover_alt | Texto; vacío | Alternativa de portada. |
| seo | Objeto; vacío | Sólo title, description e image. |
| tutorial | Objeto; valores pendientes | Video principal de instalación. |
| blocks | Lista; vacía | Contenido ordenado del artículo. |
| download_intro | Texto; vacío | Introducción de descargas. |
| downloads | Lista; vacía | Paquetes de esa edición. |

`seo.title` y `seo.description` son textos; `seo.image` sigue las reglas de imágenes. No incluir JSON-LD arbitrario en `schema`.

No se transportan `rating_html`, `schema`, `legacy`, `hub_aliases` ni `auto_slug`. Son integración/datos internos, no contenido libre que deba aceptar un JSON externo. En un reemplazo se conservan los valores locales protegidos de las ediciones coincidentes. En una copia nueva no se duplica código de calificaciones ni aliases históricos. Las URLs importadas no se renombran automáticamente al editar una etiqueta de versión; se administran mediante los controles correspondientes del editor.

## 7. Tutoriales y videos

Tanto `edition.tutorial` como `block.video` admiten:

| Campo | Tipo / predeterminado | Uso |
| --- | --- | --- |
| url | Texto; vacío | URL HTTPS de YouTube reconocida por el editor: watch, youtu.be, embed o shorts. |
| start_seconds | Entero 0–604800 o null; null | Obligatorio como entero cuando hay URL. Cero es un inicio explícito válido. |
| show_in_article | Booleano; true | Mostrar el tutorial según la plantilla. |

No escribir `"04:59"` ni `"299"`: el campo es numérico, por ejemplo `299`. No se deduce automáticamente el tiempo de un parámetro `t` de la URL; `start_seconds` es la fuente explícita. Sin video confirmado usar `url: ""` y `start_seconds: null`.

## 8. Bloques editoriales

Cada bloque exige `type`; admite `id`, `title` y `variant`. `variant` es `normal` o `disclosure`, por defecto `normal`. El último presenta el contenido como un desplegable con su título.

Los bloques no tienen hijos y no forman una jerarquía de secciones como las Guías. Su orden determina el del artículo.

| type | Propiedades específicas admitidas | Comportamiento |
| --- | --- | --- |
| text | html | Texto enriquecido seguro. |
| list | html, items | Lista editorial. Si items tiene elementos, se muestra esa lista en lugar del HTML. |
| instructions | html, items | Pasos ordenados. items no lleva numeración manual. |
| warning | html | Aviso con el estilo de advertencia de Spider Patch. |
| html | html | Contenido editorial restringido conservado por compatibilidad; no HTML ejecutable. |
| image | src, alt, caption, fit | Imagen y leyenda. fit: contain o cover; contain por defecto. |
| gallery | images, columns | Lista de imágenes; 1, 2 o 3 columnas, por defecto 2. |
| video | video, caption | Enlace al video con su configuración de inicio. |

`items` es una lista de textos. Las imágenes de una galería admiten sólo `src`, `alt` y `caption`. Una imagen planificada puede usar src vacío sin inventar una ruta:

```json
{
  "type": "image",
  "title": "Captura pendiente",
  "src": "",
  "alt": "Qué deberá verse en la captura real",
  "caption": "Qué deberá comprobar el lector",
  "fit": "contain"
}
```

El H1 y la estructura general los generan las plantillas: no copiar una página HTML entera en un bloque.

## 9. HTML permitido

Los campos `html` e `instructions` de paquetes admiten el subconjunto que ya usa el editor:

`p`, `ul`, `ol`, `li`, `strong`, `b`, `em`, `i`, `u`, `s`, `a`, `br`, `div`, `span`, `h2`, `h3`, `h4`, `figure`, `img`, `figcaption`, `details`, `summary`, `section`, `article`, `blockquote`, `hr`.

Atributos permitidos: `class`, `id`, `href`, `src`, `alt`, `title`, `width`, `height`, `loading`, `target`, `rel`, `open`, `aria-hidden`, `aria-label`. Las clases sólo admiten letras ASCII, números, guiones, guiones bajos y espacios. Los enlaces con target `_blank` reciben rel `noopener noreferrer`.

Se rechazan scripts, iframes, estilos libres, atributos `on...`, atributos ajenos al contrato, comentarios y declaraciones HTML. Los enlaces son HTTP/HTTPS sin credenciales o rutas internas desde `/`/anclas. Las imágenes son locales según las reglas siguientes. No se descarga ningún recurso para validarlo.

No incluir el widget de calificaciones, código de comentarios, scripts de anuncios, navegación ni CSS del sitio. Esas integraciones pertenecen al editor y a las plantillas locales.

## 10. Imágenes: rutas y pendientes

Se admiten PNG, JPEG/JPG, WebP, GIF y AVIF en `/assets/` o `/img/`. Las referencias no llevan parámetros ni fragmentos. Un HTTPS del propio `laqp.website` en un campo de imagen se normaliza a una ruta local; no se admiten servidores remotos arbitrarios. En HTML usar directamente una ruta local.

Se rechazan rutas absolutas de Windows, barras invertidas, esquemas ejecutables, credenciales, traversal `..` —también codificado— y referencias que intenten escapar del proyecto. Un archivo JSON no puede adjuntar binarios ni Base64 como imagen.

Si el archivo no está disponible localmente, el importador conserva la referencia internamente y deja el campo pendiente. No la pierde silenciosamente. Exportar vuelve a incluir la referencia original si no fue reemplazada o descartada. Los archivos cargados en la biblioteca privada de Spider Patch se reconocen por su ruta pública prevista; sólo se copian al sitio cuando corresponde generar una publicación que los usa.

La publicación de una referencia importada todavía pendiente se bloquea. Elegir otra imagen resuelve la referencia; Quitar la descarta intencionalmente sin borrar archivos del disco.

Para imágenes embebidas en HTML se conserva el HTML original y se muestra un texto temporal en lugar de la imagen ausente. Editar el contenido enriquecido adopta la nueva redacción y descarta ese pendiente anterior. Preferí bloques estructurados de imagen/galería para capturas planificadas.

Los campos internos `pending_*` no se escriben en el JSON de intercambio: los gestiona el editor.

## 11. Paquetes: edition.downloads

| Campo | Tipo / predeterminado | Uso |
| --- | --- | --- |
| id | ID generado | Referencia estable para dependencias. |
| name | Texto; vacío | Nombre editorial del paquete. |
| kind | complete, update o addon; complete | Principal, actualización o complemento. |
| status | Estado; draft | Siempre draft al importar. |
| compatibility | Texto; vacío | Requisitos reales de versión/base. Obligatorio al publicar updates/addons. |
| description | Texto opcional | Metadato editorial conservado cuando existe. |
| requires | Lista de IDs; vacía | Paquetes necesarios como requisito. |
| install_before | Lista de IDs; vacía | Relaciones de orden de instalación. No se transforma su sentido ni su orden. |
| instructions | HTML seguro; vacío | Instrucciones específicas. |
| warnings | Texto; vacío | Advertencias, no código. |
| image | Imagen; vacía | Imagen del paquete. |
| files | Lista; vacía | Partes obligatorias. |

Una edición de lanzamiento publicada necesita un paquete completo publicado con archivos. Una actualización o complemento debe declarar compatibilidad. El importador no inventa una cadena de instalación a partir del nombre de un enlace.

## 12. Partes y mirrors

Cada objeto de `files` admite:

| Campo | Tipo / predeterminado | Uso |
| --- | --- | --- |
| id | ID generado | Único dentro del paquete. |
| name | Texto; vacío | Nombre visible, por ejemplo Parte 1 si ese dato está confirmado. |
| url | HTTP/HTTPS o vacío | Enlace del archivo; vacío representa pendiente en borrador. |
| size | Texto; vacío | Tamaño informado por el autor; no se calcula ni verifica por red. |
| mirrors | Lista; vacía | Alternativas para esa parte. |

Cada mirror admite sólo `name` y `url`, ambos textos y vacíos por defecto. Las URLs no pueden contener usuario/contraseña ni esquemas como javascript, data o file. No se comprueba si un host de descargas sigue disponible, si el archivo pesa lo indicado o si el binario es compatible: esa verificación editorial sigue siendo responsabilidad de quien publica.

No confundir arrays de partes con mirrors. El formato conserva exactamente el orden recibido y no fusiona archivos por parecido de nombre o URL.

## 13. Dependencias y compatibilidad

Las referencias deben apuntar a IDs de paquetes, dentro de la versión o ya existentes en la biblioteca receptora. Una dependencia externa ausente se rechaza antes de confirmar; primero hay que importar la publicación necesaria o corregir el archivo.

Las referencias internas se remapean cuando una copia nueva necesita IDs distintos. Si un ID pertenece a un paquete del propio documento, se interpreta como referencia interna; elegí IDs inequívocos si también existe otro paquete con ese nombre en la biblioteca.

Se rechazan ciclos, referencias inexistentes y mezclas PC/PlayStation salvo la compatibilidad con una edición compartida (`all`). Al publicar, una descarga no puede depender de un paquete que siga siendo borrador o no esté publicado a través de su temporada/versión/edición.

La validez de referencias no prueba compatibilidad técnica del contenido descargable. Un texto de compatibility no se convierte en comprobación del juego ni de los RAR/CPK.

## 14. Nueva versión y reemplazo

**Nueva versión:** conserva toda la biblioteca anterior. Si un ID global o slug colisiona, se genera otro. No se reutilizan URLs históricas reservadas. Los archivos de calificaciones y aliases locales no se copian a la nueva publicación. Una temporada existente conserva nombre y estado.

**Reemplazo:** requiere conflicto por ID de versión, misma temporada y confirmación adicional. Deben venir todas las ediciones anteriores, conservando ID, slug, comments_id y platform. Una edición nueva no puede usar una identidad o URL de otra publicación. Las dependencias externas deben seguir siendo válidas si se sustituyen paquetes.

El reemplazo conserva los campos internos de integración de las ediciones coincidentes y la tabla completa de identidades históricas. Reemplaza contenido editorial, no es un merge automático de párrafos o paquetes. Se guarda respaldo antes de escribir.

Siempre quedan en borrador versión, ediciones y paquetes importados. Las publicaciones existentes no se regeneran durante la importación. Si se reemplazó una versión publicada y luego se genera sin reactivarla, quedará fuera de esa generación.

## 15. Qué se excluye deliberadamente

No se intercambian producto completo, todas las temporadas/versiones, revision del servidor, identities, archivo legacy original, calificaciones ejecutables, aliases históricos, JSON-LD arbitrario, rutas internas de respaldos, configuración, contraseñas ni claves.

No se adjuntan imágenes, parches, videos o archivos comprimidos. El intercambio no es un respaldo integral ni una herramienta de publicación en GitHub. No ejecuta comandos, SQL, código del archivo ni instrucciones escritas dentro del contenido.

## 16. API local para herramientas y pruebas

Todas las operaciones son POST JSON, con `X-Spider-Token`, Host local permitido y Origin aceptado por el servidor. No son endpoints de la web pública.

| Ruta | Cuerpo | Resultado / efecto |
| --- | --- | --- |
| `/api/export` | `{ "version": objetoActual, "season": objetoTemporada }` | filename y content JSON. No guarda ni cambia revisión. La API proyecta sólo campos editoriales permitidos. |
| `/api/import/review` | `{ "raw": "texto JSON", "revision": enteroActual }` | review_id, resumen y conflictos. No escribe la fuente. |
| `/api/import/confirm` | `{ "review_id": "...", "mode": "new" }` | Guarda versión nueva como borrador con respaldo; devuelve model, selected, warnings y message. |
| `/api/import/confirm` | Igual, con `mode: "replace"` y `confirm_replace: true` | Reemplaza únicamente la versión compatible revisada. |

El navegador evita importar con cambios sin guardar. La revisión caduca a los 900 segundos, se consume al confirmar y se invalida si cambió la revisión de la biblioteca. No se puede modificar el JSON después de revisar y confirmarlo bajo el mismo review_id: el servidor conserva el documento revisado, no confía en un segundo payload editorial.

## 17. Esquema 2: traducciones y contraseña

`schema_version: 2` es el formato que produce **Exportar versión**. Es el esquema 1 más tres extensiones opcionales; un archivo `schema_version: 1` se sigue importando igual, sin pérdida de datos, y queda sólo en español hasta que se traduzca.

- `translations`: en cualquier objeto editorial (temporada, versión, edición, `seo`, bloque, imagen de galería, paquete, parte o mirror). Claves de idioma admitidas: `en`, `pt`, `ar`, `it`. Cada idioma contiene únicamente campos editoriales que ya existen en el original en español: `title`, `summary`, `download_note`, `home_description`, `heading`, `description`, `cover_alt`, `download_intro`, `name`, `compatibility`, `instructions`, `warnings`, `alt`, `caption`, `html`, `tagline`, `archive_title`, `items`. `items` debe ser una lista de textos. Nunca se traducen IDs, slugs, `comments_id`, URLs, nombres de archivo en enlaces, fechas, estados ni plataformas. El HTML traducido pasa por la misma validación que el original.
- `translation_state` (sólo en `version`): `{"en": {"status": "complete", "source_hash": "…"}}`. `complete` significa «revisada» y sólo vale mientras el texto español no cambie (`source_hash`). Si falta, es `draft` o el español cambió, la web muestra el artículo completo en español con un aviso, nunca una mezcla.
- `password` (en `download` o `edition`): texto exacto para descomprimir, idéntico en todos los idiomas. Se muestra en un recuadro con botón de copiar junto al paquete correspondiente. No se hereda a otros paquetes ni versiones.

Una versión sigue siendo **una sola publicación**: las traducciones viajan dentro del mismo objeto, no como cinco versiones separadas.

## 18. Esquema y ejemplo de referencia

[FORMATO_INTERCAMBIO.schema.json](FORMATO_INTERCAMBIO.schema.json) utiliza JSON Schema 2020-12 y el identificador `urn:laqp:spider-patch:version:1`. El identificador no corresponde a una página publicada ni provoca una descarga.

Un validador JSON Schema puede comprobar forma, tipos y parte de los límites. No sustituye las validaciones de seguridad HTML/URL, IDs globales, fechas reales, existencia de medios, dependencias, ciclos, plataformas o conflictos del importador Python. No se agregó una dependencia JSON Schema al editor.

[EJEMPLO_VERSION_INTERCAMBIO.json](EJEMPLO_VERSION_INTERCAMBIO.json) muestra una edición PC, bloques, paquete principal y complemento con dependencia interna. Las imágenes y URLs están pendientes para no inventar recursos. Se valida como borrador, no como publicación terminada. No se importa automáticamente en ninguna biblioteca.
