import {initMobileDisplay} from './mobileDisplay.js';
import {fullscreenParent,registerFullscreenController} from './fullscreenNavigation.js';
// Presentation-only controller: never imports Draft state or simulation.
const controllers=new WeakMap();
export function initFullscreen(doc=document,{fit=()=>{}}={}){
 if(controllers.has(doc))return controllers.get(doc);
 const target=doc.documentElement,view=doc.defaultView,button=doc.querySelector('#draft-fullscreen'),status=doc.querySelector('#draft-fullscreen-status');
 if(!target||!button)return null;
 let pending=false,wasActive=false,entryScroll=null,frame=null,mobile=null;
 const parent=view?fullscreenParent(view):null;
 const supported=parent?parent.supported:typeof target.requestFullscreen==='function'&&typeof doc.exitFullscreen==='function'&&doc.fullscreenEnabled!==false;
 const message=text=>{if(status)status.textContent=text;};
 const measure=()=>{
  frame=null;const header=doc.querySelector('.draft-header'),container=doc.querySelector('.draft-container');
  const height=view?.visualViewport?.height||view?.innerHeight||0,headerHeight=header?.getBoundingClientRect?.().height||0;
  target.style.setProperty('--draft-header-height',Math.ceil(headerHeight)+'px');
  target.style.setProperty('--draft-viewport-height',height+'px');
  if(container&&height){const top=container.getBoundingClientRect().top+(view?.scrollY||0);target.style.setProperty('--draft-game-height',Math.max(0,height-top)+'px');}
  fit(doc);
 };
 const schedule=()=>{if(frame!==null)return;if(view?.requestAnimationFrame)frame=view.requestAnimationFrame(measure);else measure();};
 const sync=()=>{
  const active=parent?parent.isActive():doc.fullscreenElement===target;
  if(!active)mobile?.unlock();
  target.classList.toggle('draft-fullscreen',active);
  button.textContent=active?'Salir de pantalla completa':'⛶ Pantalla completa';
  button.setAttribute('aria-pressed',String(active));button.disabled=pending;
  if(wasActive&&!active&&entryScroll){const same=entryScroll.node===doc.querySelector('#app')?.firstElementChild;view?.scrollTo?.({left:same?entryScroll.x:0,top:same?entryScroll.y:0,behavior:'instant'});entryScroll=null;}
  if(active&&!wasActive)view?.scrollTo?.({left:0,top:0,behavior:'instant'});
  wasActive=active;schedule();
 };
 const error=()=>{message('No se pudo cambiar la pantalla completa. Probá nuevamente desde el botón o revisá los permisos del navegador.');sync();};
 const toggle=async()=>{
  if(pending)return false;
  if(!supported){message('Este navegador no permite pantalla completa. Podés seguir jugando en la vista normal.');return false;}
  pending=true;button.disabled=true;message('');
  try{
   if(parent){await parent.toggle();return parent.isActive();}
   if(doc.fullscreenElement===target)await doc.exitFullscreen();
   else{entryScroll={x:view?.scrollX||0,y:view?.scrollY||0,node:doc.querySelector('#app')?.firstElementChild};await target.requestFullscreen();mobile?.lock().then(()=>{if(doc.fullscreenElement!==target)mobile.unlock();});}
   return doc.fullscreenElement===target;
  }catch{error();return false;}
  finally{pending=false;sync();}
 };
 button.addEventListener('click',toggle);doc.addEventListener('fullscreenchange',sync);doc.addEventListener('fullscreenerror',error);
 const detachParent=()=>{if(parent)view.parent.document.removeEventListener('fullscreenchange',sync);};
 const attachParent=()=>{if(parent){view.parent.document.addEventListener('fullscreenchange',sync);sync();}};
 if(parent){attachParent();view.addEventListener('pagehide',detachParent);view.addEventListener('pageshow',attachParent);}
 view?.addEventListener('resize',schedule);view?.visualViewport?.addEventListener('resize',schedule);
 const Observer=view?.ResizeObserver;const observer=Observer?new Observer(schedule):null;const header=doc.querySelector('.draft-header');if(header)observer?.observe(header);
 mobile=initMobileDisplay(doc,{enterFullscreen:toggle,supported});
 const controller={toggle,sync,measure,supported,destroy(){mobile?.destroy();detachParent();if(parent){view.removeEventListener('pagehide',detachParent);view.removeEventListener('pageshow',attachParent);}button.removeEventListener('click',toggle);doc.removeEventListener('fullscreenchange',sync);doc.removeEventListener('fullscreenerror',error);view?.removeEventListener('resize',schedule);view?.visualViewport?.removeEventListener('resize',schedule);observer?.disconnect();if(frame!==null)view?.cancelAnimationFrame?.(frame);controllers.delete(doc);}};
 controllers.set(doc,controller);registerFullscreenController(doc,controller);sync();return controller;
}
