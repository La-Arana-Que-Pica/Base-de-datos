import {staffSummaryHtml} from './staff.js';
import {escapeHtml as e} from './html.js';
import {historyViewState} from '../persistence/campaignHistory.js';
import {renderBuilderPitch,renderBuilderBench} from './teamBuilder.js';
import {expandedFinalStatsHtml} from './campaignFinals.js';
import {cupPathHtml} from './cupPath.js';
import {DRAFT_CONFIG} from '../config.js';
const outcome=r=>r.outcome==='champion'?'Campeón':r.outcome==='runner_up'?'Subcampeón':'Eliminado';
export function historyListHtml(items,next){return '<h2>HISTORIAL DE CAMPAÑAS</h2><p>Solo consulta · Tus campañas terminadas de Europa y América.</p><div class="history-list">'+items.map(r=>'<button type="button" class="draft-btn history-entry" data-history-id="'+e(r.campaign_id)+'"><strong>'+e(outcome(r))+' · '+e(r.region)+'</strong><span>'+e(new Date(r.finished_at).toLocaleString('es-AR'))+' · '+e(r.round_reached)+'</span><small>'+r.played+' partidos · '+r.wins+' victorias · '+r.goals_for+' GF / '+r.goals_against+' GC</small></button>').join('')+'</div>'+(!items.length?'<p>Todavía no hay campañas archivadas.</p>':'')+(next!==null?'<button type="button" class="draft-btn" data-history-next>Ver más campañas</button>':'');}
export function historyDetailHtml(row,tab='team'){
 let state;try{state=historyViewState(row);}catch(error){return '<h2>'+e(outcome(row))+' · '+e(row.region)+'</h2><p role="status">'+e(error.message)+'</p><p>'+e(row.round_reached)+' · '+row.played+' partidos · '+row.goals_for+' GF / '+row.goals_against+' GC. Los datos originales permanecen archivados.</p>';}
 const content=tab==='stats'?expandedFinalStatsHtml(state,'campaign'):tab==='cup'?cupPathHtml(state.tournament):'<section class="history-team team-builder"><h3>MI EQUIPO · '+e(state.formation.name)+'</h3><p>Medias finales de campaña · Las mejoras pertenecen solamente a esta campaña.</p><div class="team-center"><div class="draft-field-and-bench">'+renderBuilderPitch(state,state.formation)+renderBuilderBench(state,DRAFT_CONFIG.BENCH_ROLES)+'</div></div></section>';
 return '<h2>'+e(outcome(row))+' · '+e(row.region)+'</h2><p>'+e(row.round_reached)+' · '+e(new Date(row.finished_at).toLocaleString('es-AR'))+'</p>'+staffSummaryHtml(state)+'<nav class="history-tabs" aria-label="Apartados del historial">'+[['team','Mi equipo'],['stats','Estadísticas'],['cup','Camino a la Copa']].map(([id,label])=>'<button type="button" class="draft-btn" aria-pressed="'+(tab===id)+'" data-history-tab="'+id+'">'+label+'</button>').join('')+'</nav>'+content;
}
export function clearHistoryForAccount(owner){const dialog=document.querySelector('#draft-history-dialog');if(dialog&&dialog.dataset.owner!==owner)dialog.close();}
export function openCampaignHistory(controller){
 if(document.querySelector('#draft-history-dialog'))return;
 const dialog=document.createElement('dialog');dialog.id='draft-history-dialog';dialog.className='campaign-dialog history-dialog';dialog.dataset.owner=controller.owner||'';dialog.setAttribute('aria-label','Historial de campañas');
 dialog.innerHTML='<header><button class="draft-btn" type="button" data-history-back>← Historial</button><button class="draft-btn" type="button" data-history-close>Cerrar</button></header><div class="campaign-dialog-content" data-history-content></div>';
 const playback=controller.state.activeMatch?.playback,wasPlaying=playback&&!playback.paused&&!playback.finished;if(wasPlaying)playback.pause();
 const owner=controller.owner,epoch=controller.epoch;let items=[],next=null,record=null,generation=0;
 const content=dialog.querySelector('[data-history-content]');const valid=()=>dialog.open&&controller.owner===owner&&controller.epoch===epoch;
 function error(message){content.innerHTML='<p role="status">'+e(message)+'</p><button type="button" class="draft-btn" data-history-retry>Reintentar</button>';}
 async function load(more=false){const token=++generation;content.innerHTML='<p role="status">Buscando historial…</p>';try{if(!owner)throw new Error('Iniciá sesión para consultar tu historial.');const page=await controller.service.history(owner,more?next:null);if(!valid()||token!==generation)return;items=more?[...items,...page.items]:page.items;next=page.next;record=null;content.innerHTML=historyListHtml(items,next);}catch(err){if(valid()&&token===generation)error(err.message);}}
 dialog.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-history-close')){dialog.close();return;}if(button.hasAttribute('data-history-back')){generation++;record=null;content.innerHTML=historyListHtml(items,next);return;}if(button.hasAttribute('data-history-next')){await load(true);return;}if(button.hasAttribute('data-history-retry')){await load();return;}if(button.dataset.historyTab&&record){content.innerHTML=historyDetailHtml(record,button.dataset.historyTab);return;}if(button.dataset.historyId){const token=++generation;content.innerHTML='<p>Recuperando detalle…</p>';try{const row=await controller.service.historyDetail(owner,button.dataset.historyId);if(valid()&&token===generation){record=row;content.innerHTML=historyDetailHtml(row);}}catch(err){if(valid()&&token===generation)error(err.message);}}});
 dialog.addEventListener('close',()=>{generation++;dialog.remove();if(wasPlaying&&controller.state.activeMatch?.playback===playback&&controller.state.currentScreen==='MATCH'&&!playback.disposed)playback.resume();},{once:true});
 document.body.append(dialog);dialog.showModal();load();
}
