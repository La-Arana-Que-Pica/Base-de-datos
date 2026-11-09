"""Local graphical Spider Patch manager. Standard library; bound to loopback only."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs,unquote
from urllib.request import urlopen
import argparse, base64, copy, hashlib, json, mimetypes, re, secrets, sys, threading, time, webbrowser
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Generadores'))
from model import only_published, ROOT, ContentError, load_working, save_working, validate, paths, read, atomic, backup_root, stamp, json_text
from spider_patch import render_outputs, publish
WEB=Path(__file__).parent/'web'

class Application:
    def __init__(self,root):
        self.root=Path(root).resolve();self.token=secrets.token_urlsafe(32);self.lock=threading.RLock();self.preview=None;self.last_preview_model=None;self.import_reviews={}
        load_working(self.root)
    def export_version(self,version,season):
        from spider_exchange import export_version
        content=export_version(version,season)
        return {'filename':'spider-patch-'+json.loads(content)['version']['id']+'.json','content':content}
    def review_import(self,raw,revision):
        from spider_exchange import review
        current=load_working(self.root)
        if type(revision) is not int or revision!=current['revision']:raise ContentError('El contenido cambió. Recargá antes de importar.')
        document,summary=review(raw,current,self.root)
        self.import_reviews={k:v for k,v in self.import_reviews.items() if time.monotonic()-v['created']<900}
        while len(self.import_reviews)>=8:self.import_reviews.pop(next(iter(self.import_reviews)))
        key=secrets.token_urlsafe(24)
        self.import_reviews[key]={'document':document,'summary':summary,'revision':revision,'created':time.monotonic()}
        return {'review_id':key,**summary}
    def confirm_import(self,key,mode,confirm_replace=False):
        from spider_exchange import integrate
        entry=self.import_reviews.get(key)
        if not entry or time.monotonic()-entry['created']>900:raise ContentError('La revisión venció. Volvé a seleccionar el archivo.')
        if mode=='replace' and (confirm_replace is not True or not entry['summary']['replace_allowed']):raise ContentError('El reemplazo necesita una versión compatible y confirmación explícita.')
        current=load_working(self.root)
        if entry['revision']!=current['revision']:raise ContentError('El contenido cambió. Revisá el archivo otra vez.')
        result,selected,warnings=integrate(entry['document'],current,self.root,mode,entry['summary']['existing_id'])
        saved=save_working(result,entry['revision'],self.root)
        self.import_reviews.pop(key,None)
        return {'model':saved,'selected':selected,'warnings':warnings,'message':'Versión importada y guardada como borrador. No se generó ni publicó la web.'}
    def info(self):
        return {'model':load_working(self.root),'published_revision':read(paths(self.root)[1]).get('revision'),'root':str(self.root)}
    def preview_model(self,model,focus=None):
        outputs=render_outputs(model,self.root,preview=True,focus=focus)
        stage=self.root/'Herramientas/Salidas/Spider-Patch/vista-previa'/stamp()
        for name,content in outputs.items():atomic(stage/name,content)
        self.preview=stage;self.last_preview_model=copy.deepcopy(model)
        base=stage.parent.resolve()
        old=[p for p in sorted(base.iterdir(),reverse=True) if p.is_dir() and re.fullmatch(r'\d{8}T\d{12}Z',p.name)]
        for folder in old[3:]:
            resolved=folder.resolve()
            if resolved.is_relative_to(base) and resolved!=base:
                import shutil
                shutil.rmtree(resolved)
        return {'url':'/downloads.html?preview='+stage.name,'files':len(outputs)}
    def images(self,query=''):
        images=[];base=self.root/'assets/images'
        for p in sorted(base.rglob('*')):
            if p.is_file() and p.suffix.lower() in {'.webp','.png','.jpg','.jpeg','.gif','.avif'}:
                url='/'+p.relative_to(self.root).as_posix()
                if query.lower() in url.lower():images.append({'url':url,'name':p.name,'private':False})
        private=self.root/'Herramientas/Recursos/Spider-Patch/imagenes'
        if private.exists():
            for p in sorted(private.iterdir()):
                if p.is_file() and query.lower() in p.name.lower():images.append({'url':'/assets/images/spider-patch/'+p.name,'name':p.name,'private':True})
        return images[:500]
    def upload(self,data):
        name=Path(data.get('name','imagen')).name
        try:blob=base64.b64decode(data.get('data',''),validate=True)
        except ValueError:raise ContentError('Archivo de imagen inválido.')
        if not blob or len(blob)>12*1024*1024:raise ContentError('La imagen debe pesar menos de 12 MB.')
        ext='.png' if blob.startswith(b'\x89PNG\r\n\x1a\n') else '.jpg' if blob.startswith(b'\xff\xd8\xff') else '.webp' if blob.startswith(b'RIFF') and blob[8:12]==b'WEBP' else '.gif' if blob.startswith((b'GIF87a',b'GIF89a')) else None
        if not ext:raise ContentError('Usá PNG, JPEG, WebP o GIF. No se admiten SVG ni archivos ejecutables.')
        stem=re.sub(r'[^a-zA-Z0-9_-]','-',Path(name).stem)[:48].strip('-') or 'imagen'
        filename=stem+'-'+hashlib.sha256(blob).hexdigest()[:12]+ext
        atomic(self.root/'Herramientas/Recursos/Spider-Patch/imagenes'/filename,blob)
        return {'url':'/assets/images/spider-patch/'+filename,'name':filename,'private':True}
    def backups(self):
        base=backup_root(self.root)
        if not base.exists():return []
        result=[]
        for folder in sorted(base.iterdir(),reverse=True):
            candidates=[folder/'contenido.json',folder/'Herramientas/Recursos/Spider-Patch/contenido.json']
            p=next((p for p in candidates if p.is_file()),None)
            if p:result.append({'id':p.relative_to(base).as_posix(),'label':folder.name})
        return result[:100]
    def restore(self,name):
        allowed={b['id'] for b in self.backups()}
        if name not in allowed:raise ContentError('Respaldo no válido.')
        current=load_working(self.root);model=read(backup_root(self.root)/name)
        model['identities']={**model.get('identities',{}),**current.get('identities',{})}
        return save_working(model,current['revision'],self.root)

class Handler(BaseHTTPRequestHandler):
    server_version='SpiderPatchLocal/1'
    def log_message(self,*args):pass
    @property
    def app(self):return self.server.app
    def allowed_host(self):
        return self.headers.get('Host','') in {'127.0.0.1:'+str(self.server.server_port),'localhost:'+str(self.server.server_port)}
    def json_response(self,value,status=200):
        data=json.dumps(value,ensure_ascii=False).encode('utf-8');self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def error(self,message,status=400):self.json_response({'error':str(message)},status)
    def authenticated(self):
        if not self.allowed_host():return False
        if not secrets.compare_digest(self.headers.get('X-Spider-Token',''),self.app.token):return False
        origin=self.headers.get('Origin')
        return not origin or origin in {'http://127.0.0.1:'+str(self.server.server_port),'http://localhost:'+str(self.server.server_port)}
    def do_GET(self):
        if not self.allowed_host():return self.error('Host no permitido.',403)
        url=urlsplit(self.path);route=unquote(url.path)
        try:
            if route.startswith('/api/'):
                if not self.authenticated():return self.error('Acceso local no autorizado.',403)
                with self.app.lock:
                    if route=='/api/state':return self.json_response(self.app.info())
                    if route=='/api/images':return self.json_response(self.app.images(parse_qs(url.query).get('q',[''])[0]))
                    if route=='/api/backups':return self.json_response(self.app.backups())
                return self.error('Acción inexistente.',404)
            if route in {'/','/admin','/admin/'}:
                text=(WEB/'index.html').read_text(encoding='utf-8').replace('{{TOKEN}}',self.app.token)
                return self.serve_bytes(text.encode(),'text/html; charset=utf-8',admin=True)
            if route.startswith('/admin/'):
                name=route.removeprefix('/admin/')
                if name not in {'admin.js','admin.css'}:return self.error('Archivo no disponible.',404)
                p=WEB/name;return self.serve_bytes(p.read_bytes(),mimetypes.guess_type(p)[0] or 'text/plain',admin=True)
            # Never serve private source files, backups, tools or credentials through the preview.
            relative=route.lstrip('/')
            if '..' in relative.split('/') or '\\' in relative:return self.error('Ruta no permitida.',403)
            first=relative.split('/')[0]
            if first in {'en','pt','ar','it'}:
                rest=relative.split('/',1)[1] if '/' in relative else ''
                if rest!='downloads.html' and not rest.startswith(('option-files/','download/')):return self.error('Archivo no disponible.',404)
                first='option-files'
            if first not in {'assets','img','css','js','database','option-files','download','guia'} and not (relative.endswith('.html') and '/' not in relative):return self.error('Archivo no disponible.',404)
            if route.endswith('/'):relative+='index.html'
            candidates=[]
            if self.app.preview:candidates.append(self.app.preview/relative)
            candidates.append(self.app.root/relative)
            if relative.startswith('assets/images/spider-patch/'):candidates.append(self.app.root/'Herramientas/Recursos/Spider-Patch/imagenes'/Path(relative).name)
            p=next((p for p in candidates if p.is_file() and (p.resolve().is_relative_to(self.app.root))),None)
            if not p or p.suffix.lower() not in {'.html','.css','.js','.json','.csv','.png','.jpg','.jpeg','.webp','.svg','.gif','.avif','.woff','.woff2','.ico'}:return self.error('Archivo no disponible.',404)
            return self.serve_bytes(p.read_bytes(),(mimetypes.guess_type(p)[0] or 'application/octet-stream')+('; charset=utf-8' if p.suffix in {'.html','.css','.js','.json','.csv'} else ''))
        except (ContentError,ValueError,OSError) as ex:self.error(ex)
    def serve_bytes(self,data,typ,admin=False):
        self.send_response(200);self.send_header('Content-Type',typ);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Robots-Tag','noindex, nofollow')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://img.youtube.com https://i.ytimg.com; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'")
        self.end_headers();self.wfile.write(data)
    def do_POST(self):
        if not self.authenticated():return self.error('Acceso local no autorizado.',403)
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.error('Se necesita JSON.',415)
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<18*1024*1024:return self.error('Solicitud demasiado grande.',413)
            body=json.loads(self.rfile.read(length));route=urlsplit(self.path).path
            with self.app.lock:
                if route=='/api/save':return self.json_response({'model':save_working(body['model'],body.get('revision'),self.app.root)})
                if route=='/api/export':return self.json_response(self.app.export_version(body['version'],body['season']))
                if route=='/api/translation':
                    from multilingual import LANGUAGES, missing, mark_complete, validate_extensions
                    language=body.get('language');version=body['version']
                    if language not in LANGUAGES or language=='es':raise ContentError('Idioma de traducción inválido.')
                    from spider_exchange import html as check_html
                    validate_extensions(version,check_html)
                    absent=missing(version,language)
                    if absent:return self.json_response({'missing':absent,'state':None})
                    mark_complete(version,language)
                    return self.json_response({'missing':[],'state':version['translation_state'][language]})
                if route=='/api/import/review':return self.json_response(self.app.review_import(body.get('raw'),body.get('revision')))
                if route=='/api/import/confirm':return self.json_response(self.app.confirm_import(body.get('review_id'),body.get('mode'),body.get('confirm_replace')))
                if route=='/api/preview':return self.json_response(self.app.preview_model(body['model'],body.get('focus')))
                if route=='/api/plan':
                    model=body['model'];validate(model,self.app.root,publishing=True,previous=load_working(self.app.root));outputs=render_outputs(model,self.app.root)
                    return self.json_response({'files':sorted(outputs),'published':sum(len(v['editions']) for v in only_published(model)['versions']),'drafts':sum(v['status']=='draft' for v in model['versions'])})
                if route=='/api/generate':
                    model=load_working(self.app.root)
                    if body.get('revision')!=model['revision']:raise ContentError('El contenido cambió. Recargá antes de generar.')
                    model,written=publish(model,self.app.root);return self.json_response({'model':model,'files':written,'message':'Archivos locales generados. No se hizo commit ni publicación en GitHub.'})
                if route=='/api/upload':return self.json_response(self.app.upload(body))
                if route=='/api/restore':return self.json_response({'model':self.app.restore(body['id'])})
                if route=='/api/shutdown':
                    self.json_response({'message':'Administrador cerrado.'});threading.Thread(target=self.server.shutdown,daemon=True).start();return
                return self.error('Acción inexistente.',404)
        except ContentError as ex:self.error(ex,409 if 'cambió' in str(ex) else 400)
        except (ValueError,KeyError,TypeError,OSError) as ex:self.error('No se pudo completar la operación: '+str(ex))

def main():
    parser=argparse.ArgumentParser(description='Administrador visual local de Spider Patch')
    parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--port',type=int,default=8776);parser.add_argument('--no-open',action='store_true')
    args=parser.parse_args()
    if args.port and not args.no_open:
        try:
            with urlopen('http://127.0.0.1:'+str(args.port)+'/admin/',timeout=1) as response:existing=response.read().decode('utf-8')
            if 'spider-token' in existing and 'Administrador local' in existing:
                webbrowser.open('http://127.0.0.1:'+str(args.port)+'/admin/');return
        except OSError:pass
    app=Application(args.root);server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.app=app
    url='http://127.0.0.1:'+str(server.server_port)+'/admin/'
    print('Spider Patch — administrador local\n'+url+'\nCerrar esta ventana detiene el administrador. No publica en GitHub.',flush=True)
    if not args.no_open:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
