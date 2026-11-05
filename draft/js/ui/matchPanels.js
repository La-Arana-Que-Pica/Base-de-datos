import {playerDetailButton} from './playerDetail.js';
import {substitutionPositions} from './substitutionPlan.js';
import {getCoach} from '../data/coaches.js';
import {activeCaptain} from '../core/leadership.js';
import {actionQuality} from '../core/duels.js';
import {positionOrder} from './matchView.js';
import { DRAFT_CONFIG as config } from '../config.js';
import { getFatiguePerformanceModifier,effectivePlayerRating,effectiveGoalkeeperRating,matchReferenceRating,isGoalkeeper } from '../core/fatigue.js';
import { escapeHtml as esc } from './html.js';
export function energyLevel(energy) {
 const c=config.MATCH_EVENTS.ENERGY_LEVELS;
 return energy>=c.HIGH?{key:'high',label:'Alta'}:energy>=c.MEDIUM?{key:'medium',label:'Media'}:energy>=c.TIRED?{key:'tired',label:'Cansado'}:{key:'exhausted',label:'Agotado'};
}
export function renderEnergyHtml(p) {
 const energy=Math.max(0,Math.min(100,p.energy??100)),level=energyLevel(energy);
 return '<div class="energy-indicator energy-'+level.key+'"><div class="energy-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(energy)+'" aria-label="Energía de '+esc(p.name)+'"><span style="width:'+energy+'%"></span></div><strong>'+Math.round(energy)+'% · '+level.label+'</strong></div>';
}
export function statusText(p,record={}) {
 return [p.sentOff?'🟥 Expulsado':(p.yellowCards||record.yellowCards)?'🟨 '+(p.yellowCards||record.yellowCards):'',p.injured?'🤕 LESIÓN · necesita cambio':'',p.substitutedOut?'↩ Sustituido':'',p.superSubActive?'⚡ Super refuerzo activo':''].filter(Boolean).join(' · ');
}
export function renderPlayerConditionHtml(p,record={}) {
 const fatigue=(1-getFatiguePerformanceModifier(p))*100;
 return renderEnergyHtml(p)+'<div class="player-condition"><span>OVR de campaña: <strong>'+p.overall+'</strong></span><span>Referencia de partido: <strong>'+matchReferenceRating(p).toFixed(1)+'</strong></span><span>Fuerza colectiva: <strong>~'+(isGoalkeeper(p)?effectiveGoalkeeperRating(p):effectivePlayerRating(p)).toFixed(1)+'</strong></span><span>Resistencia PES: '+(p.stamina??config.FATIGUE.STAMINA_FALLBACK)+(p.staminaSource==='fallback'?' (fallback)':'')+'</span><span>Fatiga colectiva: <strong>−'+fatigue.toFixed(1)+'%</strong></span><span>Nota: '+(record.minutes?record.rating.toFixed(1):'—')+'</span><span>Goles: '+(record.goals||0)+' · Asistencias: '+(record.assists||0)+'</span>'+(!isGoalkeeper(p)&&record.duels!==undefined?'<span>Duelos físicos: <strong>'+actionQuality(p,['CB','LB','RB','DMF'].includes(p.slotPosition||p.primaryPosition)?'tackle':'carry').toFixed(1)+'</strong></span><span>Pases bajo presión: <strong>'+actionQuality(p,'pass').toFixed(1)+'</strong></span>':'')+'</div><p class="player-status">'+esc(statusText(p,record))+'</p>'+(isGoalkeeper(p)?'<p class="keeper-workload">Intervenciones: '+(record.interventions||0)+' · Atajadas: '+(record.saves||0)+' · Tiros recibidos: '+(record.shotsFaced||0)+' · Penales enfrentados: '+((record.penaltiesFaced||0)+(record.shootoutPenaltiesFaced||0))+'</p>':'')+(p.injured?'<p class="campaign-help">La lesión limita el rendimiento al '+Math.round(config.MATCH_EVENTS.INJURY_PERFORMANCE*100)+'% de lo que rendiría sin lesión. No resta nota por sí sola.</p>':'');
}
export function renderLivePlayersHtml(players,records={}) {
 return players.map(p=>{const r=records[p.id]||{};return '<details class="match-player" data-player-detail="'+esc(p.id)+'"><summary><span>'+esc(p.slotPosition||p.primaryPosition)+' · '+esc(p.name)+'</span><span>'+Math.round(p.energy??100)+'% · Nota '+(r.minutes?r.rating.toFixed(1):'—')+' '+esc(statusText(p,r))+'</span></summary>'+renderPlayerConditionHtml(p,r)+'</details>';}).join('');
}
export function renderMatchTeamHtml(match,isUser=true) {
 const xi=match.players(isUser),bench=isUser?match.userBench:match.rivalBench,off=isUser?match.userSentOff:match.rivalSentOff;
 const records=isUser?match.playerPerformance:match.rivalPerformance,ratings=match.getEffectiveRatings()[isUser?'user':'rival'];
 const energy=xi.reduce((sum,p)=>sum+(p.energy??100),0)/(xi.length||1);
 const strength=(ratings.att+ratings.mid+ratings.def+ratings.gk)/4;
 const base=xi.reduce((sum,p)=>sum+p.overall,0)/(xi.length||1);
 const available=bench.filter(p=>!p.substitutedOut),replaced=bench.filter(p=>p.substitutedOut);
 return '<div class="team-live-summary"><strong>'+esc(isUser?match.userTeamName:match.rivalTeamName)+'</strong><span>Formación base: '+esc(isUser?match.formationId:match.rivalFormation)+' · En cancha: '+xi.length+'</span><span>Táctica: '+config.TACTICS[isUser?match.userTactic:match.rivalTactic].label+' · OVR XI: '+base.toFixed(1)+' · Fuerza actual: '+strength.toFixed(1)+'</span><span>Energía media: '+Math.round(energy)+'% · Marcador: '+match.userScore+'–'+match.rivalScore+'</span></div><h3>XI actual ('+xi.length+')</h3><div id="'+(isUser?'live-energy':'live-rival')+'">'+renderLivePlayersHtml(xi,records)+'</div><details class="reserve-panel" data-roster-section="bench"><summary>Suplentes/reservas ('+available.length+')</summary>'+renderLivePlayersHtml(available,records)+'</details><details class="reserve-panel" data-roster-section="replaced"><summary>Sustituidos ('+replaced.length+')</summary>'+renderLivePlayersHtml(replaced,records)+'</details>'+(off.length?'<section class="sent-off-panel"><h3>Expulsados ('+off.length+')</h3>'+renderLivePlayersHtml(off,records)+'</section>':'');
}
export const MATCH_STAT_ROWS = [['Possession','Posesión'],['Chances','Ocasiones'],['ClearChances','Ocasiones claras'],['Saves','Atajadas'],['Corners','Córners'],['Shots','Tiros'],['ShotsOnTarget','Tiros al arco'],['Assists','Asistencias'],['Substitutions','Cambios'],['Fouls','Faltas'],['YellowCards','Amarillas'],['RedCards','Rojas'],['Penalties','Penales en juego'],['FreeKicks','Tiros libres'],['Injuries','Lesiones'],['Recoveries','Recuperaciones'],['Interceptions','Intercepciones'],['Clearances','Despejes'],['Blocks','Bloqueos'],['Constructions','Construcciones'],['Losses','Pérdidas'],['Duels','Duelos disputados'],['DuelsWon','Duelos ganados'],['DribblesAttempted','Regates intentados'],['DribblesCompleted','Regates completados'],['TacklesAttempted','Entradas intentadas'],['TacklesWon','Entradas exitosas'],['KeyPasses','Pases clave'],['PassesAttempted','Pases disputados'],['PassesCompleted','Pases completados']];
export function matchStatNumber(match,key,isUser) {
 if(key==='Substitutions')return isUser?match.substitutionsUsed:match.rivalSubstitutionsUsed;
 return match.stats?.[(isUser?'user':'rival')+key];
}
export function matchStatValue(match,key,isUser) {
 const n=matchStatNumber(match,key,isUser);if(!Number.isFinite(n))return '—';
 if(key==='Possession')return n.toFixed(1)+'%';
 if(key==='Substitutions')return n+' / '+config.MAX_SUBSTITUTIONS;
 return n;
}
export function matchStatShare(match,key) {
 const u=matchStatNumber(match,key,true),r=matchStatNumber(match,key,false);
 return !Number.isFinite(u)||!Number.isFinite(r)?null:u+r?Math.max(0,Math.min(100,100*u/(u+r))):50;
}
export function renderMatchStatsHtml(match) {
 const primary=new Set(['Possession','Shots','ShotsOnTarget','ClearChances','Fouls','Corners','YellowCards','RedCards']);
 const row=([key,label])=>{const share=matchStatShare(match,key);return '<div class="stats-row" data-stat="'+key+'"><span class="stats-row-val">'+matchStatValue(match,key,true)+'</span><span class="stats-row-label">'+label+'</span><span class="stats-row-val">'+matchStatValue(match,key,false)+'</span><div class="comparison-track" aria-hidden="true"'+(share===null?' hidden':'')+'><span style="width:'+ (share??50)+'%"></span></div></div>';};
 return '<div class="feed-header">Estadísticas en vivo <small>Mi equipo / Rival</small></div><div class="match-primary-stats">'+MATCH_STAT_ROWS.filter(([key])=>primary.has(key)).sort((x,y)=>['Possession','Shots','ShotsOnTarget','ClearChances','Fouls','Corners','YellowCards','RedCards'].indexOf(x[0])-['Possession','Shots','ShotsOnTarget','ClearChances','Fouls','Corners','YellowCards','RedCards'].indexOf(y[0])).map(row).join('')+'</div><details class="match-stats-expanded"><summary>Más estadísticas</summary><div class="match-extra-stats">'+MATCH_STAT_ROWS.filter(([key])=>!primary.has(key)).map(row).join('')+'</div></details>';
}
export function renderMatchPlayerDetailHtml(p,r={}) {
 const keys=[['minutes','Minutos'],['goals','Goles'],['assists','Asistencias'],['shots','Remates'],['shotsOnTarget','Al arco'],['chancesCreated','Ocasiones creadas'],['recoveries','Recuperaciones'],['interceptions','Intercepciones'],['clearances','Despejes'],['blocks','Bloqueos'],['losses','Pérdidas'],['duels','Duelos'],['duelsWon','Duelos ganados'],['dribblesAttempted','Regates intentados'],['dribblesCompleted','Regates completados'],['tacklesAttempted','Entradas intentadas'],['tacklesWon','Entradas exitosas'],['keyPasses','Pases clave'],['passesAttempted','Pases disputados'],['passesCompleted','Pases completados'],['saves','Atajadas'],['difficultSaves','Atajadas difíciles']];
 const content=renderPlayerConditionHtml(p,r)+'<dl class="match-individual-stats">'+keys.filter(([key])=>Number.isFinite(r[key])).map(([key,label])=>'<div><dt>'+label+'</dt><dd>'+r[key]+'</dd></div>').join('')+'</dl>';
 return content+playerDetailButton(p,{context:'match',extraHtml:content});
}
export function renderCompactPlayerHtml(p,r={}) {
 const energy=Math.max(0,Math.min(100,p.energy??100)),level=energyLevel(energy),note=r.minutes&&Number.isFinite(r.rating)?r.rating:null;
 return '<details class="compact-player '+(p.specialType==='LEGEND'?'match-legend-player ':'')+'" data-player-detail="'+esc(p.id)+'"><summary aria-label="Ver rendimiento de '+esc(p.name)+'"><img class="compact-miniface" src="'+esc(p.image||'../img/players/default.webp')+'" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'../img/players/default.webp\'"><span class="compact-player-identity"><span class="compact-player-name" title="'+esc(p.name)+(p.specialType==='LEGEND'?' · LEYENDA '+esc(p.legendFranchise):'')+'">'+(p.specialType==='LEGEND'?'★ ':'')+esc(p.name)+'</span><small class="compact-position">'+esc(p.slotPosition||p.primaryPosition)+'</small></span><span class="compact-player-state" title="'+esc(statusText(p,r))+'">'+esc(p.sentOff?'🟥':p.yellowCards?'🟨 '+p.yellowCards:'')+(p.isCaptain?' Ⓒ':'')+(p.injured?' 🤕':'')+(p.superSubActive?' ⚡':'')+'</span><strong class="compact-note '+(note>=7?'note-good':note!==null&&note<6?'note-low':'')+'" title="Nota del partido">'+(note===null?'—':note.toFixed(1).replace('.',','))+'</strong><span class="compact-energy energy-'+level.key+'" title="Energía"><span class="compact-energy-track" role="meter" aria-label="Energía de '+esc(p.name)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(energy)+'"><span style="width:'+energy+'%"></span></span><small>'+Math.round(energy)+'%</small></span></summary><div class="compact-player-detail">'+renderMatchPlayerDetailHtml(p,r)+'</div></details>';
}
export function renderCompactTeamHtml(match,isUser=true) {
 const xi=match.players(isUser),off=isUser?match.userSentOff:match.rivalSentOff,bench=isUser?match.userBench:match.rivalBench,records=isUser?match.playerPerformance:match.rivalPerformance;
 const name=isUser?match.userTeamName:match.rivalTeamName,crest=isUser?'../img/logo.webp':match.rivalCrest;
 const captain=activeCaptain(match,isUser),coach=getCoach(match.coaches?.[isUser?'user':'rival']);
 const rows=players=>players.slice().sort((a,b)=>positionOrder(a)-positionOrder(b)).map(p=>renderCompactPlayerHtml({...p,isCaptain:p.id===captain?.id},records[p.id])).join('');
 return '<header class="compact-team-header"><img src="'+esc(crest||'../img/teams/default.webp')+'" alt="" onerror="this.onerror=null;this.src=\'../img/teams/default.webp\'"><div><small>'+ (isUser?'NUESTRO EQUIPO':'EQUIPO RIVAL')+'</small><h3>'+esc(name)+'</h3><span data-team-formation>'+esc(isUser?match.formationId:match.rivalFormation)+' · '+xi.length+' en cancha</span></div></header><div class="match-team-context"><span data-team-tactic>Planteamiento: '+esc(config.TACTICS[isUser?match.userTactic:match.rivalTactic]?.label||'—')+'</span><span data-team-staff>'+esc(coach?coach.name+' · '+coach.ability:'')+'</span><span data-team-subs>Cambios: '+(isUser?match.substitutionsUsed:match.rivalSubstitutionsUsed)+' / '+config.MAX_SUBSTITUTIONS+'</span></div><div class="compact-roster-heading"><span>Jugador / posición</span><span>Nota · energía</span></div><div class="compact-xi" data-roster-list="xi">'+rows(xi)+'</div><div class="compact-expelled"'+(off.length?'':' hidden')+'><small>Expulsados</small><div data-roster-list="off">'+rows(off)+'</div></div><details class="compact-team-details" data-roster-section="bench"><summary>Suplentes disponibles <span data-bench-count>'+bench.filter(p=>!p.substitutedOut).length+'</span></summary><div data-roster-list="bench">'+rows(bench.filter(p=>!p.substitutedOut))+'</div></details><details class="compact-team-details" data-roster-section="replaced"><summary>Sustituidos · rendimiento conservado</summary><div data-roster-list="replaced">'+rows(bench.filter(p=>p.substitutedOut))+'</div></details>';
}
// Reconcile player nodes by ID. Details, focus and the team panel survive each tick.
export function syncMatchTeam(panel,match,isUser) {
 if(!panel.querySelector('[data-roster-list]')){const html=renderCompactTeamHtml(match,isUser);if(panel.innerHTML!==html)panel.innerHTML=html;return;}
 const records=isUser?match.playerPerformance:match.rivalPerformance,bench=isUser?match.userBench:match.rivalBench;
 const groups={xi:match.players(isUser),off:isUser?match.userSentOff:match.rivalSentOff,bench:bench.filter(p=>!p.substitutedOut),replaced:bench.filter(p=>p.substitutedOut)};
 const captain=activeCaptain(match,isUser),coach=getCoach(match.coaches?.[isUser?'user':'rival']);
 const nodes=new Map([...panel.querySelectorAll('.compact-player')].map(el=>[el.dataset.playerDetail,el]));const retained=new Set();
 const set=(el,text)=>{if(el&&el.textContent!==String(text))el.textContent=text;};
 set(panel.querySelector('[data-team-formation]'),(isUser?match.formationId:match.rivalFormation)+' · '+groups.xi.length+' en cancha');
 set(panel.querySelector('[data-team-tactic]'),'Planteamiento: '+(config.TACTICS[isUser?match.userTactic:match.rivalTactic]?.label||'—')+' · Intensidad: '+(config.INTENSITIES[isUser?match.userIntensity:match.rivalIntensity]?.label||'Normal'));
 set(panel.querySelector('[data-team-staff]'),coach?'DT: '+coach.name+' · '+coach.ability:'');
 set(panel.querySelector('[data-team-subs]'),'Cambios: '+(isUser?match.substitutionsUsed:match.rivalSubstitutionsUsed)+' / '+config.MAX_SUBSTITUTIONS);
 set(panel.querySelector('[data-bench-count]'),groups.bench.length);panel.querySelector('.compact-expelled').hidden=!groups.off.length;
 for(const [key,players] of Object.entries(groups)){
  const list=panel.querySelector('[data-roster-list="'+key+'"]');
  players.slice().sort((a,b)=>positionOrder(a)-positionOrder(b)).forEach((p,index)=>{
   const id=String(p.id),r=records[p.id]||{};retained.add(id);let el=nodes.get(id);
   if(!el){list.insertAdjacentHTML('beforeend',renderCompactPlayerHtml(p,r));el=list.lastElementChild;nodes.set(id,el);}
   if(list.children[index]!==el)list.insertBefore(el,list.children[index]||null);
   set(el.querySelector('.compact-position'),p.slotPosition||p.primaryPosition);
   const note=r.minutes&&Number.isFinite(r.rating)?r.rating:null,noteEl=el.querySelector('.compact-note');set(noteEl,note===null?'—':note.toFixed(1).replace('.',','));noteEl.classList.toggle('note-good',note!==null&&note>=7);noteEl.classList.toggle('note-low',note!==null&&note<6);
   const status=el.querySelector('.compact-player-state');set(status,(captain?.id===p.id?'Ⓒ ':'')+(p.sentOff?'🟥':p.yellowCards?'🟨 '+p.yellowCards:'')+(p.injured?' 🤕':'')+(p.superSubActive?' ⚡':''));status.title=statusText(p,r);
   const energy=Math.max(0,Math.min(100,p.energy??100));el.querySelector('.compact-energy').className='compact-energy energy-'+energyLevel(energy).key;
   set(el.querySelector('.compact-energy small'),Math.round(energy)+'%');const meter=el.querySelector('[role="meter"]');meter.setAttribute('aria-valuenow',String(Math.round(energy)));meter.firstElementChild.style.width=energy+'%';
   const detail=el.querySelector('.compact-player-detail'),html=renderMatchPlayerDetailHtml(p,r);if(detail.innerHTML!==html)detail.innerHTML=html;
  });
 }
 for(const [id,el] of nodes)if(!retained.has(id))el.remove();
}
export function renderSubChoiceHtml(player,record={},direction='out') {
 const energy=Math.max(0,Math.min(100,Math.round(player.energy??100))),level=energyLevel(energy),positions=substitutionPositions(player);
 const tags=positions.map(pos=>'<span class="sub-position-tag" title="'+esc((pos===player.primaryPosition||(player.naturalPositions||[]).includes(pos))?'Posición principal / A':'Posición alternativa B')+'">'+esc(pos)+'</span>').join('');
 return '<button type="button" class="sub-item compact-sub" data-sub-'+direction+'="'+esc(player.id)+'" aria-pressed="false"><img class="sub-photo" src="'+esc(player.image||'../img/players/default.webp')+'" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'../img/players/default.webp\'"><span class="sub-identity"><span class="sub-name" title="'+esc(player.name)+'">'+esc(player.name)+'</span><span class="sub-position-line"><small class="sub-position">'+esc(player.primaryPosition||'')+'</small><span class="sub-position-tags">'+tags+'</span></span></span><span class="sub-ovr" title="OVR de la carta, sin ajuste por fatiga ni posición"><small>OVR</small>'+esc(player.overall??'—')+'</span><span class="sub-energy energy-'+level.key+'"><span class="sub-energy-track"><span style="width:'+energy+'%"></span></span><span>'+energy+'%</span></span><span class="sub-rating" title="Nota del partido">'+(record.minutes&&Number.isFinite(record.rating)?record.rating.toFixed(1):'—')+'</span><span class="sub-card">'+(player.sentOff?'🟥':player.yellowCards?'🟨':'')+(player.injured?' 🤕':'')+'</span></button>';
}

// Attributes already normalized by the Draft adapter; no new ratings or formulas.
export function renderPlayerAttributesHtml(player) {
 const attributes=[['finishing','Definición'],['lowPass','Pase raso'],['loftedPass','Pase elevado'],['placeKicking','Balón parado'],['controlledSpin','Efecto'],['kickingPower','Potencia'],['defensiveProwess','Actitud defensiva'],['ballWinning','Recuperación'],['goalkeeping','Portería'],['stamina','Resistencia'],['injuryResistance','Resistencia a lesiones']];
 return '<section class="squad-pes-attributes"><h4>Atributos PES disponibles</h4><dl>'+attributes.filter(([key])=>Number.isFinite(player[key])).map(([key,label])=>'<div><dt>'+label+'</dt><dd>'+player[key]+'</dd></div>').join('')+'</dl></section>';
}

// One presentation for initial history and incoming events; no sporting state changes.
export function renderMatchFeedContentHtml(event,view={}){
 const id=event.playerId??event.scorerId;
 const players=['userStarters','userBench','userSentOff','rivalStarters','rivalBench','rivalSentOff'].flatMap(key=>view[key]||[]);
 const player=id==null?null:players.find(p=>String(p.id)===String(id));
 const photo=player?'<img class="feed-miniface" src="'+esc(player.image||'../img/players/default.webp')+'" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'../img/players/default.webp\'">':'';
 return '<span class="feed-minute">'+esc(event.minute)+'′</span>'+photo+'<span class="feed-text">'+esc(event.text)+'</span>';
}
