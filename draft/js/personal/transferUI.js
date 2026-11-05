import {GuestTransferRepository} from './transferRepository.js';
import {transferLabRequested,stagingTransferRequested} from './context.js';
import {PersonalSyncCoordinator} from './sync/coordinator.js';
import {LocalSyncStore} from './sync/local.js';
import {profileSummary} from './sync/protocol.js';
import {refreshMenuAccount} from '../ui/menuShell.js';
import {state} from '../state.js';

export function guestProgressSummary(bundle){
 const summary=profileSummary(bundle),p=bundle.data.shared.progress||{},x=p.expansion||{};
 const stickers=new Set(Object.values(x.albums||{}).flatMap(a=>Object.keys(a.historical||{})));for(const row of Object.values(bundle.data.shared.albumNamespaces)){for(const id of Object.keys(row.discovered||{}))stickers.add(id);if(row.playerId&&row.discovery)stickers.add(String(row.playerId));}
 return {...summary,cards:Object.values(p.collection||{}).filter(c=>!c.transformedTo).length+Object.values(x.specialCards||{}).filter(c=>!c.transformedTo).length,cups:Object.values(p.regions||{}).reduce((n,r)=>n+Object.values(r.trophies||{}).reduce((a,v)=>a+(typeof v==='number'?v:v?1:0),0),0),packs:Object.values(x.packs||{}).filter(p=>p.status!=='claimed').length,stickers:stickers.size};
}
export function hasGuestProgress(bundle){
 const s=guestProgressSummary(bundle),p=bundle.data.shared.progress;
 return !!(s.coins||s.cards||s.campaigns||s.history||s.cups||s.packs||s.stickers||bundle.data.shared.dreamTeam||Object.keys(bundle.data.shared.survivalProfiles).length||Object.keys(p?.expansion?.ledger||{}).length||Object.keys(p?.grants||{}).length);
}
export function transferElement(tag,text,className){const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;}
const el=transferElement;
function button(host,text,test,fn,primary=false){const b=el('button',text,primary?'menu-primary':'menu-secondary');b.type='button';b.dataset.lf5=test;b.onclick=()=>Promise.resolve(fn()).catch(()=>{const notice=host.closest('.lf5-dialog')?.querySelector('[role=status]');if(notice){notice.hidden=false;notice.dataset.tone='warning';notice.textContent='No se pudo completar la acción. Confirmá el guardado local y volvé a intentar. Tus partidas se conservan.';}});host.append(b);return b;}
const copy={unknown:'No pudimos verificar el respaldo de tu cuenta. No se instalará ninguna copia hasta comprobar el destino.',changed:'El progreso o la cuenta cambiaron. Revisá otra vez las dos partidas antes de confirmar.',interrupted:'No se confirmó la transferencia. Tu invitado original sigue disponible. Podés recuperar la operación o volver a revisar el progreso.'};

// Both adapters use this player flow. Real Auth is supplied by the website;
// fictional sessions remain confined to the separate laboratory database.
export async function installGuestTransfer(runtime,{prepareNavigation,adapter}){
 const real=adapter?.kind==='staging',active=()=>real?stagingTransferRequested():transferLabRequested();
 if(!active()||runtime.repository.name!==(real?'laqp-draft-personal-lf5-staging':'laqp-draft-lf5-laboratory')||!['staging','fictional'].includes(adapter?.kind))throw Error('La transferencia requiere un entorno aislado autorizado');
 const link=el('link');link.rel='stylesheet';link.href='/draft/css/transfer.css';document.head.append(link);
 const selected=()=>active()?adapter.current():null,label=owner=>adapter.label(owner),guest=await runtime.repository.guestIdentity(),listeners=new Set();
 let dialog=null,body,footer,status,title,description,closeButton,previousFocus,view=null,busy=false,closed=false,sync=null,backing=null,cloud={state:'pending',text:'Respaldo cloud pendiente'},journal=null,flowOwner=null;
 const playing=()=>!!(state.currentScreen==='MATCH'&&state.activeMatch?.playback&&!state.activeMatch.playback.paused);
 const transfers=new GuestTransferRepository(runtime.repository,{backend:adapter.backend,selectedAccount:selected,isPlaying:playing});
 const prefix=adapter.storagePrefix||'lf5-lab',opKey=owner=>prefix+'-operation:'+owner,decisionKey=owner=>prefix+'-decision:'+guest+':'+owner;
 function emit(){if(closed)return;refreshMenuAccount();for(const fn of listeners)fn();}
 function decide(value,owner=flowOwner||selected()){if(owner)localStorage.setItem(decisionKey(owner),value);}
 async function operation(owner=selected()){const id=owner&&localStorage.getItem(opKey(owner));if(!id)return null;const j=await transfers.get(id);return j?.source===guest&&j.target===owner?j:null;}
 function navigate(owner){if(owner!==selected())throw Error('La sesión cambió');if(adapter.navigate)return adapter.navigate(owner,journal?.prepared);localStorage.setItem(prefix+'-active',owner);const url=new URL(location.href);url.searchParams.set('personalProfile',owner);location.assign(url.href);}
 async function returnGuest(){await saveBoundary();localStorage.removeItem(prefix+'-active');const url=new URL(location.href);url.searchParams.delete('personalProfile');location.assign(url.href);}
 async function saveBoundary(){if(runtime.detached)return;runtime.pauseGame?.();await runtime.matchRecovery?.flush();await prepareNavigation();await runtime.flush();if(playing()||runtime.matchRecovery?.failure)throw Error('No se confirmó el checkpoint');}
 function close(postpone=false){if(busy)return;if(postpone&&['offer','preview','blocked','interrupted'].includes(view))decide('postponed');const mounted=dialog;if(!mounted)return;mounted.close();if(dialog===mounted){dialog=null;view=null;mounted.remove();(previousFocus?.isConnected?previousFocus:document.querySelector('[data-menu-account]'))?.focus();}}
 function mount(){
  if(dialog)return;runtime.pauseGame?.();previousFocus=document.activeElement;dialog=el('dialog',null,'lf5-dialog');dialog.id='lf5-transfer-dialog';dialog.setAttribute('aria-labelledby','lf5-title');dialog.setAttribute('aria-describedby','lf5-description');
  const header=el('header',null,'lf5-heading'),brand=el('span','LAqP DRAFT','lf5-eyebrow');closeButton=button(header,'×','close',()=>close(true));closeButton.className='lf5-close';closeButton.setAttribute('aria-label','Cerrar');header.prepend(brand);title=el('h2');title.id='lf5-title';title.tabIndex=-1;description=el('p');description.id='lf5-description';status=el('p',null,'lf5-status');status.dataset.lf5='transfer-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');body=el('div',null,'lf5-content');footer=el('footer',null,'lf5-actions');
  dialog.append(header,title,description,status,body,footer);document.body.append(dialog);
  dialog.addEventListener('keydown',event=>event.stopPropagation()); // Gameplay shortcuts must not consume dialog keys.
  const mounted=dialog;dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});dialog.addEventListener('close',()=>{mounted.remove();if(dialog!==mounted)return;dialog=null;view=null;(previousFocus?.isConnected?previousFocus:document.querySelector('[data-menu-account]'))?.focus();},{once:true});dialog.showModal();
 }
 function screen(kind,heading,note,message=''){
  mount();view=kind;dialog.dataset.step=kind;title.textContent=heading;description.textContent=note;body.replaceChildren();footer.replaceChildren();setStatus(message);title.focus({preventScroll:true});
 }
 function setStatus(text,tone='info'){if(!dialog)return;status.textContent=text;status.hidden=!text;status.dataset.tone=tone;}
 function lock(value){busy=value;if(!dialog)return;dialog.setAttribute('aria-busy',String(value));closeButton.disabled=value;for(const b of footer.querySelectorAll('button'))b.disabled=value;}
 function stats(host,bundle,compact=false){
  const s=guestProgressSummary(bundle),grid=el('dl',null,'lf5-stats');for(const [name,value,icon]of [['Draft Coins',s.coins,'◈'],['Cartas',s.cards,'▣'],['Copas',s.cups,'★'],['Campañas',s.campaigns,'⚑']]){const cell=el('div');cell.append(el('dt',icon+' '+name),el('dd',value.toLocaleString('es-AR')));grid.append(cell);}host.append(grid);
  if(!compact)host.append(el('p',s.stickers+' figuritas en el álbum · '+s.packs+(s.packs===1?' sobre pendiente':' sobres pendientes')+' · '+s.history+(s.history===1?' registro de historial':' registros de historial'),'lf5-detail'));
 }
 function profileCard(host,heading,bundle,note){const card=el('section',null,'lf5-profile-card');card.append(el('h3',heading));if(bundle)stats(card,bundle,true);if(note)card.append(el('p',note,'lf5-detail'));host.append(card);return card;}
 function choices(){button(footer,'Seguir con mi cuenta','account',async()=>{if(busy)return;await saveBoundary();decide('account');navigate(flowOwner);});button(footer,'Ahora no','later',()=>close(true));}
 async function open(){
  if(closed||busy||dialog||!selected())return;flowOwner=selected();journal=null;screen('offer','¿Querés conservar tu progreso?','Tenés una partida guardada como invitado. Podés llevarla a tu cuenta para seguir jugando y conservar tus avances.','Verificando tu progreso…');
  try{
   journal=await operation(flowOwner);if(dialog===null||selected()!==flowOwner)return;
   if(journal&&['installed','local-confirmed'].includes(journal.state)){await transfers.install(journal.operationId,journal.consent);completed(await transfers.get(journal.operationId));return;}
   const source=await runtime.repository.read(guest);if(!dialog||selected()!==flowOwner)return;
   if(!source||!hasGuestProgress(source)){screen('empty','Tu próxima partida empieza acá','Todavía no hay progreso de invitado para llevar a tu cuenta.');choices();return;}
   stats(body,source);const {readMatchCopies}=await import('./matches.js'),matches=await readMatchCopies(runtime.repository,guest);if(!dialog)return;
   const active=matches.find(r=>r.key.startsWith('lf3-match:'))?.generations?.[0]?.sealed?.checkpoint;
   if(active)body.append(el('p','◷ Partido en curso · '+active.minute+'′ · Se recuperará en pausa','lf5-match'));
   body.append(el('p','Destino: '+label(flowOwner)+(real?' · Staging':' · Sesión de prueba'),'lf5-destination'));setStatus('Tu partida original seguirá disponible como invitado.');
   if(journal?.state==='consented'){setStatus('Hay una transferencia interrumpida con tu confirmación guardada.','warning');button(footer,'Recuperar transferencia','recover',()=>install(journal),true);button(footer,'Volver a revisar','preview',()=>preview());}
   else button(footer,'Conservar mi progreso','preview',()=>preview(),true);choices();
  }catch{setStatus(copy.interrupted,'warning');button(footer,'Volver a intentar','retry',async()=>{close();await open();});}
 }
 async function preview(){
  if(busy||!dialog)return;lock(true);setStatus('Preparando transferencia · Confirmando el guardado local…');
  try{
   await saveBoundary();const source=await runtime.repository.read(guest),target=await runtime.repository.read(flowOwner);if(!source)throw Error('Sin invitado');
   screen('preview','Elegí cómo seguir','Vamos a conservar una copia de tu partida invitada. Las dos partidas permanecen separadas.','Verificando el estado de tu cuenta…');
   const comparison=el('div',null,'lf5-comparison');profileCard(comparison,'Mi partida como invitado',source,'Se conserva también el original.');const targetCard=profileCard(comparison,'Mi cuenta',target,target?'Progreso guardado en este dispositivo.':'Sin progreso local. El respaldo todavía no está verificado.');body.append(comparison);choices();lock(true);
   let check;try{check=await transfers.inspectDestination(flowOwner);}catch(e){screenBlocked(e.details?.reason==='remote-progress'?'remote':'unknown',targetCard);return;}
   if(!check.empty){screenBlocked('local',targetCard);return;}
   targetCard.querySelector('.lf5-detail').textContent='Cuenta vacía verificada en este dispositivo y en '+(real?'el servidor de staging.':'el respaldo de prueba.');
   const ready=el('div',null,'lf5-account-ready');ready.append(el('span','✓'),el('strong','Lista para tu partida'));targetCard.append(ready);
   const operationId=crypto.randomUUID();localStorage.setItem(opKey(flowOwner),operationId);setStatus('Verificando el progreso y preparando una copia completa…');await transfers.prepare({operationId,source:guest,target:flowOwner});journal=await transfers.get(operationId);
   // Render the exact source bound by the durable preparation, not a stale preview.
   comparison.firstChild.replaceChildren(el('h3','Mi partida como invitado'));stats(comparison.firstChild,journal.original.active.bundle,true);comparison.firstChild.append(el('p','El original permanece disponible.','lf5-detail'));
   const consentLabel=el('label',null,'lf5-consent'),checkbox=el('input');checkbox.type='checkbox';checkbox.dataset.lf5='consent';consentLabel.append(checkbox,el('span','Confirmo copiar esta partida a '+label(flowOwner)+' y conservar mi progreso original como invitado.'));body.append(consentLabel);footer.replaceChildren();
   const confirm=button(footer,'Confirmar transferencia','confirm',()=>{if(checkbox.checked)return consentAndInstall(checkbox);},true);confirm.disabled=true;checkbox.onchange=()=>{confirm.disabled=!checkbox.checked;};button(footer,'Ahora no','later',()=>close(true));setStatus('Se instalará una copia completa. No se suman monedas ni se vuelven a conceder premios.');
  }catch{setStatus(copy.changed,'warning');footer.replaceChildren();button(footer,'Volver a revisar','preview',()=>preview(),true);choices();}finally{busy=false;if(dialog){dialog.setAttribute('aria-busy','false');closeButton.disabled=false;for(const b of footer.querySelectorAll('button'))if(b.dataset.lf5!=='confirm')b.disabled=false;}}
 }
 function screenBlocked(reason,targetCard){
  view='blocked';dialog.dataset.step='blocked';title.textContent=reason==='unknown'?'Tu cuenta todavía no está verificada':'Tenés dos partidas distintas';
  description.textContent=reason==='unknown'?copy.unknown:'Tu invitado y tu cuenta tienen su propio progreso. Por ahora no se pueden combinar ni reemplazar. Conservamos ambas partidas.';
  targetCard.querySelector('.lf5-detail').textContent=reason==='unknown'?'Estado del respaldo desconocido. No asumimos que la cuenta esté vacía.':reason==='remote'?'Hay progreso en el respaldo de tu cuenta. No se descargó ni se modificó.':'Tu cuenta ya tiene progreso. No se instalará el invitado encima.';
  setStatus(reason==='unknown'?'Podés continuar con tu cuenta o verificar de nuevo más tarde.':'Ninguna de las dos partidas se borró ni se combinó.','warning');footer.replaceChildren();if(reason==='unknown')button(footer,'Volver a verificar','preview',()=>preview());choices();
 }
 async function consentAndInstall(checkbox){if(busy)return;lock(true);checkbox.disabled=true;setStatus('Verificando tu confirmación…');try{const consent=await transfers.consent(journal.operationId,{requestHash:journal.requestHash,confirmed:checkbox.checked});journal={...journal,consent};await performInstall(journal);}catch{interrupted();}finally{lock(false);}}
 async function performInstall(j){setStatus('Guardando una copia de seguridad e instalando tu progreso…');await transfers.install(j.operationId,j.consent);completed(await transfers.get(j.operationId));}
 async function install(j){if(busy)return;lock(true);try{await performInstall(j);}catch{interrupted();}finally{lock(false);}}
 function interrupted(){view='interrupted';dialog.dataset.step=view;title.textContent='Tu partida sigue a salvo';setStatus(copy.interrupted,'warning');footer.replaceChildren();if(journal?.consent)button(footer,'Recuperar transferencia','recover',()=>install(journal),true);button(footer,'Volver a revisar','preview',()=>preview());button(footer,'Ahora no','later',()=>close(true));}
 function completed(j){
  journal=j;decide('transferred',j.target);
  if(runtime.identity===j.source){runtime.pauseGame?.();runtime.matchRecovery?.suspend();runtime.detached=true;document.querySelector('#app').inert=true;}
  screen('complete','Tu progreso ya está en tu cuenta','La transferencia en este dispositivo está confirmada. Tu partida original de invitado sigue conservada.');body.append(el('div','✓','lf5-success'));stats(body,j.prepared.active.bundle,true);cloud={state:j.cloud?.state==='confirmed'?'confirmed':'pending',text:j.cloud?.state==='confirmed'?'Respaldo cloud confirmado':'Respaldo cloud pendiente · Podés seguir jugando en este dispositivo'};showCloud();button(footer,'Continuar jugando','continue',()=>navigate(j.target),true);button(footer,'Respaldar ahora','backup-now',()=>backup());emit();
  if(adapter.autoBackup&&j.cloud?.state!=='confirmed')queueMicrotask(()=>backup());
 }
 function showCloud(){if(!dialog)return;if(view==='complete'||view==='account')setStatus(cloud.text,cloud.state==='confirmed'?'success':cloud.state==='conflict'?'warning':'info');}
 async function backup(){
  if(closed)return;if(backing)return backing;const owner=selected();if(!owner)return;
  const task=(async()=>{try{
   if(owner===runtime.identity)await saveBoundary();const j=await operation(owner);if(!await runtime.repository.read(owner))throw Error('Sin instalación local');
   sync?.stop();const client=adapter.client(owner);let acknowledged=null;const commit=client.commit.bind(client);client.commit=async(o,job)=>{const receipt=await commit(o,job);acknowledged={job,receipt};if(j&&job.profileHash===j.receipt?.installedHash)await transfers[real?'rememberCloudReceipt':'rememberFictionalCloudReceipt'](j.operationId,acknowledged);return receipt;};
   const targetRuntime=owner===runtime.identity?runtime:{identity:owner,repository:runtime.repository,flush:()=>Promise.resolve(),subscribe:()=>()=>{},matchActive:false};
   sync=await new PersonalSyncCoordinator({runtime:targetRuntime,client,online:adapter.online,onChange:s=>{cloud={state:s.status==='synced'?'confirmed':s.status==='syncing'?'syncing':s.status==='conflict'?'conflict':'pending',text:s.status==='synced'?'Respaldo cloud confirmado':s.status==='syncing'?'Respaldando tu progreso…':s.status==='conflict'?'Hay otra partida en el respaldo. Ambas copias se conservan.':'Respaldo cloud pendiente · Tu progreso local se conserva'};showCloud();emit();}}).start();await sync.enable();
   const candidate=acknowledged||(j?(await transfers.get(j.operationId))?.cloudCandidate:null);if(j&&candidate&&candidate.job.profileHash===j.receipt?.installedHash)await transfers[real?'acknowledgeCloud':'acknowledgeFictionalCloud'](j.operationId,candidate);
  }catch{cloud={state:'pending',text:'Respaldo cloud pendiente · Tu progreso local se conserva. Podés reintentar más tarde.'};showCloud();}finally{backing=null;emit();}})();backing=task;emit();return task;
 }
 async function continueAccount(){await saveBoundary();decide('account',selected());navigate(selected());}
 async function signIn(){if(busy||closed||!active())return;close();const prior=selected(),owner=await adapter.signIn();if(prior!==owner){sync?.stop();cloud={state:'pending',text:'Respaldo cloud pendiente'};}emit();const source=await runtime.repository.read(guest);if(source&&hasGuestProgress(source)&&!localStorage.getItem(decisionKey(owner)))await open();else await openAccount();}
 async function restoreAccount(){
  if(!real||busy||backing||runtime.identity!==selected())return;lock(true);const owner=selected();
  try{
   await saveBoundary();if(!(await transfers.inspectLocalDestination(owner)).empty)throw Error('El dispositivo ya tiene una partida');
   sync?.stop();sync=await new PersonalSyncCoordinator({runtime,client:adapter.client(owner),online:adapter.online,onInstalled:({snapshot})=>{runtime.pauseGame?.();runtime.matchRecovery?.suspend();runtime.detached=true;adapter.navigate(owner,snapshot);}}).start();
   // Recovery never enables upload of an empty profile. Reuse LF4's verified
   // download and local CAS installer, only while this device remains empty.
   if(await sync.store.pending())throw Error('Hay un respaldo local pendiente');
   const head=await sync.client.head(owner);if(!head){setStatus('Esta cuenta todavía no tiene un respaldo remoto.');return;}
   const before=await sync.store.capture(),snapshot=await sync.download(head,sync.epoch),checked=await sync.client.head(owner);
   if(owner!==selected()||!checked||checked.revision!==head.revision||checked.hash!==head.hash||!(await transfers.inspectLocalDestination(owner)).empty)throw Error('La cuenta o la partida cambiaron');
   const boundary=()=>{sync.gate();if(owner!==selected())throw Error('La cuenta autenticada cambió');};boundary();const installed=await sync.store.install(snapshot,{expectedStamp:before.stamp,head,confirm:true,boundary});boundary();runtime.bundle=installed.bundle;await sync.onInstalled({snapshot,bundle:installed.bundle});
  }catch{setStatus('No se pudo recuperar el respaldo. Las partidas se conservan; verificá la sesión y volvé a intentar.','warning');}finally{lock(false);}
 }
 async function openAccount(){
  if(busy||closed||dialog||!active())return;flowOwner=selected();screen('account','Mi cuenta',selected()?label(selected())+(real?' · Cuenta auténtica de staging.':' · Sesión de prueba; no usa tu cuenta real de LAqP.'):'Estás jugando como invitado. Tu progreso queda guardado en este dispositivo.');
  if(!selected()){const cached=real&&runtime.identity.startsWith('account:');if(cached)description.textContent='Estás usando la copia local de tu cuenta. El respaldo queda pendiente hasta verificar la sesión; podés seguir jugando en este dispositivo.';button(footer,real?'Iniciar sesión':'Iniciar sesión de prueba','login',()=>signIn(),true);button(footer,cached?'Volver al juego':'Seguir como invitado','later',()=>close());return;}
  const source=await runtime.repository.read(guest);if(!dialog||view!=='account')return;
  const j=await operation(),profile=await runtime.repository.read(selected());if(profile){const store=new LocalSyncStore(runtime.repository,selected(),adapter.projectRef),saved=await store.state(),confirmed=saved.lastCloudAt&&saved.baseStamp===await store.stamp();cloud={state:confirmed?'confirmed':'pending',text:confirmed?'Respaldo cloud confirmado':'Respaldo cloud pendiente · Podés seguir jugando localmente'};showCloud();}
  body.append(el('p',runtime.identity.startsWith('guest:')?'Estás usando tu partida invitada. La cuenta permanece separada.':'Estás usando la partida de '+label(runtime.identity)+' en este dispositivo.','lf5-detail'));
  if(source&&hasGuestProgress(source))button(body,j?.receipt?'Ver transferencia realizada':'Revisar progreso de invitado','offer',async()=>{close();await open();});
  if(source&&hasGuestProgress(source)&&(runtime.identity!==guest||runtime.detached))button(body,'Abrir mi partida de invitado','guest-user',()=>returnGuest());
  if(runtime.identity!==selected())button(footer,'Seguir con mi cuenta','account',()=>continueAccount(),true);
  else if(real&&(await transfers.inspectLocalDestination(selected())).empty)button(footer,'Recuperar mi progreso','restore-user',()=>restoreAccount(),true);
  else button(footer,'Respaldar mi progreso','backup-user',()=>backup(),true);
  button(footer,'Volver al juego','later',()=>close());
 }
 const onSessionChanged=event=>{if(real&&event?.type==='verified'&&event.renewed){emit();return;}sync?.stop();cloud={state:'pending',text:'La sesión cambió · Respaldo pendiente de verificar'};if(!busy)close();else setStatus(copy.changed,'warning');emit();
  if(!real)return;
  if(event?.type==='changed'&&runtime.identity.startsWith('account:')&&event.userId!==runtime.identity.split(':').at(-1)){localStorage.removeItem(prefix+'-active');runtime.detachAccount?.().catch(()=>{});}
  if(event?.type==='verified'&&runtime.identity===guest&&!busy)queueMicrotask(async()=>{try{const source=await runtime.repository.read(guest);if(source&&hasGuestProgress(source)&&!localStorage.getItem(decisionKey(event.owner)))await open();}catch{}});
 };const unsubscribe=adapter.subscribe(onSessionChanged);
 const keyboard=event=>{if(event.target.closest?.('[data-personal-account-menu]')&&['Enter',' '].includes(event.key)){event.preventDefault();openAccount().catch(()=>{});}};document.addEventListener('keydown',keyboard);
 runtime.accountMenu={open:openAccount,get signedIn(){return !!selected();},get label(){return selected()?'Mi cuenta · '+(real?'Staging':'Sesión de prueba'):real&&runtime.identity.startsWith('account:')?'Mi cuenta · Sin verificar':'Ingresar con mi cuenta';}};
 runtime.guestTransfer={open,openAccount,signIn,backup,returnGuest,repository:transfers,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},get busy(){return busy;},get backing(){return !!backing;},get cloud(){return cloud;},get selected(){return selected();}};emit();
 if(real&&selected())onSessionChanged({type:'verified',owner:selected(),userId:selected().split(':').at(-1)});
 return {dispose(){closed=true;sync?.stop();unsubscribe?.();adapter.dispose?.();dialog?.close();delete runtime.accountMenu;delete runtime.guestTransfer;document.removeEventListener('keydown',keyboard);listeners.clear();link.remove();refreshMenuAccount();}};
}
