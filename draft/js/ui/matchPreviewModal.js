import {isReducedMotion} from './motionPreferences.js';
let dialog=null,returnFocus=null;
export function closeMatchPreview(animate=false){
 if(!dialog)return;const current=dialog;dialog=null;const previous=returnFocus;const finish=()=>{current.close();current.remove();if(!dialog){if(previous?.isConnected)previous.focus();else document.querySelector('#btn-toggle-play')?.focus();}};
 if(animate&&!isReducedMotion()){current.classList.add('is-closing');setTimeout(finish,120);}else finish();
}
export function openMatchPreview(content,start){
 closeMatchPreview();returnFocus=document.activeElement;
 dialog=document.createElement('dialog');dialog.className='match-preview-modal';dialog.setAttribute('aria-label','Previa del partido');
 dialog.innerHTML='<button type="button" class="match-preview-close" aria-label="Cerrar previa sin iniciar">×</button><div id="match-start-preview">'+content+'</div><button type="button" class="draft-btn draft-btn-primary match-preview-start">▶ INICIAR PARTIDO</button>';
 document.querySelector('.match-screen').append(dialog);
 dialog.querySelector('.match-preview-close').onclick=()=>closeMatchPreview(true);
 dialog.querySelector('.match-preview-start').onclick=start;
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeMatchPreview(true);});
 if(isReducedMotion())dialog.classList.add('motion-reduced');
 dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...e.currentTarget.querySelectorAll('button,summary,a[href],input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
 dialog.showModal();dialog.querySelector('.match-preview-start').focus();
}
