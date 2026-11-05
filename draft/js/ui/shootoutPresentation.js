import { escapeHtml as esc } from './html.js';
import { selectShootoutKeeper } from '../core/penalties.js';

// Narrative variation is deterministic and never touches the sporting RNG.
function hash(value) {
 let result=2166136261;
 for(const character of String(value)){result^=character.charCodeAt(0);result=Math.imul(result,16777619);}
 return result>>>0;
}
export function kickDescriptor(event,view,keeperView=view) {
 const user=event.team==='user'||event.side==='home';
 const players=user?view.userStarters:view.rivalStarters;
 const player=players.find(p=>String(p.id)===String(event.playerId));
 const keeper=selectShootoutKeeper(user?keeperView.rivalStarters:keeperView.userStarters);
 const previous=view.events?.filter(e=>e.type==='penalty-kick'&&e.team===(user?'user':'rival')).length;
 return {playerId:event.playerId,name:event.playerName||event.name||player?.name||'Pateador',image:player?.image,
  keeper:{id:keeper?.id,name:keeper?.name||'Arquero',image:keeper?.image},team:user?'user':'rival',
  round:event.round||previous||1,userTeamName:view.userTeamName||'Mi Draft',rivalTeamName:view.rivalTeamName||'Rival'};
}
export function revealedScore(history) {
 return {user:history.filter(k=>k.team==='user'&&k.scored).length,rival:history.filter(k=>k.team==='rival'&&k.scored).length};
}
export function seriesWinner(history) {
 const score=revealedScore(history),user=history.filter(k=>k.team==='user').length,rival=history.length-user;
 if(user<=5&&rival<=5){
  if(score.user>score.rival+Math.max(0,5-rival))return 'user';
  if(score.rival>score.user+Math.max(0,5-user))return 'rival';
 }
 if(user>=5&&rival>=5&&user===rival&&score.user!==score.rival)return score.user>score.rival?'user':'rival';
 return null;
}
export function shootoutContext(history,kick) {
 const other=kick.team==='user'?'rival':'user',score=revealedScore(history),winner=seriesWinner(history);
 const winIfGoal=seriesWinner([...history,{...kick,scored:true}])===kick.team;
 const loseIfMiss=seriesWinner([...history,{...kick,scored:false}])===other;
 let detail=score[kick.team]+1===score[other]?'Puede empatar la serie.':score[kick.team]===score[other]?'Puede adelantarse en la serie.':'Puede ampliar o recortar la diferencia.';
 if(winIfGoal)detail='Si convierte, su equipo clasifica.';
 if(loseIfMiss)detail='Debe convertir para evitar la eliminación.';
 if(winner)detail='La clasificación ya está asegurada. Se completa el registro de la tanda.';
 return {status:winner?'Serie decidida':kick.round>5?'Muerte súbita':winIfGoal||loseIfMiss?'Penal decisivo':'Tanda normal',detail,winIfGoal,loseIfMiss,winner};
}
export function presentationOutcome(kick,seed=0) {
 if(kick.scored)return 'goal';
 // The engine records a miss, not its cause. These are visual/narrative variants only.
 return ['save','wide','post'][hash(seed+'|'+kick.team+'|'+kick.playerId+'|'+kick.round)%3];
}
export const OUTCOME_LABELS={goal:'Gol',save:'Atajada',wide:'Afuera',post:'Palo'};
export function phaseNarrative(phase,kick,seed=0) {
 const variant=hash(seed+'|'+kick.playerId+'|'+kick.round)%3;
 if(phase==='prepare')return ['¡'+kick.name+' se prepara para patear!','Todo listo: '+kick.name+' frente al arquero…','¡Atención! Es el turno de '+kick.name+'.'][variant];
 if(phase==='runup')return ['¡Toma carrera…!','Se acerca al balón…','Respira, avanza…'][variant];
 return '¡REMATA!';
}
export function revealNarrative(kick,context,history) {
 const winner=seriesWinner(history),decisive=winner&&!context.winner;
 if(kick.outcome==='goal')return decisive?'¡GOL! ¡Su equipo asegura la clasificación!':['¡GOOOOOOL de '+kick.name+'!','¡Adentro! '+kick.name+' convierte.','¡Lo mete! Penal convertido por '+kick.name+'.'][hash(kick.name+'|'+kick.round)%3];
 if(kick.outcome==='save')return decisive?'¡Gran atajada de '+kick.keeper.name+'! ¡Su equipo clasifica!':'¡'+kick.keeper.name+' lo ataja!';
 if(kick.outcome==='post')return '¡PALO! '+kick.name+' no convierte.'+(decisive?' La serie queda decidida.':'');
 return '¡AFUERA! Se le va a '+kick.name+'.'+(decisive?' La serie queda decidida.':'');
}
function photo(person,label) {
 return '<div class="shootout-person"><img src="'+esc(person.image||'../img/players/default.webp')+'" alt="" onerror="this.onerror=null;this.src=&quot;../img/players/default.webp&quot;"><small>'+label+'</small><strong>'+esc(person.name)+'</strong></div>';
}
function historyHtml(history,names,compact=true) {
 return '<div class="shootout-history">'+['user','rival'].map(team=>{
  const all=history.filter(k=>k.team===team),shown=compact?all.slice(-12):all;
  return '<div><strong>'+esc(names[team])+'</strong><div class="shootout-dots">'+(all.length>shown.length?'<small>+'+(all.length-shown.length)+' anteriores</small>':'')+shown.map(k=>'<span class="shootout-dot '+(k.scored?'is-goal':'is-miss')+'" title="'+esc(k.round+' · '+k.name+' · '+OUTCOME_LABELS[k.outcome])+'" aria-label="'+esc(k.round+' · '+k.name+' · '+OUTCOME_LABELS[k.outcome])+'">'+(k.scored?'✓':'×')+'</span>').join('')+'</div></div>';
 }).join('')+'</div>';
}
export function shootoutSummaryHtml(history,names) {
 const score=revealedScore(history),winner=score.user>score.rival?'user':'rival';
 return '<section class="shootout-summary '+(winner==='user'?'is-win':'is-loss')+'"><strong>CLASIFICADO: '+esc(names[winner])+'</strong><div class="shootout-final-score">'+score.user+' — '+score.rival+'</div>'+historyHtml(history,names)+'<div class="shootout-totals">'+['user','rival'].map(team=>{
  const goals=history.filter(k=>k.team===team&&k.scored).length,misses=history.filter(k=>k.team===team&&!k.scored).length,saves=history.filter(k=>k.team!==team&&k.outcome==='save').length;
  return '<p><strong>'+esc(names[team])+'</strong><span>'+goals+' goles · '+misses+' fallos · '+saves+' atajadas en el relato</span></p>';
 }).join('')+'</div><details class="shootout-register"><summary>Ver registro completo ('+history.length+' lanzamientos)</summary><ol>'+history.map(k=>'<li><span>R'+k.round+' · '+esc(names[k.team])+'</span><strong>'+esc(k.name)+'</strong><span class="'+(k.scored?'is-goal':'is-miss')+'">'+(k.scored?'✓':'×')+' '+OUTCOME_LABELS[k.outcome]+'</span></li>').join('')+'</ol></details></section>';
}
export function renderShootoutScene(scene) {
 if(!scene)return '';
 const names={user:scene.kick.userTeamName,rival:scene.kick.rivalTeamName},score=revealedScore(scene.history);
 if(scene.phase==='final')return '<div class="shootout-scene phase-final '+(score.user>score.rival?'is-win':'is-loss')+'" data-phase="final"><h2>'+(score.user>score.rival?'¡CLASIFICASTE POR PENALES!':'ELIMINADO POR PENALES')+'</h2>'+shootoutSummaryHtml(scene.history,names)+'<button type="button" class="draft-btn" data-skip-shootout>Continuar</button></div>';
 return '<div class="shootout-scene phase-'+scene.phase+(scene.outcome?' result-'+scene.outcome:'')+'" data-phase="'+scene.phase+'"><header class="shootout-score"><span>'+esc(names.user)+'</span><strong>'+score.user+' — '+score.rival+'</strong><span>'+esc(names.rival)+'</span></header><div class="shootout-round"><strong>Ronda '+scene.kick.round+' · '+esc(names[scene.kick.team])+' patea</strong><span>'+esc(scene.context.status)+'</span></div><p class="shootout-context">'+esc(scene.context.detail)+'</p><div class="shootout-players">'+photo(scene.kick,'Pateador')+photo(scene.kick.keeper,'Arquero')+'</div><div class="shootout-pitch" aria-hidden="true"><div class="shootout-net"></div><span class="shootout-ball">⚽</span><span class="shootout-glove">🧤</span><span class="shootout-miss">×</span></div><p class="shootout-narrative" role="status" aria-live="polite">'+esc(scene.headline)+'</p>'+historyHtml(scene.history,names)+'<button type="button" class="draft-btn" data-skip-shootout>Omitir este lanzamiento</button></div>';
}
export function renderFinalShootout(penalties,match) {
 if(!penalties)return '';
 const history=penalties.kicks.map(k=>{const descriptor=kickDescriptor({...k,team:k.side==='home'?'user':'rival'},match);return {...descriptor,scored:k.scored,outcome:presentationOutcome({...descriptor,scored:k.scored},match.seed)};});
 return shootoutSummaryHtml(history,{user:match.userTeamName||'Mi Draft',rival:match.rivalTeamName||'Rival'});
}
