/**
 * Central State Store for LAqP Draft
 * Single source of truth. No scattered global variables.
 */

import { DRAFT_CONFIG } from './config.js';
import { getDraftPlan } from './core/draftEngine.js';
import { calculateChemistry } from './core/chemistry.js';
import { calculateTeamRatings } from './core/teamRating.js';

class StateStore {
  constructor() {
    this.listeners = new Set();
    this.reset();
  }

  reset() {
    this.currentScreen = 'START'; // START, DRAFTING, REVIEW, MATCH, MATCH_RESULT, STEAL_RIVAL, OCTAVOS
    this.region = 'EUROPA';
    this.formationId = '4-3-3';

    // Draft progression
    this.draftPlan = [];
    this.currentPickIndex = 0;
    this.currentCandidates = [];
    this.startersMap = {}; // { [slotId]: player }
    this.benchList = [];   // [ player, ... ]
    this.draftedIds = new Set();

    // Squad analysis
    this.chemistry = { score: 0, totalPoints: 0, linkDetails: [] };
    this.ratings = { overall: 70, attack: 70, midfield: 70, defense: 70, goalkeeper: 70 };

    // Match & Opponent
    this.rivalSquad = null;
    this.activeMatch = null;
    this.lastMatchResult = null;
    this.subModalOpen = false;

    // Steal mechanic
    this.selectedRivalPlayer = null;
    this.selectedReplacePlayerId = null;

    // Post-match state
    this.round = '16avos';
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }

  setScreen(screen) {
    this.currentScreen = screen;
    this.notify();
  }

  setRegion(region) {
    this.region = region;
    this.notify();
  }

  setFormation(formationId) {
    this.formationId = formationId;
    this.notify();
  }

  startDraft() {
    this.draftPlan = getDraftPlan(this.formationId);
    this.currentPickIndex = 0;
    this.startersMap = {};
    this.benchList = [];
    this.draftedIds = new Set();
    this.currentScreen = 'DRAFTING';
  }

  selectCandidate(candidate) {
    const currentStep = this.draftPlan[this.currentPickIndex];
    if (!currentStep || !candidate) return;

    this.draftedIds.add(candidate.id);

    if (currentStep.isStarter) {
      this.startersMap[currentStep.slotId] = {
        ...candidate,
        slotId: currentStep.slotId,
        slotPosition: currentStep.position
      };
    } else {
      this.benchList.push({
        ...candidate,
        slotId: currentStep.slotId,
        slotPosition: currentStep.position
      });
    }

    this.currentPickIndex++;

    if (this.currentPickIndex >= this.draftPlan.length) {
      // Draft complete! Recalculate squad chemistry & ratings
      this.recalculateSquadStats();
      this.currentScreen = 'REVIEW';
    }
  }

  recalculateSquadStats() {
    this.chemistry = calculateChemistry(this.formationId, this.startersMap);
    const startersList = Object.values(this.startersMap);
    this.ratings = calculateTeamRatings(startersList, this.chemistry.score, 'BALANCED');
  }

  getStartingXIList() {
    const formation = DRAFT_CONFIG.FORMATIONS[this.formationId];
    if (!formation) return Object.values(this.startersMap);
    return formation.slots
      .map(slot => this.startersMap[slot.id])
      .filter(Boolean);
  }

  getFullSquad() {
    return [...this.getStartingXIList(), ...this.benchList];
  }

  replaceSquadPlayer(oldPlayerId, newPlayer) {
    // If in starters:
    for (const [slotId, p] of Object.entries(this.startersMap)) {
      if (p.id === oldPlayerId) {
        this.startersMap[slotId] = {
          ...newPlayer,
          slotId,
          slotPosition: p.slotPosition || newPlayer.primaryPosition,
          temporaryAcquisition: true
        };
        this.recalculateSquadStats();
        return true;
      }
    }

    // If in bench:
    const benchIndex = this.benchList.findIndex(p => p.id === oldPlayerId);
    if (benchIndex !== -1) {
      const oldSlot = this.benchList[benchIndex].slotId;
      this.benchList[benchIndex] = {
        ...newPlayer,
        slotId: oldSlot,
        temporaryAcquisition: true
      };
      this.recalculateSquadStats();
      return true;
    }

    return false;
  }
}

export const state = new StateStore();
