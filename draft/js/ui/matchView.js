// Presentation only: never advances the engine or consumes sporting randomness.
import {escapeHtml as esc} from './html.js';
export const USER_CREST='../img/logo.webp';
export function matchPeriod(match={},playback=null) {
 if(playback?.finished)return 'FINAL DEL PARTIDO';
 if(playback?.shootout||playback?.shootoutReady||match.shootoutPending||match.penalties)return 'TANDA DE PENALES';
 if(match.isFinished)return 'FINAL DEL PARTIDO';
 if(playback?.halftimeReady||match.halftimePending)return 'ENTRETIEMPO';
 if((match.minute??0)===0)return 'PREVIA DEL PARTIDO';
 if(match.extraTime)return match.minute<105?'PRÓRROGA · PRIMER TIEMPO':'PRÓRROGA · SEGUNDO TIEMPO';
 return match.minute<45||match.minute===45&&!match.halftimeCompleted?'PRIMER TIEMPO':'SEGUNDO TIEMPO';
}
export function positionOrder(player) {
 const p=player.slotPosition||player.primaryPosition;
 return p==='GK'?0:['CB','LB','RB'].includes(p)?1:['DMF','CMF','LMF','RMF','AMF'].includes(p)?2:3;
}
export function renderMatchIdle(match={},playback=null) {
 const period=matchPeriod(match,playback),paused=playback?.paused;
 const actions=match.recentActions||[];
 const labels={constructions:'Construye el ataque',interceptions:'Intercepta y recupera',clearances:'Despeja el peligro',blocks:'Bloquea el remate',losses:'Pierde la posesión'};
 const action=actions.slice().reverse().find(a=>labels[a.type]);
 const roster=[...(match.userStarters||[]),...(match.userBench||[]),...(match.rivalStarters||[]),...(match.rivalBench||[])];
 const player=action&&roster.find(p=>p.id===action.playerId);
 const headline=period==='ENTRETIEMPO'?'Tiempo de ajustar el equipo':period==='PREVIA DEL PARTIDO'?'Todo listo para la eliminatoria':paused?'El partido está en pausa':action?labels[action.type]:'El encuentro continúa';
 return '<div class="match-idle"><span class="broadcast-kicker">'+esc(period)+'</span><strong>'+esc(headline)+'</strong><p>'+esc(!paused&&player?player.name+' · '+(action.team==='user'?match.userTeamName:match.rivalTeamName):paused?'Revisá el rendimiento y tomá tus decisiones.':'Seguimiento en vivo · Cada decisión cuenta.')+'</p></div>';
}
export function updateMatchPeriod(match,playback,document) {
 const node=document.querySelector('#match-period');if(node)node.textContent=matchPeriod(match,playback);
 document.querySelector('.cinematic-match')?.classList.toggle('is-match-paused',!!playback?.paused);
}
