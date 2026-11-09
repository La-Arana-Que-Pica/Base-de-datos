'use strict';
// Explicit production policy. Unknown paths are reported, never automatically staged.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const GIT_ROOT=process.env.LAQP_RELEASE_GIT_ROOT?path.resolve(process.env.LAQP_RELEASE_GIT_ROOT):ROOT;
const CLOSED_DRAFT_PAGES=['index.html','clasico/index.html','carrera/index.html','supervivencia/index.html','album/index.html','coleccion/index.html','mis-cartas/index.html','dream-team/index.html','perfil/index.html','historial/index.html','rankings/index.html','classic/index.html','career/index.html','survival/index.html','survival-dream/index.html','collection/index.html','cards/index.html','profile/index.html','history/index.html','dream/index.html'];
const ROOTS=new Set(['assets','css','database','download','guia','img','js','league','option-files','perfil','player','tactics','team','draft','en','pt','ar','it']);
const EXT=new Set(['.html','.htm','.css','.js','.mjs','.json','.csv','.txt','.xml','.svg','.webp','.png','.jpg','.jpeg','.gif','.avif','.ico','.woff','.woff2','.ttf','.otf','.mp3','.ogg','.wav','.wasm','.bin','.data','.dat','.zip','.dds','.ftex','.pvr','.tflite','.task','.onnx','.pdf']);
const SKIP=new Set(['node_modules','__pycache__','.git','tests','test','backups','backup','logs']);
// Source-only files are retained in Git by the updater, but excluded from Pages by _config.yml.
// Explicit list: never sweep unrelated backend work into the publication procedure.
const RANKINGS_SOURCE=['supabase/rankings.sql','supabase/rankings-catalog.sql','supabase/rankings-games.sql','supabase/rankings-games-rollback.sql','supabase/rankings-games-audit.sql','supabase/config.toml',
 'supabase/functions/football-rankings/index.ts','supabase/functions/football-rankings/handler.mjs',
 'supabase/functions/football-rankings/service.mjs','supabase/SETUP.md'];
const CONTROL=new Set(['.gitignore','scripts/Actualizar-LAqP.ps1','Herramientas/Mantenimiento/repository-release.cjs',...RANKINGS_SOURCE,...["Herramientas/Generadores/templates/league.html","Herramientas/Generadores/templates/player.html","Herramientas/Generadores/templates/team.html","Herramientas/Generadores/templates/spider-patch/archive-entry.html","Herramientas/Generadores/templates/spider-patch/article.html","Herramientas/Generadores/templates/spider-patch/extra-entry.html","Herramientas/Generadores/templates/spider-patch/home.html","Herramientas/Generadores/templates/spider-patch/hub.html","Herramientas/Generadores/templates/spider-patch/latest.html","Herramientas/Generadores/templates/spider-patch/parts.html","Herramientas/Generadores/templates/spider-patch/platform-card.html","Herramientas/Generadores/templates/guias/article.html","Herramientas/Generadores/templates/guias/card.html","Herramientas/Generadores/templates/guias/footer.html","Herramientas/Generadores/templates/guias/library.html","Herramientas/Generadores/templates/guias/nav.html","Herramientas/Generadores/templates/guias/shell.html"],...["Herramientas/Generadores/biblioteca_guias.py","Herramientas/Generadores/database_statistics.py","Herramientas/Generadores/generador_clubes.py","Herramientas/Generadores/generador_database.py","Herramientas/Generadores/generador_secciones.py","Herramientas/Generadores/generar_ahorcado_camisetas.cjs","Herramientas/Generadores/generar_base_de_datos.py","Herramientas/Generadores/generar_traducciones_pes.py","Herramientas/Generadores/generar_web.py","Herramientas/Generadores/guide_components.py","Herramientas/Generadores/guide_content.py","Herramientas/Generadores/manager_external.py","Herramientas/Generadores/miniface_paths.py","Herramientas/Generadores/pes2018_overall.py","Herramientas/Generadores/rankings-catalog.mjs","Herramientas/Generadores/spider_locales.py","Herramientas/Generadores/spider_patch.py","Herramientas/Mantenimiento/build-club-pages.js","Herramientas/Mantenimiento/build-database-pages.js","Herramientas/Mantenimiento/build-database-version.js","Herramientas/Mantenimiento/build-player-pages.js","Herramientas/Mantenimiento/build-site.js","Herramientas/Mantenimiento/crear-html-nuevos.ps1","Herramientas/Mantenimiento/create-missing-database-html.js","Herramientas/Mantenimiento/generar-html-database.ps1","Herramientas/Mantenimiento/generar-index-dts.ps1","Herramientas/Mantenimiento/Migraciones/migrate_manager_system.py","Herramientas/Mantenimiento/migrate-database-routes.js","Herramientas/Mantenimiento/normalize-ad-markup.js","Herramientas/Mantenimiento/optimize-guide-images.py","Herramientas/Mantenimiento/project-root.js","Herramientas/Mantenimiento/rebuild-historical-tactics.js","Herramientas/Mantenimiento/repository-release.cjs","Herramientas/Mantenimiento/validate-site.js","Herramientas/SpiderPatch/administrar.py","Herramientas/SpiderPatch/dom.py","Herramientas/SpiderPatch/EJEMPLO_VERSION_INTERCAMBIO.json","Herramientas/SpiderPatch/FORMATO_INTERCAMBIO.md","Herramientas/SpiderPatch/FORMATO_INTERCAMBIO.schema.json","Herramientas/SpiderPatch/model.py","Herramientas/SpiderPatch/multilingual.py","Herramientas/SpiderPatch/README.md","Herramientas/SpiderPatch/spider_exchange.py","Herramientas/SpiderPatch/web/admin.js"]]);
function publicPath(p){const a=p.split('/');if(a[0]==='Desarrollo')return false;if(a.some(x=>x.startsWith('.')||SKIP.has(x.toLowerCase())))return false;if(a.length===1)return ['CNAME','_config.yml'].includes(p)||/\.(html|xml|txt)$/.test(p);if(a[0]==='draft')return CLOSED_DRAFT_PAGES.includes(a.slice(1).join('/'));if(a[0]==='draft'&&(['docs','scripts','staging','release','server','sql'].includes(a[1])||/local-test-config/.test(p)))return false;return ROOTS.has(a[0])&&(EXT.has(path.posix.extname(p).toLowerCase())||/license|notice|copyright/i.test(a.at(-1))||p.endsWith('.md')&&p.includes('/vendor/'));}
function walk(root){let out=[];function visit(rel){for(const e of fs.readdirSync(path.join(root,rel),{withFileTypes:true})){if(SKIP.has(e.name.toLowerCase())||e.name.startsWith('.'))continue;const p=rel?rel+'/'+e.name:e.name;if(e.isSymbolicLink())throw Error('Enlace simbólico no admitido: '+p);if(e.isDirectory())visit(p);else out.push(p);}}visit('');return out;}
function inventory(root=ROOT){const all=[];for(const r of ROOTS)if(fs.existsSync(path.join(root,r)))for(const p of walk(path.join(root,r)))all.push(r+'/'+p);for(const e of fs.readdirSync(root,{withFileTypes:true}))if(e.isFile())all.push(e.name);const files=all.filter(publicPath);const unknown=all.filter(p=>!publicPath(p));return {files,unknown};}
function copyFile(root,out,p){const dest=path.join(out,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,p),dest);}
function snapshot(out, build=false) {
 out=path.resolve(out);
 if(!out.startsWith(path.join(ROOT,'.tmp')+path.sep)||fs.existsSync(out))throw Error('La copia debe ser nueva y estar dentro de .tmp');
 fs.mkdirSync(out,{recursive:true});
 const inv=inventory();
 for(const p of inv.files)copyFile(ROOT,out,p);
 if(build){
  for(const dir of ['Generadores','Mantenimiento','SpiderPatch'])for(const p of walk(path.join(ROOT,'Herramientas',dir)))copyFile(ROOT,out,'Herramientas/'+dir+'/'+p);
  for(const dir of ['Guias','Spider-Patch','Base-de-datos'])for(const p of walk(path.join(ROOT,'Herramientas/Recursos',dir))){if(dir==='Base-de-datos'&&/^(archive|legacy)\//.test(p))continue;copyFile(ROOT,out,'Herramientas/Recursos/'+dir+'/'+p);}
 }
 for(const p of CONTROL)copyFile(ROOT,out,p);
 const closed=path.join(ROOT,'draft/release/closed-index.html');if(!fs.existsSync(closed))throw Error('Falta pantalla de Draft cerrado');for(const p of CLOSED_DRAFT_PAGES){const dest=path.join(out,'draft',p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(closed,dest);}
 fs.writeFileSync(path.join(out,'release-inventory.json'),JSON.stringify(inv,null,2));
 console.log('Copia aislada: '+inv.files.length+' archivos públicos. '+(build?'Compilación completa solicitada.':'Modo rápido: HTML y datos locales ya generados.'));
}
function check(root){
 const inv=inventory(root),set=new Set(inv.files),missing=new Set(),warnings=new Set();
 const planFile=path.join(root,'release-plan.json');
 if(fs.existsSync(planFile))for(const p of JSON.parse(fs.readFileSync(planFile,'utf8')).preservedMissing||[])set.add(p);
 if(fs.readFileSync(path.join(root,'CNAME'),'utf8').trim()!=='laqp.website')throw Error('CNAME inesperado');
 for(const p of inv.files){
  if(/\.(json|csv|txt|xml)$/i.test(p)){const content=fs.readFileSync(path.join(root,p),'utf8');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{20,}/.test(content))throw Error('Credencial privada en '+p);for(const match of content.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)){let token;try{token=JSON.parse(Buffer.from(match[0].split('.')[1],'base64url'));}catch{continue;}if(token.role!=='anon'||token.sub||token.session_id)throw Error('Token privado en '+p);}}
  if(!/\.(html|m?js|css)$/.test(p)||p.includes('/vendor/'))continue;
  const text=fs.readFileSync(path.join(root,p),'utf8');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{20,}/.test(text))throw Error('Credencial privada en '+p);for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)){let token;try{token=JSON.parse(Buffer.from(match[0].split('.')[1],'base64url'));}catch{continue;}if(token.role!=='anon'||token.sub||token.session_id)throw Error('Token privado en '+p);}const base=/<base\s+href="([^"]+)"/.exec(text)?.[1];
  const refs=[];
  if(p.endsWith('.html')){const source=text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');for(const m of source.matchAll(/<(script|link|img|source|a)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/g))refs.push({r:m[2],required:['script','link','source'].includes(m[1]),base:base?base.slice(1):p.startsWith('draft/shells/')?'draft':path.posix.dirname(p)});}
  else if(p.endsWith('.css')){for(const m of text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g))refs.push({r:m[1],required:true,base:path.posix.dirname(p)});}
  else {for(const m of text.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g))refs.push({r:m[1],required:true,base:path.posix.dirname(p)});for(const m of text.matchAll(/fetch\s*\(\s*["']([^"']+)["']/g))refs.push({r:m[1],required:true,base:''});}
  for(const ref of refs){if((p==='draft/js/personal/game.js'&&ref.r==='../../tests/transfer-lab-ui.js')||(p==='draft/js/ui/campaignSaveControls.js'&&ref.r==='/draft/local-test-config.json'))continue;let r=ref.r.split(/[?#]/)[0];if(!r||/^(?:[a-z]+:|\/\/)/i.test(r)||/[${}<>]/.test(r))continue;if(!r.startsWith('/')&&!r.startsWith('.')&&!/\.[a-z0-9]+$/i.test(r))continue;try{r=decodeURIComponent(r);}catch{}const target=r.startsWith('/')?r.slice(1):path.posix.normalize(path.posix.join(ref.base,r));if(!set.has(target)&&!set.has(target?target.replace(/\/$/,'')+'/index.html':'index.html'))(ref.required?missing:warnings).add(p+' -> '+target);}
 }
 fs.writeFileSync(path.join(root,'runtime-validation.json'),JSON.stringify({missing:[...missing],warnings:[...warnings]},null,2));
 if(missing.size)throw Error('Dependencias ausentes en el paquete ('+missing.size+'):\n'+[...missing].slice(0,30).join('\n'));
 console.log('Runtime validado: '+inv.files.length+' archivos. Avisos de imágenes/enlaces: '+warnings.size+' (runtime-validation.json).');
}

// Git writes for preview go to an isolated object directory and index, never the source index/objects.
function git(args,options={}) {
 return cp.execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:GIT_ROOT,encoding:'utf8',windowsHide:true,maxBuffer:128*1024**2,...options});
}
function baseTree(ref='HEAD') {
 return git(['ls-tree','-rz',ref]).split('\0').filter(Boolean).map(row=>{
  const at=row.indexOf('\t'),[mode,type,hash]=row.slice(0,at).split(' ');
  return {path:row.slice(at+1),mode,type,hash};
 });
}
function reviewEnv(root) {
 return {...process.env,GIT_INDEX_FILE:path.join(root,'release.index'),GIT_OBJECT_DIRECTORY:path.join(root,'git-objects'),GIT_ALTERNATE_OBJECT_DIRECTORIES:git(['rev-parse','--path-format=absolute','--git-path','objects']).trim()};
}
function digest(file) {return require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function assertNoRemovals(root,base,candidates) {
 const env=reviewEnv(root),next=new Map(git(['ls-files','--stage','-z'],{env}).split('\0').filter(Boolean).map(row=>{
  const at=row.indexOf('\t'),[mode,hash,stage]=row.slice(0,at).split(' ');
  if(stage!=='0')throw Error('El índice contiene conflictos.');
  return [row.slice(at+1),{mode,hash}];
 }));
 const selected=new Set(candidates);
 for(const old of base){
  const item=next.get(old.path);
  if(!item)throw Error('Eliminación bloqueada: '+old.path);
  if(!selected.has(old.path)&&(item.hash!==old.hash||item.mode!==old.mode))throw Error('Recurso preservado alterado: '+old.path);
 }
 const diff=git(['diff','--cached','--name-status','--no-renames','-z'],{env}).split('\0').filter(Boolean),changes=[];
 for(let i=0;i<diff.length;i+=2){
  if(!['A','M'].includes(diff[i]))throw Error('Cambio fuera de alcance bloqueado: '+diff[i]+' '+diff[i+1]);
  changes.push({status:diff[i],path:diff[i+1]});
 }
 return changes;
}
function plan(root,out) {
 root=path.resolve(root);
 const {files,unknown}=inventory(root);
 for(const p of CONTROL)if(fs.existsSync(path.join(root,p)))files.push(p);
 const development=files.filter(p=>p.split('/')[0]==='Desarrollo');if(development.length)throw Error('Desarrollo/ nunca se publica ni se versiona: '+development.slice(0,5).join(', '));
 const base=baseTree(),candidates=new Set(files),preservedMissing=base.filter(r=>publicPath(r.path)&&!candidates.has(r.path)).map(r=>r.path);
 const nonpublic=base.filter(r=>!publicPath(r.path)&&!CONTROL.has(r.path)).map(r=>r.path);
 const large=files.map(p=>({path:p,bytes:fs.statSync(path.join(root,p)).size})).filter(r=>r.bytes>20*1024**2);
 const result={version:2,mode:'add-and-modify-only',baseHead:git(['rev-parse','HEAD']).trim(),files:files.sort(),deleted:[],preservedMissing,nonpublic,unknown,large};
 fs.writeFileSync(out,JSON.stringify(result,null,2));return result;
}
function prepare(root) {
 root=path.resolve(root);
 const file=path.join(root,'release-plan.json'),result=plan(root,file),base=baseTree(result.baseHead);
 if(result.large.some(r=>r.bytes>=100*1024**2))throw Error('Archivo de 100 MiB o más: revisá el plan. No se excluye automáticamente.');
 fs.mkdirSync(path.join(root,'git-objects'),{recursive:true});
 const env=reviewEnv(root),pathsFile=path.join(root,'release-candidates.bin');
 fs.writeFileSync(pathsFile,result.files.join('\0')+'\0');
 git(['read-tree',result.baseHead],{env});
 // Only existing candidates; --ignore-removal is an additional safeguard against disappearing files.
 git(['--literal-pathspecs','--work-tree',root,'add','--ignore-removal','--pathspec-from-file='+pathsFile,'--pathspec-file-nul'],{env,stdio:['ignore','pipe','pipe']});
 result.changes=assertNoRemovals(root,base,result.files);
 result.unchanged=result.files.length-result.changes.length;
 result.indexSha256=digest(path.join(root,'release.index'));
 fs.writeFileSync(path.join(root,'release-paths.bin'),result.changes.map(r=>r.path).join('\0')+(result.changes.length?'\0':''));
 const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const oldByPath=new Map(base.map(r=>[r.path,r]));
 const preview=result.changes.map(r=>({estado:r.status,ruta:r.path,bytes:fs.statSync(path.join(root,r.path)).size,blob_anterior:oldByPath.get(r.path)?.hash||''}));
 fs.writeFileSync(path.join(root,'release-changes.csv'),'\ufeff'+['estado','ruta','bytes','blob_anterior'].map(cell).join(';')+'\r\n'+preview.map(r=>Object.values(r).map(cell).join(';')).join('\r\n')+'\r\n');
 const fd=fs.openSync(path.join(root,'release-diff.patch'),'w');
 try{const run=cp.spawnSync('git',['diff','--cached','--no-renames','--no-ext-diff','--no-textconv'],{cwd:GIT_ROOT,env,windowsHide:true,stdio:['ignore',fd,'pipe']});if(run.status!==0)throw Error('No se pudo escribir el diff.');}finally{fs.closeSync(fd);}
 fs.writeFileSync(file,JSON.stringify(result,null,2));
 console.log(JSON.stringify({added:result.changes.filter(r=>r.status==='A').length,modified:result.changes.filter(r=>r.status==='M').length,deleted:0,unchanged:result.unchanged,preservedMissing:result.preservedMissing.length,preservedDevelopment:result.nonpublic.length}));
 return result;
}
function verifyPrepared(root) {
 root=path.resolve(root);
 const p=JSON.parse(fs.readFileSync(path.join(root,'release-plan.json'),'utf8'));
 if(p.version!==2||p.mode!=='add-and-modify-only'||p.deleted.length)throw Error('Plan incompatible: prepará uno nuevo sin eliminaciones.');
 if(git(['rev-parse','HEAD']).trim()!==p.baseHead)throw Error('HEAD cambió desde la vista previa.');
 if(digest(path.join(root,'release.index'))!==p.indexSha256)throw Error('El índice revisado cambió. Prepará otra vista previa.');
 const changes=assertNoRemovals(root,baseTree(p.baseHead),p.files);
 if(JSON.stringify(changes)!==JSON.stringify(p.changes))throw Error('El plan no coincide con el índice.');
 return p;
}
// Invoked only after the user's explicit commit confirmation. Never needed for preview.
function promoteObjects(root) {
 root=path.resolve(root);verifyPrepared(root);
 const env=reviewEnv(root),source=env.GIT_OBJECT_DIRECTORY,target=env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
 const crypto=require('node:crypto'),zlib=require('node:zlib'),algorithm=git(['rev-parse','--show-object-format']).trim();
 for(const dir of fs.readdirSync(source,{withFileTypes:true})){
  if(!dir.isDirectory()||!(/^[a-f0-9]{2}$/).test(dir.name))continue;
  for(const name of fs.readdirSync(path.join(source,dir.name))){
   const id=dir.name+name;
   if(!(/^[a-f0-9]+$/).test(id)||id.length!==(algorithm==='sha256'?64:40))throw Error('Objeto temporal inesperado.');
   const origin=path.join(source,dir.name,name),raw=fs.readFileSync(origin);
   if(crypto.createHash(algorithm).update(zlib.inflateSync(raw)).digest('hex')!==id)throw Error('Objeto temporal corrupto.');
   const folder=path.join(target,dir.name);fs.mkdirSync(folder,{recursive:true});
   try{fs.copyFileSync(origin,path.join(folder,name),fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
  }
 }
}
function githubRepository(remote) {
 const match=String(remote).match(/^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?$/i);
 if(!match)throw Error('Origin no es una URL de repositorio github.com admitida.');
 return match[1]+'/'+match[2];
}
function assertPagesTarget(report,branch,cname) {
 if(report.buildType!=='legacy'||report.source?.path!=='/')throw Error('Esta herramienta requiere Pages desde una rama y la raíz /. Revisá la configuración.');
 if(report.source.branch!==branch)throw Error('Pages publica '+report.source.branch+'; la rama actual es '+branch+'. No se hará commit ni push con -Push.');
 if(report.cname!==cname)throw Error('El dominio de Pages no coincide con CNAME.');
}
function assertRemoteIncluded(remoteHead) {
 if(!/^[a-f0-9]{40,64}$/.test(remoteHead))throw Error('HEAD remoto inválido.');
 try{git(['merge-base','--is-ancestor',remoteHead,'HEAD'],{stdio:['ignore','pipe','pipe']});}
 catch{throw Error('La base local no incluye el HEAD remoto verificado. No se hace fetch, merge, commit ni push.');}
}
async function pages(out) {
 const https=require('node:https'),remote=git(['remote','get-url','origin']).trim(),repository=githubRepository(remote);
 function get(endpoint){return new Promise((resolve,reject)=>{
  const request=https.get('https://api.github.com/repos/'+repository+endpoint,{headers:{'User-Agent':'LAqP-release-readonly','Accept':'application/vnd.github+json'}},response=>{
   let body='';response.on('data',d=>body+=d);response.on('end',()=>{
    if(response.statusCode!==200)return reject(Error('No se pudo verificar Pages (HTTP '+response.statusCode+'). No se publica.'));
    try{resolve(JSON.parse(body));}catch{reject(Error('Respuesta de GitHub inválida.'));}
   });
  });request.setTimeout(20000,()=>request.destroy(Error('Tiempo agotado al verificar Pages.')));request.on('error',reject);
 });}
 const config=await get('/pages'),branch=await get('/git/ref/heads/'+encodeURIComponent(config.source?.branch||'main'));
 const report={verifiedAt:new Date().toISOString(),repository,remote,source:config.source,buildType:config.build_type,cname:config.cname,status:config.status,remoteHead:branch.object.sha};
 fs.writeFileSync(out,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));return report;
}
module.exports={publicPath,inventory,snapshot,check,plan,prepare,verifyPrepared,assertNoRemovals,promoteObjects,githubRepository,assertPagesTarget,assertRemoteIncluded};
if(require.main===module){(async()=>{const [cmd,a,b,c]=process.argv.slice(2);
 if(cmd==='snapshot')snapshot(a,b==='--build');
 else if(cmd==='check')check(path.resolve(a||ROOT));
 else if(cmd==='plan')plan(path.resolve(a),b);
 else if(cmd==='prepare')prepare(a);
 else if(cmd==='verify')verifyPrepared(a);
 else if(cmd==='promote')promoteObjects(a);
 else if(cmd==='pages')await pages(a);
 else if(cmd==='target')assertPagesTarget(JSON.parse(fs.readFileSync(a,'utf8')),b,c);
 else if(cmd==='ancestor')assertRemoteIncluded(a);
 else throw Error('snapshot DIR [--build] | prepare DIR | check DIR | verify DIR | promote DIR | pages ARCHIVO');
})().catch(e=>{console.error(e.message);process.exitCode=1;});}
