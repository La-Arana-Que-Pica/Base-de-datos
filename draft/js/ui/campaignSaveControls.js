import {refreshMainMenu} from './menuShell.js';
import {openCampaignHistory,clearHistoryForAccount} from './campaignHistory.js';
import {localTestRequested,createLocalTestClient,testScopedStorage,validateLocalTestConfig} from '../persistence/localTestBackend.js';
import {openLocalTestAuth} from './localTestAuth.js';
import {CloudCampaigns} from '../persistence/cloudCampaigns.js';
import {CampaignPersistence} from '../persistence/campaignPersistence.js';
import {safeCheckpoint} from '../persistence/campaignSnapshot.js';
import {escapeHtml as esc} from './html.js';
let controller=null,initializing=null,testMode=false;
const script=src=>new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=src;node.onload=resolve;node.onerror=()=>reject(new Error('No se pudo cargar la conexión de cuentas'));document.head.append(node);});
export function campaignSaveController(){return controller;}
export function refreshCampaignSaveUi(){
 if(!controller)return;refreshMainMenu();clearHistoryForAccount(controller.owner);const status=document.querySelector('#draft-save-status');if(status)status.textContent=controller.status;
 const hasLocal=(()=>{try{return !!controller.readOutbox();}catch{return false;}})();
 const available=!!(controller.ready&&(controller.remote||hasLocal));
 const start=document.querySelector('.start-screen');if(start){let controls=start.querySelector('#campaign-start-controls');if(!controls){controls=document.createElement('div');controls.id='campaign-start-controls';controls.className='campaign-start-controls';start.append(controls);}controls.innerHTML='<button type="button" class="draft-btn draft-btn-primary" data-save-action="continue" '+(available?'':'disabled')+'>CONTINUAR →</button>'+(!controller.owner?'<button type="button" class="draft-btn" data-save-action="login">Ingresar con mi cuenta</button>':'')+'<p>'+esc(controller.status)+'</p>';}
 const dialog=document.querySelector('#draft-save-dialog');if(dialog?.open){const status=dialog.querySelector('[data-save-status]');if(status)status.textContent=controller.status;const resume=dialog.querySelector('[data-save-action="continue"]');if(resume)resume.disabled=!available;}
}
function confirmDialog(message){return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='draft-modal campaign-save-dialog';dialog.id='draft-save-confirm';dialog.innerHTML='<h2>Confirmar decisión</h2><p>'+esc(message)+'</p><div class="campaign-save-actions"><button type="button" class="draft-btn" data-answer="no">Cancelar</button><button type="button" class="draft-btn draft-btn-primary" data-answer="yes">Confirmar</button></div>';document.body.append(dialog);let answer=false;dialog.addEventListener('click',e=>{const target=e.target.closest('[data-answer]');if(target){answer=target.dataset.answer==='yes';dialog.close();}});dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);},{once:true});dialog.showModal();});}
export function openCampaignSaveMenu(){
 if(document.querySelector('#draft-save-dialog'))return;
 const dialog=document.createElement('dialog');dialog.id='draft-save-dialog';dialog.className='draft-modal campaign-save-dialog';dialog.innerHTML='<header><h2>MI CAMPAÑA</h2><button type="button" class="draft-btn" data-save-action="close">Cerrar</button></header><p data-save-status role="status"></p><p>El autoguardado conserva decisiones y progreso en puntos seguros. Durante un partido se conserva la previa; al continuar, ese partido comienza de nuevo.</p><div class="campaign-save-actions"><button type="button" class="draft-btn draft-btn-primary" data-save-action="exit">GUARDAR Y SALIR</button><button type="button" class="draft-btn" data-save-action="continue" disabled>CONTINUAR DRAFT</button><button type="button" class="draft-btn" data-save-action="save">Guardar campaña / Reintentar</button><button type="button" class="draft-btn" data-save-action="history">Historial</button>'+(!controller?.owner?'<button type="button" class="draft-btn" data-save-action="login">Ingresar con mi cuenta</button>':'')+'</div>';
 document.body.append(dialog);const playback=controller?.state.activeMatch?.playback,wasPlaying=playback&&!playback.paused&&!playback.finished;if(wasPlaying)playback.pause();dialog.addEventListener('close',()=>{dialog.remove();if(wasPlaying&&controller.state.currentScreen==='MATCH'&&controller.state.activeMatch?.playback===playback&&!playback.disposed)playback.resume();document.querySelector('#draft-save-menu')?.focus();},{once:true});dialog.showModal();refreshCampaignSaveUi();
}
export function initCampaignSaveControls(state){
 if(controller)return controller;
 if(typeof window==='undefined'||typeof window.addEventListener!=='function'||!document.head)return null;
 let storage=null;try{storage=window.localStorage;}catch{}
 testMode=localTestRequested(window.location);
 if(testMode)storage=testScopedStorage(storage);
 const service=new CloudCampaigns(testMode?null:(window.LAQP_SUPABASE||window.LAQPCreateSupabaseClient?.()));
 if(testMode){const badge=document.createElement('span');badge.id='draft-test-mode';badge.textContent='MODO PRUEBAS — LAqP Draft';badge.className='draft-badge';document.querySelector('.draft-header')?.append(badge);}
 controller=new CampaignPersistence(state,service,{storage,confirm:confirmDialog,onChange:refreshCampaignSaveUi});controller.install();
 document.addEventListener('laqp-auth-change',()=>{if(testMode)return;const id=window.LAQPAuth?.user?.id||null;if(id!==controller.owner)controller.refreshIdentity();});
 window.addEventListener('online',()=>{if(controller.enabled)controller.flush().catch(e=>controller.emit(e.message,e));else controller.refreshIdentity();});
 window.addEventListener('beforeunload',event=>{if(controller.enabled&&(controller.pending||controller.retryJob||controller.busy||controller.archiving)){event.preventDefault();event.returnValue='';}});
 document.addEventListener('click',async event=>{const button=event.target.closest('[data-save-action],#draft-save-menu');if(!button)return;event.preventDefault();const action=button.dataset.saveAction;if(!action){openCampaignSaveMenu();return;}if(action==='history'){document.querySelector('#draft-save-dialog')?.close();openCampaignHistory(controller);return;}if(action==='close'){document.querySelector('#draft-save-dialog')?.close();return;}if(action==='login'||action==='test-account'){if(testMode){openLocalTestAuth(service.client,()=>controller.refreshIdentity());return;}document.querySelector('#draft-save-dialog')?.close();if(window.LAQPAuth)window.LAQPAuth.open('login');else window.location.assign('/mi-cuenta.html');return;}if(button.disabled)return;button.disabled=true;try{if(action==='continue'){if(state.currentScreen!=='START'&&!controller.suspended&&!await confirmDialog('Continuar reemplazará el estado actual en memoria por el checkpoint guardado. ¿Confirmás?'))return;await controller.continueDraft();document.querySelector('#draft-save-dialog')?.close();}else if(action==='exit'){if(await controller.saveAndExit()){document.querySelector('#draft-save-dialog')?.close();if(document.body?.dataset.menuShell==='classic')document.dispatchEvent(new CustomEvent('draft-menu-home'));}}else if(action==='save'){if(controller.enabled){controller.capture();await controller.flush();}else await controller.adoptCurrent();}}catch(e){controller.emit(e.message,e);}finally{button.disabled=false;refreshCampaignSaveUi();}});
 initializing=(async()=>{try{if(testMode){
 if(!['localhost','127.0.0.1'].includes(window.location.hostname))throw new Error('Modo pruebas bloqueado: solo disponible en localhost / 127.0.0.1.');
 const response=await fetch('/draft/local-test-config.json',{cache:'no-store'});if(!response.ok)throw new Error('Modo pruebas: falta /draft/local-test-config.json. No se conectará a producción.');let config;try{config=validateLocalTestConfig(await response.json());}catch(e){throw new Error('Modo pruebas: configuración JSON/clave inválida. '+e.message);}
 if(!window.supabase)await script('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.min.js');
 service.client=await createLocalTestClient(window.location,window.supabase,async()=>config);
 service.client.auth.onAuthStateChange(()=>{queueMicrotask(()=>controller.refreshIdentity());});
 const account=document.createElement('button');account.type='button';account.className='draft-btn';account.dataset.saveAction='test-account';account.textContent='Cuenta de pruebas';document.querySelector('.draft-header')?.append(account);
 await controller.refreshIdentity();return;
 }if(!window.LAQP_SUPABASE){if(!window.supabase)await script('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.min.js');if(!window.LAQPCreateSupabaseClient)await script('/js/supabaseClient.js?v=20261005c');}service.client=window.LAQP_SUPABASE||window.LAQPCreateSupabaseClient?.();if(!window.LAQPAuth)await script('/js/auth.js?v=20261005d');if(!controller.ready)await controller.refreshIdentity();}catch(e){controller.emit(testMode?String(e.message):'Cuentas no disponibles · podés jugar como invitado',e);}})();
 refreshCampaignSaveUi();return controller;
}
