"""Renderizador canónico de Guías. Python y Node comparten datos y plantillas."""
from pathlib import Path
from string import Template
from html import escape
from datetime import date,datetime,timezone
import argparse,csv,json,re,copy,shutil,xml.etree.ElementTree as ET,importlib.util
from guide_components import component_resources,render_components
from guide_content import project_lock,ROOT,ARCHIVED,load_published,initialize,validate,walk,atomic,json_text
SITE='https://laqp.website'
TEMPLATES=Path(__file__).parent/'templates/guias'

def esc(value):return escape(str(value or ''),quote=True)
def js(value):return json.dumps(value,ensure_ascii=False).replace('<','\\u003c')
def url(guide):return '/guia/'+(guide.get('slug') or guide['id'])+'/'
def date_label(value):return '/'.join(reversed(str(value).split('-')))
def tpl(name,**data):return Template((TEMPLATES/(name+'.html')).read_text('utf-8')).substitute(data)
def image_data(root,source):
 if not source:return '/img/logo.webp'
 manifest=Path(root)/'assets/images/guias/optimized/manifest.json'
 entries=json.loads(manifest.read_text('utf-8')) if manifest.exists() else {}
 return entries.get(source,{}).get('src') or '/'+source.lstrip('/')
def image_dimensions(root,source):
 manifest=Path(root)/'assets/images/guias/optimized/manifest.json'
 entry=json.loads(manifest.read_text('utf-8')).get(source,{}) if manifest.exists() else {}
 return f'width="{int(entry["width"])}" height="{int(entry["height"])}"' if entry else ''
def visible(g):return g.get('status')=='published' and g.get('visibility')=='catalog'
def shell(title,description,canonical,content,schema=None,extra_head='',article=False,image='/assets/images/guias/optimized/configurar-kits.webp',resources='',noindex=False):
 return tpl('shell',title=esc(title),description=esc(description),canonical=esc(SITE+canonical),content=content,nav=tpl('nav'),footer=tpl('footer'),schema='<script type="application/ld+json">'+js(schema)+'</script>' if schema else '',extra_head=extra_head,og_type='article' if article else 'website',social_image=esc(image if image.startswith('https://') else SITE+'/'+image.lstrip('/')),resources=resources,robots='<meta name="robots" content="noindex,follow">' if noindex else '')
def card(g,root,compact=False):
 position=g.get('thumbnailPosition','center')
 if position not in {'center','top','bottom','left','right'} and not re.fullmatch(r'(?:100|[0-9]{1,2})(?:\.[0-9]+)?% (?:100|[0-9]{1,2})(?:\.[0-9]+)?%',position):position='center'
 fit=g.get('thumbnailFit','cover')
 if fit not in {'cover','contain'}:fit='cover'
 return tpl('card',id=esc(g['id']),fit=fit,compact=' gl-card-compact' if compact else '',url=url(g),image=esc(image_data(root,g.get('thumbnail') or g.get('image'))),title=esc(g['title']),description=esc(g['description']),category=esc(g.get('category','PES 2018')),read_time=esc(g.get('readTime','')),position=position)
def community(root):
 p=Path(root)/'database/community.json';conf=json.loads(p.read_text('utf-8-sig')) if p.exists() else {};d=conf.get('discord') or {};invite=d.get('inviteUrl')
 if not invite:return ''
 from urllib.parse import urlsplit
 u=urlsplit(invite)
 if u.scheme!='https' or not (u.hostname=='discord.gg' and u.path.strip('/') or u.hostname=='discord.com' and u.path.startswith('/invite/')):raise ValueError('Invitación Discord inválida')
 return '<p class="gl-community-link">Compartí lo que aprendés. <a href="'+esc(invite)+'" target="_blank" rel="noopener noreferrer">Comunidad LAqP ↗</a></p>'
def latest_installation(root):
 p=Path(root)/'Herramientas/Recursos/Spider-Patch/publicado.json'
 if not p.exists():return ''
 m=json.loads(p.read_text('utf-8'));seasons={s['id'] for s in m['seasons'] if s.get('status')=='published'}
 versions=[v for v in m['versions'] if v.get('status')=='published' and v.get('kind')!='addon' and v['season_id'] in seasons and any(e.get('status')=='published' for e in v.get('editions',[]))]
 if not versions:return ''
 v=max(versions,key=lambda x:(x.get('published_at',''),tuple(int(n) for n in re.findall(r'\d+',x['version']))))
 links=[]
 for e in v['editions']:
  if e.get('status')!='published':continue
  name='PC' if e['platform']=='pc' else 'PS4 / PS5';links.append('<a href="/option-files/'+esc(e['slug'])+'/">Contenido y descarga '+name+'</a>')
  tutorial=e.get('tutorial') or {};link=tutorial.get('url','');seconds=tutorial.get('start_seconds')
  if link and isinstance(seconds,int):
   video_id=re.search(r'(?:v=|youtu.be/)([A-Za-z0-9_-]{11})',link)
   if video_id:links.append('<a href="https://www.youtube.com/watch?v='+video_id[1]+'&amp;t='+str(seconds)+'s" target="_blank" rel="noopener noreferrer">Video '+name+' desde '+f'{seconds//60:02}:{seconds%60:02}'+' ↗</a>')
 return '<aside class="gl-callout gl-warning"><strong>Esta guía está archivada</strong><p>No es un procedimiento universal ni la instalación vigente. Consultá las instrucciones específicas de '+esc(v['title'])+' para tu plataforma.</p><div class="gl-link-row">'+' '.join(links)+'</div></aside>'

def render_block(b,root,level=1):
 kind=b['type'];bid=esc(b['id']);text=esc(b.get('text',''));title=esc(b.get('title',''))
 if kind in {'section','subsection'}:
  rank=2 if kind=='section' else 3
  return '<section class="gl-section" id="'+bid+'"><h'+str(rank)+'>'+title+'</h'+str(rank)+'>'+''.join(render_block(c,root,rank) for c in b.get('children',[]))+'</section>'
 if kind=='paragraph':return '<p>'+text+(' <a href="'+esc(b['href'])+'">'+esc(b.get('link_text') or 'Más información')+'</a>' if b.get('href') else '')+'</p>'
 if kind in {'list','steps'}:
  tag='ol' if kind=='steps' else 'ul'
  return '<'+tag+' class="'+('gl-steps' if kind=='steps' else 'gl-list')+'">'+''.join('<li>'+esc(i)+'</li>' for i in b.get('items',[]))+'</'+tag+'>'
 if kind in {'note','tip','warning'}:return '<aside class="gl-callout gl-'+kind+'">'+('<strong>'+title+'</strong>' if title else '')+'<p>'+text+'</p></aside>'
 if kind=='image':
  if not b.get('src'):return '<aside class="gl-callout gl-note gl-pending-image"><strong>Imagen pendiente</strong><p>'+esc(b.get('alt',''))+'</p>'+('<p>'+esc(b.get('caption',''))+'</p>' if b.get('caption') else '')+'</aside>'
  src='/'+b['src'].lstrip('/');dim=image_dimensions(root,b['src'])
  return '<figure class="gl-figure'+(' gl-figure-compact' if b.get('width')=='compact' else '')+'" id="'+bid+'"><a href="'+esc(src)+'" data-guide-zoom aria-label="Ampliar imagen: '+esc(b['alt'])+'"><img src="'+esc(image_data(root,b['src']))+'" alt="'+esc(b['alt'])+'" '+dim+' loading="lazy"></a>'+('<figcaption>'+esc(b['caption'])+'</figcaption>' if b.get('caption') else '')+'</figure>'
 if kind=='gallery':return '<div class="gl-gallery'+(' gl-gallery-columns-'+str(b['columns']) if b.get('columns') in {1,2,3} else '')+'">'+''.join(render_block(dict(i,type='image',id=b['id']+'-'+str(n)),root) for n,i in enumerate(b.get('images',[])))+'</div>'
 if kind=='code':return '<div class="gl-code" id="'+bid+'"><div><span>'+esc(b.get('language','Código'))+'</span><button type="button" data-copy-code aria-label="Copiar código '+esc(b.get('title',''))+'">Copiar</button></div><pre tabindex="0"><code>'+esc(b.get('code',''))+'</code></pre><p class="gl-copy-status" role="status"></p></div>'
 if kind=='download':return '<div class="gl-download" id="'+bid+'"><div><strong>'+esc(b['name'])+'</strong><p>'+text+'</p>'+('<small>'+esc(b['size'])+'</small>' if b.get('size') else '')+'</div><a href="'+esc(b['url'])+'">Descargar ↗</a></div>'
 if kind=='video':return video(b['video_id'],b.get('title','Video complementario'),b.get('start_seconds',0),level+1)
 if kind=='component':return render_components({(1,0):[b['component']]},1,0,level+1)
 raise ValueError('Bloque no soportado: '+kind)

def video(video_id,title,start=0,rank=3):
 return '<div class="gl-video"><h'+str(rank)+'>'+esc(title)+'</h'+str(rank)+'><button type="button" data-guide-video="'+esc(video_id)+'" data-video-start="'+str(start)+'" aria-label="Reproducir: '+esc(title)+'"><img src="https://img.youtube.com/vi/'+esc(video_id)+'/hqdefault.jpg" alt="" width="480" height="360" loading="lazy"><span>▶ Ver el video</span></button><a href="https://www.youtube.com/watch?v='+esc(video_id)+'&amp;t='+str(start)+'s" target="_blank" rel="noopener noreferrer">Abrir en YouTube ↗</a></div>'

def article(g,guides,root,tutorials,components=None,preview=False):
 blocks=g.get('blocks',[])
 if not blocks:
  from guide_content import legacy_blocks
  blocks=legacy_blocks(g,components)
 archived=g.get('visibility')=='archive';videos='';resource_items=[];seen=set()
 def add_resource(key,html):
  if key not in seen:seen.add(key);resource_items.append(html)
 def reading_blocks(items):
  result=[]
  for original in items:
   item=copy.deepcopy(original)
   if item['type'] in {'video','download'}:
    key=('video',item.get('video_id'),item.get('start_seconds',0)) if item['type']=='video' else ('download',item.get('url'))
    add_resource(key,render_block(item,root,2));continue
   if item.get('href'):
    href=item.pop('href');label=item.pop('link_text',None) or 'Abrir herramienta'
    add_resource(('link',href),'<a class="gl-resource-link" href="'+esc(href)+'"><span aria-hidden="true">↗</span><span><small>Herramienta</small><strong>'+esc(label)+'</strong></span></a>')
   if item.get('children') is not None:item['children']=reading_blocks(item['children'])
   result.append(item)
  return result
 blocks=reading_blocks(blocks)
 if not archived:
  matches=[t for t in tutorials if str(t['id']) in list(map(str,g.get('tutorialIds',[])))]
  for t in matches:add_resource(('video',t['video_id'],0),video(t['video_id'],t['titulo']))
 useful_resources=('<aside class="gl-resources" aria-labelledby="resources-title"><h2 id="resources-title">Recursos útiles</h2>'+''.join(resource_items)+'</aside>') if resource_items else ''
 faq=''
 if g.get('showFaq') is True and g.get('faq'):faq='<section class="gl-section"><h2>Dudas adicionales</h2>'+''.join('<details class="gl-faq"><summary>'+esc(q)+'</summary><p>'+esc(a)+'</p></details>' for q,a in g['faq'])+'</section>'
 related=[next((r for r in guides if r['id']==key and visible(r)),None) for key in g.get('related',[])];related=[r for r in related if r and r['id']!=g['id']][:3]
 related_html='<section class="gl-related" id="relacionadas" aria-labelledby="related-title"><div class="gl-catalog-head"><h2 id="related-title">Para seguir aprendiendo</h2></div><div class="gl-related-grid">'+''.join(card(r,root,True) for r in related)+'</div></section>' if related and not archived else ''
 dates='<time datetime="'+esc(g['date'])+'">Publicado el '+date_label(g['date'])+'</time>'
 if g.get('updatedAt'):dates+='<span aria-hidden="true">·</span><time datetime="'+esc(g['updatedAt'])+'">Actualizado el '+date_label(g['updatedAt'])+'</time>'
 cover='<span class="gl-cover-stage" aria-hidden="true"><img class="gl-article-cover" src="'+esc(image_data(root,g.get('thumbnail') or g['image']))+'" alt="" width="180" height="144"></span>' if g.get('image') else ''
 # Preserve legacy section anchors even after an editorial rewrite.
 old_aliases=g.get('_aliases',[]);present={b['id'] for b in walk(blocks)};aliases=''.join('<span id="'+esc(a)+'" class="gl-anchor-alias" aria-hidden="true"></span>' for a in old_aliases if a not in present)
 body=tpl('article',breadcrumb=esc(g['title']),category=esc('Archivo histórico' if archived else g.get('category','Guía PES 2018')),heading=esc(g['title']),description=esc(g['description']),author=esc(g.get('author','LAqP')),dates=dates,read_time=esc(g.get('readTime','')),cover=cover,notice=latest_installation(root) if archived and g['id']==ARCHIVED else '',useful_resources=useful_resources,resource_class=' gl-has-resources' if useful_resources else '',blocks=aliases+''.join(render_block(b,root) for b in blocks),videos=videos,faq=faq,related=related_html)
 schema=[{'@context':'https://schema.org','@type':'Article','headline':g['title'],'description':g['description'],'image':SITE+'/'+g['image'].lstrip('/'),'datePublished':g['date'],'dateModified':g.get('updatedAt') or g['date'],'inLanguage':'es','author':{'@type':'Person','name':g.get('author','Agustín Segade')},'publisher':{'@type':'Organization','name':'LAqP','url':SITE},'mainEntityOfPage':SITE+url(g)},{'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Inicio','item':SITE+'/'},{'@type':'ListItem','position':2,'name':'Guías','item':SITE+'/guias.html'},{'@type':'ListItem','position':3,'name':g['title'],'item':SITE+url(g)}]}]
 used=[b['component'] for b in walk(blocks) if b['type']=='component'];resources=component_resources({(1,0):used})
 if not g.get('image'):schema[0].pop('image',None)
 seo=g.get('seo',{})
 return shell(seo.get('title') or g['title'],seo.get('description') or g['description'],url(g),body,schema,article=True,image=seo.get('image') or g['image'],resources=resources,noindex=preview or not g.get('indexable',True))

def library(guides,root,tutorials,preview=False):
 catalog=[g for g in guides if visible(g) or preview and g.get('status')=='draft' and g.get('visibility')=='catalog'];archived=[g for g in guides if g.get('status')=='published' and g.get('visibility')=='archive']
 archive=''.join('<li><a href="'+url(g)+'">'+esc(g['title'])+' · Archivo escrito</a></li>' for g in archived)+''.join('<li><a href="https://www.youtube.com/watch?v='+esc(t['video_id'])+'" target="_blank" rel="noopener noreferrer">'+esc(t['titulo'])+' ↗</a><span>'+esc(t['fecha'])+'</span></li>' for t in tutorials)
 content=tpl('library',count=len(catalog),cards=''.join(card(g,root) for g in catalog),archive=archive,community=community(root))
 return shell('Guías de PES 2018 — Biblioteca LAqP','Aprendé a configurar kits, crear caras, entender las medias y trabajar con herramientas de PES 2018. Guías escritas de LAqP.','/guias.html',content,{'@context':'https://schema.org','@type':'CollectionPage','name':'Guías LAqP','url':SITE+'/guias.html','inLanguage':'es'},noindex=preview)

def plain(g):
 parts=[g['description']]
 for b in walk(g.get('blocks',[])):
  parts.extend(str(b[k]) for k in ['title','text','caption','code','name'] if b.get(k));parts.extend(map(str,b.get('items',[])))
 if g.get('showFaq'):parts.extend(str(x) for pair in g.get('faq',[]) for x in pair)
 return '\n'.join(parts)

def patch_sitemap(source,guides):
 ns='http://www.sitemaps.org/schemas/sitemap/0.9';ET.register_namespace('',ns);tree=ET.fromstring(source)
 for n in list(tree):
  loc=n.find('{'+ns+'}loc');value=loc.text if loc is not None else ''
  if value and (value==SITE+'/guias.html' or value==SITE+'/tutorials.html' or value==SITE+'/articulo.html' or value.startswith(SITE+'/guia/')):tree.remove(n)
 indexable=[g for g in guides if g.get('status')=='published' and g.get('indexable',True)]
 for route,modified in [('/guias.html',max((g.get('updatedAt') or g['date'] for g in indexable),default=''))]+[(url(g),g.get('updatedAt') or g['date']) for g in indexable]:
  n=ET.SubElement(tree,'{'+ns+'}url');ET.SubElement(n,'{'+ns+'}loc').text=SITE+route
  if modified:ET.SubElement(n,'{'+ns+'}lastmod').text=modified
 return '<?xml version="1.0" encoding="utf-8"?>\n'+ET.tostring(tree,encoding='unicode')+'\n'

def render_outputs(root=ROOT,model=None,output_root=None,preview=False):
 root=Path(root);output=Path(output_root or root);model=copy.deepcopy(model or load_published(root));validate(model,root,strict=not preview)
 guides=model['guides'];live=[g for g in guides if g.get('status')=='published' or preview and g.get('status')=='draft']
 for g in live:g['_aliases']=model.get('identities',{}).get(g['id'],{}).get('aliases',[])
 with (root/'database/tutoriales.csv').open(encoding='utf-8-sig',newline='') as f:tutorials=list(csv.DictReader(f,delimiter=';'))
 files={'guias.html':library(live,root,tutorials,preview)}
 files['tutorials.html']=shell('Los tutoriales están en Guías LAqP','Los videos anteriores se conservan en el archivo de la biblioteca.','/guias.html','<header class="gl-hero"><div><h1>Los tutoriales están en Guías LAqP</h1><p>Los artículos escritos y sus videos se reúnen en la biblioteca.</p><a href="/guias.html#videos">Abrir el archivo de videos →</a></div></header>',extra_head='<meta http-equiv="refresh" content="0;url=/guias.html#videos">')
 files['articulo.html']=shell('Guías LAqP','Biblioteca de guías de PES 2018.','/guias.html','<header class="gl-hero"><div><h1>Guías LAqP</h1><p id="guide-legacy-status">Este enlace necesita JavaScript. Buscá tu guía en la biblioteca.</p><a href="/guias.html">Abrir la biblioteca</a></div></header>',extra_head='<script src="/js/guides-legacy.js" defer></script>',noindex=True)
 for g in live:files['guia/'+(g.get('slug') or g['id'])+'/index.html']=article(g,live,root,tutorials,preview=preview)
 for key,identity in model.get('identities',{}).items():
  if not any(g['id']==key for g in live):files['guia/'+identity['slug']+'/index.html']=shell('Guía no disponible','Esta guía no está disponible.','/guia/'+identity['slug']+'/','<header class="gl-hero"><div><h1>Guía no disponible</h1><a href="/guias.html">Explorar la biblioteca</a></div></header>',noindex=True)
 catalog=[g for g in live if visible(g) or preview and g.get('status')=='draft' and g.get('visibility')=='catalog'];docs=[{'id':g['id'],'url':url(g),'title':g['title'],'description':g['description'],'content':plain(g),'category':g['category'],'platforms':g.get('platforms',[]),'date':g.get('updatedAt') or g['date'],'image':image_data(root,g.get('thumbnail') or g['image']),'readTime':g.get('readTime',''),'thumbnailPosition':g.get('thumbnailPosition','center'),'thumbnailFit':g.get('thumbnailFit','cover')} for g in catalog]
 files['database/guides-search.json']=js({'version':2,'documents':docs})+'\n'
 compat=[{k:v for k,v in g.items() if k not in {'_aliases','blocks'}} for g in catalog]
 for g in compat:g['related']=[key for key in g.get('related',[]) if any(x['id']==key for x in catalog)]
 files['database/guias.json']=json_text(compat)
 files['js/articles-data.js']="'use strict';\n// Exportación publicada. Administrar desde la fuente editorial privada.\nwindow.LAQP_ARTICLES = "+js(compat)+";\nwindow.loadLAQPArticles = async function(){return window.LAQP_ARTICLES;};\n"
 files['js/guides-legacy.js']="'use strict';\n(function(){var id=new URLSearchParams(location.search).get('id');var routes="+js({key:'/guia/'+i['slug']+'/' for key,i in model.get('identities',{}).items()})+";if(id&&Object.prototype.hasOwnProperty.call(routes,id))location.replace(routes[id]+location.hash);else document.getElementById('guide-legacy-status').textContent=id?'No encontramos esa guía. Buscala en la biblioteca.':'Elegí una guía en la biblioteca.';})();\n"
 def source(name):return (output/name if (output/name).exists() else root/name).read_text('utf-8-sig')
 if (root/'sitemap.xml').exists():files['sitemap.xml']=patch_sitemap(source('sitemap.xml'),live)
 # Reuse the existing, small DOM utility; no application or service is initialized.
 spec=importlib.util.spec_from_file_location('laqp_guide_dom',ROOT/'Herramientas/SpiderPatch/dom.py');dom=importlib.util.module_from_spec(spec);spec.loader.exec_module(dom)
 if (root/'index.html').exists():
  home=dom.parse(source('index.html'));grid=home.find(id='home-guides-grid')
  if grid:
   chosen=sorted(catalog,key=lambda g:({'importar-kits-pes-2018':0,'consejos-crear-caras-pes-2018-editor-interno':1,'sistema-medias-pes-2018':2}.get(g['id'],9)))[:3]
   grid.html(''.join('<article class="editorial-card"><a class="editorial-card-media" href="'+url(g)+'"><img src="'+esc(image_data(root,g.get('thumbnail') or g['image']))+'" alt="" loading="lazy" width="480" height="320"></a><div class="editorial-card-body"><div class="editorial-meta"><span>'+esc(g['category'])+'</span><span>'+esc(g.get('readTime',''))+'</span></div><h3><a href="'+url(g)+'">'+esc(g['title'])+'</a></h3><p>'+esc(g['description'])+'</p><a class="editorial-card-cta" href="'+url(g)+'">Leer guía →</a></div></article>' for g in chosen));files['index.html']=home.render()
 # Stage only assets actually referenced by the selected published/preview guides.
 for guide in live:
  assets=[guide.get('image'),guide.get('thumbnail'),guide.get('seo',{}).get('image')]
  for block in walk(guide.get('blocks',[])):
   assets.extend([block.get('src'),block.get('url')]);assets.extend(i.get('src') for i in block.get('images',[]))
  for asset in filter(None,assets):
   name=asset.lstrip('/')
   if name.startswith('assets/guias-editor/'):
    private=root/'Herramientas/Recursos/Guias/archivos'/Path(name).name
    if private.is_file():files[name]=private.read_bytes()
 for name,html in files.items():
  if name.endswith('.html') and name not in {'index.html'}:
   doc=dom.parse(html);ids=[n.attrs['id'] for n in doc.walk() if n.attrs.get('id')]
   if len(doc.all(tag='h1'))!=1 or len(doc.all(tag='main'))!=1 or len(ids)!=len(set(ids)):raise ValueError('Estructura o identificadores inválidos: '+name)
 return files

def write_outputs(files,root=ROOT,output_root=None,write=None):
 root=Path(root);output=Path(output_root or root)
 # All rendering and validation complete before writing the first file.
 changed={name:text for name,text in files.items() if not (output/name).exists() or (output/name).read_bytes()!=(text if isinstance(text,bytes) else text.encode('utf-8'))}
 backup=None
 if output.resolve()==root.resolve() and changed:
  backup=root/'Herramientas/Salidas/Guias/respaldos'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ-generacion')
  for name in changed:
   p=output/name
   if p.exists():dest=backup/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
 originals={name:(output/name).read_bytes() if (output/name).exists() else None for name in changed};written=[]
 try:
  for name,text in changed.items():
   written.append(name)
   if write and isinstance(text,str):write(output/name,text)
   else:atomic(output/name,text)
 except Exception:
  for name in reversed(written):
   p=output/name
   if originals[name] is None:p.unlink(missing_ok=True)
   else:p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(originals[name])
  raise
 return list(files)

def generate_guides(project_root=ROOT,output_root=None,write=None):
 with project_lock(project_root):return write_outputs(render_outputs(project_root,output_root=output_root),project_root,output_root,write)

def main(argv=None):
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--output',type=Path);p.add_argument('--init',action='store_true');args=p.parse_args(argv)
 if args.init:initialize(args.root)
 print('Guías LAqP:',len(generate_guides(args.root,args.output)),'archivos locales; sin publicar.')
if __name__=='__main__':main()
