import {PersonalSyncClient,syncConfiguration} from './client.js';
import {PersonalSyncCoordinator} from './coordinator.js';
import {accountIdentity} from '../identity.js';
import {routeURL} from '../../navigation/routes.js';
const labels={local:'Guardado en este dispositivo',pending:'Sincronización pendiente',syncing:'Respaldando tu progreso…',synced:'Sincronizado con tu cuenta',offline:'Sin conexión · Tu progreso local se conserva',expired:'Sesión vencida · Podés seguir jugando',disabled:'Respaldo pausado para esta cuenta · Tu progreso local se conserva',conflict:'Conflicto entre versiones · Ambas copias se conservan'};
export async function installPersonalSync(runtime,{scope=window,prepareNavigation=()=>runtime.flush()}={}){
 let configured=null,configurationError=null;try{configured=syncConfiguration(scope);}catch(e){configurationError=e;}
 let sync=null,closed=false;
 if(configured&&runtime.identity.startsWith('account:'+configured.projectRef+':')){
  sync=await new PersonalSyncCoordinator({runtime,client:new PersonalSyncClient(configured),onChange:()=>render(),onInstalled:({snapshot})=>{runtime.detached=true;runtime.matchRecovery?.suspend();runtime.pauseGame?.();const active=snapshot.matches.map(r=>r.generations[0]?.sealed.checkpoint).filter(Boolean);if(active.length===1){const c=active[0],name=c.mode==='CAREER'?'career':c.mode==='SURVIVAL_DREAM'?'survivalDream':c.mode==='SURVIVAL'?'survival':'classic';location.replace(routeURL(name,{personal:1,personalProfile:runtime.identity,...(name==='career'?{continue:c.region}:{})}));}else location.reload();}}).start();runtime.cloudSync=sync;
 }
 function render(){
  if(closed||runtime.detached)return;let node=document.querySelector('#personal-cloud-status');
  const user=scope.LAQPAuth?.user;if(!sync&&!user&&!configurationError){node?.remove();return;}
  if(!node){node=document.createElement('aside');node.id='personal-cloud-status';node.className='personal-save-status';document.querySelector('#personal-save-status')?.after(node);}
  const key=JSON.stringify([sync?.status,sync?.state?.enabled,sync?.state?.lastCloudAt,sync?.state?.conflict,sync?.error?.message,user?.id,configurationError?.message]);if(node.dataset.syncStatusKey===key)return;node.dataset.syncStatusKey=key;
  node.replaceChildren();const status=document.createElement('span');status.setAttribute('role','status');status.textContent=sync?sync.status==='error'?sync.error?.message||'No se confirmó el respaldo':labels[sync.status]||labels.local:configurationError?'Respaldo de cuenta no configurado para este entorno':labels.local;node.append(status);
  function button(text,action,attr){const b=document.createElement('button');b.className='menu-secondary';b.textContent=text;if(attr)b.setAttribute(attr,'');b.onclick=()=>Promise.resolve(action()).catch(e=>{status.textContent=e.message;});node.append(b);}
  if(sync){if(sync.state?.lastCloudAt){const time=document.createElement('small');time.textContent='Último respaldo confirmado: '+new Date(sync.state.lastCloudAt).toLocaleString('es-AR');node.append(time);}if(sync.allowed()){button(sync.state.enabled?'SINCRONIZAR':'ACTIVAR RESPALDO OPCIONAL',()=>sync.state.enabled?sync.sync():sync.enable(),'data-personal-sync');if(sync.state.conflict)button('REVISAR VERSIONES',()=>conflictDialog(),'data-personal-sync-conflict');if(sync.state.enabled)button('PAUSAR RESPALDO',()=>sync.disable(),'data-personal-sync-disable');}}
  else if(user&&runtime.identity.split(':').at(-1)!==user.id){button('USAR PERFIL LOCAL DE MI CUENTA',async()=>{const project=new URL(scope.LAQP_SUPABASE?.supabaseUrl||scope.LAQP_SUPABASE_CONFIG?.url).hostname.split('.')[0];const owner=accountIdentity(project,user.id);await prepareNavigation();const url=new URL(location.href);url.searchParams.set('personalProfile',owner);location.assign(url.href);},'data-personal-account');}
 }
 function conflictDialog(){
  if(document.querySelector('#personal-sync-conflict'))return;const c=sync.state.conflict;if(!c)return;
  const dialog=document.createElement('dialog');dialog.id='personal-sync-conflict';dialog.className='personal-migration-dialog';dialog.setAttribute('aria-labelledby','personal-sync-conflict-title');const title=document.createElement('h2');title.id='personal-sync-conflict-title';title.textContent='Elegí qué progreso conservar';dialog.append(title);
  const note=document.createElement('p');note.textContent='Las dos versiones tienen copia protegida. No se sumarán monedas, jugadores ni premios.';dialog.append(note);
  for(const [name,s]of [['Este dispositivo',c.local],['Tu cuenta',c.remote]]){const p=document.createElement('p');p.textContent=name+': '+s.coins+' Draft Coins · '+s.cards+' cartas · '+s.campaigns+' campañas activas · '+s.history+' registros históricos';dialog.append(p);}
  const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
  for(const [text,choice]of [['CONSERVAR ESTE DISPOSITIVO','local'],['RECUPERAR LA VERSIÓN DE MI CUENTA','remote']]){const b=document.createElement('button');b.className='menu-secondary';b.textContent=text;b.dataset.syncChoice=choice;b.onclick=async()=>{const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await sync.resolve(choice,{confirm:true});dialog.close();}catch(e){status.textContent=e.message;buttons.forEach(b=>b.disabled=false);}};dialog.append(b);}
  const close=document.createElement('button');close.textContent='DECIDIR DESPUÉS';close.className='menu-secondary';close.onclick=()=>dialog.close();dialog.append(close);const previous=document.activeElement;dialog.addEventListener('close',()=>{dialog.remove();previous?.focus?.();},{once:true});document.body.append(dialog);dialog.showModal();
 }
 const network=()=>sync?.networkChanged().catch(()=>{}),auth=event=>{if(sync&&event.detail?.error&&!event.detail?.session)sync.sessionExpired();else if(sync&&event.detail?.session?.user?.id===runtime.identity.split(':').at(-1))sync.networkChanged().catch(()=>{});render();};
 // The web profile fetch may finish later than Auth itself. Hide A immediately
 // on a B session, without awaiting profile tables or making Auth calls in-hook.
 const authSubscription=scope.LAQP_SUPABASE?.auth?.onAuthStateChange?.((event,session)=>{if(closed)return;const id=session?.user?.id;if(runtime.identity.startsWith('account:')&&id&&id!==runtime.identity.split(':').at(-1))runtime.detachAccount?.().catch(()=>{});else if(event==='SIGNED_OUT')sync?.sessionExpired();});
 window.addEventListener('online',network);window.addEventListener('offline',network);document.addEventListener('laqp-auth-change',auth);render();
 return {sync,dispose(){closed=true;sync?.stop();authSubscription?.data?.subscription?.unsubscribe?.();window.removeEventListener('online',network);window.removeEventListener('offline',network);document.removeEventListener('laqp-auth-change',auth);document.querySelector('#personal-cloud-status')?.remove();document.querySelector('#personal-sync-conflict')?.remove();}};
}
