"""Canonical Spider Patch renderer used by the manager, Python and Node builds."""
from pathlib import Path
from datetime import date
from html import escape as esc
from urllib.parse import quote
import argparse, copy, csv, io, json, os, re, shutil, sys, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'Herramientas/SpiderPatch'))
from dom import parse, Node
from model import (ContentError, ROOT, paths, read, atomic, json_text, stamp, backup_root, validate,
                   load_working, load_published, only_published, clean_html, video_url)
SITE='https://laqp.website'

def template(root,name):return parse((Path(root)/'Herramientas/Generadores/templates/spider-patch'/name).with_suffix('.html').read_text(encoding='utf-8'))
def put(node,value):
    if node is not None:node.text_set(value)
def platform(e):return ' / '.join(e.get('platforms') or ['PC','PS4','PS5']) if e['platform']=='all' else {'pc':'PC','playstation':'PS4 / PS5'}[e['platform']]
def edition_url(e):return '/option-files/'+quote(e['slug'],safe='')+'/'
def visible_versions(model):return model.get('versions',[])
def latest_version(model):
    eligible=[v for v in visible_versions(model) if v.get('status')=='published' and v.get('kind')!='addon' and any(e.get('status')=='published' and any(d.get('status')=='published' and d.get('kind')=='complete' and d.get('files') for d in e.get('downloads',[])) for e in v.get('editions',[]))]
    def key(v):return (v.get('published_at',''),tuple(int(x) for x in re.findall(r'\d+',v.get('version',''))))
    return max(eligible,key=key,default=None)
def active_downloads(e):return e.get('downloads',[])
def primary(e):return next((d for d in active_downloads(e) if d.get('kind')=='complete'),next(iter(active_downloads(e)),{}))
def files_count(e):return len(primary(e).get('files',[]))
def long_date(value):
    months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    try:
        d=date.fromisoformat(value);return f'{d.day:02} de {months[d.month-1]} de {d.year}'
    except ValueError:return value or ''
def short_date(value):
    try:return date.fromisoformat(value).strftime('%d/%m/%Y')
    except ValueError:return value or ''
def absolute_image(value):return SITE+quote(value,safe='/') if value.startswith('/') else value

def metadata(doc,title,description,canonical,image,graph=None,noindex=False):
    put(doc.find(tag='title'),title)
    values={'description':description,'og:title':title.removesuffix(' | LAqP'),'og:description':description,'og:url':canonical,'og:image':absolute_image(image),'twitter:title':title.removesuffix(' | LAqP'),'twitter:description':description,'twitter:image':absolute_image(image)}
    for key,value in values.items():
        n=doc.find(tag='meta',attr={'property':key}) or doc.find(tag='meta',attr={'name':key})
        if n:n.attrs['content']=value
    n=doc.find(tag='link',attr={'rel':'canonical'})
    if n:n.attrs['href']=canonical
    if graph is not None:
        for n in doc.all(tag='script',attr={'type':'application/ld+json'}):n.remove()
        doc.find(tag='head').add(Node('script',{'type':'application/ld+json'})).html(json.dumps(graph,ensure_ascii=False).replace('<','\\u003c'))
    for n in doc.all(tag='meta',attr={'name':'robots'}):n.remove()
    if noindex:doc.find(tag='head').add(Node('meta',{'name':'robots','content':'noindex,follow'}))

def tutorial_html(e, css='sp-essential-video'):
    cfg=e.get('tutorial');href=video_url(cfg)
    if not href:return ''
    seconds=cfg['start_seconds'];time=f'{seconds//60:02}:{seconds%60:02}'
    return f'<a class="{css}" href="{esc(href,quote=True)}" target="_blank" rel="noopener noreferrer" aria-label="Ver guía de instalación {esc(platform(e))} en YouTube desde {time} (nueva pestaña)">▶ Guía de instalación ↗</a>'

def block_html(b):
    typ=b['type'];title=b.get('title','');identifier=esc(b['id'],quote=True);variant=b.get('variant','normal')
    body=clean_html(b.get('html',''))
    if typ in {'list','instructions'} and b.get('items'):
        tag='ol' if typ=='instructions' else 'ul';cls='of-number-list' if typ=='instructions' else 'of-check-list'
        body=f'<{tag} class="{cls}">'+''.join('<li>'+esc(x)+'</li>' for x in b['items'])+f'</{tag}>'
    elif typ=='image':
        fit='sp-image-cover' if b.get('fit')=='cover' else 'sp-image-contain'
        body=f'<figure class="sp-editorial-image {fit}"><img src="{esc(b.get("src",""),quote=True)}" alt="{esc(b.get("alt",""),quote=True)}" loading="lazy">'+('<figcaption>'+esc(b['caption'])+'</figcaption>' if b.get('caption') else '')+'</figure>'
    elif typ=='gallery':
        images=''.join(f'<figure><a href="{esc(i.get("src",""),quote=True)}"><img src="{esc(i.get("src",""),quote=True)}" alt="{esc(i.get("alt",""),quote=True)}" loading="lazy"></a>'+('<figcaption>'+esc(i['caption'])+'</figcaption>' if i.get('caption') else '')+'</figure>' for i in b.get('images',[]))
        body='<div class="sp-editorial-gallery sp-gallery-'+str(b.get('columns',2) if b.get('columns') in [1,2,3] else 2)+'">'+images+'</div>'
    elif typ=='video':
        href=video_url(b.get('video'));body='<a class="sp-essential-video" href="'+esc(href or '#',quote=True)+'" target="_blank" rel="noopener noreferrer">'+esc(b.get('caption') or 'Ver video en YouTube')+' ↗</a>' if href else ''
    elif typ=='warning':body='<div class="sp-warning">'+body+'</div>'
    if variant=='disclosure':return f'<details class="sp-lean-support" id="{identifier}"><summary>{esc(title)}</summary>{body}</details>'
    return f'<section class="of-article-section" id="{identifier}">'+('<h2>'+esc(title)+'</h2>' if title else '')+body+'</section>'

def file_rows(download,e):
    rows=[]
    for f in download.get('files',[]):
        size='<small>'+esc(f['size'])+'</small>' if f.get('size') else ''
        href=f.get('url');a=(f'<a class="sp-button sp-button-small" href="{esc(href,quote=True)}" target="_blank" rel="noopener noreferrer">Descargar <span class="sp-sr">{esc(f["name"])} para {esc(platform(e))} (sitio externo)</span><span aria-hidden="true">↗</span></a>' if href else '<span>Archivo sin enlace (borrador)</span>')
        mirrors=''.join(f'<a class="sp-file-mirror" href="{esc(m["url"],quote=True)}" target="_blank" rel="noopener noreferrer">{esc(m.get("name") or "Enlace alternativo")} ↗</a>' for m in f.get('mirrors',[]) if m.get('url'))
        rows.append('<li><span><strong>'+esc(f.get('name') or 'Archivo')+'</strong>'+size+mirrors+'</span>'+a+'</li>')
    return ''.join(rows)

def article(v,e,model,root,latest,preview=False):
    doc=template(root,'article');art=doc.find(cls='sp-publication')
    art.attrs.update({'data-release':v['version'],'data-season':v['season_id'],'data-published':v.get('published_at',''),'data-status':v['status']})
    copy_node=doc.find(cls='sp-lean-header-copy');h=copy_node.find(tag='h1');h.text_set(e.get('heading') or v['title']);h.add(Node('span')).text_set(platform(e))
    put(copy_node.find(cls='sp-deck'),e.get('description',''))
    time=copy_node.find(tag='time');time.attrs['datetime']=v.get('published_at','');put(time,short_date(v.get('published_at','')))
    meta=doc.find(cls='sp-release-meta');is_latest=latest and latest['id']==v['id']
    meta.html('<span class="sp-latest">'+(('OCULTO · VISTA PREVIA' if v.get('status')=='hidden' else 'BORRADOR · VISTA PREVIA') if preview and v.get('status')!='published' else 'ÚLTIMA VERSIÓN DISPONIBLE')+'</span>' if is_latest else '<span class="sp-archive-badge">'+('Complemento opcional' if v.get('kind')=='addon' else 'Archivo de versiones')+'</span>')
    cover_path=e.get('cover') or v.get('cover','')
    if cover_path:
        cover=doc.find(cls='sp-lean-header-cover').find(tag='img');cover.attrs.update({'src':cover_path,'alt':e.get('cover_alt') or 'Portada de '+v['title']})
    else:
        doc.find(cls='sp-lean-header-cover').remove();doc.find(cls='sp-publication-header').attrs['class']+=' sp-no-cover'
    nav=doc.find(cls='sp-edition-nav')
    if v.get('kind')=='addon':nav.remove()
    else:nav.html(''.join('<a href="'+edition_url(other)+'"'+(' aria-current="page"' if other['id']==e['id'] else '')+'>'+esc(platform(other))+'</a>' for other in v['editions']))
    crumbs=doc.find(cls='sp-breadcrumbs');crumbs.children[-1].text_set((e.get('heading') or v['title'])+' · '+platform(e))
    body=[];after=[]
    for b in e.get('blocks',[]):
        rendered=block_html(b)
        if b.get('id')=='instalacion' and e.get('tutorial',{}):
            if e['tutorial'].get('show_in_article',True):rendered=rendered.removesuffix('</section>')+tutorial_html(e)+'</section>'
        (after if b.get('variant')=='disclosure' else body).append(rendered)
    doc.find(cls='of-article-body').html(''.join(body))
    panel=doc.find(id='descarga');put(panel.find(tag='h2'),'Descargar complemento' if v.get('kind')=='addon' else 'Descargar para '+platform(e))
    for n in list(panel.children):
        if n.tag=='p' and 'sp-external-note' not in (n.attrs.get('class') or ''):n.remove()
    intro=e.get('download_intro','')
    if intro:
        n=Node('p');n.text_set(intro);n.parent=panel;panel.children.insert(1,n)
    downloads=active_downloads(e);main=primary(e)
    file_list=doc.find(cls='sp-files')
    package_lookup={d['id']:(version,edition,d) for version in model['versions'] for edition in version['editions'] for d in edition.get('downloads',[])}
    def dependency_links(refs):
        links=[]
        for key in refs:
            if key not in package_lookup:continue
            version,edition,download=package_lookup[key]
            anchor='#descarga' if download is primary(edition) else '#download-'+quote(key,safe='')
            links.append('<a href="'+edition_url(edition)+anchor+'">'+esc(version['title']+' · '+platform(edition)+' · '+download['name'])+'</a>')
        return ', '.join(links)
    extra=''
    if main.get('description'):extra+='<p>'+esc(main['description'])+'</p>'
    if main.get('show_details') and main.get('compatibility'):extra+='<p><strong>Compatibilidad:</strong> '+esc(main['compatibility'])+'</p>'
    if main.get('requires'):extra+='<p><strong>Requiere:</strong> '+dependency_links(main['requires'])+'</p>'
    if main.get('install_before'):extra+='<p><strong>Instalar antes de:</strong> '+dependency_links(main['install_before'])+'</p>'
    if main.get('warnings'):extra+='<div class="sp-warning">'+esc(main['warnings'])+'</div>'
    if main.get('image'):extra+='<img class="sp-addon-image" src="'+esc(main['image'],quote=True)+'" alt="'+esc(main['name'],quote=True)+'" loading="lazy">'
    if extra:file_list.replace(extra+file_list.render());file_list=doc.find(cls='sp-files')
    file_list.html(file_rows(main,e))
    if main.get('instructions'):
        for n in list(parse(clean_html(main['instructions'])).children):panel.add(n)
    for d in downloads:
        if d is main:continue
        details='<section class="sp-optional-download" id="download-'+esc(d['id'],quote=True)+'"><span class="sp-eyebrow">'+({'addon':'Complemento opcional','update':'Actualización','complete':'Descarga completa'}[d['kind']])+'</span><h3>'+esc(d['name'])+'</h3>'
        if d.get('description'):details+='<p>'+esc(d['description'])+'</p>'
        if d.get('compatibility'):details+='<p><strong>Compatible con:</strong> '+esc(d['compatibility'])+'</p>'
        if d.get('requires'):details+='<p><strong>Requiere:</strong> '+dependency_links(d['requires'])+'</p>'
        if d.get('install_before'):details+='<p><strong>Instalar antes de:</strong> '+dependency_links(d['install_before'])+'</p>'
        if d.get('warnings'):details+='<div class="sp-warning">'+esc(d['warnings'])+'</div>'
        if d.get('image'):details+='<img class="sp-addon-image" src="'+esc(d['image'],quote=True)+'" alt="'+esc(d['name'],quote=True)+'" loading="lazy">'
        details+='<ul class="sp-files">'+file_rows(d,e)+'</ul>'+clean_html(d.get('instructions',''))+'</section>';panel.add(parse(details).children[0])
    card=doc.find(cls='sp-info-card');card.attrs['id']=e['slug'];values=[v['version'],v['season_id'],platform(e),str(files_count(e))+(' partes obligatorias' if files_count(e)>1 else ' archivo'),'Última disponible' if is_latest else ('Complemento opcional' if v.get('kind')=='addon' else 'Versión anterior')]
    for dd,value in zip(card.find(tag='dl').all(tag='dd'),values):put(dd,value)
    rating=card.find(cls='sp-rating')
    if e.get('rating_html'):rating.replace(e['rating_html'])
    rating=card.find(cls='sp-rating');rating.attrs['data-sp-rating']=e['comments_id']
    comments=doc.find(id='comentarios');comments.attrs.update({'data-page-type':'download','data-page-id':e['comments_id']})
    if after:
        for part in after:comments.parent.children.insert(comments.parent.children.index(comments),parse(part).children[0])
    canonical=SITE+edition_url(e);seo=e.get('seo',{});title=seo.get('title') or (v['title']+' · '+platform(e)+' | LAqP');description=seo.get('description') or e.get('description','')
    graph=copy.deepcopy(e.get('schema') or {'@context':'https://schema.org','@graph':[]})
    articles=[g for g in graph.get('@graph',[]) if g.get('@type')=='Article']
    if not articles:
        graph={'@context':'https://schema.org','@graph':[{'@type':'Article','author':{'@type':'Organization','name':'LAqP','url':SITE+'/acerca-de.html'}}]};articles=graph['@graph']
    articles[0].update({'@id':canonical+'#publicacion','mainEntityOfPage':canonical,'headline':(e.get('heading') or v['title'])+' · '+platform(e),'description':description,'datePublished':v.get('published_at',''),'image':absolute_image(e.get('cover') or v.get('cover',''))})
    if not cover_path:articles[0].pop('image',None)
    if v.get('updated_at'):
        articles[0]['dateModified']=v['updated_at']
        copy_node.find(cls='sp-publication-date').add(' · Actualizado el '+esc(short_date(v['updated_at'])))
    breadcrumbs={'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Inicio','item':SITE+'/'},{'@type':'ListItem','position':2,'name':'Spider Patch','item':SITE+'/downloads.html'},{'@type':'ListItem','position':3,'name':(e.get('heading') or v['title'])+' · '+platform(e),'item':canonical}]}
    graph['@graph']=[g for g in graph['@graph'] if g.get('@type')!='BreadcrumbList']+[breadcrumbs]
    metadata(doc,title,description,canonical,seo.get('image') or e.get('cover') or v.get('cover',''),graph,preview)
    return doc.render()

def parts_page(v,e,root,preview=False):
    doc=template(root,'parts');page=doc.find(cls='sp-parts-page');h=page.find(tag='h1');h.text_set(e.get('heading') or v['title']);h.add(Node('span')).text_set('Todos los archivos, en un lugar.')
    put(page.find(cls='sp-eyebrow'),'Descarga completa · '+platform(e));put(page.find(cls='sp-deck'),f'Necesitás las {files_count(e)} partes. Guardalas juntas e iniciá la extracción desde la primera; no son complementos opcionales.')
    page.find(cls='sp-back').attrs['href']=edition_url(e);doc.find(cls='sp-files').html(file_rows(primary(e),e));put(doc.find(cls='sp-download-panel').find(tag='h2'),'Descargas para '+platform(e))
    guide=doc.find(cls='sp-tutorial')
    if guide:
        link=guide.find(tag='a')
        if video_url(e.get('tutorial')):
            if link:link.replace(tutorial_html(e,'sp-text-link'))
            put(guide.find(tag='h3'),'Tutorial de instalación '+v['version'])
        else:guide.remove()
    crumbs=doc.find(cls='sp-breadcrumbs');crumbs.children[-1].text_set('Descargar '+v['title']+' · '+platform(e))
    canonical=SITE+edition_url(e)+'descargar/'
    metadata(doc,'Descargar '+v['title']+' · '+platform(e)+' | LAqP','Todas las partes de '+v['title']+' para '+platform(e)+'.',canonical,e.get('cover') or v.get('cover',''),{'@context':'https://schema.org','@type':'WebPage','name':'Descargar '+v['title'],'url':canonical},True)
    return doc.render()

def platform_card(v,e,root):
    node=template(root,'platform-card').children[0];node.attrs['id']=e['id'];node.attrs['aria-labelledby']='latest-'+e['platform']
    for n in node.all(tag='span'):
        if n.attrs.get('id'):n.remove()
    head=node.find(cls='sp-platform-heading');h=head.find(tag='h3');h.attrs['id']='latest-'+e['platform'];put(h,platform(e));put(head.find(cls='sp-platform-icon'),'PC' if e['platform']=='pc' else 'PS')
    for alias in e.get('hub_aliases',[]):node.add(Node('span',{'id':alias,'class':'sp-sr'}))
    count=files_count(e);put(node.find(tag='p'),('Parche completo' if e['platform']=='pc' else 'Option File completo')+' · '+str(count)+(' partes obligatorias' if count>1 else ' archivo'))
    a=node.find(cls='sp-button');a.attrs['href']=edition_url(e);put(a,'Ver contenido y descargar '+platform(e))
    for old in node.all(attr={'data-video-release':'2026-v3'}):old.remove()
    for old in node.all(cls='sp-installation-video'):old.remove()
    html=tutorial_html(e,'sp-installation-video')
    if html:node.add(parse(html).children[0])
    else:node.add(parse('<span class="sp-installation-video sp-installation-pending"><span aria-hidden="true">▶</span> Guía de instalación <small>Video pendiente</small></span>').children[0])
    return node.render()

def latest_html(v,root):
    if not v:return '<section class="sp-featured"><h2>Spider Patch</h2><p>No hay versiones publicadas disponibles.</p></section>'
    node=template(root,'latest').children[0];node.attrs.update({'id':'version-'+v['season_id']+'-'+v['version'].lower(),'data-release':v['version'],'data-season':v['season_id'],'data-published':v.get('published_at',''),'data-status':v['status']})
    h=node.find(cls='sp-latest-header');put(h.find(tag='h2'),v['title']);time=h.find(tag='time');time.attrs['datetime']=v.get('published_at','');put(time,short_date(v.get('published_at','')))
    h.find(cls='sp-compact-date').html('<time datetime="'+esc(v.get('published_at',''),quote=True)+'">'+esc(long_date(v.get('published_at','')) )+'</time> · Temporada '+esc(v.get('coverage') or v['season_id']))
    put(h.find(cls='sp-latest-summary'),v.get('summary',''));h.find(tag='img').attrs.update({'src':v.get('cover',''),'alt':'Portada original de '+v['title']})
    if not v.get('cover'):h.find(tag='img').remove();h.attrs['class']+=' sp-no-cover'
    node.find(cls='sp-platform-grid').html(''.join(platform_card(v,e,root) for e in v['editions']))
    put(node.find(cls='sp-package-note'),v.get('download_note') or 'Elegí los archivos de tu plataforma y conservá una copia de seguridad antes de instalar.')
    return node.render()

def archive_entry(v,root):
    addon=v.get('kind')=='addon';node=template(root,'extra-entry' if addon else 'archive-entry').children[0]
    node.attrs.update({'id':v['editions'][0]['id'] if addon else 'version-'+v['season_id']+'-'+v['version'].lower(),'data-release':v['version'],'data-season':v['season_id'],'data-published':v.get('published_at',''),'data-status':v['status']})
    h=node.find(tag='h3');put(h,v.get('archive_title') or v['title'])
    image=node.find(cls='sp-version-thumb')
    if v.get('cover'):image.attrs['src']=v['cover']
    else:
        image.remove();summary=node.find(tag='summary');summary.attrs['class']=(summary.attrs.get('class') or '').replace('sp-version-summary-with-image','').strip()
    time=node.find(tag='time')
    if time:time.attrs['datetime']=v.get('published_at','');put(time,short_date(v.get('published_at','')))
    body=node.find(cls='sp-version-body');put(body.find(tag='p'),v.get('summary',''))
    nav=body.find(tag='nav');nav.attrs['aria-label']='Publicaciones de '+v['title']
    if addon:
        nav.html('<a href="'+edition_url(v['editions'][0])+'">Publicación, instrucciones y descarga →</a>'+tutorial_html(v['editions'][0],'sp-text-link'))
    else:nav.html(''.join('<a id="'+esc(e['id'],quote=True)+'" href="'+edition_url(e)+'">'+esc(platform(e))+' · publicación y descargas →</a>' for e in v['editions']))
    return node.render()

def hub_page(model,root,latest,preview=False):
    doc=template(root,'hub');html=doc.render().replace('{{LATEST}}',latest_html(latest,root))
    sections=[]
    for season in model['seasons']:
        entries=[v for v in model['versions'] if v['season_id']==season['id'] and (not latest or v['id']!=latest['id']) and v.get('editions')]
        sections.append('<section class="sp-season" id="temporada-'+esc(season['id'],quote=True)+'" data-season="'+esc(season['id'],quote=True)+'" aria-labelledby="season-title-'+esc(season['id'],quote=True)+'"><h3 class="sp-sr" id="season-title-'+esc(season['id'],quote=True)+'">Archivo de '+esc(season['title'])+'</h3>'+(''.join(archive_entry(v,root) for v in entries) if entries else '<p class="sp-package-note">No hay versiones anteriores en esta temporada.</p>')+'</section>')
    nav=''.join('<a href="#temporada-'+esc(s['id'],quote=True)+'" data-season-link="'+esc(s['id'],quote=True)+'"'+(' aria-current="true"' if latest and latest['season_id']==s['id'] else '')+'>'+esc(s.get('label') or s['id'])+'</a>' for s in model['seasons'])
    archive='<section id="versiones-anteriores" class="sp-compact-archive" aria-labelledby="archive-title"><div class="sp-seasons-bar"><h2 id="archive-title">Versiones anteriores</h2><nav class="sp-season-nav" aria-label="Temporadas de versiones anteriores">'+nav+'</nav></div>'+''.join(sections)+'</section>'
    doc=parse(html.replace('{{ARCHIVE}}',archive));put(doc.find(cls='sp-hero').find(tag='p'),model['product'].get('tagline',''))
    if not model['product'].get('hero_image'):doc.find(cls='sp-hero').attrs['style']='--sp-hero-image:none'
    elif model['product']['hero_image']!='/assets/images/home-banner-main-2.webp':doc.find(cls='sp-hero').attrs['style']="--sp-hero-image:url('"+quote(model['product']['hero_image'],safe='/')+"')"
    seo=model['product'].get('seo',{});graph={'@context':'https://schema.org','@graph':[{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Inicio','item':SITE+'/'},{'@type':'ListItem','position':2,'name':'Spider Patch','item':SITE+'/downloads.html'}]},{'@type':'CollectionPage','name':'Spider Patch by LAqP','url':SITE+'/downloads.html','description':'Temporadas, versiones, descargas e instalación de Spider Patch para PES 2018.'}]}
    metadata(doc,seo.get('title','Spider Patch | LAqP'),seo.get('description',''),SITE+'/downloads.html',seo.get('image',''),graph,preview)
    return doc.render()

def legacy_redirect(e,root):
    doc=template(root,'hub');main=doc.find(tag='main');target=edition_url(e)
    main.html('<section class="of-legacy-redirect"><h1>'+esc(e.get('heading') or e['slug'])+'</h1><p>Esta página cambió de dirección.</p><a class="sp-button" href="'+target+'">Abrir la publicación</a></section>')
    metadata(doc,'Spider Patch | LAqP','Publicación de Spider Patch.',SITE+target,'',{'@context':'https://schema.org','@type':'WebPage','url':SITE+target},True)
    doc.find(tag='head').add(Node('meta',{'http-equiv':'refresh','content':'0; url='+target}));return doc.render()
def tombstone(identity,root,slug):
    doc=template(root,'hub');doc.find(tag='main').html('<section class="of-legacy-redirect"><h1>'+esc(identity.get('title') or 'Spider Patch')+'</h1><p>Esta publicación no está disponible.</p><a class="sp-button" href="/downloads.html">Volver a Spider Patch</a></section>')
    metadata(doc,'Publicación no disponible | LAqP','Publicación de Spider Patch no disponible.',SITE+'/option-files/'+slug+'/', '',{'@context':'https://schema.org','@type':'WebPage'},True);return doc.render()

def exports(model,latest):
    rows=[]
    for v in model['versions']:
        for e in v['editions']:
            legacy=copy.deepcopy(e.get('legacy',{}).get('json',{}));parts=[{'name':f['name'],'url':f.get('url',''),'size':f.get('size','')} for f in primary(e).get('files',[])]
            legacy.update({'id':e['id'],'slug':e['slug'],'title':v['title'],'description':e.get('description',''),'version':v['version'],'game':'PES 2018','season':v['season_id'],'date':v.get('published_at',''),'platforms':e.get('platforms') or (['PC'] if e['platform']=='pc' else ['PS4','PS5']),'cover':e.get('cover') or v.get('cover',''),'featured':bool(latest and v['id']==latest['id']),'status':'Disponible','category':'Complemento' if v.get('kind')=='addon' else 'Option File','download_parts':parts,'tutorial':video_url(e.get('tutorial')) or ''})
            rows.append(legacy)
    output=io.StringIO(newline='');fields=['id','titulo','version','juego','plataforma','descripcion','link','miniatura','destacado','categoria','fecha','detalles','estado','tags','links'];writer=csv.DictWriter(output,fieldnames=fields,delimiter=';',lineterminator='\n');writer.writeheader()
    for e in rows:
        writer.writerow({'id':e['id'],'titulo':e['title'],'version':e['version'],'juego':'PES 2018','plataforma':'/'.join(e['platforms']),'descripcion':e['description'],'link':next(iter(e['download_parts']),{}).get('url',''),'miniatura':e['cover'],'destacado':'1' if e['featured'] else '0','categoria':e['category'],'fecha':e['date'],'detalles':'/option-files/'+e['slug']+'/','estado':'Disponible','tags':'PES 2018 | '+e['season'],'links':' | '.join(p['name']+'::'+p['url'] for p in e['download_parts'])})
    return rows,output.getvalue()

def render_outputs(model,root=ROOT,output_root=None,preview=False,focus=None):
    root=Path(root);output_root=Path(output_root or root);validate(model,root,publishing=not preview)
    public=copy.deepcopy(model) if preview else only_published(model)
    if preview:
        # Hidden content stays hidden; only a selected draft is promoted inside the private preview.
        public['versions']=[v for v in public['versions'] if v.get('status')!='hidden' or v['id']==focus]
        for v in public['versions']:
            v['editions']=[e for e in v.get('editions',[]) if e.get('status')!='hidden' or v['id']==focus]
            for e in v['editions']:e['downloads']=[d for d in e.get('downloads',[]) if d.get('status')!='hidden' or v['id']==focus]
    latest=latest_version(only_published(model))
    if preview and focus:latest=next((v for v in public['versions'] if v['id']==focus and v.get('kind')!='addon' and v.get('editions')),latest)
    def source(name):
        p=output_root/name
        return p.read_text(encoding='utf-8-sig') if p.exists() else (root/name).read_text(encoding='utf-8-sig')
    result={'downloads.html':hub_page(public,root,latest,preview)};live={}
    for v in public['versions']:
        for e in v['editions']:
            live[e['id']]=e;result['option-files/'+e['slug']+'/index.html']=article(v,e,public,root,latest,preview)
            if files_count(e)>1:result['option-files/'+e['slug']+'/descargar/index.html']=parts_page(v,e,root,preview)
            result['download/'+e['id']+'/index.html']=legacy_redirect(e,root)
    if not preview:
        for key,identity in model.get('identities',{}).items():
            if key not in live:
                page=tombstone(identity,root,identity['slug']);result['option-files/'+identity['slug']+'/index.html']=page;result['option-files/'+identity['slug']+'/descargar/index.html']=page;result['download/'+key+'/index.html']=page
            elif files_count(live[key])<=1:
                stale=root/'option-files'/identity['slug']/'descargar/index.html'
                if stale.exists():result['option-files/'+identity['slug']+'/descargar/index.html']=legacy_redirect(live[key],root)
    flat,csv_text=exports(public,latest);result['database/option-files.json']=json_text(flat);result['database/descargas.csv']=csv_text
    index=json.loads(source('database/content-index.json'));items=index.setdefault('items',{})
    for key in list(items):
        if key.startswith('download:'):items.pop(key)
    for e in flat:items['download:'+e['slug']]={'title':e['title'],'url':'/option-files/'+e['slug']+'/'}
    result['database/content-index.json']=json_text(index)
    tree=ET.fromstring(source('sitemap.xml'));ns='http://www.sitemaps.org/schemas/sitemap/0.9';ET.register_namespace('',ns)
    for item in list(tree):
        loc=item.find('{'+ns+'}loc');url=loc.text if loc is not None else ''
        if url and (url==SITE+'/downloads.html' or url.startswith(SITE+'/option-files/') or url.startswith(SITE+'/download/')):tree.remove(item)
    for path,lastmod in [('downloads.html',max((v.get('updated_at') or v.get('published_at','') for v in public['versions']),default=''))]+[('option-files/'+e['slug']+'/',v.get('updated_at') or v.get('published_at','')) for v in public['versions'] for e in v['editions']]:
        item=ET.SubElement(tree,'{'+ns+'}url');ET.SubElement(item,'{'+ns+'}loc').text=SITE+'/'+path
        if lastmod:ET.SubElement(item,'{'+ns+'}lastmod').text=lastmod
    result['sitemap.xml']='<?xml version="1.0" encoding="utf-8"?>\n'+ET.tostring(tree,encoding='unicode')+'\n'
    home=source('index.html');home_doc=parse(home);promo=home_doc.find(id='featured-of-section')
    if promo and latest:
        new=template(root,'home').children[0];put(new.find(cls='sp-home-description'),(latest.get('home_description') or 'Descubrí {version}: '+latest.get('summary','')).replace('{version}',latest['title']));image=new.find(cls='sp-home-promo-image');image.attrs['href']='/downloads.html#version-'+latest['season_id']+'-'+latest['version'].lower();image.find(tag='img').attrs.update({'src':latest.get('cover',''),'alt':'Portada de '+latest['title']});put(image.find(cls='sp-latest'),'ÚLTIMA VERSIÓN DISPONIBLE · '+latest['version']);promo.replace(new);result['index.html']=home_doc.render()
    elif promo:
        promo.remove();result['index.html']=home_doc.render()
    def media_values(value):
        if isinstance(value,dict):
            for item in value.values():yield from media_values(item)
        elif isinstance(value,list):
            for item in value:yield from media_values(item)
        elif isinstance(value,str):
            yield from re.findall(r'/assets/images/spider-patch/[A-Za-z0-9_.-]+',value)
    for image in set(media_values(public)):
        private=root/'Herramientas/Recursos/Spider-Patch/imagenes'/Path(image).name
        if private.is_file():result[image.lstrip('/')]=private.read_bytes()
    # Validate actual output, including duplicate anchors introduced by rich content.
    for name,content in result.items():
        if not name.endswith('.html'):continue
        doc=parse(content);ids=[n.attrs['id'] for n in doc.walk() if n.raw is None and 'id' in n.attrs]
        if len(ids)!=len(set(ids)):raise ContentError('IDs HTML duplicados en '+name)
        if len(doc.all(tag='h1'))!=1:raise ContentError('La página necesita un H1 único: '+name)
    return result

_render_spanish=render_outputs
def render_outputs(model,root=ROOT,output_root=None,preview=False,focus=None):
    from spider_locales import render_all
    return render_all(_render_spanish,model,root,output_root,preview,focus)

def write_outputs(outputs,output_root,root=ROOT,writer=None,backup=True,extra=None):
    output_root=Path(output_root).resolve();root=Path(root).resolve();combined=dict(outputs);combined.update(extra or {})
    transaction=backup_root(root)/(stamp()+'-generacion') if backup else None;written=[];originals={}
    if transaction:transaction.mkdir(parents=True,exist_ok=True)
    for relative,content in combined.items():
        target=(output_root/relative).resolve()
        if not target.is_relative_to(output_root):raise ContentError('Ruta de salida no permitida.')
        if target.exists() and (target.read_bytes()==content if isinstance(content,bytes) else target.read_text(encoding='utf-8-sig')==content):continue
        originals[relative]=target.read_bytes() if target.exists() else None
        if transaction and target.exists():
            saved=transaction/relative;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
    if transaction:atomic(transaction/'operacion.json',json_text({'state':'preparada','files':list(originals),'created':[f for f,v in originals.items() if v is None]}))
    try:
        for relative in originals:
            target=output_root/relative
            written.append(relative)
            if writer:writer(target,combined[relative])
            else:atomic(target,combined[relative])
    except Exception:
        for relative in reversed(written):
            target=output_root/relative
            if originals[relative] is None:target.unlink(missing_ok=True)
            else:target.write_bytes(originals[relative])
        raise
    if transaction:atomic(transaction/'operacion.json',json_text({'state':'completa','files':written,'created':[f for f,v in originals.items() if v is None]}))
    return written

def generate(root=ROOT,output_root=None,writer=None):
    root=Path(root);target=Path(output_root or root);model=load_published(root);outputs=render_outputs(model,root,target)
    return write_outputs(outputs,target,root,writer=writer,backup=target.resolve()==root.resolve())

def publish(model,root=ROOT):
    root=Path(root);validate(model,root,publishing=True,previous=load_working(root));new=copy.deepcopy(model);new['revision']=model['revision']+1
    for v in new['versions']:
        if v.get('status')!='published':continue
        for e in v.get('editions',[]):
            if e.get('status')=='published':new.setdefault('identities',{}).setdefault(e['id'],{'slug':e['slug'],'comments_id':e['comments_id'],'title':e.get('heading') or v['title'],'platform':e['platform']})
    outputs=render_outputs(new,root);source,snapshot=paths(root)
    manifest=root/'Herramientas/Recursos/Spider-Patch/salidas.json'
    extra={str(source.relative_to(root)).replace('\\','/'):json_text(new),str(snapshot.relative_to(root)).replace('\\','/'):json_text(only_published(new)),str(manifest.relative_to(root)).replace('\\','/'):json_text({'schema_version':1,'files':sorted(outputs)})}
    written=write_outputs(outputs,root,root,extra=extra)
    return new,written

def main(argv=None):
    parser=argparse.ArgumentParser(description='Generar únicamente Spider Patch, sin publicar en GitHub.')
    parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--output',type=Path);parser.add_argument('--init',action='store_true')
    parser.add_argument('--export',action='store_true')
    args=parser.parse_args(argv)
    if args.export:
        m=load_published(args.root);print(json.dumps(exports(m,latest_version(m))[0],ensure_ascii=False));return
    if args.init:load_working(args.root);print('Spider Patch importado. Fuentes y diseño respaldados.')
    else:print('Spider Patch: '+str(len(generate(args.root,args.output)))+' archivos locales actualizados.')


from model import project_lock
_generate=generate
_publish=publish
def generate(root=ROOT,output_root=None,writer=None):
    with project_lock(root):return _generate(root,output_root,writer)
def publish(model,root=ROOT):
    with project_lock(root):
        if model.get('revision')!=load_working(root)['revision']:raise ContentError('El contenido cambió. Recargá antes de generar.')
        return _publish(model,root)
if __name__=='__main__':main()

