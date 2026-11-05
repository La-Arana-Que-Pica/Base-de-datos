import {personalContext} from '../personal/context.js';
import {officialContext,requireAccount,accountRuntime} from '../accounts/context.js';
import {rewardLaboratoryRequested} from '../expansion/laboratory.js';
import {routeURL} from '../navigation/routes.js';
import {navigationCopies} from '../navigation/checkpoints.js';
import {laboratorySubject} from '../expansion/bridge.js';
import {openExpansion} from './expansion.js';
import {openEcosystem,closeEcosystem} from './ecosystem.js';
import {openAlbum} from './album.js';
import {state} from '../state.js';
import {homeMenuHtml,shellHeaderHtml,isDevelopment} from './menuViews.js';
import {escapeHtml as e} from './html.js';
import {CareerOutbox} from '../career/outbox.js';
import {campaignSaveController} from './campaignSaveControls.js';
import {openCampaignHistory} from './campaignHistory.js';
const installed=new WeakMap();
let menuRead=0,careerReader=null,coinsRead=0;
export function menuDialog(title,body,actions=''){
 const old=document.querySelector('#menu-dialog');old?.close();old?.remove();
 const dialog=document.createElement('dialog');dialog.id='menu-dialog';dialog.className='menu-dialog';dialog.innerHTML='<header><h2>'+e(title)+'</h2><button type="button" class="menu-secondary" data-menu-dialog-close aria-label="Cerrar">×</button></header>'+body+'<div class="menu-dialog-actions">'+actions+'</div>';
 document.body.append(dialog);dialog.addEventListener('click',event=>{if(event.target.closest('[data-menu-dialog-close]'))dialog.close();});dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();return dialog;
}
export function installMenuShell({mode='classic',onHome,onClassic,onResume,onNavigate,onSection,hasMemory}={}){
 if(!document.body?.dataset.menuShell)return null;
 if(installed.has(document))return installed.get(document);
 const header=document.querySelector('.draft-header');header.classList.add('menu-shell');header.innerHTML=shellHeaderHtml(mode)+(mode==='career'?'<button type="button" id="career-menu-error" class="menu-error-shortcut" hidden>Guardado pendiente</button>':'')+(mode==='classic'?'<button type="button" class="draft-btn" id="draft-cup-path" data-cup-path hidden>Camino a la Copa</button>':'');
 document.addEventListener('click',event=>{const toggle=event.target.closest('.menu-nav-toggle');if(toggle){const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));header.dataset.navOpen=String(open);}else if(event.target.closest('.menu-nav a')){header.dataset.navOpen='false';header.querySelector('.menu-nav-toggle')?.setAttribute('aria-expanded','false');}});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&header.dataset.navOpen==='true'){header.dataset.navOpen='false';const toggle=header.querySelector('.menu-nav-toggle');toggle?.setAttribute('aria-expanded','false');toggle?.focus();}});
 const callbacks={mode,onHome,onClassic,onResume,onNavigate,onSection,hasMemory};installed.set(document,callbacks);
 document.addEventListener('click',event=>{if(event.target.closest('#career-menu-error')){const tools=document.querySelector('.menu-tools');if(tools)tools.open=true;}});
 document.addEventListener('error',event=>{const image=event.target;if(image?.tagName!=='IMG'||!image.getAttribute('src')?.startsWith('assets/ui/'))return;image.style.display='none';const parent=image.parentElement;if(parent.querySelector('.menu-asset-fallback'))return;const label=document.createElement('span');label.className='menu-asset-fallback';label.textContent=parent.closest('.career-route')?'PNG':'RECURSO VISUAL PENDIENTE';label.setAttribute('aria-hidden','true');image.insertAdjacentElement('afterend',label);},{capture:true});
 document.addEventListener('click',async event=>{
 const target=event.target.closest('[data-menu-account],[data-personal-account-menu],[data-open-expansion],[data-menu-home],[data-menu-classic],[data-menu-resume],[data-menu-continue],[data-mode-link],[data-menu-section],[data-menu-local-continue],[data-menu-cloud-resume]');if(!target||target.disabled)return;event.preventDefault();
 try{
 if(target.hasAttribute('data-personal-account-menu')){await personalContext()?.accountMenu?.open();return;}
 if(target.hasAttribute('data-menu-account')&&target.dataset.saveAction==='login'&&window.LAQPAuth?.open){event.stopImmediatePropagation();window.LAQPAuth.open('login');return;}
 if(target.hasAttribute('data-open-expansion')){await openExpansion(state,{view:target.dataset.expansionView||'wallet',packId:target.dataset.expansionPack||null});return;}
 if(target.hasAttribute('data-menu-cloud-resume')){document.querySelector('#menu-dialog')?.close();await callbacks.onResume?.();}
 else if(target.hasAttribute('data-menu-home')){document.querySelector('#menu-dialog')?.close();await callbacks.onHome?.();}
 else if(target.hasAttribute('data-menu-classic')){document.querySelector('#menu-dialog')?.close();await callbacks.onClassic?.();}
 else if(target.hasAttribute('data-menu-resume')){document.querySelector('#menu-dialog')?.close();await callbacks.onResume?.();}
 else if(target.hasAttribute('data-menu-continue'))await showContinueChoices(callbacks);
 else if(target.hasAttribute('data-menu-local-continue')){const href=routeURL('career',{continue:target.dataset.menuLocalContinue});await navigate(callbacks,href);}
 else if(target.dataset.modeLink){if(['career','survival'].includes(target.dataset.modeLink)&&!isDevelopment()&&!officialContext()&&!personalContext()){menuDialog('Beta de cuentas','<p>Este modo todavía no está habilitado para tu cuenta. Tu progreso local se conserva.</p><p>Si tenés acceso a la beta, iniciá sesión en LAqP Website y volvé a abrir Draft. Mientras tanto podés jugar al Clásico local.</p>');return;}await navigate(callbacks,target.getAttribute('href'));}
 else if(target.dataset.menuSection==='collection')openAlbum(state,()=>section(callbacks,'collection'));
 else if(target.dataset.menuSection)await section(callbacks,target.dataset.menuSection);
 }catch(err){menuDialog('Tu progreso se conserva','<p>'+e(err.message)+'</p><p>No se cambió de modo ni se descartó el guardado.</p>');}
 });
 document.addEventListener('laqp-personal-change',refreshMainMenu);document.addEventListener('laqp-expansion-change',refreshMainMenu);document.addEventListener('laqp-expansion-change',refreshDraftCoins);document.addEventListener('change',event=>{if(event.target.id==='career-profile')refreshDraftCoins();});refreshDraftCoins();document.addEventListener('laqp-draft-account-state',refreshDraftCoins);document.addEventListener('laqp-draft-account-state',refreshMenuAccount);document.addEventListener('laqp-auth-change',refreshMenuAccount);refreshMenuAccount();
 return callbacks;
}
async function navigate(callbacks,href){if(callbacks.onNavigate&&await callbacks.onNavigate(href)===false)return;location.assign(new URL(href,document.baseURI).href);}
async function section(callbacks,name){
 if(['history','rankings','profile','dream'].includes(name)){openEcosystem(state,name);return;}

 if(callbacks.onSection&&await callbacks.onSection(name))return;
 if(name==='rankings'){menuDialog('RANKINGS','<p>PRÓXIMAMENTE</p><p>Las clasificaciones competitivas todavía no están disponibles.</p>','<button class="menu-primary" data-menu-dialog-close>Volver</button>');return;}
 if(name==='profile'){menuDialog('PERFIL','<p>El perfil deportivo de LAqP Draft está <strong>PRÓXIMAMENTE</strong>.</p><p>La cuenta general de LAqP sigue disponible. Carrera utiliza perfiles de prueba locales, independientes de esa cuenta.</p>','<a class="menu-primary" href="../mi-cuenta.html" data-mode-link="account">Mi cuenta LAqP</a><button class="menu-secondary" data-menu-dialog-close>Volver</button>');return;}
 if(name==='collection'){menuDialog('COLECCIÓN','<p>La colección local se conserva por separado y no se convierte en inventario oficial. La colección de cuenta requiere acceso al piloto.</p>',isDevelopment()?'<a class="menu-primary" href="'+routeURL('cards')+'" data-mode-link="career">Abrir colección local</a>':'<button class="menu-secondary" data-menu-dialog-close>Aún no habilitada para esta cuenta</button>');return;}
 if(name==='history'){menuDialog('HISTORIAL','<p>Elegí el historial que querés consultar. Cada modo conserva su propio almacenamiento.</p>','<button class="menu-primary" data-menu-classic-history>Historial Draft Clásico</button>'+(isDevelopment()?'<a class="menu-secondary" href="'+routeURL('history')+'" data-mode-link="career">Historial Carrera local</a>':''));const button=document.querySelector('[data-menu-classic-history]');button?.addEventListener('click',()=>{const saves=campaignSaveController();if(!saves?.owner){document.querySelector('#menu-dialog')?.close();document.querySelector('[data-save-action=login]')?.click();return;}document.querySelector('#menu-dialog')?.close();openCampaignHistory(saves);});}
}
export async function readCareerMenuState(){if(personalContext()){const r=personalContext();await r.flush();return {available:true,subject:r.identity,rows:r.bundle.data.runs.filter(x=>x.id.startsWith('career:')).map(x=>x.legacy||x),progress:structuredClone(r.progress),pending:[]};}if(officialContext()){const r=requireAccount();return {available:true,subject:'account:'+r.account.owner,rows:Object.values(r.account.view.runs).filter(v=>v.mode==='CAREER'&&!v.settled&&!v.abandoned).map(v=>({region:v.region,snapshot:{data:v.ui}})),progress:r.account.view.progress,pending:[]};}
 if(!isDevelopment()||!globalThis.indexedDB)return {available:false,rows:[],progress:null,pending:[]};
 let subject='sandbox-A';try{const stored=sessionStorage.getItem('laqp-career-menu-subject');if(['sandbox-A','sandbox-B'].includes(stored))subject=stored;}catch{}
 if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(db=>db.name==='laqp-career-local-v1'))return {available:true,subject,rows:[],progress:null,pending:[]};
 const {CareerLocalStore}=await import('../career/localStore.js');
 const store=careerReader??=new CareerLocalStore(indexedDB),progress=await store.profile(subject),rows=[];for(const region of ['EUROPA','AMERICA']){const row=await store.active(subject,region);if(row)rows.push(row);}let pending=[],pendingError=false;try{const outbox=new CareerOutbox(localStorage,'menu-readonly');pending=['EUROPA','AMERICA'].flatMap(region=>outbox.list(subject,region));}catch{pendingError=true;}return {available:true,subject,rows,progress,pending,error:pendingError};
}
export function renderMainMenu(container){container.innerHTML=homeMenuHtml();refreshMainMenu();}
export function refreshMenuAccount(){
 const button=document.querySelector('[data-menu-account]');if(!button)return;const auth=globalThis.window?.LAQPAuth,owner=officialContext()?accountRuntime()?.account?.owner:campaignSaveController()?.owner||(auth?.ready?auth.user?.id:null),test=!!document.querySelector('#draft-test-mode');
 const personalAccount=personalContext()?.accountMenu;
 button.removeAttribute('data-website-exit');
 button.removeAttribute('data-website-account');
 if(personalAccount){button.dataset.personalAccountMenu='';button.removeAttribute('data-save-action');button.removeAttribute('data-mode-link');button.removeAttribute('href');button.setAttribute('role','button');button.setAttribute('tabindex','0');button.textContent=personalAccount.signedIn?'●':'◉';button.setAttribute('aria-label',personalAccount.label);button.setAttribute('title',personalAccount.label);return;}
 if(button.hasAttribute('data-personal-account-menu')){button.removeAttribute('data-personal-account-menu');button.removeAttribute('role');button.removeAttribute('tabindex');}
 if(test){button.dataset.saveAction='test-account';button.removeAttribute('data-mode-link');button.textContent='◉';button.setAttribute('aria-label','Cuenta de pruebas independiente');return;}
 if(owner&&(officialContext()||auth?.user?.id===owner)){const name=auth?.user?.id===owner?(auth.profile?.display_name||auth.profile?.username||'Mi cuenta'):'Mi cuenta';button.textContent=name.charAt(0).toUpperCase();button.setAttribute('aria-label','Mi cuenta LAqP: '+name);button.setAttribute('title',name);button.removeAttribute('data-save-action');button.removeAttribute('data-mode-link');button.dataset.websiteAccount='';button.setAttribute('href','/mi-cuenta.html');if(auth?.user?.id===owner&&typeof auth.avatarURL==='function'){const image=document.createElement('img');image.className='menu-account-avatar';image.src=auth.avatarURL();image.alt='';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>{button.textContent=name.charAt(0).toUpperCase();},{once:true});button.replaceChildren(image);}}
 else{button.textContent='◉';button.removeAttribute('data-mode-link');button.setAttribute('aria-label','Ingresar con mi cuenta');button.removeAttribute('title');if(typeof auth?.open==='function'){button.dataset.saveAction='login';button.removeAttribute('href');}else{button.removeAttribute('data-save-action');button.dataset.websiteAccount='';button.setAttribute('href','/mi-cuenta.html');}}
}
export async function refreshMainMenu(){
 refreshMenuAccount();
 const root=document.querySelector('.menu-home');if(!root)return;const token=++menuRead,saves=campaignSaveController();let local,survival;
 try{survival=await readSurvivalMenuState();local=await readCareerMenuState();}catch{local={rows:[],progress:null,pending:[],error:true};}if(token!==menuRead||document.querySelector('.menu-home')!==root)return;
 const memory=installed.get(document)?.hasMemory?.()||false;let cloud=false;try{cloud=!!(saves?.owner&&saves.ready&&(saves.remote||saves.readOutbox()));}catch{}
 const officialClassic=officialContext()?Object.values(accountRuntime()?.account?.view?.runs||{}).some(r=>r.mode==='CLASSIC'&&!r.settled):false;
 const count=(survival?.active?1:0)+(survival?.dream?.active?1:0)+(officialClassic||cloud||memory?1:!officialContext()&&navigationCopies().length?1:0)+local.rows.length+local.pending.filter(p=>!local.rows.some(r=>r.region===p.record.region)).length+(local.error&&local.available?1:0);
 const continueButton=root.querySelector('[data-menu-continue]');if(continueButton)continueButton.disabled=count===0;
 const description=root.querySelector('[data-menu-save-description]');if(description)description.textContent=count?'Elegí qué partida querés retomar.':local.error?'No se pudo consultar Carrera local.':saves?.owner&&!saves.ready?'Consulta Clásica no disponible. Abrí Mi campaña.':'Todavía no hay una partida recuperable.';
 const note=root.querySelector('[data-menu-storage-note]');if(note)note.textContent=personalContext()?'Progreso guardado en este dispositivo. No necesita cuenta. El respaldo opcional de cuenta no interrumpe el juego local.':officialContext()?((accountRuntime()?.account?.status||'Cuenta no disponible')+' · Economía oficial. El progreso invitado se conserva por separado; su transferencia y respaldo personal todavía no están habilitados.'):local.available?'Progreso local en este navegador · Sin respaldo en la nube.':local.error?'Almacenamiento local no disponible. Tu progreso no se borró.':'Los modos de cuenta se habilitan gradualmente durante la beta.';
 const p=local.progress,trophies=p?Object.values(p.regions).reduce((sum,r)=>sum+Object.values(r.trophies).reduce((s,n)=>s+n,0),0):0,collection=p?Object.values(p.collection).filter(c=>!c.transformedTo).length+Object.values(p.expansion?.specialCards||{}).filter(c=>!c.transformedTo).length:0;
 const summary=root.querySelector('[data-menu-progress]');if(summary)summary.textContent='Copas '+(local.available?trophies:'—')+' · Colección '+(local.available?collection:'—')+' · Racha tradicional '+(survival?.profile?.best??'—')+' · Dream Team '+(survival?.dream?.profile?.best??'—');
 const survivalStatus=root.querySelector('[data-mode-status=survival]');if(survivalStatus){survivalStatus.hidden=!(survival?.active||survival?.dream?.active);survivalStatus.textContent=survival?.dream?.active?'EN CURSO · DREAM TEAM':officialContext()?'EN CURSO · CUENTA':'EN CURSO · LOCAL';}
 const classicStatus=root.querySelector('[data-mode-status=classic]'),careerStatus=root.querySelector('[data-mode-status=career]');if(classicStatus){classicStatus.hidden=!(officialClassic||cloud||memory);classicStatus.textContent='PARTIDA DISPONIBLE';}if(careerStatus){careerStatus.hidden=!local.rows.some(r=>!['eliminated','champion'].includes(r.snapshot.data.tournament?.status));careerStatus.textContent=officialContext()?'EN CURSO · CUENTA':'EN CURSO · LOCAL';}
}
export async function readSurvivalMenuState(){if(personalContext()){const r=personalContext();await r.flush();const entry=v=>({active:r.bundle.data.runs.find(x=>x.id==='survival:'+v)?.legacy||null,profile:r.bundle.data.shared.survivalProfiles[v]||{best:0,played:0}});return {...entry('traditional'),dream:entry('dream')};}if(officialContext()){const r=requireAccount(),v=r.account.view,entry=mode=>{const run=v.runs[v.active[mode]];return {profile:{best:v.survivalBests[mode]},active:run&&!run.settled?{snapshot:{data:run.ui}}:null};};return {...entry('SURVIVAL'),dream:entry('SURVIVAL_DREAM')};}if(!isDevelopment()||!globalThis.indexedDB)return null;if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(db=>db.name==='laqp-survival-local-v1'))return null;const {SurvivalStore}=await import('../survival/storage.js');const store=new SurvivalStore(indexedDB);try{await store.open();const [traditional,dream]=await Promise.all([store.load(rewardLaboratoryRequested()?'lab:traditional:rewards-lab':'guest'),store.load('dream:'+laboratorySubject())]);return {...traditional,dream};}finally{store.db?.close?.();}}
async function showContinueChoices(callbacks){
 const local=await readCareerMenuState(),survival=await readSurvivalMenuState(),saves=campaignSaveController();let cloud=false;try{cloud=!!(saves?.ready&&saves.owner&&(saves.remote||saves.readOutbox()));}catch{}
 if(officialContext()){const a=requireAccount().account;const rows=Object.values(a.view.runs).filter(r=>!r.settled&&!r.abandoned);menuDialog('CONTINUAR PARTIDA','<p>'+e(a.status)+'</p>',rows.map(r=>'<a class="menu-primary" href="'+routeURL(r.mode==='CAREER'?'career':r.mode==='CLASSIC'?'classic':r.mode==='SURVIVAL_DREAM'?'survivalDream':'survival',{region:r.region})+'">'+e(r.mode)+' · '+e(r.region)+'</a>').join('')||'<p>No hay participaciones pendientes.</p>');return;}
 let actions=personalContext()?.bundle.data.runs.some(r=>r.id==='classic')?'<a class="menu-primary" href="'+routeURL('classic')+'">Continuar Draft Clásico · Este dispositivo</a>':callbacks.hasMemory?.()?'<button class="menu-primary" data-menu-resume>Volver al Draft abierto</button>':'';
 if(survival?.active)actions+='<a class="menu-primary" href="'+routeURL('survival',{continue:1})+'" data-mode-link="survival">Continuar Supervivencia · Racha '+survival.active.snapshot.data.survival.wins+'</a>';
 if(survival?.dream?.active)actions+='<a class="menu-primary" href="'+routeURL('survivalDream',{continue:1})+'" data-mode-link="survival">Continuar Supervivencia Dream Team · Racha '+survival.dream.active.snapshot.data.survival.wins+'</a>';
 if(!officialContext()&&!callbacks.hasMemory?.())for(const row of navigationCopies())actions+='<button class="menu-primary" data-nav-continue="'+e(row.tab)+'">Continuar Draft Clásico · Copia local de navegación</button>';
 if(cloud)actions+='<button class="menu-primary" data-save-action="continue" data-menu-cloud-resume>Continuar Draft Clásico guardado</button>';
 for(const row of local.rows)actions+='<button class="menu-secondary" data-menu-local-continue="'+row.region+'">Carrera '+(row.region==='EUROPA'?'Europa':'América')+' · '+e(row.snapshot.data.career.cup)+'</button>';
 for(const entry of local.pending)if(!local.rows.some(r=>r.region===entry.record.region))actions+='<button class="menu-secondary" data-menu-local-continue="'+entry.record.region+'">Recuperar Carrera pendiente · '+e(entry.record.region)+'</button>';
 if(local.error&&isDevelopment())actions+='<a class="menu-secondary" href="'+routeURL('career')+'" data-mode-link="career">Revisar copias pendientes de Carrera</a>';
 menuDialog('CONTINUAR PARTIDA',personalContext()?'<p>Se verifica el último guardado del modo elegido. Los partidos con checkpoint se recuperan en pausa.</p>':'<p>La recuperación verifica el guardado del modo elegido. Durante un partido se recupera la previa, según la regla actual.</p>',actions||'<button class="menu-secondary" data-menu-dialog-close>No hay partidas recuperables</button>');
}
export function setMenuActivity(section){document.querySelectorAll('.menu-nav [aria-current]').forEach(node=>node.removeAttribute('aria-current'));const key=section==='home'?'[data-menu-home]':section==='career'?'[data-mode-link=career]':'[data-menu-section='+section+']';document.querySelector('.menu-nav '+key)?.setAttribute('aria-current','page');}

export async function refreshDraftCoins(){
 const token=++coinsRead,bound=laboratorySubject(),node=document.querySelector('[data-draft-coins-balance]');if(!node||!isDevelopment()&&!officialContext()&&!personalContext())return;
 try{const result=await readCareerMenuState();if(token!==coinsRead||bound!==laboratorySubject()||node!==document.querySelector('[data-draft-coins-balance]'))return;node.textContent=Number(result.progress?.expansion?.balance||0).toLocaleString('es-AR');}catch{if(token===coinsRead)node.textContent='—';}
}
