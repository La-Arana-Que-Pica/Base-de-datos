import { isReducedMotion, getRevealMotionScale } from './motionPreferences.js';
import {createCardRevealSequence,REVEAL_INITIAL_MS,REVEAL_ANIMATION_MS,REVEAL_PAUSE_MS} from './cardRevealSequence.js';
// Presentation only: the offer already exists and never changes here.
export const FORMATION_REVEAL_INITIAL_MS=REVEAL_INITIAL_MS;
export const FORMATION_REVEAL_ANIMATION_MS=REVEAL_ANIMATION_MS;
export const FORMATION_REVEAL_PAUSE_MS=REVEAL_PAUSE_MS;
export const FORMATION_REVEAL_INTERVAL_MS=REVEAL_ANIMATION_MS+REVEAL_PAUSE_MS;
const sequence=createCardRevealSequence({paint,cards:panel=>[...panel.querySelectorAll('[data-choice-formation]')],motionScale:getRevealMotionScale});
export const cancelFormationReveal=sequence.cancel;
function paint(panel,s){
 const cards=[...panel.querySelectorAll('[data-choice-formation]')];
 Object.assign(panel.dataset,{revealState:s.phase,revealedCount:String(s.count),revealing:String(s.phase!=='completed'),reducedMotion:String(s.reducedMotion)});
 cards.forEach((card,i)=>{
  const shown=i<s.count,turn=s.step==='turning'&&i===s.count?'out':s.step==='finishing'&&i===s.count-1?'in':'none';
  if(shown&&card.dataset.frontMounted!=='true'){card.querySelector('.formation-front').appendChild(card.querySelector('template').content.cloneNode(true));card.dataset.frontMounted='true';card.removeAttribute('aria-label');}
  card.dataset.revealed=String(shown);card.dataset.turn=turn;card.style?.setProperty('--formation-half-duration',(FORMATION_REVEAL_ANIMATION_MS/2*s.scale)+'ms');
  card.disabled=!shown||turn==='in';
 });
 panel.querySelector('#btn-skip-formation-reveal').hidden=s.phase==='completed';
 panel.querySelector('#formation-reveal-status').textContent=s.phase==='completed'?'Elegí cómo vas a jugar.':s.count+' de 5 esquemas descubiertos';
}
export function startFormationReveal(panel,offer,reducedMotion=isReducedMotion()){sequence.start(panel,offer,reducedMotion);}
export function refreshFormationMotion(panel,offer){sequence.refresh(panel,offer,isReducedMotion(),true);}
export function skipFormationReveal(){return sequence.skip();}
export function canSelectFormation(card){return !!card&&card.dataset.revealed==='true'&&!card.disabled;}
export function updateFormationSelection(panel,id){
 if(!panel)return;panel.dataset.hasSelection=String(!!id);
 for(const card of panel.querySelectorAll('[data-choice-formation]')){const selected=card.dataset.choiceFormation===id;card.classList.toggle('is-selected',selected);card.setAttribute('aria-pressed',String(selected));}
 const confirm=panel.querySelector('#btn-start-draft');if(confirm)confirm.disabled=!id;
}
