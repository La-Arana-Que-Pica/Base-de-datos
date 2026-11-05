import {state} from '../state.js';
import {personalContext} from '../personal/context.js';
import {officialContext} from '../accounts/context.js';
import {safeCheckpoint} from '../persistence/campaignSnapshot.js';
import {fullscreenParent} from '../ui/fullscreenNavigation.js';
import {menuDialog} from '../ui/menuShell.js';
import {escapeHtml as e} from '../ui/html.js';

// Existing mode hooks own every write/checkpoint. No Auth, economy, cloud job
// or profile selection is performed by this navigation controller.
export function installWebsiteExit({prepare,owner,isNavigating=()=>false}){
 let busy=false;
 async function leave(destination='/'){
  if(!['/','/mi-cuenta.html'].includes(destination))return false;
  if(busy||isNavigating())return false;
  const other=document.querySelector('dialog[open]');
  if(other){let note=other.querySelector('[data-website-pending]');if(!note){note=document.createElement('p');note.dataset.websitePending='';note.setAttribute('role','alert');other.append(note);}note.textContent='Terminá o cancelá esta decisión antes de volver a LAqP Website.';return false;}
  busy=true;const bound=owner(),playback=state.activeMatch?.playback,wasPlaying=playback&&!playback.paused&&!playback.finished;let dialog,leaving=false,saveFailed=false;
  if(wasPlaying)playback.pause();
  const resume=()=>{if(!leaving&&!saveFailed&&wasPlaying&&owner()===bound&&state.activeMatch?.playback===playback&&!playback.disposed&&!playback.finished)playback.resume();};
  try{
   const active=state.currentScreen!=='START';
   if(active&&!personalContext()&&!officialContext()&&!safeCheckpoint(state)){
    const reason=state.currentScreen==='MATCH'?'Este modo conserva la previa del partido, pero no este momento del encuentro. Terminá el partido para volver a la web sin perder lo que jugaste.':'Este paso todavía no tiene un guardado recuperable. Completá la decisión o volvé al menú de este modo antes de salir.';
    dialog=menuDialog('Antes de salir','<p>'+reason+'</p>','<button type="button" class="menu-primary" data-menu-dialog-close>Seguir jugando</button>');
    await new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));return false;
   }
   if(active){
    const match=state.currentScreen==='MATCH'&&personalContext()?.matchRecovery;
    dialog=menuDialog('¿Volver a LAqP Website?', '<p>'+ (match?'El partido quedará pausado. Confirmaremos su guardado en este navegador antes de salir.':'Guardaremos tu selección y el progreso recuperable en este navegador antes de salir.')+'</p><p>Tu sesión se mantiene. Guardar en este dispositivo no confirma un respaldo en la nube.</p>','<button type="button" class="menu-secondary" data-menu-dialog-close>Seguir jugando</button><button type="button" class="menu-primary" data-website-confirm>Guardar y volver a la web</button>');
    const confirmed=await new Promise(resolve=>{let yes=false;dialog.querySelector('[data-website-confirm]').addEventListener('click',()=>{yes=true;resolve(true);},{once:true});dialog.addEventListener('close',()=>{if(!yes)resolve(false);},{once:true});});
    if(!confirmed)return false;
    dialog.querySelectorAll('button').forEach(button=>button.disabled=true);dialog.addEventListener('cancel',event=>event.preventDefault());
    const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Confirmando el guardado local…';dialog.append(status);
   }
   if(await prepare()===false)throw Error('Hay una acción pendiente. Completala antes de salir.');
   if(owner()!==bound)throw Error('La identidad cambió mientras se guardaba. La salida se detuvo para proteger ambos perfiles.');
   const target=fullscreenParent()?window.parent:window;
   if(target.document.fullscreenElement)await target.document.exitFullscreen();
   if(owner()!==bound)throw Error('La identidad cambió antes de salir. Volvé a comprobar el guardado.');
   // Do not suspend the mode here: Back may restore this document from BFCache.
   // The fullscreen host's suspension hook is only for in-Draft mode changes.
   leaving=true;dialog?.close();target.location.assign(destination);return true;
  }catch(error){saveFailed=true;dialog?.close();menuDialog('No salimos todavía','<p>'+e(error.message)+'</p><p>El juego sigue abierto. No se descartó tu progreso: resolvé el guardado pendiente y volvé a intentar.</p>','<button type="button" class="menu-primary" data-menu-dialog-close>Volver al juego</button>');return false;
  }finally{busy=false;resume();}
 }
 document.addEventListener('click',event=>{const link=event.target.closest('[data-website-exit],[data-website-account]');if(!link||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();event.stopImmediatePropagation();leave(link.getAttribute('href')||'/');},true);
 document.querySelectorAll('[data-website-exit]').forEach(link=>{link.removeAttribute('inert');link.removeAttribute('aria-disabled');});
 return {leave,get busy(){return busy;}};
}
