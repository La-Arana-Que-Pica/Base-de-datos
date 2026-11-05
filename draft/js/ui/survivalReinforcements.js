import {renderPickStage,handlePickNavigation} from './pickStage.js';
import {startReveal,canSelectFromReveal} from './pickReveal.js?v=shared-reveal-1';
import {renderCompactDraftPlayer} from './teamBuilder.js';
import {escapeHtml as e} from './html.js';

export function renderSurvivalRecruitment(container,state){
 const pick=state.survival.recruitment;
 container.innerHTML='<div class="drafting-screen">'+renderPickStage({slotId:'survival-recruit',label:'Refuerzo del plantel',isStarter:false},pick.candidates,'SUPERVIVENCIA · RACHA '+state.survival.wins,0)
 .replace('BANCO · FICHAJE 1/23','REFUERZO DEL PLANTEL')
 .replace('Casilla objetivo:','Destino:')
 .replace('← Volver a la cancha','← Volver al resultado').replace('id="btn-close-pick"','id="survival-pick-back"')
 .replace('Elegí una carta para incorporarla.','Elegí y confirmá un fichaje. Se suma al plantel sin reemplazar a nadie.')
 .replace('</footer>','<button type="button" class="draft-btn draft-btn-primary" id="survival-confirm-recruit" disabled>CONFIRMAR FICHAJE</button></footer>')+'</div>';
 const panel=container.querySelector('.pick-panel');panel.dataset.survivalRecruit='true';
 startReveal(panel,undefined,pick.candidates);
}
export function survivalReservesHtml(state){
 const run=state.survival;if(!run||run.variant==='DREAM_TEAM'||!run.reserves?.length)return '';
 return '<section class="survival-reserves"><h3>FUERA DE LA CONVOCATORIA · '+run.reserves.length+'</h3><p>Plantel: '+(23+run.reserves.length)+' · Convocados: 11 titulares + 12 suplentes. En preparación, tocá un jugador y después una plaza del once o banco para intercambiarlos.</p><label>Buscar reserva por nombre o posición <input type="search" data-reserves-filter placeholder="Nombre o posición…"></label><div class="survival-reserve-grid">'+run.reserves.map(p=>'<button type="button" class="draft-bank-slot team-bench-slot '+(state.selectedSquadSlot===p.slotId?'slot-selected':'')+'" data-reserve-search="'+e(p.name+' '+p.primaryPosition+' '+p.naturalPositions.join(' '))+'" data-squad-slot="'+e(p.slotId)+'" aria-pressed="'+(state.selectedSquadSlot===p.slotId)+'" '+(state.currentScreen==='REVIEW'?'':'disabled')+'>'+renderCompactDraftPlayer(p,p.primaryPosition,{bench:true})+'<span>ENERGÍA '+Math.round(p.energy??100)+'%</span></button>').join('')+'</div></section>';
}
export function handleRecruitmentKeyboard(event,panel){return handlePickNavigation(event,panel);}
export function selectRecruitmentCard(panel,id,state){
 if(!canSelectFromReveal(panel)||!state.survival.recruitment.candidates.some(p=>p.id===id))return false;
 panel.dataset.selectedRecruit=id;
 panel.querySelectorAll('.candidate-card').forEach(card=>{const chosen=card.dataset.playerId===id;card.setAttribute('aria-pressed',String(chosen));card.style.outline=chosen?'3px solid #00e6df':'';});
 const p=state.survival.recruitment.candidates.find(p=>p.id===id),button=panel.querySelector('#survival-confirm-recruit');button.disabled=false;button.textContent='FICHAR A '+p.name+' · '+p.overall+' OVR';return true;
}
