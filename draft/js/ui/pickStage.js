import {escapeHtml as e} from './html.js';
import {renderCandidateCard} from './candidateCard.js?v=pick-stage-2';
import {getMotionMode} from './motionPreferences.js';

export function renderPickStage(step,candidates,formationName,pickIndex){
 const target=step.isStarter?step.label:step.label+(step.position==='GK'?' · arquero':' · cualquier posición');
 return `<div class="pick-stage"><section class="pick-panel pick-scene" role="dialog" aria-modal="true" aria-labelledby="pick-title" aria-describedby="pick-target pick-help" data-slot-id="${e(step.slotId)}">
 <header class="pick-scene-top"><div class="pick-brand" aria-hidden="true">LAqP <span>Draft</span><small>CREÁ TU EQUIPO</small></div><div class="pick-context"><strong>${e(formationName)}</strong><span>${step.isStarter?'ONCE TITULAR':'BANCO'} · FICHAJE ${pickIndex+1}/23</span></div></header>
 <div class="pick-scene-heading"><p class="pick-eyebrow">CINCO OPCIONES · UNA ELECCIÓN</p><h2 id="pick-title">ELEGÍ <span>UN JUGADOR</span></h2><p id="pick-target">Casilla objetivo: <strong>${e(target)}</strong></p></div>
 <div class="candidates-grid" aria-label="Cinco candidatos">${candidates.map((p,i)=>`<div class="pick-option" data-reveal-index="${i}"><div class="pick-flipper formation-flipper"><div class="pick-back" aria-label="Carta oculta ${i+1}"><span class="pick-back-brand">LAqP<small>DRAFT</small></span><span class="pick-back-symbol" aria-hidden="true">?</span><span class="pick-back-index">CANDIDATO 0${i+1}</span></div><div class="pick-front" inert aria-hidden="true"></div></div><template>${renderCandidateCard(p)}</template></div>`).join('')}</div>
 <footer class="pick-scene-footer"><div><p id="pick-reveal-status" role="status">Preparando candidatos…</p><p id="pick-help">Elegí una carta para incorporarla. Flechas para navegar · Enter para elegir.</p><p class="pick-touch-help">Deslizá para ver los cinco candidatos.</p></div><div class="pick-scene-controls"><label class="pick-motion-control">Animaciones <select id="pick-motion">${[['system','Sistema'],['full','Completas'],['fast','Rápidas'],['reduced','Sin animaciones']].map(([value,label])=>'<option value="'+value+'" '+(getMotionMode()===value?'selected':'')+'>'+label+'</option>').join('')}</select></label><button type="button" class="draft-btn" id="btn-skip-reveal">Omitir animación</button><button type="button" class="draft-btn" id="btn-close-pick">← Volver a la cancha</button></div></footer>
 <a class="menu-website-link pick-website-link" href="/" data-website-exit ${globalThis.window?.LAQPDraftRouter?'':'inert aria-disabled="true"'}>← Volver a LAqP Website</a>
 </section></div>`;
}

export function handlePickNavigation(event,panel){
 if(!panel || panel.dataset.confirming==='true')return false;
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || !event.target.closest?.('.candidate-card'))return false;
 const cards=[...panel.querySelectorAll('.candidate-card')].filter(el=>!el.closest('[inert]'));
 const current=cards.indexOf(event.target.closest('.candidate-card'));
 if(current<0 || !cards.length)return false;
 const index=event.key==='Home'?0:event.key==='End'?cards.length-1:(current+(event.key==='ArrowRight'?1:-1)+cards.length)%cards.length;
 event.preventDefault();cards[index].focus();return true;
}
