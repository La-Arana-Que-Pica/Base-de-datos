"""Locale layer over the established Spider Patch renderer and templates."""
import copy
import json
import re
import xml.etree.ElementTree as ET
from html import escape, unescape
from pathlib import Path
from dom import parse, Node
from multilingual import LANGUAGES, localized, complete

SITE='https://laqp.website'
CATALOG=Path(__file__).parents[1]/'Recursos/Spider-Patch/idiomas.json'

def route(path,lang):return ('/'+lang if lang!='es' else '')+'/'+path.lstrip('/')

def render_all(base,model,root,output_root=None,preview=False,focus=None):
    catalog=json.loads(CATALOG.read_text(encoding='utf-8'))
    outputs={}
    versions={e['slug']:(v,e) for v in model['versions'] for e in v['editions']}
    for lang in LANGUAGES:
        result=base(localized(model,lang),root,output_root,preview,focus)
        if lang=='es':outputs.update(result)
        # Catalog entries may hold named slots such as {n}, {platform} or {time}; longest source wins.
        templates=[]
        for source,target in sorted(catalog.get('ui',{}).get(lang,{}).items(),key=lambda item:len(item[0]),reverse=True):
            names=re.findall(r'\{(\w+)\}',source)
            if names:
                pattern=re.escape(source)
                for slot in names:pattern=pattern.replace(r'\{'+slot+r'\}','(?P<'+slot+'>.+?)',1)
                templates.append((source,names,re.compile(pattern),target))
        for name,content in result.items():
            # Legacy /download/ redirects stay Spanish-only: noindex pages that must not multiply.
            if not name.endswith('.html') or name=='index.html' or name.startswith('download/'):continue
            doc=parse(content);html=doc.find(tag='html');head=doc.find(tag='head');body=doc.find(tag='body')
            if not html or not head or not body:continue
            html.attrs.update({'lang':lang,'dir':'rtl' if lang=='ar' else 'ltr','data-spider-language':lang})
            path=name.removesuffix('index.html') if name.endswith('/index.html') else name
            canonical=SITE+route(path,lang)
            strings=catalog.get('ui',{}).get(lang,{})
            def tr(text):
                if lang=='es':return text
                raw=unescape(text);stripped=raw.strip()
                if stripped in strings:return raw.replace(stripped,strings[stripped])
                for source,names,pattern,target in templates:
                    match=pattern.fullmatch(stripped)
                    if match:
                        result=target
                        for name in names:result=result.replace('{'+name+'}',match.group(name))
                        return raw.replace(stripped,result)
                return raw
            # Existing editorial HTML, rating hooks and discussion identities remain intact.
            for n in doc.walk():
                if n.raw is not None:
                    if n.parent and n.parent.tag not in {'script','style'} and not n.raw.startswith('<'):n.raw=escape(tr(n.raw),quote=False)
                    continue
                for attr in ('aria-label','title','alt','placeholder','content'):
                    if attr in n.attrs and (attr!='content' or n.tag=='meta'):n.attrs[attr]=tr(n.attrs[attr])
                if 'data-i18n' in n.attrs:del n.attrs['data-i18n']
                if n.tag=='a' and 'href' in n.attrs:
                    href=n.attrs['href'];local=href.removeprefix(SITE)
                    if local=='/downloads.html' or local.startswith(('/downloads.html#','/option-files/')):n.attrs['href']=route(local,lang)
            for link in head.all(tag='link',attr={'rel':'alternate'}):link.remove()
            canonical_node=head.find(tag='link',attr={'rel':'canonical'})
            if canonical_node:canonical_node.attrs['href']=canonical
            for code in LANGUAGES:
                head.add(Node('link',{'rel':'alternate','hreflang':code,'href':SITE+route(path,code)}))
            head.add(Node('link',{'rel':'alternate','hreflang':'x-default','href':SITE+route(path,'es')}))
            for n in head.all(tag='meta'):
                if n.attrs.get('property')=='og:url':n.attrs['content']=canonical
            head.add(Node('meta',{'property':'og:locale','content':{'es':'es_AR','en':'en_US','pt':'pt_BR','ar':'ar_AR','it':'it_IT'}[lang]}))
            for script in head.all(tag='script',attr={'type':'application/ld+json'}):
                graph=json.loads(script.inner)
                def schema(value):
                    if isinstance(value,dict):
                        if value.get('@type') in {'Article','WebPage','CollectionPage'}:value['inLanguage']=lang
                        for key,item in value.items():
                            if isinstance(item,str):
                                if item.startswith(SITE+'/option-files/') or item.startswith(SITE+'/downloads.html'):value[key]=SITE+route(item[len(SITE):],lang)
                                elif key in {'name','description'}:value[key]=tr(item)
                            else:schema(item)
                    elif isinstance(value,list):
                        for item in value:schema(item)
                schema(graph);script.html(json.dumps(graph,ensure_ascii=False).replace('<','\\u003c'))
            head.add(Node('link',{'rel':'stylesheet','href':'/css/spider-i18n.css'}))
            body.add(Node('script',{'src':'/js/spider-i18n.js','defer':None}))
            main=doc.find(tag='main') or body
            label=strings.get('Idioma','Idioma')
            switch=Node('nav',{'class':'sp-language-bar','aria-label':label})
            switch.add(Node('label',{'for':'sp-language'})).text_set(label+' ')
            select=switch.add(Node('select',{'id':'sp-language','aria-label':label}))
            for code,native in LANGUAGES.items():
                attrs={'value':code,'data-url':route(path,code)}
                if code==lang:attrs['selected']=None
                select.add(Node('option',attrs)).text_set(native)
            # Real links provide language navigation even without JavaScript.
            links=switch.add(Node('noscript'))
            for code,native in LANGUAGES.items():links.add(Node('a',{'href':route(path,code),'hreflang':code})).text_set(native+' ')
            main.children.insert(0,switch);switch.parent=main
            edition=versions.get(path.split('/')[1]) if path.startswith('option-files/') else None
            if edition:
                v,e=edition
                if lang!='es' and not complete(v,lang):
                    note=Node('p',{'class':'sp-translation-notice','role':'status'})
                    note.text_set(strings.get('Traducción pendiente. Mostramos el contenido original en español.','Traducción pendiente. Mostramos el contenido original en español.'))
                    main.add(note)
                    article=doc.find(cls='of-article-body')
                    if article:article.attrs.update({'lang':'es','dir':'ltr'})
                passwords=[]
                for d in e.get('downloads',[]):
                    password=d.get('password') or (e.get('password') if d.get('kind')=='complete' else '')
                    if not password:continue
                    panel=doc.find(id='download-'+d['id']) or (doc.find(id='descarga') if d.get('kind')=='complete' else None) or (doc.find(cls='sp-download-panel') if d.get('kind')=='complete' else None)
                    if not panel:continue
                    box=Node('aside',{'class':'sp-password','aria-label':strings.get('Contraseña de los archivos','Contraseña de los archivos')})
                    box.add(Node('strong')).text_set(strings.get('Contraseña para descomprimir los archivos:','Contraseña para descomprimir los archivos:'))
                    box.add(Node('bdi',{'dir':'ltr','class':'sp-password-value'})).text_set(password)
                    box.add(Node('button',{'type':'button','data-copy-password':password,'data-copied':strings.get('Copiada','Copiada'),'data-copy-error':strings.get('No se pudo copiar. Seleccioná la contraseña y copiala manualmente.','No se pudo copiar. Seleccioná la contraseña y copiala manualmente.')})).text_set(strings.get('Copiar contraseña','Copiar contraseña'))
                    box.add(Node('span',{'class':'sp-copy-status','aria-live':'polite'}))
                    panel.children.insert(1,box);box.parent=panel
            outputs[route(name,lang).lstrip('/')]=doc.render()
    if not preview:
        ns='http://www.sitemaps.org/schemas/sitemap/0.9';xhtml='http://www.w3.org/1999/xhtml'
        ET.register_namespace('',ns);ET.register_namespace('xhtml',xhtml)
        tree=ET.fromstring(outputs['sitemap.xml'])
        for url in list(tree):
            loc=url.find('{'+ns+'}loc')
            if loc is not None and any(loc.text.startswith(SITE+'/'+lang+'/') for lang in LANGUAGES if lang!='es'):tree.remove(url)
        for url in list(tree):
            loc=url.find('{'+ns+'}loc')
            if loc is None or not (loc.text==SITE+'/downloads.html' or loc.text.startswith(SITE+'/option-files/')):continue
            path=loc.text[len(SITE):]
            for old in list(url):
                if old.tag=='{'+xhtml+'}link':url.remove(old)
            for code in [*LANGUAGES,'x-default']:ET.SubElement(url,'{'+xhtml+'}link',{'rel':'alternate','hreflang':code,'href':SITE+route(path,'es' if code=='x-default' else code)})
            for code in LANGUAGES:
                if code=='es':continue
                clone=copy.deepcopy(url);clone.find('{'+ns+'}loc').text=SITE+route(path,code);tree.append(clone)
        outputs['sitemap.xml']='<?xml version="1.0" encoding="utf-8"?>\n'+ET.tostring(tree,encoding='unicode')+'\n'
    return outputs
