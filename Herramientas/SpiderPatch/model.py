"""Spider Patch content, import, validation and recoverable local storage."""
from pathlib import Path
from datetime import datetime, date, timezone
from urllib.parse import urlsplit, parse_qs
from html import escape
import copy, csv, hashlib, json, os, re, shutil, uuid
from dom import parse, Node

ROOT=Path(__file__).resolve().parents[2]
SCHEMA=1
STATUSES={'draft','published','hidden'}
BLOCKS={'text','list','instructions','warning','image','gallery','video','html'}
class ContentError(ValueError): pass

def paths(root=ROOT):
    base=Path(root)/'Herramientas/Recursos/Spider-Patch'
    return base/'contenido.json',base/'publicado.json'
def read(path): return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def stamp(): return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
def backup_root(root=ROOT):return Path(root)/'Herramientas/Salidas/Spider-Patch/respaldos'
def atomic(path, data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        with tmp.open('wb' if isinstance(data,bytes) else 'w',encoding=None if isinstance(data,bytes) else 'utf-8',newline=None if isinstance(data,bytes) else '\n') as stream:
            stream.write(data);stream.flush();os.fsync(stream.fileno())
        os.replace(tmp,path)
    finally:
        if tmp.exists():tmp.unlink()
def json_text(model):return json.dumps(model,ensure_ascii=False,indent=2)+'\n'
def backup_file(path, root=ROOT, reason='guardado'):
    path=Path(path)
    if path.exists():
        target=backup_root(root)/(stamp()+'-'+reason)/path.name
        target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
        return target

def safe_id(value):return isinstance(value,str) and bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,119}',value))
def web_url(value):
    try:
        u=urlsplit(value);return u.scheme in {'https','http'} and bool(u.hostname) and not u.username and not u.password
    except ValueError:return False

def video_url(config):
    if not config or not config.get('url'):return None
    seconds=config.get('start_seconds')
    if type(seconds) is not int or not 0<=seconds<=86400*7:raise ContentError('El tutorial necesita un segundo de inicio explícito (entero, desde cero).')
    u=urlsplit(config['url']);host=(u.hostname or '').lower();vid=None
    if u.scheme!='https':raise ContentError('El tutorial debe usar HTTPS.')
    if host=='youtu.be':vid=u.path.strip('/')
    elif host in {'youtube.com','www.youtube.com','m.youtube.com'}:
        vid=parse_qs(u.query).get('v',[None])[0] if u.path=='/watch' else (re.fullmatch(r'/(?:embed|shorts)/([\w-]{11})',u.path).group(1) if re.fullmatch(r'/(?:embed|shorts)/([\w-]{11})',u.path) else None)
    if not vid or not re.fullmatch(r'[A-Za-z0-9_-]{11}',vid):raise ContentError('URL de YouTube inválida.')
    return f'https://www.youtube.com/watch?v={vid}&t={seconds}s'

def image_path(value, root=ROOT, exists=True):
    if not value:return
    if not isinstance(value,str) or not value.startswith(('/assets/','/img/')) or '\\' in value or '..' in value.split('/'):
        raise ContentError('Las imágenes deben estar en assets/ o img/ del proyecto.')
    target=(Path(root)/value.lstrip('/')).resolve()
    if not target.is_relative_to(Path(root).resolve()):raise ContentError('Ruta de imagen fuera del proyecto.')
    if exists and not target.is_file():
        staged=Path(root)/'Herramientas/Recursos/Spider-Patch/imagenes'/target.name
        if not value.startswith('/assets/images/spider-patch/') or not staged.is_file():raise ContentError('No se encuentra la imagen: '+value)

ALLOWED=set('p ul ol li strong b em i u s a br div span h2 h3 h4 figure img figcaption details summary section article blockquote hr'.split())
def clean_html(value):
    doc=parse(value or '')
    for n in list(doc.walk()):
        if n.raw is not None:continue
        if n.tag not in ALLOWED:raise ContentError('El bloque contiene un elemento no permitido: '+n.tag)
        for k,v in list(n.attrs.items()):
            if k.startswith('on') or k=='style':raise ContentError('El contenido no puede incluir scripts ni estilos libres.')
            if k not in {'class','id','href','src','alt','title','width','height','loading','target','rel','open','aria-hidden','aria-label'}:n.attrs.pop(k,None)
            if k=='class' and not re.fullmatch(r'[A-Za-z0-9_\- ]*',v or ''):raise ContentError('Clase de contenido inválida.')
            if k in {'href','src'}:
                if not v or not (v.startswith('/') and not v.startswith('//') or k=='href' and v.startswith('#') or web_url(v)):raise ContentError('Enlace no permitido en el contenido.')
                if '..' in urlsplit(v).path.split('/'):raise ContentError('Ruta relativa no permitida.')
                if k=='src' and not v.startswith(('/assets/','/img/','https://img.youtube.com/','https://i.ytimg.com/')):raise ContentError('Origen de imagen no permitido.')
        if n.tag=='a' and n.attrs.get('target')=='_blank':n.attrs['rel']='noopener noreferrer'
    return doc.render()

def only_published(model):
    result=copy.deepcopy(model)
    result['seasons']=[s for s in result['seasons'] if s.get('status')=='published']
    seasons={s['id'] for s in result['seasons']}
    result['versions']=[v for v in result['versions'] if v.get('status')=='published' and v['season_id'] in seasons]
    for v in result['versions']:
        v['editions']=[e for e in v.get('editions',[]) if e.get('status')=='published']
        for e in v['editions']:
            e['downloads']=[d for d in e.get('downloads',[]) if d.get('status')=='published']
    return result

def validate(model, root=ROOT, publishing=False, previous=None):
    from multilingual import validate_extensions
    try:
        from spider_exchange import html as check_translation_html
        validate_extensions(model, check_translation_html)
    except ValueError as ex:raise ContentError(str(ex))
    errors=[]
    def fail(message):errors.append(message)
    def pending(holder):
        for key in ('cover','image','src'):
            if holder.get('pending_'+key) and not holder.get(key):fail('Hay imágenes importadas pendientes. Elegilas o descartá su referencia antes de publicar.')
        for key in ('html','instructions'):
            if holder.get('pending_'+key) and holder.get(key)==holder.get('pending_'+key+'_rendered'):fail('Hay imágenes HTML importadas pendientes. Revisá el bloque antes de publicar.')
    if model.get('schema_version')!=SCHEMA:raise ContentError('Formato de contenido no compatible.')
    seasons=model.get('seasons',[]);versions=model.get('versions',[])
    if not isinstance(seasons,list) or not isinstance(versions,list):raise ContentError('Temporadas y versiones deben ser listas.')
    if len(versions)>2000:raise ContentError('Demasiadas versiones.')
    ids=set();slugs=set();download_ids={};dependencies={};published_labels=set();active_downloads=set()
    try:image_path(model.get('product',{}).get('hero_image'),root,exists=publishing)
    except ContentError as ex:fail(str(ex))
    def unique(value,kind):
        if not safe_id(value):fail(kind+': identificador inválido.');return
        if value in ids:fail('Identificador duplicado: '+value)
        ids.add(value)
    for s in seasons:
        unique(s.get('id'),'Temporada')
        if s.get('status') not in STATUSES:fail('Estado inválido de temporada.')
        if not str(s.get('title','')).strip():fail('La temporada necesita un título.')
    season_ids={s.get('id') for s in seasons}
    published_seasons={s['id'] for s in seasons if s.get('status')=='published'}
    for v in versions:
        unique(v.get('id'),'Versión');label=v.get('title') or v.get('id','Versión')
        if v.get('season_id') not in season_ids:fail(label+': temporada inexistente.')
        if v.get('status') not in STATUSES:fail(label+': estado inválido.')
        public=publishing and v.get('status')=='published' and v.get('season_id') in published_seasons
        if public:
            pending(v)
            label_key=(v.get('season_id'),v.get('version','').casefold())
            if v.get('kind')!='addon' and label_key in published_labels:fail(label+': ya existe esa versión publicada en la temporada.')
            published_labels.add(label_key)
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,39}',v.get('version','')):fail(label+': usá una etiqueta como V4 o V4.1, sin espacios ni barras.')
            if not v.get('title') or not v.get('version'):fail(label+': faltan título o número de versión.')
            try:
                if date.fromisoformat(v.get('published_at',''))>date.today():fail(label+': la fecha de publicación está en el futuro.')
            except ValueError:fail(label+': fecha de publicación inválida.')
            if not any(e.get('status')=='published' for e in v.get('editions',[])):fail(label+': la versión está en «Publicado», pero ninguna de sus ediciones (PC, PS4/PS5) lo está. Abrí la pestaña Publicación de cada plataforma, poné su Estado en «Publicado» y hacé lo mismo con su paquete principal en Descargas.')
        try:image_path(v.get('cover'),root,exists=public)
        except ContentError as ex:fail(label+': '+str(ex))
        for e in v.get('editions',[]):
            unique(e.get('id'),'Edición');slug=e.get('slug','')
            if not safe_id(slug) or slug in slugs:fail(label+': slug inválido o duplicado.')
            slugs.add(slug)
            if e.get('platform') not in {'pc','playstation','all'}:fail(label+': plataforma inválida.')
            if e.get('status') not in STATUSES:fail(label+': estado de edición inválido.')
            if public and e.get('status')=='published':pending(e);pending(e.get('seo',{}))
            # Published route and social identity are immutable; changing a title does not rename a route.
            identity=model.get('identities',{}).get(e.get('id'))
            if identity and (identity['slug']!=slug or identity['comments_id']!=e.get('comments_id')):fail(label+': no se puede cambiar la URL o identidad de una publicación histórica.')
            if e.get('comments_id')!=slug:fail(label+': la identidad de comentarios debe conservar el slug de la publicación.')
            try:
                video_url(e.get('tutorial'));image_path(e.get('cover'),root,exists=public and e.get('status')=='published')
                for b in e.get('blocks',[]):
                    if public and e.get('status')=='published':
                        pending(b)
                        for image in b.get('images',[]):pending(image)
                    if b.get('type') not in BLOCKS:raise ContentError('Tipo de bloque no permitido.')
                    if not safe_id(b.get('id')):raise ContentError('ID de bloque inválido.')
                    if b.get('html'):clean_html(b['html'])
                    if b.get('type')=='video':video_url(b.get('video'))
                    if public and e.get('status')=='published':
                        if b.get('type') in {'text','list','instructions','warning','html'} and not parse(b.get('html','')).text.strip() and not any(b.get('items',[])):raise ContentError('Hay un bloque editorial vacío. Completalo o quitalo antes de publicar.')
                        if b.get('type')=='image' and (not b.get('src') or not b.get('alt','').strip()):raise ContentError('Una imagen publicada necesita archivo y texto alternativo.')
                        if b.get('type')=='gallery' and (not b.get('images') or any(not i.get('src') or not i.get('alt','').strip() for i in b['images'])):raise ContentError('La galería necesita imágenes con texto alternativo.')
                        if b.get('type')=='video' and not video_url(b.get('video')):raise ContentError('El bloque de video necesita un tutorial válido.')
                    if b.get('src'):image_path(b['src'],root,exists=public)
                    for img in b.get('images',[]):image_path(img.get('src'),root,exists=public)
            except (ContentError,ValueError) as ex:fail(label+': '+str(ex))
            blocks=e.get('blocks',[])
            if len({b.get('id') for b in blocks})!=len(blocks):fail(label+': IDs de bloque duplicados.')
            for d in e.get('downloads',[]):
                unique(d.get('id'),'Descarga');download_ids[d.get('id')]=(v,e,d);dependencies[d.get('id')]=d.get('requires',[])+d.get('install_before',[])
                if d.get('kind') not in {'complete','update','addon'} or d.get('status') not in STATUSES:fail(label+': tipo o estado de descarga inválido.')
                active=public and e.get('status')=='published' and d.get('status')=='published'
                if active:active_downloads.add(d.get('id'))
                if active:pending(d)
                if active and (not d.get('name') or not d.get('files')):fail(label+': descarga publicada sin nombre o archivos.')
                if active and d.get('kind') in {'update','addon'} and not d.get('compatibility'):fail(label+': la actualización o complemento necesita compatibilidad explícita.')
                if d.get('instructions'):clean_html(d['instructions'])
                try:image_path(d.get('image'),root,exists=active)
                except ContentError as ex:fail(label+': '+str(ex))
                for f in d.get('files',[]):
                    if (active or f.get('url')) and not web_url(f.get('url','')):fail(label+': URL de archivo inválida.')
                    for mirror in f.get('mirrors',[]):
                        if (active or mirror.get('url')) and not web_url(mirror.get('url','')):fail(label+': enlace alternativo inválido.')
            if public and e.get('status')=='published':
                if not e.get('description','').strip():fail(label+': falta la descripción de la edición.')
                if not any(d.get('status')=='published' and d.get('files') for d in e.get('downloads',[])):fail(label+': la edición está en «Publicado», pero ningún paquete con archivos lo está. En Descargas, poné el Estado del paquete principal en «Publicado».')
                if v.get('kind')!='addon' and not any(d.get('kind')=='complete' and d.get('status')=='published' for d in e.get('downloads',[])):fail(label+': falta el paquete principal publicado.')
    for key,refs in dependencies.items():
        for ref in refs:
            if ref not in download_ids:fail('Dependencia inexistente: '+str(ref))
            elif download_ids[key][1].get('platform')!='all' and download_ids[ref][1].get('platform')!='all' and download_ids[key][1].get('platform')!=download_ids[ref][1].get('platform'):fail('Una dependencia no puede mezclar archivos de PC y PS4 / PS5.')
            elif publishing and key in active_downloads and ref not in active_downloads:fail('Una descarga publicada depende de un borrador: '+str(ref))
    visiting=set();visited=set()
    def visit(key):
        if key in visiting:fail('Hay un ciclo entre dependencias de descargas.');return
        if key in visited:return
        visiting.add(key)
        for ref in dependencies.get(key,[]):visit(ref)
        visiting.remove(key);visited.add(key)
    for key in dependencies:visit(key)
    if previous:
        old_editions={e['id']:e for v in previous['versions'] for e in v.get('editions',[])}
        for v in versions:
            for e in v.get('editions',[]):
                if e.get('rating_html','')!=old_editions.get(e['id'],{}).get('rating_html',''):fail('La integración de calificaciones no se edita desde el contenido editorial.')
        for key,identity in previous.get('identities',{}).items():
            if model.get('identities',{}).get(key)!=identity:fail('Se modificó o eliminó una identidad histórica: '+key)
    if errors:raise ContentError('\n'.join(dict.fromkeys(errors)))
    return model

def import_current(root=ROOT):
    root=Path(root);source,snapshot=paths(root)
    if source.exists():return read(source)
    template_dir=root/'Herramientas/Generadores/templates/spider-patch';template_dir.mkdir(parents=True,exist_ok=True)
    hub=parse((root/'downloads.html').read_text(encoding='utf-8-sig'))
    legacy_json=read(root/'database/option-files.json');legacy_by={e['id']:e for e in legacy_json}
    with (root/'database/descargas.csv').open(encoding='utf-8-sig',newline='') as stream:rows=list(csv.DictReader(stream,delimiter=';'))
    # A full, immutable initial archive is also kept for exact recovery, not used as another source.
    archive=backup_root(root)/(stamp()+'-importacion')
    public_paths=[root/'downloads.html',root/'index.html',root/'sitemap.xml',root/'database/option-files.json',root/'database/descargas.csv',root/'database/tutoriales.csv',root/'js/option-files.js',*root.glob('option-files/**/index.html'),*root.glob('download/*/index.html')]
    for f in public_paths:
        if f.exists():
            dest=archive/f.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest)
    model={'schema_version':SCHEMA,'revision':1,'product':{'name':'Spider Patch','signature':'by LAqP.','tagline':hub.find(cls='sp-hero').find(tag='p').text,'hero_image':'/assets/images/home-banner-main-2.webp','seo':{}},'seasons':[],'versions':[],'identities':{},'legacy':{'option_files':legacy_json,'downloads':rows,'tutorials':(root/'database/tutoriales.csv').read_text(encoding='utf-8-sig')}}
    model['product']['seo']={'title':hub.find(tag='title').text,'description':hub.find(tag='meta',attr={'name':'description'}).attrs['content'],'image':hub.find(tag='meta',attr={'property':'og:image'}).attrs['content']}
    groups={};seasons=set()
    for row in rows:
        legacy=legacy_by.get(row['id'],{});slug=legacy.get('slug')
        if not slug:slug='pes-2018-option-file-2026-v3-'+('pc' if row['plataforma']=='PC' else 'ps4-ps5')
        doc=parse((root/'option-files'/slug/'index.html').read_text(encoding='utf-8-sig'));art=doc.find(cls='sp-publication')
        season=art.attrs['data-season'];number=art.attrs.get('data-release') or 'Complemento';kind='addon' if not art.attrs.get('data-release') else 'release';key='sp-'+season+'-'+number.lower()
        if season not in seasons:model['seasons'].append({'id':season,'title':'Temporada '+season,'status':'published'});seasons.add(season)
        heading=doc.find(tag='h1');platform_node=heading.find(tag='span');heading_text=heading.text
        if platform_node:heading_text=heading_text[:heading_text.rfind(platform_node.text)].strip()
        card=hub.find(id=row['id']);cover=doc.find(cls='sp-lean-header-cover').find(tag='img').attrs['src'];published_at=art.attrs['data-published']
        if key not in groups:
            summary=hub.find(cls='sp-latest-summary').text if number=='V3' else (card.parent.parent.find(tag='p').text if card and card.tag=='a' and card.parent and card.parent.parent.find(tag='p') else row['descripcion'])
            v={'id':key,'season_id':season,'version':number,'kind':kind,'title':heading_text,'summary':summary,'cover':cover,'status':'published','published_at':published_at,'updated_at':'','download_note':hub.find(cls='sp-package-note').text if number=='V3' else '', 'editions':[]};groups[key]=v;model['versions'].append(v)
        current=groups[key]
        entry=hub.find(id='version-'+season+'-'+number.lower()) if kind!='addon' else hub.find(id=row['id'])
        if entry and entry.find(tag='h3'):
            current['archive_title']=entry.find(tag='h3').text
            if entry.find(cls='sp-version-body') and entry.find(cls='sp-version-body').find(tag='p'):current['summary']=entry.find(cls='sp-version-body').find(tag='p').text
        if number=='V3':
            current['date_line']=hub.find(cls='sp-compact-date').inner
            current['coverage']=hub.find(cls='sp-compact-date').text.split('Temporada ')[-1]
            current['home_description']=parse((root/'index.html').read_text(encoding='utf-8-sig')).find(cls='sp-home-description').text.replace(current['title'],'{version}')
        h=doc.find(cls='sp-publication-header');blocks=[]
        body=doc.find(cls='of-article-body')
        for n in body.children:
            if not n.tag:continue
            block=n.clone();title=block.find(tag='h2');block_title=title.text if title else ''
            if title:title.remove()
            ordered=block.find(tag='ol');unordered=block.find(tag='ul')
            block_type='instructions' if ordered else ('list' if unordered else 'text')
            blocks.append({'id':block.attrs.get('id') or 'block-'+uuid.uuid4().hex[:8],'type':block_type,'title':block_title,'html':block.inner,'variant':'normal'})
        support=doc.find(cls='sp-lean-support')
        if support:
            block=support.clone();summ=block.find(tag='summary');label=summ.text;summ.remove();blocks.append({'id':'support','type':'html','title':label,'html':block.inner,'variant':'disclosure'})
        files=[]
        for li in doc.find(cls='sp-files').all(tag='li'):
            a=li.find(tag='a');files.append({'id':'file-'+uuid.uuid4().hex[:12],'name':li.find(tag='strong').text,'url':a.attrs['href'],'size':'','mirrors':[]})
        tutorial=None
        for a in doc.all(tag='a'):
            if 'youtube.com/watch' in a.attrs.get('href','') and a.parent and a.parent.attrs.get('id')=='instalacion':
                u=urlsplit(a.attrs['href']);raw=parse_qs(u.query).get('t',['0'])[0].rstrip('s');tutorial={'url':a.attrs['href'],'start_seconds':int(raw)};a.remove()
        # The imported editorial block already includes the same link: detach it into structured tutorial data.
        if tutorial:
            for b in blocks:
                if b['id']=='instalacion':
                    tree=parse(b['html'])
                    for a in tree.all(tag='a'):
                        if a.attrs.get('href')==tutorial['url']:a.remove()
                    b['html']=tree.render()
        actual_tutorial = bool(tutorial)
        if not tutorial and legacy.get('tutorial','').startswith('https://www.youtube.com'):
            tutorial={'url':legacy['tutorial'],'start_seconds':0}
        # Older verified tutorials were removed from the visual articles; recover their original associations.
        if not tutorial and kind!='addon':
            vid={'V1':'NdUNRvEeXhs','V2':'aMjJ3fx5aM4','V5':'3HkpYyyUnxU'}.get(number)
            if vid:tutorial={'url':'https://www.youtube.com/watch?v='+vid,'start_seconds':0}
        if tutorial:tutorial['show_in_article']=actual_tutorial
        seo={}
        for field,name in [('description','description'),('image','og:image')]:
            n=doc.find(tag='meta',attr={'name':name}) or doc.find(tag='meta',attr={'property':name});seo[field]=n.attrs['content'] if n else ''
        seo['title']=doc.find(tag='title').text
        graph=doc.find(tag='script',attr={'type':'application/ld+json'})
        e={'id':row['id'],'slug':slug,'comments_id':slug,'platform':'pc' if row['plataforma']=='PC' else ('all' if kind=='addon' else 'playstation'),'platforms':row['plataforma'].split('/'),'status':'published','heading':heading_text,'description':h.find(cls='sp-deck').text,'cover':cover,'cover_alt':doc.find(cls='sp-lean-header-cover').find(tag='img').attrs.get('alt',''),'seo':seo,'schema':json.loads(graph.inner),'tutorial':tutorial,'blocks':blocks,'download_intro': (doc.find(cls='sp-download-panel').find(tag='p').text if doc.find(cls='sp-download-panel').find(tag='p') and doc.find(cls='sp-download-panel').find(tag='p').attrs.get('class')!='sp-external-note' else ''),'downloads':[{'id':row['id']+'-package','name':'Complemento de kits' if kind=='addon' else 'Paquete completo','kind':'addon' if kind=='addon' else 'complete','status':'published','compatibility':legacy.get('compatibility','') or ('Temporada 2025; comprobar la base según las instrucciones del complemento.' if kind=='addon' else ''),'requires':[],'install_before':[],'instructions':'','warnings':'','image':'','files':files}], 'rating_html':doc.find(cls='sp-rating').render(),'hub_aliases':[n.attrs['id'] for n in card.all(tag='span') if 'id' in n.attrs] if card else [],'legacy':{'csv':row,'json':legacy}}
        model['identities'][e['id']]={'slug':slug,'comments_id':slug,'title':heading_text,'platform':e['platform']};groups[key]['editions'].append(e)
    # Save only one layout source per view; all editorial content lives in the model.
    for name,node in [('latest',hub.find(cls='sp-featured')),('platform-card',hub.find(cls='sp-platform-card')),('archive-entry',hub.find(cls='sp-version-entry')),('extra-entry',hub.find(id='of_pes2018_complemento'))]:atomic(template_dir/(name+'.html'),node.render())
    hub.find(cls='sp-featured').replace('{{LATEST}}');hub.find(cls='sp-compact-archive').replace('{{ARCHIVE}}');atomic(template_dir/'hub.html',hub.render())
    article_path=root/'option-files/pes-2018-option-file-2026-v3-pc/index.html';doc=parse(article_path.read_text(encoding='utf-8-sig'))
    doc.find(cls='of-article-body').html('{{BLOCKS}}');doc.find(cls='sp-files').html('{{FILES}}');atomic(template_dir/'article.html',doc.render())
    parts_path=root/'option-files/pes-2018-option-file-2026-v3-pc/descargar/index.html';doc=parse(parts_path.read_text(encoding='utf-8-sig'));doc.find(cls='sp-files').html('{{FILES}}');atomic(template_dir/'parts.html',doc.render())
    promo=parse((root/'index.html').read_text(encoding='utf-8-sig')).find(id='featured-of-section');atomic(template_dir/'home.html',promo.render())
    validate(model,root,publishing=True)
    atomic(source,json_text(model));atomic(snapshot,json_text(only_published(model)))
    return model

def load_working(root=ROOT):
    source,_=paths(root)
    return read(source) if source.exists() else import_current(root)
def load_published(root=ROOT):
    _,snapshot=paths(root)
    if not snapshot.exists():import_current(root)
    return read(snapshot)
def save_working(model, expected_revision, root=ROOT):
    current=load_working(root)
    if expected_revision!=current['revision']:raise ContentError('El contenido cambió en otra ventana. Recargá antes de guardar.')
    validate(model,root,previous=current)
    model=copy.deepcopy(model);model['revision']=current['revision']+1
    source,_=paths(root);backup_file(source,root);atomic(source,json_text(model));return model


from contextlib import contextmanager
@contextmanager
def project_lock(root=ROOT):
    lock=paths(root)[0].parent/'operacion.lock';lock.parent.mkdir(parents=True,exist_ok=True)
    try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    except FileExistsError:
        alive=True
        try:
            pid=int(lock.read_text())
            if os.name=='nt':
                import ctypes
                kernel=ctypes.windll.kernel32;kernel.OpenProcess.restype=ctypes.c_void_p
                handle=kernel.OpenProcess(0x1000,False,pid)
                if handle:
                    code=ctypes.c_ulong();kernel.GetExitCodeProcess(ctypes.c_void_p(handle),ctypes.byref(code));kernel.CloseHandle(ctypes.c_void_p(handle));alive=code.value==259
                else:alive=kernel.GetLastError() not in {87,1168}
            else:
                try:os.kill(pid,0)
                except ProcessLookupError:alive=False
        except (OSError,ValueError):alive=True
        if alive:raise ContentError('Otra operación de Spider Patch está en curso. Esperá y volvé a intentar.')
        lock.unlink(missing_ok=True)
        try:fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
        except FileExistsError:raise ContentError('Otra operación está en curso.')
    try:
        os.write(fd,str(os.getpid()).encode());os.close(fd);yield
    finally:lock.unlink(missing_ok=True)
_save_working=save_working
def save_working(model,expected_revision,root=ROOT):
    with project_lock(root):return _save_working(model,expected_revision,root)
