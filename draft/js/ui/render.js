import {openSubModal} from './substitutions.js';
import {staffSummaryHtml,coachStripHtml} from './staff.js';
import {specialCardClass} from './candidateCard.js';
import {victoryHtml,campaignEndHtml} from './campaignFinals.js';
import {cupPathHtml} from './cupPath.js';
import {rewardConfirmationHtml} from './rewards.js?v=rewards-redesign-1';
import {matchTabsHtml} from './matchWorkspace.js';
import {renderAcquisitionHtml} from './rivalAcquisition.js';
import {matchPeriod,renderMatchIdle,USER_CREST} from './matchView.js';
import {mountTeamWorkspace} from './teamWorkspace.js?v=squad-preparation-4';
import {renderTeamBuilder} from './teamBuilder.js?v=phase5c-1';
import { renderPickStage } from './pickStage.js?v=pick-stage-2';
import { renderFinalShootout } from './shootoutPresentation.js';
/**
 * UI Renderer for LAqP Draft
 * Pure modular render functions for every vertical slice stage.
 */

import { renderLivePlayersHtml,renderMatchTeamHtml,renderCompactTeamHtml,renderSubChoiceHtml,renderMatchFeedContentHtml,renderMatchStatsHtml,renderPlayerConditionHtml } from './matchPanels.js?v=broadcast-tabs-6';
export { renderLivePlayersHtml,renderMatchTeamHtml,renderCompactTeamHtml,renderMatchStatsHtml,renderPlayerConditionHtml,matchStatValue } from './matchPanels.js?v=broadcast-tabs-6';
import { state } from '../state.js';
import { DRAFT_CONFIG } from '../config.js';
import { isNaturalPosition } from '../core/positions.js';
import { getCampaignSummary } from '../core/campaignStats.js';
import { USER_TEAM_ID } from '../core/tournament.js';
import { playerPerformanceMultiplier, chemistryMultiplier, calculateTeamRatings } from '../core/teamRating.js';
import { getPlanningAnalysis } from '../core/preMatchAnalysis.js';

import { escapeHtml } from './html.js';
export { escapeHtml } from './html.js';

export function ovrClass(ovr) {
  if (ovr >= 85) return 'ovr-high';
  if (ovr >= 78) return 'ovr-mid';
  return 'ovr-low';
}

export function staminaClass(energy) {
  if (energy < 55) return 'energy-low';
  if (energy < 75) return 'energy-mid';
  return '';
}

/**
 * Render player card HTML
 */
export function renderPlayerCardHtml(player, { showTemporary = true, compact = false } = {}) {
  if (!player) return '';
  const ovrCls = ovrClass(player.overall);
  const tempBadge = (showTemporary && player.temporaryAcquisition)
    ? `<span class="temporary-badge">Fichaje</span>`
    : '';

  return `
    <div role="button" tabindex="0" class="player-card ${compact ? 'is-compact' : ''}${specialCardClass(player)}" data-player-id="${escapeHtml(player.id)}">
      ${tempBadge}${player.hasSuperSub ? '<span class="super-sub-badge">⚡ Super refuerzo</span>' : ''}
      <div class="card-top">
        <span class="card-ovr ${ovrCls}">${player.overall}</span>
        <span class="card-pos">${escapeHtml(player.slotPosition || player.primaryPosition)}</span>
      </div>
      <div class="card-photo-wrap">
        <img class="card-photo" src="${escapeHtml(player.image)}" alt="${escapeHtml(player.name)}" loading="lazy" onerror="this.onerror=null;this.src='../img/players/default.webp'">
      </div>
      <div class="card-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</div>
      <div class="card-meta">
        <div class="card-club-row">
          <img class="card-crest" src="../img/teams/${escapeHtml(player.teamId)}.webp" alt="" onerror="this.style.display='none'">
          <span>${escapeHtml(player.teamName)}</span>
        </div>
        <div class="card-nat">${escapeHtml(player.nationality)}</div><div class="natural-positions">A: ${escapeHtml(player.naturalPositions.join(' · '))}</div>
      </div>
    </div>
  `;
}

/**
 * SCREEN 1: Setup / Start
 */
export function renderStartScreen(container) {
 container.innerHTML=`<section class="start-screen classic-preparation"><header class="classic-hero"><div><h1>DRAFT CLÁSICO</h1><p>Armá tu equipo, elegí tus cartas y conquistá el torneo.</p></div><ol class="classic-stepper" aria-label="Etapas del Draft">${['REGIÓN','FORMACIÓN','DT','DRAFT','CAPITÁN','TORNEO'].map((x,i)=>'<li '+(i===0?'aria-current="step"':'')+'>'+(i+1)+'. '+x+'</li>').join('')}</ol></header><div class="classic-layout"><div><h2>1. ELEGÍ TU REGIÓN</h2><div class="classic-regions">${[['EUROPA','EUROPA','CLUBES EUROPEOS','Competí con los clubes y las ligas de Europa.'],['AMERICA','AMÉRICA','CLUBES AMERICANOS','Argentina, Brasil, Chile y el resto de la región.']].map(([id,name,sub,desc])=>'<button type="button" class="classic-region '+(state.region===id?'is-selected':'')+'" data-choice-region="'+id+'" aria-pressed="'+(state.region===id)+'"><img class="classic-region-map" src="assets/ui/regions/'+(id==='EUROPA'?'europe':'americas')+'.svg" alt="" aria-hidden="true" width="400" height="300"><span class="classic-selected">'+(state.region===id?'✓ SELECCIONADO':'ELEGIR REGIÓN')+'</span><span class="classic-region-copy"><strong>'+name+'</strong><span>'+sub+'</span><small>'+desc+'</small></span></button>').join('')}</div><button type="button" class="menu-primary classic-cta" id="btn-continue-region">CONTINUAR → ELEGIR FORMACIÓN</button></div><aside class="classic-rules"><h2>REGLAS DEL DRAFT</h2><img src="assets/ui/modes/draft-classic.png" alt="Cinco cartas del Draft"><ul><li><strong>Todos desde cero</strong><span>Armá un equipo nuevo en cada Draft.</span></li><li><strong>Plantel de 23 futbolistas</strong><span>Elegí posición por posición.</span></li><li><strong>Torneo eliminatorio</strong><span>16 equipos · 4 rondas hacia la copa.</span></li><li><strong>Recompensas por victoria</strong><span>Fichá un rival o elegí una mejora +1.</span></li></ul></aside></div><footer id="campaign-start-controls" class="campaign-start-controls"></footer></section>`;
}
export function renderFormationPreviewHtml(formation) {
 return '<svg class="formation-preview" viewBox="0 0 100 100" role="img" aria-label="Distribución '+escapeHtml(formation.name)+'"><rect class="mini-pitch" x="1" y="1" width="98" height="98" rx="5"/><path class="mini-line" d="M1 50H99 M30 1V17H70V1 M30 99V83H70V99"/><circle class="mini-line" cx="50" cy="50" r="10"/>'+formation.slots.map(slot=>'<g><title>'+escapeHtml(slot.position)+'</title><circle class="mini-player '+(slot.position==='GK'?'mini-gk':'')+'" cx="'+slot.x+'" cy="'+slot.y+'" r="5"/><text x="'+slot.x+'" y="'+(slot.y+1.5)+'">'+escapeHtml(slot.label)+'</text></g>').join('')+'</svg>';
}
export function renderFormationScreen(container) {
 const region=state.survival?'SUPERVIVENCIA · DRAFT MUNDIAL':({EUROPA:'EUROPA',AMERICA:'AMÉRICA'})[state.region];
 container.innerHTML=`<section class="formation-screen" aria-labelledby="formation-heading" data-has-selection="${!!state.selectedFormationId}">
 <header class="formation-heading"><div class="formation-brand" aria-hidden="true">LAqP <span>Draft</span></div><p class="setup-step">${region} · PASO 2 DE 3</p><h2 id="formation-heading">ELEGÍ TU <span>FORMACIÓN</span></h2><p>Cinco esquemas. Una sola elección. ¿Cómo vas a jugar?</p></header>
 <div class="formation-offer-grid">${state.formationOffer.map((id,i)=>{const f=DRAFT_CONFIG.FORMATIONS[id];return '<button type="button" class="formation-choice '+(state.selectedFormationId===id?'is-selected':'')+'" data-choice-formation="'+id+'" disabled aria-label="Formación oculta" aria-pressed="'+(state.selectedFormationId===id)+'"><span class="formation-flipper"><span class="formation-back" aria-hidden="true"><span class="formation-back-emblem">LAqP<span>DRAFT</span></span><span class="formation-mystery">?</span><span class="formation-back-number">ESQUEMA 0'+(i+1)+'</span></span><span class="formation-front"></span></span><span class="formation-selected-mark" aria-hidden="true">✓</span><template><strong class="choice-title">'+escapeHtml(f.name)+'</strong>'+renderFormationSelectionPreviewHtml(f)+'</template></button>';}).join('')}</div>
 <p id="formation-reveal-status" class="formation-reveal-status" role="status">Cinco esquemas por descubrir</p>
 <div class="formation-actions"><button type="button" class="draft-btn formation-back-action" id="btn-back-region">${state.survival?'← Volver a Supervivencia':'← Volver a región'}</button><button type="button" class="draft-btn" id="btn-skip-formation-reveal">Omitir revelación</button><button type="button" class="draft-btn draft-btn-primary" id="btn-start-draft" ${state.selectedFormationId?'':'disabled'}>Confirmar formación · Empezar Draft →</button></div></section>`;
}
export function renderFormationSelectionPreviewHtml(formation){
 // Visual coordinates only: the formation catalogue and Draft slots stay canonical.
 return '<svg class="formation-preview" viewBox="0 0 100 140" role="img" aria-label="Distribución '+escapeHtml(formation.name)+'"><rect class="mini-pitch" x="1" y="1" width="98" height="138" rx="3"/>'+Array.from({length:7},(_,i)=>'<rect class="mini-grass-stripe" x="2" y="'+(2+i*20)+'" width="96" height="10"/>').join('')+'<g class="mini-line"><path d="M2 70H98 M18 2V24H82V2 M35 2V10H65V2 M18 138V116H82V138 M35 138V130H65V138 M38 24A14 14 0 0 0 62 24 M38 116A14 14 0 0 1 62 116 M2 5A3 3 0 0 0 5 2 M95 2A3 3 0 0 0 98 5 M2 135A3 3 0 0 1 5 138 M95 138A3 3 0 0 1 98 135"/><circle cx="50" cy="70" r="12"/></g><g class="mini-pitch-spots"><circle cx="50" cy="70" r=".8"/><circle cx="50" cy="17" r=".7"/><circle cx="50" cy="123" r=".7"/></g>'+formation.slots.map(slot=>'<g data-preview-slot="'+slot.id+'" class="mini-shirt '+(slot.position==='GK'?'mini-shirt-gk':'mini-shirt-outfield')+'" transform="translate('+slot.x+' '+slot.y*1.4+')"><title>'+escapeHtml(slot.label)+'</title><svg x="-6.5" y="-7" width="13" height="14" viewBox="0 0 100 108" aria-hidden="true"><path class="shirt-body" d="M36 5Q50 9 64 5L71 10 87 16Q91 18 94 28L99 45Q91 53 79 51L75 42 79 102Q50 110 21 102L25 42 21 51Q9 53 1 45L6 28Q9 18 13 16L29 10Z"/><path class="shirt-side" d="M25 32L29 96 24 101 M75 32L71 96 76 101"/><path class="shirt-texture" d="M17 24L34 12 25 30 M24 37L42 14 33 35 M43 99L68 73 61 91 M54 102L72 84"/><path class="shirt-seam" d="M29 12Q16 20 25 42 M71 12Q84 20 75 42 M23 99Q50 106 77 99"/><path class="shirt-cuff" d="M3 43Q12 49 22 47 M78 47Q88 49 97 43"/><path class="shirt-collar" d="M36 5Q50 10 64 5L65 11Q63 23 50 24 37 23 35 11Z"/><path class="shirt-neck" d="M39 9Q50 12 61 9Q60 18 50 18 40 18 39 9Z"/></svg></g>').join('')+'</svg>';
}

/**
 * SCREEN 2: Drafting
 */
function renderChemistryLegend() {
  return '<p class="link-legend"><span class="dead">Rojo · 0</span><span class="weak">Amarillo · 1</span><span class="strong">Verde · 2</span><span class="hyper">Hyper · 3</span><span>Gris · pendiente</span></p>';
}

export function renderPitchHtml(mode = 'view') {
  const formation = DRAFT_CONFIG.FORMATIONS[state.formationId];
  const slots = Object.fromEntries(formation.slots.map(slot => [slot.id, slot]));
  const lines = state.chemistry.linkDetails.map(link => {
    const a = slots[link.slotA], b = slots[link.slotB];
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="chem-link link-${link.populated ? link.points : 'pending'}"><title>${escapeHtml(a.label)}–${escapeHtml(b.label)}: ${link.populated ? link.points : 'pendiente'}</title></line>`;
  }).join('');
  return `<div class="pitch-container draft-pitch" id="tactical-pitch">
    <div class="pitch-half-line"></div><div class="pitch-center-circle"></div><div class="pitch-box-top"></div><div class="pitch-box-bottom"></div>
    <svg class="chemistry-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Conexiones de química">${lines}</svg>
    ${formation.slots.map(slot => {
      const player = state.startersMap[slot.id];
      const natural = player && isNaturalPosition(player, slot.position);
      const chemistry = state.chemistry.individuals[slot.id]?.score || 0;
      const selected = state.selectedSquadSlot === slot.id || state.activeDraftStep?.slotId === slot.id;
      const action = mode === 'draft' ? (player ? `data-squad-slot="${slot.id}"` : `data-draft-slot="${slot.id}"`) : mode === 'prepare' ? `data-squad-slot="${slot.id}"` : '';
      const compatible = mode === 'draft' && state.selectedSquadSlot && state.canSwapSquadSlots(state.selectedSquadSlot, slot.id);
      return `<button type="button" class="pitch-pin draft-slot ${!player ? 'empty-slot' : ''} ${selected ? 'slot-selected' : ''} ${compatible ? 'swap-compatible' : ''} ${player && !natural ? 'out-of-position' : ''}" style="left:${slot.x}%;top:${slot.y}%;" ${action} ${!action ? 'disabled' : ''} aria-label="${escapeHtml(slot.label + ': ' + (player ? player.name + ', química ' + chemistry.toFixed(1) + ', ' + (natural ? 'posición natural A' : 'fuera de posición A') : 'vacío'))}">
        <span class="slot-position">${escapeHtml(slot.label)}</span>
        ${player ? `<span class="pitch-pin-avatar"><img src="${escapeHtml(player.image)}" alt="" onerror="this.onerror=null;this.src='../img/players/default.webp'"></span><span class="slot-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span><span class="slot-detail">${player.overall} · Q ${chemistry.toFixed(1)}</span><span class="position-fit">${natural ? 'A' : 'Fuera de A'}</span>` : '<span class="slot-plus">+</span>'}
      </button>`;
    }).join('')}
  </div>`;
}

function renderSquadStats() {
  return `<div class="stats-bar"><div class="stat-item"><span class="stat-label">OVR del XI</span><strong class="stat-val">${state.getStartingXIList().length ? state.ratings.overall : '—'}</strong></div><div class="stat-item"><span class="stat-label">Química</span><strong class="stat-val">${state.chemistry.score} / 100</strong></div><div class="stat-item"><span class="stat-label">Formación</span><strong>${state.formationId}</strong></div><div class="stat-item"><span class="stat-label">Plantilla</span><strong>${state.getFullSquad().length} / ${DRAFT_CONFIG.SQUAD_SIZE}</strong></div></div>`;
}

export function renderDraftBenchHtml() {
 return '<section class="draft-bank" aria-label="Suplentes"><h3>Banco · '+state.benchList.length+'/12</h3><div class="draft-bank-grid">'+DRAFT_CONFIG.BENCH_ROLES.map((role,i)=>{
  const p=state.getPlayerAtSlot(role.id),selected=state.selectedSquadSlot===role.id;
  const compatible=state.selectedSquadSlot&&state.canSwapSquadSlots(state.selectedSquadSlot,role.id);
  return '<button type="button" class="draft-bank-slot '+(selected?'slot-selected ':'')+(compatible?'swap-compatible ':'')+'" '+(p?'data-squad-slot':'data-draft-slot')+'="'+role.id+'" aria-label="S'+(i+1)+': '+escapeHtml(p?p.name:i===0?'Elegir arquero':'Elegir suplente')+'" aria-pressed="'+!!selected+'">'+(p?'<img src="'+escapeHtml(p.image)+'" alt="" onerror="this.onerror=null;this.src=\'../img/players/default.webp\'">':'<span class="bank-plus">+</span>')+'<span class="bank-label"><strong title="'+escapeHtml(p?.name||'')+'">'+escapeHtml(p?.name||'S'+(i+1))+'</strong><small>'+escapeHtml(p?p.primaryPosition+' · '+p.overall:i===0?'PO · S1':'Libre')+'</small></span></button>';
 }).join('')+'</div></section>';
}

export function renderDraftingScreen(container) {
  const step=state.activeDraftStep,complete=state.getFullSquad().length===DRAFT_CONFIG.SQUAD_SIZE,picking=!!step&&!complete;
  const formation=DRAFT_CONFIG.FORMATIONS[state.formationId];
  mountTeamWorkspace(container,`<div class="drafting-screen"><div class="draft-base" ${picking?'inert aria-hidden="true"':''}>${complete&&state.rivalSquad&&state.getSquadReadiness().ready?renderPlanningAnalysisHtml(getPlanningAnalysis(state)):''}${renderTeamBuilder(state,formation,DRAFT_CONFIG.BENCH_ROLES,complete?renderDraftCompletePanelHtml():'')}${state.currentScreen==='REVIEW'&&Object.keys(state.campaignStats).length?'<details class="squad-campaign-stats"><summary>Rendimiento de campaña</summary>'+renderCampaignStatsHtml(true)+'</details>':''}</div>${picking?renderPickStage(step,state.currentCandidates,formation.name,state.currentPickIndex):''}</div>`);
}

export function renderPlanningAnalysisHtml(analysis) {
 if(!analysis)return state.accountAuthority?'<p class="draft-panel" role="status">La previa es orientativa y se calcula aparte. Podés comenzar el partido sin esperarla.</p>':'';
 const p=analysis.regulation,verdict=p.win>=75?'Claro favorito':p.win>=55?'Favorito':Math.abs(p.win-p.loss)<=12?'Partido equilibrado':p.loss>=75?'Gran desafío':'Ligera desventaja';
 return `<aside class="qualification-preview draft-panel broadcast-preview" aria-label="Previa del partido"><div class="qualification-heading"><strong>PREVIA · ${escapeHtml(state.round)}</strong><span>${verdict}</span></div><div class="broadcast-contenders"><div><img src="../img/logo.webp" alt="" width="38" height="38"><strong>Mi Draft</strong><small>XI efectivo · ${analysis.initialForces.user}</small></div><div class="broadcast-forecast"><div class="regulation-numbers"><strong>${p.win}%<small>Victoria</small></strong><strong>${p.draw}%<small>Empate</small></strong><strong>${p.loss}%<small>Rival</small></strong></div><div class="regulation-track" role="img" aria-label="A90 minutos: victoria${p.win}%, empate${p.draw}%, rival${p.loss}%"><span style="width:${p.win}%"></span><span style="width:${p.draw}%"></span><span style="width:${p.loss}%"></span></div><small>90 MINUTOS REGLAMENTARIOS</small></div><div><img src="${escapeHtml(state.rivalSquad.crest)}" alt="" width="38" height="38"><strong>${escapeHtml(state.rivalSquad.name)}</strong><small>XI efectivo · ${analysis.initialForces.rival}</small></div></div><ul>${analysis.observations.map(note=>`<li>${escapeHtml(note)}</li>`).join('')}</ul><details class="qualification-secondary"><summary>Opciones de clasificación · ≈${analysis.userPercent}%</summary><div class="qualification-numbers"><strong>Mi Draft · ≈${analysis.userPercent}%</strong><strong>${escapeHtml(state.rivalSquad.name)} · ≈${analysis.rivalPercent}%</strong></div><div class="qualification-track"><span style="width:${analysis.userPercent}%"></span></div><small>Incluye prórroga y penales.</small></details><small>Estimación con ${analysis.simulations} simulaciones del motor real; las decisiones y los sucesos del partido pueden cambiar el resultado.</small></aside>`;
}

function renderDraftCompletePanelHtml() {
 const ready=state.getSquadReadiness(),preparing=state.currentScreen==='REVIEW',next=state.currentScreen==='NEXT_RIVAL',initial=(state.tournament?.roundIndex||0)===0;
 const action=preparing?'<button type="button" class="draft-btn draft-btn-primary" id="btn-preview-rival" '+(!ready.ready?'disabled':'')+'>'+(initial?(state.survival?'PREPARAR PRIMER PARTIDO':'COMENZAR TORNEO'):'CONFIRMAR ALINEACIÓN')+'</button>'+(state.survival?'':'<button type="button" class="draft-btn" id="btn-show-bracket">CAMINO A LA COPA</button>'):next?'<button type="button" class="draft-btn draft-btn-primary" id="btn-prepare-next">Preparar equipo</button>':'<button type="button" class="draft-btn draft-btn-primary" id="btn-play-match" '+(!ready.ready?'disabled':'')+'>Jugar '+escapeHtml(state.round)+'</button><button type="button" class="draft-btn" id="btn-back-prepare">Volver a preparar equipo</button>';
 return '<section class="draft-panel draft-complete-panel"><p class="setup-step">'+(state.survival?'CONVOCADOS · 23/23 · PLANTEL '+(23+(state.survival.reserves?.length||0)):'PLANTEL COMPLETO · 23/23')+'</p><h2>'+ (preparing?'¡Tu Draft está listo!':'Tu rival · '+escapeHtml(state.round))+'</h2>'+staffSummaryHtml(state)+coachStripHtml(state.rivalSquad?.coachId,'DT RIVAL')+'<p>'+ (preparing?'Intercambiá dos cartas para ajustar el once. Al comenzar confirmás tu alineación actual.':'Próximo rival: '+escapeHtml(state.rivalSquad?.name||'Por definir'))+'</p>'+action+(!ready.ready?'<p class="squad-invalid" role="alert">'+escapeHtml(ready.reasons.join(' '))+'</p>':'')+'<details class="draft-complete-details"><summary>Consultar alineación rival</summary>'+renderRivalInfoHtml(state.rivalSquad)+'</details></section>';
}

function renderCampaignStatsHtml() {
 return '<div class="stats-table-wrap"><table class="campaign-table"><thead><tr><th>Jugador</th><th>PJ</th><th>Minutos</th><th>Goles</th><th>Asistencias</th><th>Nota media</th></tr></thead><tbody>'+Object.values(state.campaignStats).sort((a,b)=>b.averageRating-a.averageRating).map(p=>'<tr><th>'+escapeHtml(p.name)+'</th><td>'+p.matches+'</td><td>'+p.minutes+'</td><td>'+p.goals+'</td><td>'+(p.assists||0)+'</td><td>'+p.averageRating.toFixed(1)+'</td></tr>').join('')+'</tbody></table></div>';
}
export function renderReviewScreen(container) {
 // The same workspace represents the completed squad and its preparation in every round.
 renderDraftingScreen(container);
}

/**
 * SCREEN 4: Match Screen
 */
export function renderMatchScreen(container) {
 const engine=state.activeMatch,playback=engine?.playback,match=playback?.view||engine;if(!match)return;
 const paused=playback?playback.paused:match.isPaused;
 container.innerHTML=`
 <div class="match-screen unified-match cinematic-match">
  <header class="match-scoreboard">
   <span class="broadcast-kicker">${state.survival?'SUPERVIVENCIA · RACHA '+state.survival.wins+' · RÉCORD '+Math.max(state.survival.initialBest||0,state.survival.wins)+' · '+escapeHtml(state.round):'ELIMINATORIA · LAqP DRAFT'} · <span id="playback-status" class="playback-status" role="status">${paused?'En pausa':'En juego'}</span></span>
   <div class="scoreboard-teams">
    <div class="scoreboard-team"><img class="scoreboard-crest" src="${USER_CREST}" alt="Escudo LAqP"><strong class="scoreboard-team-name">${escapeHtml(match.userTeamName)}</strong><small id="live-chemistry">Química: ${match.userChemistry} · ${chemistryImpactText(match.userChemistry)}</small></div>
    <div class="scoreboard-score-wrap"><span class="scoreboard-minute">${match.minute}′</span><span class="scoreboard-score" aria-label="Marcador">${match.userScore} - ${match.rivalScore}</span><span id="match-period">${matchPeriod(match,playback)}</span></div>
    <div class="scoreboard-team"><img class="scoreboard-crest" src="${escapeHtml(match.rivalCrest)}" alt="" onerror="this.onerror=null;this.src='../img/teams/default.webp'"><strong class="scoreboard-team-name">${escapeHtml(match.rivalTeamName)}</strong><small>Química: ${match.rivalChemistry} · ${chemistryImpactText(match.rivalChemistry)}</small></div>
   </div>
   <div class="minute-progress-bar"><div class="minute-progress-fill" style="width:${Math.min(100,match.minute/(match.extraTime?120:90)*100)}%"></div></div>
   <div class="match-quickbar"><div class="match-controls-bar"><button type="button" class="draft-btn draft-btn-primary" id="btn-toggle-play" aria-pressed="${!paused}">${playback?.halftimeReady?'▶ Continuar segundo tiempo':paused?(match.minute===0?'▶ INICIAR PARTIDO':'▶ Reanudar'):'Ⅱ Pausar'}</button><label class="match-select">Velocidad <select id="match-speed" aria-label="Velocidad de simulación">${DRAFT_CONFIG.PLAYBACK.SPEEDS.map(n=>'<option value="'+n+'" '+((playback?.speed||1)===n?'selected':'')+'>'+n+'×</option>').join('')}</select></label><label class="event-animation-preference"><input type="checkbox" id="match-simple-animations"> Relato breve</label></div><div class="match-team-decisions"><label class="match-select match-tactic-control">Planteamiento <select id="match-tactic" aria-label="Planteamiento">${Object.values(DRAFT_CONFIG.TACTICS).map(t=>'<option value="'+t.id+'" '+(match.userTactic===t.id?'selected':'')+'>'+t.label+'</option>').join('')}</select></label><label class="match-select">Intensidad <select id="match-intensity" aria-label="Intensidad">${Object.entries(DRAFT_CONFIG.INTENSITIES).map(([id,t])=>'<option value="'+id+'" '+(match.userIntensity===id?'selected':'')+'>'+t.label+'</option>').join('')}</select></label><button type="button" class="draft-btn" id="btn-set-pieces" ${match.minute>0&&!paused?'disabled':''}>Pelotas paradas</button><button type="button" class="draft-btn draft-btn-primary" id="btn-open-subs" ${engine.canSubstitute()?'':'disabled'}>HACER CAMBIO</button><span id="match-sub-limits" class="playback-status">Cambios disponibles: ${DRAFT_CONFIG.MAX_SUBSTITUTIONS-engine.substitutionsUsed}/5 · Ventanas disponibles: ${DRAFT_CONFIG.MAX_SUBSTITUTION_WINDOWS-engine.substitutionWindowsUsed}/3</span><span id="match-tactic-feedback" role="status"></span></div></div>
  </header>
  <div id="match-halftime-banner" class="match-halftime-banner" ${playback?.halftimeReady?'':'hidden'}><strong>ENTRETIEMPO</strong><span>Revisá el equipo. Los cambios no consumen ventana durante el descanso.</span></div>
  <div class="match-columns">
   <section class="match-side match-user" aria-label="Nuestro equipo"><div id="live-team-user">${renderCompactTeamHtml(match,true)}</div></section>
   <section class="match-commentary" aria-label="Partido en vivo">
    <div class="broadcast-live-heading"><span>PARTIDO EN VIVO</span></div>
    <div id="match-suspense" class="match-suspense" aria-live="polite"><div id="event-scene-host">${renderMatchIdle(match,playback)}</div><span id="suspense-text" class="visually-hidden" aria-hidden="true">El partido está listo.</span><button id="btn-skip-action" type="button" class="skip-action" hidden>Omitir animación</button></div>
    <section id="match-shootout" class="match-shootout" aria-label="Tanda de penales" hidden></section>

    ${matchTabsHtml()}
    <div class="match-secondary-panels" data-active-panel="report">
    <div id="match-panel-report" data-match-panel="report" role="tabpanel" aria-labelledby="match-tab-report" class="match-feed-panel"><h3 id="match-feed-heading" class="feed-header">Cronología del encuentro</h3><div class="feed-events-list" id="match-feed-list" role="log" aria-label="Acontecimientos del partido">${match.events.filter(ev=>!ev.presentationOnly).slice().reverse().map(ev=>'<div class="feed-item event-'+ev.type+'">'+renderMatchFeedContentHtml(ev,match)+'</div>').join('')}</div></div>
    <section id="match-panel-stats" data-match-panel="stats" role="tabpanel" aria-labelledby="match-tab-stats" class="match-stats-panel match-secondary" aria-label="Estadísticas del partido" hidden>${renderMatchStatsHtml(match)}</section>
    <section id="match-panel-info" data-match-panel="info" role="tabpanel" aria-labelledby="match-tab-info" class="match-information" hidden><h3>Información del encuentro</h3><p>El planteamiento y los cambios están disponibles en la barra superior. Abrí una fila de jugador para consultar su rendimiento.</p><p>La química colectiva se fija antes del encuentro. Los cambios del partido conservan tu alineación base para la próxima ronda.</p></section>
    </div>
   </section>
   <section class="match-side match-rival" aria-label="Equipo rival"><div id="live-team-rival">${renderCompactTeamHtml(match,false)}</div></section>
  </div>
 </div>`;
}

export function renderSubModal(container){if(state.activeMatch)openSubModal(container,state.activeMatch);}

export function renderMatchResultScreen(container){container.innerHTML=state.tournament?.status==='champion'||!state.lastMatchResult?.userWon?campaignEndHtml(state):victoryHtml(state);}

/**
 * SCREEN 6: Steal Rival Player
 */
export function renderStealScreen(container) {
 if(state.rivalSquad)container.innerHTML=renderAcquisitionHtml(state);
}

export function renderBracketHtml(){return cupPathHtml(state.tournament);}

export function renderTournamentScreen(container) {
  const preview=state.currentScreen==='BRACKET_PREVIEW';
  const final=state.tournament.roundIndex===state.tournament.rounds.length-1;
  const next=state.tournament.rounds[state.tournament.roundIndex+1];
  container.innerHTML=`<div class="review-screen"><h2>Tu camino continúa</h2><p>${preview?Object.keys(state.tournament.teams).length+' participantes · Tu camino está resaltado.':final?'Ganaste la final. La copa es tuya.':'Resultados de '+escapeHtml(state.round)+'. Próxima ronda: '+escapeHtml(next.label)}</p>${rewardConfirmationHtml(preview?null:state.lastRewardSummary)}${renderBracketHtml()}<button type="button" class="draft-btn draft-btn-primary" id="${preview?'btn-back-bracket':'btn-advance-tournament'}">${preview?'Volver a preparar equipo':final?'Ver campeonato':'Presentar próximo rival'}</button></div>`;
}

export function renderCampaignEndScreen(container){container.innerHTML=campaignEndHtml(state);}

export function chemistryImpactText(score) {
 const percent=(chemistryMultiplier(score)-1)*100;
 return 'Coordinación: '+(percent>=0?'+':'')+percent.toFixed(1)+'%';
}
function renderRivalInfoHtml(rival) {
 if(!rival)return '';
 const energy=rival.startingXI.reduce((s,p)=>s+(p.energy??100),0)/(rival.startingXI.length||1);
 const ratings=calculateTeamRatings(rival.startingXI,rival.chemistry??50,'BALANCED',true);
 const strength=(ratings.effectiveAttack+ratings.effectiveMidfield+ratings.effectiveDefense+ratings.effectiveGoalkeeper)/4;
 const group=(title,players)=>'<h4>'+title+' ('+players.length+')</h4><div class="stats-table-wrap"><table class="campaign-table"><thead><tr><th>Jugador</th><th>Posición</th><th>OVR</th><th>Energía</th><th>PJ</th><th>Nota media</th></tr></thead><tbody>'+players.map(p=>'<tr><th>'+escapeHtml(p.name)+(p.hasSuperSub?' ⚡':'')+'</th><td>'+escapeHtml(p.slotPosition||p.primaryPosition)+'</td><td>'+p.overall+'</td><td>'+Math.round(p.energy??100)+'%</td><td>'+(rival.campaignStats?.[p.id]?.matches||0)+'</td><td>'+(rival.campaignStats?.[p.id]?.averageRating.toFixed(1)||'—')+'</td></tr>').join('')+'</tbody></table></div>';
 return '<details class="draft-panel rival-info"><summary>RIVAL · '+escapeHtml(rival.name)+' · Consultar plantilla</summary><div class="opponent-info"><img class="opponent-crest" src="'+escapeHtml(rival.crest)+'" alt=""><p>Formación '+escapeHtml(rival.formation)+' · '+rival.overall+' OVR · Fuerza '+strength.toFixed(1)+' · Química '+rival.chemistry+'/100 · '+chemistryImpactText(rival.chemistry)+' · Energía media '+Math.round(energy)+'%</p></div>'+group('Titulares',rival.startingXI)+group('Suplentes/reservas',rival.bench)+'<p>Notas de partidos NPC: estimación agregada basada en goles, sin relato minuto a minuto.</p></details>';
}
export function renderPenaltyHtml(penalties) {
 if(!penalties?.kicks)return '';
 return '<details open class="draft-panel"><summary>Tanda de penales · '+penalties.user+'–'+penalties.rival+'</summary><ol class="penalty-list">'+penalties.kicks.map(k=>'<li>'+(k.side==='home'?'Mi equipo':'Rival')+' · '+escapeHtml(k.name)+' '+(k.scored?'✅':'❌')+(k.suddenDeath?' · Muerte súbita':'')+'</li>').join('')+'</ol></details>';
}
function renderFinalRatingsHtml(match) {
 return '<details class="draft-panel"><summary>Notas finales · MI EQUIPO / RIVAL</summary><h4>Mi equipo</h4>'+renderLivePlayersHtml(match.getAllPlayers(true).filter(p=>match.playerPerformance[p.id]?.minutes),match.playerPerformance)+'<h4>Rival</h4>'+renderLivePlayersHtml(match.getAllPlayers(false).filter(p=>match.rivalPerformance[p.id]?.minutes),match.rivalPerformance)+'</details>';
}
