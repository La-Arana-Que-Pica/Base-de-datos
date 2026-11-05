import {cupPathHtml,focusCupPath} from './cupPath.js';
import {expandedFinalStatsHtml} from './campaignFinals.js';
export function openCampaignDialog(state,kind,scope='match',doc=document){
 if(doc.querySelector('#campaign-dialog')||!state.tournament)return false;
 const match=state.activeMatch,playback=match?.playback,wasRunning=state.currentScreen==='MATCH'&&!!playback&&!playback.paused&&!match.isFinished;
 if(wasRunning)playback.pause();
 const trigger=doc.activeElement,dialog=doc.createElement('dialog');dialog.id='campaign-dialog';dialog.className='campaign-dialog';dialog.setAttribute('aria-label',kind==='cup'?'Camino a la Copa':'Estadísticas');
 dialog.innerHTML='<button type="button" class="draft-btn campaign-dialog-close" data-close-campaign-dialog>← VOLVER</button><div class="campaign-dialog-content">'+(kind==='cup'?cupPathHtml(state.tournament):expandedFinalStatsHtml(state,scope))+'</div>';
 dialog.addEventListener('close',()=>{dialog.remove();if(wasRunning&&state.activeMatch===match&&state.currentScreen==='MATCH'&&!match.isFinished)playback.resume();trigger?.focus?.();},{once:true});
 doc.body.append(dialog);dialog.showModal();if(kind==='cup')focusCupPath(dialog,'current');return true;
}
