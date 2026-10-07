/**
 * UI Renderer for LAqP Draft
 * Pure modular render functions for every vertical slice stage.
 */

import { state } from '../state.js';
import { DRAFT_CONFIG } from '../config.js';
import { generatePickCandidates } from '../core/draftEngine.js';

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function ovrClass(ovr) {
  if (ovr >= 85) return 'ovr-high';
  if (ovr >= 78) return 'ovr-mid';
  return 'ovr-low';
}

export function staminaClass(stamina) {
  if (stamina < 55) return 'stamina-low';
  if (stamina < 75) return 'stamina-mid';
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
    <div class="player-card ${compact ? 'is-compact' : ''}" data-player-id="${escapeHtml(player.id)}">
      ${tempBadge}
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
        <div class="card-nat">${escapeHtml(player.nationality)}</div>
      </div>
    </div>
  `;
}

/**
 * SCREEN 1: Setup / Start
 */
export function renderStartScreen(container) {
  container.innerHTML = `
    <div class="draft-panel start-screen">
      <h1>LAqP <span>Draft</span></h1>
      <p class="start-subtitle">Armá tu equipo, desafiá a un rival en 16avos de final y fichá a su mejor jugador.</p>

      <div class="setup-group">
        <label>1. Seleccioná la Región del Draft</label>
        <div class="selector-grid">
          <div class="choice-card ${state.region === 'EUROPA' ? 'is-selected' : ''}" data-choice-region="EUROPA">
            <div class="choice-title">Europa</div>
            <div class="choice-desc">Clubes europeos (Premier, LaLiga, Serie A, etc.)</div>
          </div>
          <div class="choice-card ${state.region === 'SUDAMERICA' ? 'is-selected' : ''}" data-choice-region="SUDAMERICA">
            <div class="choice-title">Sudamérica</div>
            <div class="choice-desc">Clubes sudamericanos (Argentina, Brasil, Chile, etc.)</div>
          </div>
        </div>
      </div>

      <div class="setup-group">
        <label>2. Seleccioná la Formación Táctica</label>
        <div class="selector-grid">
          <div class="choice-card ${state.formationId === '4-3-3' ? 'is-selected' : ''}" data-choice-formation="4-3-3">
            <div class="choice-title">4-3-3</div>
            <div class="choice-desc">Extremos veloces y medio campo balanceado</div>
          </div>
          <div class="choice-card ${state.formationId === '4-2-3-1' ? 'is-selected' : ''}" data-choice-formation="4-2-3-1">
            <div class="choice-title">4-2-3-1</div>
            <div class="choice-desc">Doble pivote defensivo y mediapunta creativo</div>
          </div>
          <div class="choice-card ${state.formationId === '4-4-2' ? 'is-selected' : ''}" data-choice-formation="4-4-2">
            <div class="choice-title">4-4-2</div>
            <div class="choice-desc">Dos delanteros centro y bandas sólidas</div>
          </div>
        </div>
      </div>

      <button type="button" class="draft-btn draft-btn-primary" id="btn-start-draft" style="width: 100%; padding: 14px; font-size: 1.1rem;">
        Comenzar Draft
      </button>
    </div>
  `;
}

/**
 * SCREEN 2: Drafting
 */
export function renderDraftingScreen(container) {
  const currentStep = state.draftPlan[state.currentPickIndex];
  if (!currentStep) return;

  const totalSteps = state.draftPlan.length;
  const progressPct = ((state.currentPickIndex) / totalSteps) * 100;

  // Generate candidates for this pick
  const candidates = generatePickCandidates(
    state.region,
    currentStep.position,
    state.draftedIds
  );
  state.currentCandidates = candidates;

  container.innerHTML = `
    <div class="drafting-screen">
      <div class="draft-progress-bar-wrap">
        <div class="draft-progress-bar-fill" style="width: ${progressPct}%;"></div>
      </div>

      <div class="draft-step-header">
        <div>
          <h2 class="draft-step-title">${escapeHtml(currentStep.title)}</h2>
          <span style="color: var(--draft-text-muted); font-size: 0.9rem;">Elegí 1 de los 5 candidatos para sumarlo a tu plantilla:</span>
        </div>
        <div class="draft-step-badge">${state.currentPickIndex + 1} de ${totalSteps} picks</div>
      </div>

      <div class="candidates-grid">
        ${candidates.map(player => renderPlayerCardHtml(player)).join('')}
      </div>
    </div>
  `;
}

/**
 * SCREEN 3: Squad Review
 */
export function renderReviewScreen(container) {
  const formation = DRAFT_CONFIG.FORMATIONS[state.formationId];
  const starters = state.getStartingXIList();
  const bench = state.benchList;

  container.innerHTML = `
    <div class="review-screen">
      <!-- Stats Bar -->
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-label">Media General</span>
          <span class="stat-val ${ovrClass(state.ratings.overall)}">${state.ratings.overall}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Química</span>
          <span class="stat-val">${state.chemistry.score} / 100</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Ataque / Medio / Defensa</span>
          <span style="font-size: 1.2rem; font-weight: 800;">${state.ratings.attack} / ${state.ratings.midfield} / ${state.ratings.defense}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Esquema</span>
          <span style="font-size: 1.2rem; font-weight: 800;">${state.formationId} (${state.region})</span>
        </div>
      </div>

      <!-- Schematic Pitch -->
      <div class="pitch-container" id="tactical-pitch">
        <div class="pitch-half-line"></div>
        <div class="pitch-center-circle"></div>
        <div class="pitch-box-top"></div>
        <div class="pitch-box-bottom"></div>

        ${formation.slots.map(slot => {
          const player = state.startersMap[slot.id];
          if (!player) return '';
          return `
            <div class="pitch-pin" style="left: ${slot.x}%; top: ${slot.y}%;" title="${escapeHtml(player.name)} (${slot.label})">
              <div class="pitch-pin-avatar">
                <img src="${escapeHtml(player.image)}" alt="${escapeHtml(player.name)}" onerror="this.onerror=null;this.src='../img/players/default.webp'">
              </div>
              <div class="pitch-pin-tag">
                <span class="ovr">${player.overall}</span>
                <span>${escapeHtml(player.name.split(' ').pop())}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Bench Section -->
      <div class="bench-section">
        <h3>Banco de Suplentes (5)</h3>
        <div class="bench-grid">
          ${bench.map(player => renderPlayerCardHtml(player, { compact: true })).join('')}
        </div>
      </div>

      <!-- Opponent Matchup Card -->
      <div class="opponent-preview-card">
        <div class="opponent-info">
          <img class="opponent-crest" src="${escapeHtml(state.rivalSquad.crest)}" alt="${escapeHtml(state.rivalSquad.name)}" onerror="this.onerror=null;this.src='../img/teams/default.webp'">
          <div>
            <div style="font-size: 0.8rem; color: var(--draft-text-muted); font-weight: 700; text-transform: uppercase;">Próximo Rival • 16avos de Final</div>
            <div style="font-size: 1.4rem; font-weight: 800;">${escapeHtml(state.rivalSquad.name)}</div>
            <div style="font-size: 0.9rem; color: var(--draft-accent);">Media Rival: ${state.rivalSquad.overall} OVR • ${escapeHtml(state.rivalSquad.leagueName)}</div>
          </div>
        </div>

        <button type="button" class="draft-btn draft-btn-primary" id="btn-play-match" style="padding: 14px 28px; font-size: 1.1rem;">
          Jugar 16avos de Final ⚽
        </button>
      </div>
    </div>
  `;
}

/**
 * SCREEN 4: Match Screen
 */
export function renderMatchScreen(container) {
  const match = state.activeMatch;
  if (!match) return;

  const progressPct = Math.min(100, (match.minute / DRAFT_CONFIG.MATCH_DURATION_MINUTES) * 100);
  const remainingSubs = DRAFT_CONFIG.MAX_SUBSTITUTIONS - match.substitutionsUsed;

  container.innerHTML = `
    <div class="match-screen">
      <!-- Scoreboard -->
      <div class="match-scoreboard">
        <div class="scoreboard-teams">
          <div class="scoreboard-team">
            <span class="scoreboard-team-name">${escapeHtml(match.userTeamName)}</span>
            <span style="font-size: 0.8rem; color: var(--draft-accent);">Química: ${match.userChemistry}</span>
          </div>

          <div class="scoreboard-score-wrap">
            <span class="scoreboard-score">${match.userScore} - ${match.rivalScore}</span>
            <span class="scoreboard-minute">${match.minute}'</span>
          </div>

          <div class="scoreboard-team">
            <img class="scoreboard-crest" src="${escapeHtml(match.rivalCrest)}" alt="${escapeHtml(match.rivalTeamName)}" onerror="this.onerror=null;this.src='../img/teams/default.webp'">
            <span class="scoreboard-team-name">${escapeHtml(match.rivalTeamName)}</span>
          </div>
        </div>

        <div class="minute-progress-bar">
          <div class="minute-progress-fill" style="width: ${progressPct}%;"></div>
        </div>
      </div>

      <!-- Controls & Tactics -->
      <div class="match-controls-bar">
        <div class="tactics-selector">
          <span class="tactics-label">Planteamiento:</span>
          <button type="button" class="tactic-btn ${match.userTactic === 'DEFENSIVE' ? 'is-active' : ''}" data-tactic="DEFENSIVE">Defensivo</button>
          <button type="button" class="tactic-btn ${match.userTactic === 'BALANCED' ? 'is-active' : ''}" data-tactic="BALANCED">Equilibrado</button>
          <button type="button" class="tactic-btn ${match.userTactic === 'OFFENSIVE' ? 'is-active' : ''}" data-tactic="OFFENSIVE">Ofensivo</button>
        </div>

        <button type="button" class="draft-btn" id="btn-open-subs" ${remainingSubs <= 0 || match.isFinished ? 'disabled' : ''}>
          Realizar Cambios (${remainingSubs} disp.)
        </button>
      </div>

      <!-- Live Feed & Stats -->
      <div class="match-content-grid">
        <div class="match-feed-panel">
          <div class="feed-header">Relato en Vivo</div>
          <div class="feed-events-list" id="match-feed-list">
            ${match.events.map(ev => `
              <div class="feed-item event-${ev.type}">
                <span class="feed-minute">${ev.minute}'</span>
                <span>${escapeHtml(ev.text)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="match-stats-panel">
          <div class="feed-header">Estadísticas del Partido</div>
          <div class="stats-row">
            <span class="stats-row-val">${match.stats.userChances}</span>
            <span class="stats-row-label">Ocasiones de Peligro</span>
            <span class="stats-row-val">${match.stats.rivalChances}</span>
          </div>
          <div class="stats-row">
            <span class="stats-row-val">${match.stats.userShots}</span>
            <span class="stats-row-label">Tiros Totales</span>
            <span class="stats-row-val">${match.stats.rivalShots}</span>
          </div>
          <div class="stats-row">
            <span class="stats-row-val">${match.stats.userShotsOnTarget}</span>
            <span class="stats-row-label">Tiros al Arco</span>
            <span class="stats-row-val">${match.stats.rivalShotsOnTarget}</span>
          </div>
          <div class="stats-row">
            <span class="stats-row-val">${match.substitutionsUsed} / ${DRAFT_CONFIG.MAX_SUBSTITUTIONS}</span>
            <span class="stats-row-label">Cambios Realizados</span>
            <span class="stats-row-val">0 / ${DRAFT_CONFIG.MAX_SUBSTITUTIONS}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * MODAL: Substitutions
 */
export function renderSubModal(container) {
  const match = state.activeMatch;
  if (!match) return;

  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'draft-modal-backdrop';
  modalBackdrop.id = 'modal-subs-backdrop';

  modalBackdrop.innerHTML = `
    <div class="draft-modal">
      <div class="modal-header">
        <h3 class="modal-title">Realizar Sustitución (${DRAFT_CONFIG.MAX_SUBSTITUTIONS - match.substitutionsUsed} restantes)</h3>
        <button type="button" class="draft-btn" id="btn-close-subs">Cerrar</button>
      </div>

      <div class="sub-picker-grid">
        <div>
          <label style="display:block; font-size:0.85rem; font-weight:700; color:var(--draft-text-muted); margin-bottom:8px;">1. JUGADOR QUE SALE (Titulares)</label>
          <div class="sub-list" id="sub-starters-list">
            ${match.userStarters.map(p => `
              <div class="sub-item" data-sub-out="${escapeHtml(p.id)}">
                <div>
                  <strong>${p.overall} ${escapeHtml(p.name)}</strong> (${p.primaryPosition})
                  <div class="stamina-bar-wrap">
                    <div class="stamina-bar-fill ${staminaClass(p.stamina)}" style="width: ${Math.round(p.stamina)}%;"></div>
                  </div>
                </div>
                <span style="font-size:0.8rem; color:var(--draft-text-muted);">${Math.round(p.stamina)}% En.</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <label style="display:block; font-size:0.85rem; font-weight:700; color:var(--draft-text-muted); margin-bottom:8px;">2. JUGADOR QUE ENTRA (Suplentes)</label>
          <div class="sub-list" id="sub-bench-list">
            ${match.userBench.map(p => `
              <div class="sub-item" data-sub-in="${escapeHtml(p.id)}">
                <div>
                  <strong>${p.overall} ${escapeHtml(p.name)}</strong> (${p.primaryPosition})
                  <div class="stamina-bar-wrap">
                    <div class="stamina-bar-fill ${staminaClass(p.stamina)}" style="width: ${Math.round(p.stamina)}%;"></div>
                  </div>
                </div>
                <span style="font-size:0.8rem; color:var(--draft-text-muted);">${Math.round(p.stamina)}% En.</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:16px;">
        <button type="button" class="draft-btn draft-btn-primary" id="btn-confirm-sub" disabled>
          Confirmar Sustitución
        </button>
      </div>
    </div>
  `;

  container.appendChild(modalBackdrop);
}

/**
 * SCREEN 5: Match Result Screen
 */
export function renderMatchResultScreen(container) {
  const result = state.lastMatchResult;
  const match = state.activeMatch;
  if (!result || !match) return;

  const isWin = result.userWon;

  container.innerHTML = `
    <div class="draft-panel result-card">
      <h2 class="result-title ${isWin ? 'is-win' : 'is-loss'}">
        ${isWin ? '¡VICTORIA!' : 'ELIMINADO'}
      </h2>
      <p style="color: var(--draft-text-muted); font-size: 1.1rem; margin-bottom: 24px;">
        ${isWin
          ? 'Superaste con éxito la fase de 16avos de final.'
          : 'Has quedado eliminado en 16avos de final.'}
      </p>

      <div style="font-size: 3rem; font-weight: 900; margin-bottom: 24px;">
        ${result.userScore} - ${result.rivalScore}
        ${result.penalties ? `<div style="font-size: 1.1rem; color: var(--draft-accent);">(Penales: ${result.penalties.user} - ${result.penalties.rival})</div>` : ''}
      </div>

      <div style="display: flex; justify-content: center; gap: 16px;">
        ${isWin ? `
          <button type="button" class="draft-btn draft-btn-primary" id="btn-go-steal" style="padding: 14px 28px; font-size: 1.1rem;">
            Fichar Jugador del Rival 🏆
          </button>
        ` : `
          <button type="button" class="draft-btn draft-btn-primary" id="btn-restart-draft" style="padding: 14px 28px; font-size: 1.1rem;">
            Comenzar Nuevo Draft 🔄
          </button>
        `}
      </div>
    </div>
  `;
}

/**
 * SCREEN 6: Steal Rival Player
 */
export function renderStealScreen(container) {
  const rival = state.rivalSquad;
  if (!rival) return;

  const rivalPlayers = [...(rival.startingXI || []), ...(rival.bench || [])];
  const ownSquad = state.getFullSquad();

  container.innerHTML = `
    <div class="draft-panel">
      <h2 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 6px;">Fichaje del Rival</h2>
      <p style="color: var(--draft-text-muted); margin-bottom: 20px;">
        ¡Victoria asegurada! Podés robar UN jugador de ${escapeHtml(rival.name)} para reforzar tu plantilla durante el resto del torneo.
      </p>

      <div style="margin-bottom: 24px;">
        <label style="display:block; font-size:0.85rem; font-weight:800; color:var(--draft-accent); text-transform:uppercase; margin-bottom:10px;">
          1. Elegí al jugador rival que querés fichar:
        </label>
        <div class="steal-catalog-grid" id="steal-rival-list">
          ${rivalPlayers.map(p => `
            <div class="choice-card ${state.selectedRivalPlayer?.id === p.id ? 'is-selected' : ''}" data-steal-rival-id="${escapeHtml(p.id)}">
              <span class="card-ovr ${ovrClass(p.overall)}" style="font-size:1.4rem;">${p.overall}</span>
              <div style="font-weight:700; font-size:0.95rem; margin:4px 0;">${escapeHtml(p.name)}</div>
              <div style="font-size:0.75rem; color:var(--draft-text-muted);">${escapeHtml(p.primaryPosition)} • ${escapeHtml(p.nationality)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <label style="display:block; font-size:0.85rem; font-weight:800; color:var(--draft-accent-gold); text-transform:uppercase; margin-bottom:10px;">
          2. Elegí qué jugador de tu plantilla (16) reemplaza:
        </label>
        <div class="steal-catalog-grid" id="steal-own-list">
          ${ownSquad.map(p => `
            <div class="choice-card ${state.selectedReplacePlayerId === p.id ? 'is-selected' : ''}" data-steal-own-id="${escapeHtml(p.id)}">
              <span class="card-ovr ${ovrClass(p.overall)}" style="font-size:1.4rem;">${p.overall}</span>
              <div style="font-weight:700; font-size:0.95rem; margin:4px 0;">${escapeHtml(p.name)}</div>
              <div style="font-size:0.75rem; color:var(--draft-text-muted);">${escapeHtml(p.slotPosition || p.primaryPosition)} • ${p.temporaryAcquisition ? 'Fichaje previo' : 'Draft original'}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button type="button" class="draft-btn draft-btn-primary" id="btn-confirm-steal" style="padding: 14px 28px; font-size: 1.1rem;" ${(!state.selectedRivalPlayer || !state.selectedReplacePlayerId) ? 'disabled' : ''}>
          Confirmar Fichaje y Avanzar
        </button>
      </div>
    </div>
  `;
}

/**
 * SCREEN 7: Octavos Confirmed (End of Milestone 1)
 */
export function renderOctavosScreen(container) {
  const starters = state.getStartingXIList();
  const bench = state.benchList;

  container.innerHTML = `
    <div class="review-screen">
      <div class="draft-panel" style="background: linear-gradient(180deg, rgba(33, 212, 194, 0.12) 0%, var(--draft-surface) 100%); text-align: center; border-color: var(--draft-accent); padding: 32px 20px;">
        <span class="draft-badge" style="font-size: 0.9rem; padding: 6px 14px;">Primer Hito Completado</span>
        <h1 style="font-size: 2.4rem; font-weight: 900; margin: 12px 0 8px;">OCTAVOS DE FINAL</h1>
        <p style="color: var(--draft-text-muted); max-width: 620px; margin: 0 auto;">
          ¡Clasificación exitosa! Tu plantilla ha sido actualizada con la incorporación del rival.
          El flujo completo del Vertical Slice ha finalizado con éxito.
        </p>
      </div>

      <!-- Stats Bar -->
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-label">Nueva Media General</span>
          <span class="stat-val ${ovrClass(state.ratings.overall)}">${state.ratings.overall}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Nueva Química</span>
          <span class="stat-val">${state.chemistry.score} / 100</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Tamaño Plantilla</span>
          <span style="font-size: 1.2rem; font-weight: 800;">16 Jugadores</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Estado</span>
          <span style="font-size: 1.2rem; font-weight: 800; color: #2ecc71;">Clasificado a Octavos</span>
        </div>
      </div>

      <!-- Starters Grid -->
      <div class="draft-panel">
        <h3 style="font-size: 1.1rem; color: var(--draft-text-muted); text-transform: uppercase; margin-bottom: 14px;">Titulares Actualizados (11)</h3>
        <div class="candidates-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));">
          ${starters.map(p => renderPlayerCardHtml(p)).join('')}
        </div>
      </div>

      <!-- Bench Grid -->
      <div class="bench-section">
        <h3>Suplentes Actualizados (5)</h3>
        <div class="bench-grid">
          ${bench.map(p => renderPlayerCardHtml(p, { compact: true })).join('')}
        </div>
      </div>

      <div style="text-align: center; margin: 20px 0 40px;">
        <button type="button" class="draft-btn draft-btn-primary" id="btn-restart-draft" style="padding: 14px 28px; font-size: 1.1rem;">
          Jugar Otro Draft 🔄
        </button>
      </div>
    </div>
  `;
}
