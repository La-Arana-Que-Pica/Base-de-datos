"""Versioned, reference-only Spider Patch interchange. No publication or network IO."""
import copy
import json
import re
import unicodedata
import uuid
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlsplit

from model import ContentError, safe_id, clean_html, video_url, image_path, validate
from dom import parse as parse_html, Node

FORMAT = 'laqp.spider-patch.version'
VERSION = 2
MAX_BYTES = 5 * 1024 * 1024
VERSION_FIELDS = set('id season_id version kind title summary cover status published_at updated_at download_note editions archive_title date_line home_description coverage'.split())
EDITION_FIELDS = set('id slug comments_id platform platforms status heading description cover cover_alt seo tutorial blocks download_intro downloads'.split())
DOWNLOAD_FIELDS = set('id name kind status compatibility description requires install_before instructions warnings image files'.split())
BLOCK_FIELDS = {
    'text': {'html'}, 'list': {'html', 'items'}, 'instructions': {'html', 'items'},
    'warning': {'html'}, 'html': {'html'}, 'image': {'src', 'alt', 'caption', 'fit'},
    'gallery': {'images', 'columns'}, 'video': {'video', 'caption'},
}
EDITOR_ONLY = {'schema', 'rating_html', 'hub_aliases', 'legacy', 'auto_slug'}


def fail(message):
    raise ContentError(message)


def obj(value, fields, label):
    if not isinstance(value, dict):
        fail(label + ': se esperaba un objeto.')
    extra = set(value) - fields
    if extra:
        fail(label + ': campo no admitido «' + str(sorted(extra)[0])[:80] + '».')
    return value


def text(value, label, limit=100000):
    if not isinstance(value, str) or len(value) > limit or any((ord(c) < 32 and c not in '\n\r\t') or 0xD800 <= ord(c) <= 0xDFFF for c in value):
        fail(label + ': texto inválido o demasiado largo.')
    return value


def seq(value, label, limit=200):
    if not isinstance(value, list) or len(value) > limit:
        fail(label + ': lista inválida o demasiado extensa.')
    return value


def choice(value, values, label):
    if not isinstance(value, str) or value not in values:
        fail(label + ': opción no admitida.')


def identifier(value, label):
    if not safe_id(value):
        fail(label + ': usá hasta 120 letras ASCII, números, guiones o guiones bajos; empezá con letra o número.')
    return value


def uid(prefix):
    return prefix + '-' + uuid.uuid4().hex[:16]


def slug(value):
    return re.sub('[^a-z0-9]+', '-', unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()).strip('-')[:90] or 'spider-patch'


def link(value, label, internal=False):
    text(value, label, 4000)
    if not value:
        return value
    if any(ord(c) < 32 for c in value) or '\\' in value:
        fail(label + ': dirección no permitida.')
    try:
        u = urlsplit(value)
        if u.scheme or u.netloc:
            if u.scheme not in {'http', 'https'} or not u.hostname or u.username or u.password or any(c.isspace() for c in u.netloc):
                fail(label + ': usá una URL HTTP/HTTPS sin credenciales.')
            u.port
        elif not internal or not (value.startswith('/') and not value.startswith('//') or value.startswith('#')):
            fail(label + ': dirección no permitida.')
        decoded = u.path
        for _ in range(4):
            decoded = unquote(decoded)
        if '\\' in decoded or any(ord(c) < 32 for c in decoded) or any(p in {'.', '..'} for p in decoded.split('/')):
            fail(label + ': ruta no permitida.')
    except ValueError as exc:
        if isinstance(exc, ContentError):
            raise
        fail(label + ': dirección inválida.')
    return value


def image_ref(value, label):
    text(value, label, 4000)
    if not value:
        return value
    # Existing SEO stores same-site absolute URLs; canonicalize these to local references.
    try:
        u = urlsplit(value)
    except ValueError:
        fail(label + ': dirección de imagen inválida.')
    if u.scheme or u.netloc:
        if u.scheme != 'https' or u.netloc != 'laqp.website':
            fail(label + ': usá una imagen local, no una URL remota.')
        if u.query or u.fragment:
            fail(label + ': la imagen no admite parámetros ni fragmentos.')
        value = u.path
    for _ in range(4):
        value = unquote(value)
    link(value, label, internal=True)
    if not value.startswith(('/assets/', '/img/')) or urlsplit(value).query or urlsplit(value).fragment:
        fail(label + ': la imagen debe estar en /assets/ o /img/, sin parámetros.')
    if Path(value).suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'}:
        fail(label + ': tipo de imagen no permitido.')
    return value


def html(value, label):
    text(value, label)
    # The existing renderer is the authority for tags. Reject free attributes rather than lose them silently.
    doc = parse_html(value)
    for node in doc.walk():
        if node.raw is not None:
            if node.raw.startswith(('<!--', '<!')):
                fail(label + ': no se admiten comentarios ni declaraciones HTML.')
            continue
        allowed = {'class', 'id', 'href', 'src', 'alt', 'title', 'width', 'height', 'loading', 'target', 'rel', 'open', 'aria-hidden', 'aria-label'}
        if set(node.attrs) - allowed:
            fail(label + ': atributo HTML no admitido.')
        for key in ('href', 'src'):
            if key in node.attrs:
                link(node.attrs[key], label, internal=True)
                if key == 'src':
                    image_ref(node.attrs[key], label)
    return clean_html(value)


def video(value, label):
    obj(value, {'url', 'start_seconds', 'show_in_article'}, label)
    result = {'url': '', 'start_seconds': None, 'show_in_article': True, **value}
    link(result['url'], label)
    if type(result['show_in_article']) is not bool:
        fail(label + ': show_in_article debe ser booleano.')
    seconds = result['start_seconds']
    if seconds is not None and (type(seconds) is not int or not 0 <= seconds <= 604800):
        fail(label + ': segundo de inicio inválido.')
    if result['url']:
        video_url(result)
    return result


def parse(raw):
    if isinstance(raw, str):
        try:
            raw = raw.encode('utf-8')
        except UnicodeError:
            fail('El archivo debe usar caracteres Unicode válidos.')
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_BYTES:
        fail('El JSON debe pesar como máximo 5 MiB.')
    try:
        source = raw.decode('utf-8-sig')
    except UnicodeError:
        fail('El archivo debe estar codificado en UTF-8.')
    depth = 0
    quoted = escaped = False
    for char in source:
        if quoted:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in '[{':
            depth += 1
            if depth > 20:
                fail('El JSON supera 20 niveles de profundidad.')
        elif char in ']}':
            depth -= 1

    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                fail('Campo JSON duplicado: ' + key[:80])
            result[key] = value
        return result
    try:
        document = json.loads(source, object_pairs_hook=pairs, parse_constant=lambda value: fail('Número JSON no válido.'))
    except ContentError:
        raise
    except (ValueError, RecursionError):
        fail('JSON inválido: revisá comillas, comas y llaves.')
    return validate_document(document)


def _validate_v1(document):
    obj(document, {'format', 'schema_version', 'season', 'version'}, 'Archivo')
    if document.get('format') != FORMAT or type(document.get('schema_version')) is not int or document['schema_version'] != 1:
        fail('Se necesita el formato laqp.spider-patch.version, schema_version 1.')
    result = copy.deepcopy(document)
    season = obj(result.get('season'), {'id', 'title'}, 'Temporada')
    identifier(season.get('id'), 'ID de temporada')
    if not text(season.get('title'), 'Título de temporada', 300).strip():
        fail('La temporada necesita un título.')
    v = obj(result.get('version'), VERSION_FIELDS, 'Versión')
    if not text(v.get('title'), 'Título de versión', 300).strip():
        fail('La versión necesita un título.')
    if 'editions' not in v:
        fail('La versión necesita la lista editions (puede estar vacía).')
    defaults = {'id': slug(v['title']), 'season_id': season['id'], 'version': '', 'kind': 'release', 'status': 'draft', 'summary': '', 'cover': '', 'published_at': '', 'updated_at': '', 'download_note': '', 'archive_title': '', 'date_line': '', 'home_description': '', 'coverage': ''}
    for key, value in defaults.items():
        v.setdefault(key, value)
    if v['season_id'] != season['id']:
        fail('version.season_id debe coincidir con season.id.')
    ids = {season['id']}
    blocks_total = downloads_total = 0

    def ident(holder, prefix):
        holder.setdefault('id', uid(prefix))
        key = identifier(holder['id'], 'ID de ' + prefix)
        if key in ids:
            fail('ID repetido entre temporada, versión, ediciones o paquetes: ' + key)
        ids.add(key)

    def strings(holder, keys, label, html_keys=()):
        for key in keys:
            if key in holder:
                holder[key] = html(holder[key], label + '/' + key) if key in html_keys else text(holder[key], label + '/' + key)

    def status(holder):
        holder.setdefault('status', 'draft')
        choice(holder['status'], {'draft', 'published', 'hidden'}, 'Estado')

    ident(v, 'version')
    strings(v, VERSION_FIELDS - {'editions'}, 'Versión')
    choice(v['kind'], {'release', 'addon'}, 'Tipo de versión')
    status(v)
    v['cover'] = image_ref(v['cover'], 'Portada de versión')
    for key in ('published_at', 'updated_at'):
        value = text(v[key], key, 10)
        if value:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                fail(key + ': usá YYYY-MM-DD o vacío.')
            try:
                date.fromisoformat(value)
            except ValueError:
                fail(key + ': fecha inexistente.')
    slugs = set()
    for e in seq(v['editions'], 'Ediciones', 20):
        obj(e, EDITION_FIELDS, 'Edición')
        ident(e, 'edition')
        choice(e.get('platform'), {'pc', 'playstation', 'all'}, 'Plataforma de edición')
        for key, value in {'slug': e['id'], 'comments_id': e.get('slug', e['id']), 'platforms': {'pc': ['PC'], 'playstation': ['PS4', 'PS5'], 'all': ['PC', 'PS4', 'PS5']}[e['platform']], 'heading': v['title'], 'description': '', 'cover': '', 'cover_alt': '', 'seo': {}, 'tutorial': {}, 'blocks': [], 'download_intro': '', 'downloads': []}.items():
            e.setdefault(key, copy.deepcopy(value))
        strings(e, {'slug', 'comments_id', 'heading', 'description', 'cover_alt', 'download_intro'}, 'Edición')
        identifier(e['slug'], 'Slug')
        if e['slug'] in slugs or e['comments_id'] != e['slug']:
            fail('Slug duplicado o comments_id distinto del slug.')
        slugs.add(e['slug'])
        status(e)
        platforms = seq(e['platforms'], 'Plataformas', 3)
        if any(not isinstance(x, str) or x not in {'PC', 'PS4', 'PS5'} for x in platforms) or len(set(platforms)) != len(platforms):
            fail('Lista de plataformas inválida.')
        expected = {'pc': {'PC'}, 'playstation': {'PS4', 'PS5'}, 'all': {'PC', 'PS4', 'PS5'}}[e['platform']]
        if not platforms or not set(platforms) <= expected:
            fail('La lista platforms no corresponde a platform.')
        e['cover'] = image_ref(e['cover'], 'Portada de edición')
        obj(e['seo'], {'title', 'description', 'image'}, 'SEO')
        strings(e['seo'], {'title', 'description'}, 'SEO')
        if 'image' in e['seo']:
            e['seo']['image'] = image_ref(e['seo']['image'], 'Imagen SEO')
        e['tutorial'] = video(e['tutorial'], 'Tutorial')
        block_ids = set()
        for b in seq(e['blocks'], 'Bloques', 1000):
            blocks_total += 1
            if blocks_total > 1000:
                fail('Máximo 1000 bloques en toda la versión.')
            if not isinstance(b, dict) or not isinstance(b.get('type'), str) or b.get('type') not in BLOCK_FIELDS:
                fail('Tipo de bloque no admitido.')
            obj(b, {'id', 'type', 'title', 'variant'} | BLOCK_FIELDS[b['type']], 'Bloque')
            b.setdefault('id', uid('block'))
            identifier(b['id'], 'ID de bloque')
            if b['id'] in block_ids:
                fail('ID de bloque repetido en la edición.')
            block_ids.add(b['id'])
            b.setdefault('title', '')
            b.setdefault('variant', 'normal')
            choice(b['variant'], {'normal', 'disclosure'}, 'Presentación del bloque')
            strings(b, {'title', 'alt', 'caption'}, 'Bloque')
            if 'html' in b:
                b['html'] = html(b['html'], 'HTML del bloque')
            if 'items' in b:
                for item in seq(b['items'], 'Elementos', 2000):
                    text(item, 'Elemento')
            if b['type'] in {'text', 'warning', 'html'}:
                b.setdefault('html', '')
            if b['type'] == 'image':
                b['src'] = image_ref(b.get('src', ''), 'Imagen del bloque')
                choice(b.get('fit', 'contain'), {'contain', 'cover'}, 'Ajuste de imagen')
            if b['type'] == 'gallery':
                if type(b.get('columns', 2)) is not int or b.get('columns', 2) not in {1, 2, 3}:
                    fail('La galería admite 1, 2 o 3 columnas.')
                for image in seq(b.setdefault('images', []), 'Galería', 200):
                    obj(image, {'src', 'alt', 'caption'}, 'Imagen de galería')
                    strings(image, {'alt', 'caption'}, 'Galería')
                    image['src'] = image_ref(image.get('src', ''), 'Imagen de galería')
            if b['type'] == 'video':
                b['video'] = video(b.get('video', {}), 'Video del bloque')
        for d in seq(e['downloads'], 'Paquetes', 200):
            downloads_total += 1
            if downloads_total > 200:
                fail('Máximo 200 paquetes en toda la versión.')
            obj(d, DOWNLOAD_FIELDS, 'Paquete')
            ident(d, 'package')
            for key, value in {'name': '', 'kind': 'complete', 'compatibility': '', 'requires': [], 'install_before': [], 'instructions': '', 'warnings': '', 'image': '', 'files': []}.items():
                d.setdefault(key, copy.deepcopy(value))
            status(d)
            strings(d, {'name', 'compatibility', 'description', 'warnings'}, 'Paquete')
            d['instructions'] = html(d['instructions'], 'Instrucciones de paquete')
            choice(d['kind'], {'complete', 'update', 'addon'}, 'Tipo de paquete')
            d['image'] = image_ref(d['image'], 'Imagen de paquete')
            for key in ('requires', 'install_before'):
                refs = seq(d[key], key)
                for ref in refs:
                    identifier(ref, key)
                if len(set(refs)) != len(refs):
                    fail('Dependencia repetida.')
            file_ids = set()
            for f in seq(d['files'], 'Partes', 500):
                obj(f, {'id', 'name', 'url', 'size', 'mirrors'}, 'Archivo')
                f.setdefault('id', uid('file'))
                identifier(f['id'], 'ID de archivo')
                if f['id'] in file_ids:
                    fail('ID de archivo repetido en el paquete.')
                file_ids.add(f['id'])
                for key in ('name', 'url', 'size'):
                    f.setdefault(key, '')
                    text(f[key], 'Archivo/' + key)
                link(f['url'], 'Descarga')
                for mirror in seq(f.setdefault('mirrors', []), 'Mirrors', 50):
                    obj(mirror, {'name', 'url'}, 'Mirror')
                    mirror.setdefault('name', '')
                    mirror.setdefault('url', '')
                    text(mirror['name'], 'Nombre del mirror')
                    link(mirror['url'], 'Mirror')
    if len(json.dumps(result, ensure_ascii=False, indent=2).encode('utf-8')) > MAX_BYTES:
        fail('La versión normalizada supera 5 MiB; reducí el contenido antes de importar.')
    return result


def validate_document(document):
    from multilingual import extend_document
    try:return extend_document(document, _validate_v1, html)
    except ValueError as ex:fail(str(ex))


def export_version(version, season):
    """Explicit editorial projection; never export rating code, ledger or library state."""
    v = copy.deepcopy(version)

    def project(holder, fields, ignored=()):
        fields = fields | {'translations', 'translation_state', 'password', 'show_details'}
        extra = set(holder) - fields - set(ignored) - {'pending_' + k for k in ('cover', 'image', 'src', 'html', 'html_rendered', 'instructions', 'instructions_rendered')}
        if extra:
            fail('Ajuste todavía no intercambiable: ' + sorted(extra)[0])
        result = {k: copy.deepcopy(val) for k, val in holder.items() if k in fields}
        for key in ('cover', 'image', 'src'):
            if key in fields and not result.get(key) and holder.get('pending_' + key):
                result[key] = holder['pending_' + key]
        for key in ('html', 'instructions'):
            if key in fields and holder.get('pending_' + key) and holder.get(key) == holder.get('pending_' + key + '_rendered'):
                result[key] = holder['pending_' + key]
        return result

    out = project(v, VERSION_FIELDS)
    for e, target in zip(v.get('editions', []), out.get('editions', [])):
        target.clear()
        target.update(project(e, EDITION_FIELDS, EDITOR_ONLY))
        target['seo'] = project(e.get('seo', {}), {'title', 'description', 'image'})
        target['blocks'] = [project(b, {'id', 'type', 'title', 'variant'} | BLOCK_FIELDS[b['type']]) for b in e.get('blocks', [])]
        for b, source in zip(target['blocks'], e.get('blocks', [])):
            if b['type'] == 'gallery':
                b['images'] = [project(i, {'src', 'alt', 'caption'}) for i in source.get('images', [])]
        target['downloads'] = [project(d, DOWNLOAD_FIELDS) for d in e.get('downloads', [])]
    document = validate_document({'format': FORMAT, 'schema_version': VERSION, 'season': {k: season[k] for k in ('id', 'title', 'translations') if k in season}, 'version': out})
    content = json.dumps(document, ensure_ascii=False, indent=2) + '\n'
    if len(content.encode('utf-8')) > MAX_BYTES:
        fail('La versión supera 5 MiB; reducí el contenido o dividí la publicación.')
    return content


def normalized(document, root):
    v = copy.deepcopy(document['version'])
    warnings = []

    def ref(holder, key):
        value = holder.get(key, '')
        if not value:
            return
        try:
            image_path(value, root, exists=True)
        except ContentError:
            holder['pending_' + key] = value
            holder[key] = ''
            warnings.append('Imagen pendiente: ' + value)

    def inline(holder, key):
        if not holder.get(key):
            return
        doc = parse_html(holder[key])
        changed = False
        for node in list(doc.all(tag='img')):
            value = node.attrs.get('src', '')
            try:
                image_path(image_ref(value, 'Imagen HTML'), root, exists=True)
            except ContentError:
                replacement = Node('span', {'class': 'sp-media-pending'})
                replacement.text_set('Imagen pendiente: ' + (node.attrs.get('alt') or value))
                node.replace(replacement)
                changed = True
                warnings.append('Imagen HTML pendiente: ' + value)
        if changed:
            holder['pending_' + key] = holder[key]
            holder[key] = doc.render()
            holder['pending_' + key + '_rendered'] = holder[key]

    v['status'] = 'draft'
    ref(v, 'cover')
    for e in v['editions']:
        e['status'] = 'draft'
        e['rating_html'] = ''
        e['hub_aliases'] = []
        e['auto_slug'] = False
        ref(e, 'cover')
        ref(e['seo'], 'image')
        for b in e['blocks']:
            ref(b, 'src')
            inline(b, 'html')
            for image in b.get('images', []):
                ref(image, 'src')
        for d in e['downloads']:
            d['status'] = 'draft'
            ref(d, 'image')
            inline(d, 'instructions')
    return v, warnings


def integrate(document, model, root, mode='new', target=None):
    document = validate_document(document)
    result = copy.deepcopy(model)
    v, warnings = normalized(document, root)
    season = next((s for s in result['seasons'] if s['id'] == document['season']['id']), None)
    if season is None:
        season = {**document['season'], 'status': 'draft'}
        result['seasons'].append(season)
    elif season['title'] != document['season']['title']:
        warnings.append('Se conserva el nombre de la temporada existente: ' + season['title'])
    used = {s['id'] for s in result['seasons']} | set(result.get('identities', {}))
    used_slugs = {x['slug'] for x in result.get('identities', {}).values()}
    for old in result['versions']:
        used.add(old['id'])
        for e in old['editions']:
            used.add(e['id'])
            used_slugs.add(e['slug'])
            used.update(d['id'] for d in e['downloads'])
    old = next((x for x in result['versions'] if x['id'] == target), None) if mode == 'replace' else None
    mapping = {}
    if mode == 'new':
        for holder, prefix in [(v, 'version')] + [(e, 'edition') for e in v['editions']] + [(d, 'package') for e in v['editions'] for d in e['downloads']]:
            previous = holder['id']
            if previous in used:
                holder['id'] = uid(prefix)
            used.add(holder['id'])
            mapping[previous] = holder['id']
        for e in v['editions']:
            if e['slug'] in used_slugs:
                e['slug'] = slug(e['slug']) + '-' + uuid.uuid4().hex[:10]
            used_slugs.add(e['slug'])
            e['comments_id'] = e['slug']
        result['versions'].insert(0, v)
    elif mode == 'replace':
        if not old or v['id'] != old['id'] or old['season_id'] != v['season_id']:
            fail('El reemplazo requiere la misma versión y temporada en conflicto.')
        incoming = {e['id']: e for e in v['editions']}
        previous_ids = {e['id'] for e in old['editions']}
        for e in v['editions']:
            if e['id'] not in previous_ids and (e['id'] in used or e['slug'] in used_slugs):
                fail('La nueva edición intenta reutilizar una identidad o URL reservada por otra publicación.')
        for existing in old['editions']:
            e = incoming.get(existing['id'])
            if not e:
                fail('El reemplazo no puede omitir una edición existente: ' + existing['id'])
            if e['slug'] != existing['slug'] or e['comments_id'] != existing['comments_id'] or e['platform'] != existing['platform']:
                fail('No se puede cambiar la URL, identidad de comentarios o plataforma de una edición existente.')
            for field in EDITOR_ONLY:
                if field in existing:
                    e[field] = copy.deepcopy(existing[field])
        result['versions'][result['versions'].index(old)] = v
    else:
        fail('Elegí importar como nueva versión o reemplazar la versión en conflicto.')
    for e in v['editions']:
        for d in e['downloads']:
            for key in ('requires', 'install_before'):
                d[key] = [mapping.get(ref, ref) for ref in d[key]]
    validate(result, root, previous=model)
    return result, v['id'], warnings


def review(raw, model, root):
    document = parse(raw)
    candidate = document['version']['id']
    existing = next((v for v in model['versions'] if v['id'] == candidate), None)
    # Validate the complete integration, including dependencies, before presenting a confirmable plan.
    _, _, warnings = integrate(document, model, root)
    v = document['version']
    packages = [d for e in v['editions'] for d in e['downloads']]
    internal = {d['id'] for d in packages}
    occupied_ids = {s['id'] for s in model['seasons']} | set(model.get('identities', {}))
    occupied_slugs = {x['slug'] for x in model.get('identities', {}).values()}
    for previous in model['versions']:
        occupied_ids.add(previous['id'])
        for edition in previous['editions']:
            occupied_ids.add(edition['id'])
            occupied_slugs.add(edition['slug'])
            occupied_ids.update(d['id'] for d in edition['downloads'])
    conflicting_ids = sorted(({v['id']} | {e['id'] for e in v['editions']} | internal) & occupied_ids)
    conflicting_slugs = sorted({e['slug'] for e in v['editions']} & occupied_slugs)
    external = sorted({ref for d in packages for key in ('requires', 'install_before') for ref in d[key] if ref not in internal})
    replace_error = ''
    if existing:
        try:
            integrate(document, model, root, 'replace', existing['id'])
        except ContentError as exc:
            replace_error = str(exc)
    summary = {'title': v['title'], 'season': document['season']['title'], 'candidate_id': candidate, 'editions': len(v['editions']), 'blocks': sum(len(e['blocks']) for e in v['editions']), 'packages': len(packages), 'files': sum(len(d['files']) for d in packages), 'mirrors': sum(len(f['mirrors']) for d in packages for f in d['files']), 'external_dependencies': external, 'warnings': warnings[:100], 'warning_count': len(warnings), 'existing_id': existing['id'] if existing else None, 'existing_title': existing['title'] if existing else None, 'replace_allowed': bool(existing and not replace_error), 'replace_error': replace_error}
    summary.update(conflicting_ids=conflicting_ids, conflicting_slugs=conflicting_slugs)
    return document, summary
