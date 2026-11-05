import {createCardRevealSequence,REVEAL_ANIMATION_MS} from './cardRevealSequence.js';
import {isReducedMotion,getRevealMotionScale} from './motionPreferences.js';
import {DRAFT_CONFIG as config} from '../config.js';
const cards=panel=>[...panel.querySelectorAll('.pick-option')];
function paint(panel,s){
 Object.assign(panel.dataset,{revealState:s.phase,revealedCount:String(s.count),revealing:String(s.phase!=='completed'),reducedMotion:String(s.reducedMotion)});
 cards(panel).forEach((card,i)=>{
  const shown=i<s.count,turn=s.step==='turning'&&i===s.count?'out':s.step==='finishing'&&i===s.count-1?'in':'none',front=card.querySelector('.pick-front');
  if(shown&&card.dataset.frontMounted!=='true'){if(front&&!front.childElementCount)front.appendChild(card.querySelector('template').content.cloneNode(true));card.dataset.frontMounted='true';}
  card.dataset.revealed=String(shown);card.dataset.turn=turn;card.style?.setProperty('--formation-half-duration',(REVEAL_ANIMATION_MS/2*s.scale)+'ms');
  if(shown)card.classList.add('is-revealed');
  if(s.phase==='completed'){front?.removeAttribute('inert');front?.removeAttribute('aria-hidden');}else{front?.setAttribute?.('inert','');front?.setAttribute?.('aria-hidden','true');}
 });
 const done=s.phase==='completed',status=panel.querySelector('#pick-reveal-status'),button=panel.querySelector('#btn-skip-reveal')||panel.querySelector('#btn-skip-coach-reveal');
 if(status)status.textContent=done?(panel.dataset.revealLabel||'Cinco candidatos disponibles · Elegí tu fichaje'):'Revelando candidatos · '+s.count+'/'+cards(panel).length;
 if(button)button.hidden=done;
}
const sequence=createCardRevealSequence({paint,cards,motionScale:getRevealMotionScale});
export const cancelReveal=sequence.cancel;
export function startReveal(panel,reducedMotion=isReducedMotion(),offer=null){
 if(panel&&typeof globalThis.Image==='function'){for(const p of offer||[])if(p?.image){const image=new Image();image.src=p.image;}for(const image of panel.querySelectorAll('template')){for(const photo of image.content?.querySelectorAll?.('img')||[]){const preload=new Image();preload.src=photo.src;}}}
 sequence.start(panel,offer,reducedMotion);
}
export function skipReveal(panel,interaction=false){const skipped=sequence.skip(panel);if(skipped&&interaction)panel.dataset.selectionLockedUntil=String(Date.now()+config.REVEAL_SELECTION_GUARD_MS);return skipped;}
export function refreshRevealMotion(panel,offer){sequence.refresh(panel,offer,isReducedMotion());}
export function canSelectFromReveal(panel,now=Date.now()){return !!panel&&panel.dataset.revealing==='false'&&now>=Number(panel.dataset.selectionLockedUntil||0);}
