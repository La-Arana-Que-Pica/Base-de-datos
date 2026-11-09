"""Modelo editorial de Guías. Sin interfaz administrativa ni dependencias externas."""
from pathlib import Path
from datetime import date
import copy, csv, json, re, os, tempfile, shutil
from urllib.parse import urlsplit
from guide_components import COMPONENTS, load_components
ROOT=Path(__file__).resolve().parents[2]
KINDS={'paragraph','section','subsection','list','steps','image','gallery','note','tip','warning','code','download','video','component'}
ARCHIVED='instalar-option-file-pes-2018-2026'

def json_text(value):return json.dumps(value,ensure_ascii=False,indent=2)+'\n'
def paths(root):
 base=Path(root)/'Herramientas/Recursos/Guias'
 return base/'contenido.json',base/'publicado.json'
def atomic(path,content):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 fd,name=tempfile.mkstemp(prefix='.guias-',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(content if isinstance(content,bytes) else content.encode('utf-8'));f.flush();os.fsync(f.fileno())
  os.replace(name,path)
 finally:
  if os.path.exists(name):os.unlink(name)
def local_asset(value,root):
 if not value:return
 if not isinstance(value,str):raise ValueError('Ruta de imagen inválida')
 value=value.lstrip('/');base=Path(root).resolve();target=(base/value).resolve()
 if value.startswith('assets/guias-editor/') and '/' not in value.removeprefix('assets/guias-editor/') and not target.is_file():target=base/'Herramientas/Recursos/Guias/archivos'/Path(value).name
 target=target.resolve()
 if not target.is_relative_to(base) or not value.startswith(('assets/','img/')) or not target.is_file():raise ValueError('Recurso inexistente o fuera del sitio: '+value)
def web_url(value):
 p=urlsplit(str(value));return p.scheme in {'http','https'} and bool(p.hostname) and not p.username and not p.password

def legacy_blocks(guide,placements=None):
 result=[];placements=placements or {}
 for i,s in enumerate(guide.get('sections',[]),1):
  children=[]
  def components(pos):
   for j,name in enumerate(placements.get((i,pos),[])):
    children.append({'id':f'component-{i}-{str(pos).lower()}-{j}','type':'component','component':name})
  components(0)
  for j,p in enumerate(s.get('body',[]),1):
   children.append({'id':f'paragraph-{i}-{j}','type':'paragraph','text':p});components(j)
  if s.get('list'):children.append({'id':f'list-{i}','type':'steps' if guide['id']==ARCHIVED and i in (4,5) else 'list','items':s['list']})
  figure=s.get('figure') or {}
  if figure.get('image'):children.append({'id':f'image-{i}','type':'image','src':figure['image'],'alt':figure.get('alt') or s['heading'],'caption':figure.get('caption','')})
  components(None)
  result.append({'id':f'section-{i}','type':'section','title':s['heading'],'children':children})
 return result

def migrate(root):
 root=Path(root);guides=json.loads((root/'database/guias.json').read_text('utf-8-sig'));placements=load_components(root,guides)
 model={'schema_version':1,'revision':1,'product':{'title':'Guías LAqP','description':'Una biblioteca para entender, editar y disfrutar PES 2018.'},'guides':[],'identities':{},'legacy':{'guides':copy.deepcopy(guides),'components_csv':(root/'database/guia-componentes.csv').read_text('utf-8-sig') if (root/'database/guia-componentes.csv').exists() else ''}}
 for g in guides:
  g=copy.deepcopy(g);g.update({'status':'published','visibility':'archive' if g['id']==ARCHIVED else 'catalog','indexable':g['id']!=ARCHIVED,'locale':'es','author':'Agustín Segade','seo':{},'toc':'auto','blocks':legacy_blocks(g,placements.get(g['id']))})
  g['category']={'Edicion':'Edición'}.get(g.get('category'),g.get('category'))
  g['thumbnail']=g['image'];g['thumbnailPosition']='center'
  if g['id']=='importar-kits-pes-2018':g['thumbnail']='assets/images/guias/configurar-kits/muestra-kit-final.png'
  if g['id']=='consejos-crear-caras-pes-2018-editor-interno':g['thumbnail']='assets/images/guias/consejos-caras/imagen-referencia.webp'
  model['guides'].append(g);model['identities'][g['id']]={'slug':g['id'],'aliases':[f'section-{i}' for i in range(1,len(g.get('sections',[]))+1)]}
 return model

def walk(blocks):
 for b in blocks:
  yield b
  yield from walk(b.get('children',[]))

LABELS={'section':'Sección','subsection':'Subsección','paragraph':'Párrafo','list':'Lista','steps':'Pasos numerados','image':'Imagen','gallery':'Galería','note':'Nota','tip':'Consejo','warning':'Advertencia','code':'Código','video':'Video','download':'Descarga','component':'Componente'}

def walk_path(blocks,path=()):
 """Like walk(), plus the titles of the sections that contain each block and its position."""
 for n,b in enumerate(blocks,1):
  yield b,path,n
  yield from walk_path(b.get('children',[]),path+((b.get('title') or LABELS.get(b.get('type'),'Bloque')),))

def describe(guide,block=None,path=(),position=None):
 """Human location used by every editorial error: guide title, section path and block."""
 where='«'+(guide.get('title') or guide.get('id') or 'Guía sin título')+'»'
 if path:where+=' › '+' › '.join(path)
 if block is not None:
  where+=' › '+LABELS.get(block.get('type'),'Bloque '+str(block.get('type')))+(' '+str(position) if position else '')
  hint=block.get('title') or block.get('alt') or block.get('name') or ''
  if hint:where+=' («'+(hint[:60]+'…' if len(hint)>60 else hint)+'»)'
  where+=' [id '+str(block.get('id',''))+']'
 return where

def image_problems(image):
 missing=[]
 if not image.get('src'):missing.append('falta el archivo de imagen')
 if not str(image.get('alt','')).strip():missing.append('falta la descripción (texto alternativo)')
 return missing

def validate(model,root=ROOT,strict=True):
 if model.get('schema_version')!=1:raise ValueError('Formato editorial no compatible')
 ids=set();routes=set();errors=[]
 for g in model.get('guides',[]):
  try:_validate_guide(g,model,root,strict,ids,routes,errors)
  except ValueError as ex:errors.append(str(ex) if str(ex).startswith('«') else describe(g)+': '+str(ex))
 if errors:
  shown=errors[:12]
  if len(errors)==1:raise ValueError('No se puede continuar: '+errors[0])
  raise ValueError('No se puede continuar: '+str(len(errors))+' problemas.\n'+'\n'.join('• '+e for e in shown)+('\n• …y '+str(len(errors)-len(shown))+' más.' if len(errors)>len(shown) else ''))
 return model

def _validate_guide(g,model,root,strict,ids,routes,errors):
  def fail(message,block=None,path=(),position=None):raise ValueError(describe(g,block,path,position)+': '+message)
  key=g.get('id','')
  if not re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*',key) or key in ids:fail('ID editorial inválido o duplicado: '+key)
  ids.add(key);slug=g.get('slug') or key
  if not re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*',slug) or slug in routes:fail('URL inválida o duplicada')
  routes.add(slug)
  if g.get('status') not in {'draft','published','hidden'} or g.get('visibility') not in {'catalog','archive','unlisted'}:fail('Estado editorial inválido')
  identity=model.get('identities',{}).get(key)
  if identity and identity['slug']!=slug:fail('No se puede cambiar una URL histórica')
  public=strict and g.get('status')=='published'
  if public:
   if not g.get('title') or not g.get('description') or not g.get('blocks'):fail('Publicación incompleta (título, descripción o contenido)')
   if date.fromisoformat(g['date'])>date.today():fail('La fecha de publicación está en el futuro')
   if not g.get('author','').strip():fail('Indicá el autor antes de publicar')
   if not (g.get('image') or g.get('thumbnail')):fail('Elegí una imagen de portada para publicar')
   if g.get('updatedAt'):
    updated=date.fromisoformat(g['updatedAt'])
    if updated>date.today() or updated<date.fromisoformat(g['date']):fail('La fecha de actualización no corresponde a la publicación')
   if g.get('showFaq') and any(not str(q).strip() or not str(a).strip() for q,a in g.get('faq',[])):fail('Completá las preguntas adicionales antes de publicar')
   if not any(b.get('type') not in {'section','subsection'} for b in walk(g['blocks'])):fail('La guía necesita contenido además de encabezados')
  for field,label in [('image','Imagen principal'),('thumbnail','Miniatura')]:
   try:local_asset(g.get(field),root)
   except ValueError as ex:fail(label+': '+str(ex))
  position=g.get('thumbnailPosition','center')
  if position not in {'center','top','bottom','left','right'} and not re.fullmatch(r'(?:100|[0-9]{1,2})(?:\.[0-9]+)?% (?:100|[0-9]{1,2})(?:\.[0-9]+)?%',position):fail('Posición de miniatura inválida')
  if g.get('thumbnailFit','cover') not in {'cover','contain'}:fail('Encuadre de miniatura inválido')
  try:local_asset(g.get('seo',{}).get('image'),root)
  except ValueError as ex:fail('Imagen SEO: '+str(ex))
  for block,path,n in walk_path(g.get('blocks',[])):
   kind=block.get('type');depth=len(path)
   if kind=='section' and depth!=0:fail('Las secciones principales deben estar en el nivel superior',block,path,n)
   if kind=='subsection' and depth!=1:fail('Una subsección debe pertenecer a una sección principal',block,path,n)
   if kind not in {'section','subsection'} and block.get('children'):fail('Sólo las secciones pueden contener bloques',block,path,n)
  block_ids=set();found=[]
  for b,path,n in walk_path(g.get('blocks',[])):
   def bad(message):fail(message,b,path,n)
   bid=b.get('id','')
   if not re.fullmatch('[a-z0-9][a-z0-9-]*',bid) or bid in block_ids or bid in {'contenido','indice','articulo','relacionadas','videos','comunidad'}:bad('ID de bloque inválido o duplicado')
   block_ids.add(bid)
   kind=b.get('type')
   if kind not in KINDS:bad('Tipo de bloque desconocido: '+str(kind))
   if kind=='section' and any(c.get('type')=='section' for c in b.get('children',[])):bad('Usá una subsección dentro de la sección')
   if public and kind in {'section','subsection'} and not b.get('title'):bad('Falta el título de la sección')
   if b.get('width','full') not in {'full','compact'}:bad('Ancho de imagen inválido')
   if b.get('columns',2) not in {1,2,3}:bad('Cantidad de columnas inválida')
   if public and kind in {'section','subsection'} and not b.get('children'):bad('La sección no tiene contenido')
   if kind=='component' and b.get('component') not in COMPONENTS:bad('Componente no autorizado')
   if kind in {'image','gallery'}:
    images=[b] if kind=='image' else b.get('images',[])
    for number,image in enumerate(images,1):
     label='' if kind=='image' else 'imagen '+str(number)+' de la galería: '
     try:local_asset(image.get('src'),root)
     except ValueError as ex:bad(label+str(ex))
     # Every incomplete image is reported, not only the first one.
     if public and image_problems(image):found.append(describe(g,b,path,n)+': '+label+' y '.join(image_problems(image))+'.')
   if kind=='download':
    link=b.get('url','')
    if not web_url(link):
     try:local_asset(link,root)
     except ValueError as ex:bad(str(ex))
    if public and (not link or not b.get('name')):bad('Descarga incompleta (falta '+' y '.join(x for x,v in [('el archivo o enlace',link),('el nombre',b.get('name'))] if not v)+')')
   if kind=='video':
    if (public or b.get('video_id')) and not re.fullmatch('[A-Za-z0-9_-]{11}',b.get('video_id','')):bad('ID de YouTube inválido o vacío')
    if not isinstance(b.get('start_seconds',0),int) or not 0<=b.get('start_seconds',0)<=604800:bad('Segundo de inicio inválido')
   if public and kind in {'paragraph','note','tip','warning'} and not b.get('text','').strip():bad('El bloque de texto está vacío')
   if public and kind in {'list','steps'} and not any(str(i).strip() for i in b.get('items',[])):bad('La lista está vacía')
   if public and kind=='code' and not b.get('code','').strip():bad('El bloque de código está vacío')
   if public and kind=='gallery' and not b.get('images'):bad('La galería no tiene imágenes')
   if b.get('href') and not (web_url(b['href']) or b['href'].startswith(('/guia/','/option-files/','/downloads.html','/calculadora-medias.html'))):bad('Enlace de bloque no autorizado')
  errors.extend(found)

def load_published(root=ROOT):
 source,snapshot=paths(root)
 if not snapshot.exists():return validate(migrate(root),root)
 model=json.loads(snapshot.read_text('utf-8'))
 # Imported CSV placements are already stable blocks; never apply them twice.
 csv_path=Path(root)/'database/guia-componentes.csv'
 current=csv_path.read_text('utf-8-sig') if csv_path.exists() else ''
 imported=model.get('legacy',{}).get('components_csv','')
 if csv_path.exists() and current.strip()!=imported.strip():
  load_components(root,model.get('legacy',{}).get('guides',[]))
  raise ValueError('El CSV de componentes cambió después de la importación. La fuente vigente son los bloques editoriales; no se mezcla contenido de dos fuentes.')
 return validate(model,root)

def initialize(root=ROOT):
 root=Path(root);source,snapshot=paths(root)
 if source.exists() or snapshot.exists():raise ValueError('La biblioteca ya está importada; no se sobrescribe el contenido')
 model=validate(migrate(root),root)
 from datetime import datetime,timezone
 backup=root/'Herramientas/Salidas/Guias/respaldos'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 for name in ['database/guias.json','database/guia-componentes.csv','database/tutoriales.csv','guias.html','sitemap.xml','index.html']:
  p=root/name
  if p.exists():dest=backup/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 for p in root.glob('guia/*/index.html'):
  dest=backup/p.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 atomic(source,json_text(model));atomic(snapshot,json_text(model));return model


from contextlib import contextmanager
@contextmanager
def project_lock(root=ROOT):
 """OS-held lock: released automatically if a local process exits unexpectedly."""
 path=paths(root)[0].parent/'operacion.lock';path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('a+b') as stream:
  stream.seek(0,2)
  if stream.tell()==0:stream.write(b'0');stream.flush()
  stream.seek(0)
  try:
   if os.name=='nt':
    import msvcrt
    msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
   else:
    import fcntl
    fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except OSError:raise ValueError('Hay otra operación de Guías en curso. Esperá y volvé a intentar.')
  try:yield
  finally:
   stream.seek(0)
   if os.name=='nt':msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)
   else:fcntl.flock(stream,fcntl.LOCK_UN)
