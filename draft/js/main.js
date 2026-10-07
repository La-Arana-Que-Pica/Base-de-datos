/**
 * Main Application Orchestrator for LAqP Draft
 * Event delegation, screen lifecycle, and match loop binding.
 */

import { state } from './state.js';
import { DRAFT_CONFIG } from './config.js';
import { getTeamsByRegion, getRivalSquad, getPlayerById } from './data/adapter.js';
import { MatchEngine } from './core/matchEngine.js';
import {
  renderStartScreen,
  renderDraftingScreen,
  renderReviewScreen,
  renderMatchScreen,
  renderSubModal,
  renderMatchResultScreen,
  renderStealScreen,
  renderOctavosScreen,
  escapeHtml
} from './ui/render.js';

let appContainer = null;

function renderCurrentScreen() {
  if (!appContainer) return;

  switch (state.currentScreen) {
    case 'START':
      renderStartScreen(appContainer);
      break;
    case 'DRAFTING':
      renderDraftingScreen(appContainer);
      break;
    case 'REVIEW':
      renderReviewScreen(appContainer);
      break;
    case 'MATCH':
      renderMatchScreen(appContainer);
      break;
    case 'MATCH_RESULT':
      renderMatchResultScreen(appContainer);
      break;
    case 'STEAL_RIVAL':
      renderStealScreen(appContainer);
      break;
    case 'OCTAVOS':
      renderOctavosScreen(appContainer);
      break;
    default:
      renderStartScreen(appContainer);
      break;
  }
}

/**
 * Partial UI updates for live match tick to avoid full DOM rebuild
 */
function updateMatchUi(match) {
  if (state.currentScreen !== 'MATCH') return;

  const scoreEl = document.querySelector('.scoreboard-score');
  const minuteEl = document.querySelector('.scoreboard-minute');
  const fillEl = document.querySelector('.minute-progress-fill');
  const subsBtn = document.querySelector('#btn-open-subs');

  if (scoreEl) scoreEl.textContent = `${match.userScore} - ${match.rivalScore}`;
  if (minuteEl) minuteEl.textContent = `${match.minute}'`;
  if (fillEl) {
    const pct = Math.min(100, (match.minute / DRAFT_CONFIG.MATCH_DURATION_MINUTES) * 100);
    fillEl.style.width = `${pct}%`;
  }

  if (subsBtn) {
    const remaining = DRAFT_CONFIG.MAX_SUBSTITUTIONS - match.substitutionsUsed;
    subsBtn.textContent = `Realizar Cambios (${remaining} disp.)`;
    subsBtn.disabled = remaining <= 0 || match.isFinished;
  }

  // Update stats panel
  const statsRows = document.querySelectorAll('.stats-row');
  if (statsRows.length >= 4) {
    const updateRow = (row, val1, val2) => {
      const vals = row.querySelectorAll('.stats-row-val');
      if (vals.length === 2) {
        vals[0].textContent = val1;
        vals[1].textContent = val2;
      }
    };
    updateRow(statsRows[0], match.stats.userChances, match.stats.rivalChances);
    updateRow(statsRows[1], match.stats.userShots, match.stats.rivalShots);
    updateRow(statsRows[2], match.stats.userShotsOnTarget, match.stats.rivalShotsOnTarget);
    updateRow(statsRows[3], `${match.substitutionsUsed} / ${DRAFT_CONFIG.MAX_SUBSTITUTIONS}`, `0 / ${DRAFT_CONFIG.MAX_SUBSTITUTIONS}`);
  }
}

function updateMatchEvents(event) {
  const feedList = document.querySelector('#match-feed-list');
  if (!feedList) return;

  const item = document.createElement('div');
  item.className = `feed-item event-${event.type}`;
  item.innerHTML = `
    <span class="feed-minute">${event.minute}'</span>
    <span>${escapeHtml(event.text)}</span>
  `;
  feedList.insertBefore(item, feedList.firstChild);
}

function bindGlobalEvents() {
  document.addEventListener('click', (e) => {
    // 1. START SCREEN: Region selection
    const regionCard = e.target.closest('[data-choice-region]');
    if (regionCard) {
      state.setRegion(regionCard.dataset.choiceRegion);
      return;
    }

    // 2. START SCREEN: Formation selection
    const formationCard = e.target.closest('[data-choice-formation]');
    if (formationCard) {
      state.setFormation(formationCard.dataset.choiceFormation);
      return;
    }

    // 3. START SCREEN: Start Draft button
    if (e.target.closest('#btn-start-draft')) {
      // Pick a random rival from same region for 16avos
      const regionTeams = getTeamsByRegion(state.region);
      if (regionTeams.length) {
        const randomTeam = regionTeams[Math.floor(Math.random() * regionTeams.length)];
        state.rivalSquad = getRivalSquad(randomTeam.id);
      }
      state.startDraft();
      state.setScreen('DRAFTING');
      return;
    }

    // 4. DRAFTING: Candidate card selected
    const playerCard = e.target.closest('.candidates-grid .player-card');
    if (playerCard && state.currentScreen === 'DRAFTING') {
      const pid = playerCard.dataset.playerId;
      const candidate = (state.currentCandidates || []).find(p => p.id === pid) || getPlayerById(pid);
      if (candidate) {
        state.selectCandidate(candidate);
        renderCurrentScreen();
      }
      return;
    }

    // 5. REVIEW SCREEN: Play Match button
    if (e.target.closest('#btn-play-match')) {
      const userStarters = state.getStartingXIList();
      const userBench = state.benchList;

      state.activeMatch = new MatchEngine({
        userTeam: {
          name: 'Mi Draft',
          starters: userStarters,
          bench: userBench
        },
        rivalTeam: state.rivalSquad,
        userChemistry: state.chemistry.score,
        seed: Date.now(),
        onTick: (m) => updateMatchUi(m),
        onEvent: (ev, m) => updateMatchEvents(ev, m),
        onFinish: (result) => {
          state.lastMatchResult = result;
          state.setScreen('MATCH_RESULT');
        }
      });

      state.setScreen('MATCH');
      state.activeMatch.start();
      return;
    }

    // 6. MATCH SCREEN: Tactical switch
    const tacticBtn = e.target.closest('[data-tactic]');
    if (tacticBtn && state.activeMatch) {
      const tid = tacticBtn.dataset.tactic;
      state.activeMatch.setTactic(tid);
      document.querySelectorAll('[data-tactic]').forEach(b => {
        b.classList.toggle('is-active', b.dataset.tactic === tid);
      });
      return;
    }

    // 7. MATCH SCREEN: Open Substitutions Modal
    if (e.target.closest('#btn-open-subs') && state.activeMatch) {
      state.activeMatch.pause();
      state.subModalOpen = true;
      renderSubModal(document.body);
      return;
    }

    // 8. SUBS MODAL: Close without substituting
    if (e.target.closest('#btn-close-subs')) {
      const modal = document.querySelector('#modal-subs-backdrop');
      if (modal) modal.remove();
      state.subModalOpen = false;
      if (state.activeMatch) state.activeMatch.resume();
      return;
    }

    // 9. SUBS MODAL: Select Starter to come off
    const subOutItem = e.target.closest('#sub-starters-list .sub-item');
    if (subOutItem) {
      document.querySelectorAll('#sub-starters-list .sub-item').forEach(el => el.classList.remove('is-selected'));
      subOutItem.classList.add('is-selected');
      checkSubConfirmationState();
      return;
    }

    // 10. SUBS MODAL: Select Bench to come in
    const subInItem = e.target.closest('#sub-bench-list .sub-item');
    if (subInItem) {
      document.querySelectorAll('#sub-bench-list .sub-item').forEach(el => el.classList.remove('is-selected'));
      subInItem.classList.add('is-selected');
      checkSubConfirmationState();
      return;
    }

    // 11. SUBS MODAL: Confirm substitution
    if (e.target.closest('#btn-confirm-sub') && state.activeMatch) {
      const selectedOut = document.querySelector('#sub-starters-list .sub-item.is-selected');
      const selectedIn = document.querySelector('#sub-bench-list .sub-item.is-selected');
      if (selectedOut && selectedIn) {
        const outId = selectedOut.dataset.subOut;
        const inId = selectedIn.dataset.subIn;
        const res = state.activeMatch.substitute(outId, inId);
        if (res.success) {
          const modal = document.querySelector('#modal-subs-backdrop');
          if (modal) modal.remove();
          state.subModalOpen = false;
          state.activeMatch.resume();
          updateMatchUi(state.activeMatch);
        }
      }
      return;
    }

    // 12. MATCH RESULT SCREEN: Go to steal after victory
    if (e.target.closest('#btn-go-steal')) {
      state.selectedRivalPlayer = null;
      state.selectedReplacePlayerId = null;
      state.setScreen('STEAL_RIVAL');
      return;
    }

    // 13. MATCH RESULT / OCTAVOS: Restart new draft
    if (e.target.closest('#btn-restart-draft')) {
      if (state.activeMatch) state.activeMatch.stopTimer();
      state.reset();
      state.setScreen('START');
      return;
    }

    // 14. STEAL SCREEN: Select Rival player to steal
    const stealRivalCard = e.target.closest('#steal-rival-list .choice-card');
    if (stealRivalCard) {
      const pid = stealRivalCard.dataset.stealRivalId;
      const rivalPool = [...(state.rivalSquad?.startingXI || []), ...(state.rivalSquad?.bench || [])];
      state.selectedRivalPlayer = rivalPool.find(p => p.id === pid) || getPlayerById(pid);

      document.querySelectorAll('#steal-rival-list .choice-card').forEach(c => c.classList.remove('is-selected'));
      stealRivalCard.classList.add('is-selected');

      checkStealConfirmBtn();
      return;
    }

    // 15. STEAL SCREEN: Select own player to replace
    const stealOwnCard = e.target.closest('#steal-own-list .choice-card');
    if (stealOwnCard) {
      state.selectedReplacePlayerId = stealOwnCard.dataset.stealOwnId;

      document.querySelectorAll('#steal-own-list .choice-card').forEach(c => c.classList.remove('is-selected'));
      stealOwnCard.classList.add('is-selected');

      checkStealConfirmBtn();
      return;
    }

    // 16. STEAL SCREEN: Confirm steal and advance to Round of 16 (Octavos)
    if (e.target.closest('#btn-confirm-steal')) {
      if (state.selectedRivalPlayer && state.selectedReplacePlayerId) {
        state.replaceSquadPlayer(state.selectedReplacePlayerId, state.selectedRivalPlayer);
        state.round = 'octavos';
        state.setScreen('OCTAVOS');
      }
      return;
    }
  });
}

function checkSubConfirmationState() {
  const selectedOut = document.querySelector('#sub-starters-list .sub-item.is-selected');
  const selectedIn = document.querySelector('#sub-bench-list .sub-item.is-selected');
  const confirmBtn = document.querySelector('#btn-confirm-sub');
  if (confirmBtn) {
    confirmBtn.disabled = !selectedOut || !selectedIn;
  }
}

function checkStealConfirmBtn() {
  const confirmBtn = document.querySelector('#btn-confirm-steal');
  if (confirmBtn) {
    confirmBtn.disabled = !state.selectedRivalPlayer || !state.selectedReplacePlayerId;
  }
}

export function init() {
  appContainer = document.querySelector('#app');
  if (!appContainer) {
    console.error('LAqP Draft: Contenedor #app no encontrado.');
    return;
  }

  state.subscribe(() => {
    renderCurrentScreen();
  });

  bindGlobalEvents();
  renderCurrentScreen();
}

document.addEventListener('DOMContentLoaded', init);
