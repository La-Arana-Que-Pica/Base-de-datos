// Display preferences only; no campaign or match state is changed.
export function initMobileDisplay(doc, { enterFullscreen, supported }) {
 const view=doc.defaultView;
 if(!doc.createElement||!view?.matchMedia||!doc.body)return null;
 const touch=view.matchMedia('(pointer: coarse)').matches||view.navigator?.maxTouchPoints>0;
 if(!touch)return null;
 doc.documentElement.classList.add('draft-mobile');
 const viewport=doc.querySelector('meta[name=viewport]');
 if(viewport&&!viewport.content.includes('viewport-fit'))viewport.content+=',viewport-fit=cover';
 if(!doc.querySelector('[data-mobile-game-style]')){
  const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('../../css/mobileGame.css',import.meta.url).href;link.dataset.mobileGameStyle='';doc.head.append(link);
 }
 const hint=doc.createElement('aside');hint.className='mobile-game-hint';hint.setAttribute('aria-label','Vista horizontal');
 hint.innerHTML='<div><strong>JUGÁ EN HORIZONTAL</strong><p>Girá el teléfono para ver mejor la cancha y las cartas.</p></div><button type="button" data-mobile-enter>PANTALLA COMPLETA</button><button type="button" data-mobile-dismiss aria-label="Cerrar recomendación">×</button>';
 if(!supported){hint.querySelector('[data-mobile-enter]').hidden=true;hint.querySelector('p').textContent='Girá el teléfono. Si tu navegador no ofrece pantalla completa, podés jugar igualmente en horizontal.';}
 doc.body.append(hint);let dismissed=false,locked=false;
 const sync=()=>{hint.hidden=dismissed||view.innerWidth>=view.innerHeight;};
 const lock=async()=>{if(!view.screen?.orientation?.lock)return;try{await view.screen.orientation.lock('landscape');locked=true;}catch{/* Manual rotation remains available when the browser rejects a lock. */}};
 const unlock=()=>{if(locked){view.screen?.orientation?.unlock?.();locked=false;}};
 const enter=()=>enterFullscreen();
 const dismiss=()=>{dismissed=true;sync();};
 hint.querySelector('[data-mobile-enter]').addEventListener('click',enter);
 hint.querySelector('[data-mobile-dismiss]').addEventListener('click',dismiss);
 view.addEventListener('resize',sync);sync();
 return {lock,unlock,destroy(){unlock();view.removeEventListener('resize',sync);hint.remove();doc.documentElement.classList.remove('draft-mobile');}};
}
