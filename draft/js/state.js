import {recordDreamReward} from './survival/squadEvolution.js';
import {captureOriginal} from './ecosystem/model.js';
import {coachOffer} from './core/coaching.js';
import {getCoach} from './data/coaches.js';
import {bestCaptain} from './core/leadership.js';
import {pendingReward,consumeReward,campaignPlayer,canUpgrade} from './core/campaignRewards.js';
/**
 * Central State Store for LAqP Draft
 * Single source of truth. No scattered global variables.
 */

import { createFormationOffer } from './core/formationOffer.js';
import { DRAFT_CONFIG } from './config.js';
import { getDraftPlan, generatePickCandidates } from './core/draftEngine.js';
import { calculateChemistry } from './core/chemistry.js';
import { calculateTeamRatings } from './core/teamRating.js';
import { createTournament, getNextOpponent, recordRoundResult, advanceTournament, completeEliminatedTournament } from './core/tournament.js';
import { accumulatePlayerStats } from './core/campaignStats.js';

export class StateStore {
  constructor() {
    this.listeners = new Set();
    this.reset();
  }

  reset() {
    this.currentScreen = 'START'; // START, DRAFTING, REVIEW, MATCH, MATCH_RESULT, STEAL_RIVAL, OCTAVOS
    this.region = 'EUROPA';
    this.staff=null;this.career=null;this.survival=null;
    this.formationId = '4-3-3';
    this.formationOffer = [];
    this.selectedFormationId = null;
    this.formationConfirmed = false;

    // Draft progression
    this.draftPlan = [];
    this.currentPickIndex = 0;
    this.currentCandidates = [];
    this.activeDraftStep = null;
    this.candidateCache = {};
    this.pendingDraftSlotId = null;
    this.selectedSquadSlot = null;
    this.squadMessage = '';
    this.squadCompletionPending = false;
    this.confirmedLineup = null;
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
    this.round = DRAFT_CONFIG.TOURNAMENT.ROUNDS[0];
    this.temporaryAcquisitions = [];
    this.campaignUpgrades = {};this.selectedUpgradePlayerId=null;this.lastRewardSummary=null;
    this.tournament = null;
    this.campaignStats = {};
    this.expansionRunId=globalThis.crypto?.randomUUID?.()||null;this.expansionSubject=null;this.albumSubject=null;
    this.initialDraftOverall = null;this.initialDraft=null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }

  setScreen(screen) {
    if(this.getPendingReward()&&['MATCH','REVIEW','NEXT_RIVAL','OPPONENT','BRACKET','BRACKET_PREVIEW','CAMPAIGN_END'].includes(screen))screen='REWARD_CHOICE';
    this.currentScreen = screen;
    this.notify();
  }

  setRegion(region) {
    if(this.pendingDraftSlotId||this.currentScreen!=='START'||!['EUROPA','AMERICA'].includes(region))return false;
    this.region = region;
    this.notify();
    return true;
  }

  prepareFormationOffer(rng=Math.random) {
    if(this.pendingDraftSlotId||this.currentScreen!=='START')return false;
    if(!this.formationOffer.length)this.formationOffer=createFormationOffer(rng);
    this.selectedFormationId=null;this.formationConfirmed=false;
    this.setScreen('FORMATION');return true;
  }

  backToRegion() {
    if(this.currentScreen!=='FORMATION')return false;
    this.setScreen('START');return true;
  }

  setFormation(formationId) {
    if(this.pendingDraftSlotId||!DRAFT_CONFIG.FORMATIONS[formationId] || !['START','FORMATION'].includes(this.currentScreen))return false;
    if(this.currentScreen==='FORMATION'&&!this.formationOffer.includes(formationId))return false;
    this.selectedFormationId=formationId;
    if(this.currentScreen==='START')this.formationId=formationId; // compatible setup API; still requires confirmation.
    this.notify();return true;
  }

  confirmFormation(rng=Math.random) {
    if(this.currentScreen!=='FORMATION'||this.formationConfirmed||!this.formationOffer.includes(this.selectedFormationId))return false;
    this.formationId=this.selectedFormationId;this.formationConfirmed=true;
    if(!this.staff)this.staff={version:1,offer:coachOffer(rng),coachId:null,captainId:null};
    if(this.staff.coachId&&!this.startDraft())return false;
    this.notify();return true;
  }

  chooseCoach(id){
    if(this.currentScreen!=='FORMATION'||!this.formationConfirmed||this.staff?.coachId||!this.staff?.offer.includes(String(id))||!getCoach(id))return false;
    this.staff.coachId=String(id);if(!this.startDraft())return false;this.notify();return true;
  }
  chooseCaptain(id){
    if(this.currentScreen!=='REVIEW'||!this.staff||!this.getStartingXIList().some(p=>String(p.id)===String(id)))return false;
    this.staff.captainId=String(id);if(this.initialDraft&&!this.tournament?.history?.length&&(!this.survival||!(this.survival.wins+this.survival.losses)))this.initialDraft.captainId=String(id);this.squadMessage='Capitán elegido.';this.notify();return true;
  }
  matchCaptain(){
    return this.getStartingXIList().find(p=>p.id===this.staff?.captainId)||bestCaptain(this.getStartingXIList());
  }
  startDraft() {
    if(this.pendingDraftSlotId||!this.formationConfirmed||this.currentScreen!=='FORMATION'||this.staff&&!this.staff.coachId)return false;
    this.draftPlan = getDraftPlan(this.formationId);
    if(this.career&&!this.career.wildcardId)this.career.wildcard={version:1,status:'pending',step:'intro',slotId:null,cardKey:null};
    this.currentPickIndex = 0;
    this.startersMap = {};
    this.benchList = [];
    this.draftedIds = new Set();
    this.currentScreen = 'DRAFTING';
    this.activeDraftStep = null;
    this.currentCandidates = [];
    this.candidateCache = {};
    this.pendingDraftSlotId = null;
    this.recalculateSquadStats();
    return true;
  }

  openDraftSlot(slotId, rng = Math.random) {
    if(this.pendingDraftSlotId && slotId!==this.pendingDraftSlotId){this.squadMessage='Primero tenés que completar tu elección pendiente';return false;}
    if (this.currentScreen !== 'DRAFTING' || this.activeDraftStep || this.selectedSquadSlot) return false;
    const step = this.draftPlan.find(step => step.slotId === slotId);
    if (!step || (step.isStarter && this.startersMap[slotId])) return false;
    if (!step.isStarter && this.benchList.some(p => p.slotId === slotId)) return false;
    const cached = this.candidateCache[slotId];
    if(this.pendingDraftSlotId && (!cached||cached.length!==5||cached.some(p=>this.draftedIds.has(p.id)))){this.squadMessage='La elección pendiente no está disponible.';return false;}
    this.currentCandidates = cached && cached.every(p => !this.draftedIds.has(p.id)) ? cached : this.survival ? StateStore.survivalServices.offer(step.position,this.draftedIds,rng) : this.career ? StateStore.careerServices.offer(this,step.position,rng) : generatePickCandidates(this.region, step.position, this.draftedIds, rng);
    this.candidateCache[slotId] = this.currentCandidates;
    this.pendingDraftSlotId=slotId;
    this.activeDraftStep=step;this.squadMessage='';
    return true;
  }

  collectionWildcardPreview(cardKey,slotId){
    if(!this.career||this.survival||this.currentScreen!=='CAREER_WILDCARD'||this.career.wildcardId||this.career.wildcard?.status!=='pending'||this.pendingDraftSlotId||this.activeDraftStep||!this.getSquadReadiness().ready)return null;
    const old=this.getPlayerAtSlot(slotId),step=this.draftPlan.find(s=>s.slotId===slotId),player=StateStore.careerServices.collection(this,cardKey);
    if(!old||!step||!player||step.position==='GK'&&player.primaryPosition!=='GK'||this.getFullSquad().some(p=>p.slotId!==slotId&&String(p.sourcePlayerId||p.id)===String(player.sourcePlayerId||player.id))||step.position&&!StateStore.careerServices.fits(player,step.position))return null;
    const {card:record,...temporaryPlayer}=player;const incoming={...temporaryPlayer,slotId:old.slotId,slotPosition:step.isStarter?old.slotPosition:step.position||player.primaryPosition,energy:DRAFT_CONFIG.FATIGUE.INITIAL_ENERGY,collectionWildcard:true};
    const starters={...this.startersMap};if(step.isStarter)starters[slotId]=incoming;
    const chemistry=calculateChemistry(this.formationId,starters),ratings=calculateTeamRatings(Object.values(starters),chemistry.score,'BALANCED');
    return {old,incoming,chemistry,ratings,cardKey,slotId};
  }
  useCollectionCard(cardKey,slotId,expectedId=null){
    const preview=this.collectionWildcardPreview(cardKey,slotId);if(!preview||expectedId&&preview.old.id!==expectedId)return false;
    const {incoming,old}=preview;
    if(this.startersMap[slotId])this.startersMap[slotId]=incoming;else this.benchList=this.benchList.map(p=>p.slotId===slotId?incoming:p);
    this.draftedIds.delete(old.id);this.draftedIds.add(incoming.id);this.career.wildcardId=incoming.id;
    this.career.wildcard={...this.career.wildcard,status:'used',cardKey,slotId,outgoingId:old.id};
    this.confirmedLineup=null;this.selectedSquadSlot=null;this.squadCompletionPending=false;this.recalculateSquadStats();
    if(!this.tournament)this.beginTournament();this.currentScreen='REVIEW';this.notify();return true;
  }
  skipCollectionWildcard(){
    if(!this.career||this.survival||this.currentScreen!=='CAREER_WILDCARD'||this.career.wildcard?.status!=='pending'||this.pendingDraftSlotId||!this.getSquadReadiness().ready)return false;
    this.career.wildcard={...this.career.wildcard,status:'skipped',slotId:null,cardKey:null};this.squadCompletionPending=false;
    if(!this.tournament)this.beginTournament();this.currentScreen='REVIEW';this.notify();return true;
  }
  resumePendingPick(){
    if(!this.pendingDraftSlotId||this.currentScreen!=='DRAFTING')return false;
    this.selectedSquadSlot=null;return this.openDraftSlot(this.pendingDraftSlotId);
  }

  closeDraftPick() { this.activeDraftStep = null; this.currentCandidates = []; }

  getPlayerAtSlot(id) { return this.startersMap[id] || this.benchList.find(p => p.slotId === id) || (this.survival?.reserves||[]).find(p=>p.slotId===id); }

  getSquadReadiness() {
    const formation=DRAFT_CONFIG.FORMATIONS[this.formationId],reasons=[];
    if(!formation)return {ready:false,reasons:['La formación no es válida.']};
    const starters=formation.slots.map(s=>this.startersMap[s.id]),bench=DRAFT_CONFIG.BENCH_ROLES.map(s=>this.benchList.find(p=>p.slotId===s.id));
    if(Object.keys(this.startersMap).length!==11 || starters.some(p=>!p))reasons.push('Completá los once titulares.');
    if(this.benchList.length!==12 || bench.some(p=>!p) || new Set(this.benchList.map(p=>p.slotId)).size!==12)reasons.push('Completá las doce casillas del banco.');
    const players=[...starters,...bench].filter(Boolean);
    if(players.length!==23 || new Set(players.map(p=>p.id)).size!==23 || players.some(p=>!p.id || !p.name || !Number.isFinite(p.overall)))reasons.push('El plantel debe contener 23 futbolistas válidos y diferentes.');
    if(starters.some((p,i)=>p && (p.slotId!==formation.slots[i].id || p.slotPosition!==formation.slots[i].position)))reasons.push('Revisá la asignación de las posiciones titulares.');
    if(starters.find((p,i)=>formation.slots[i].position==='GK')?.primaryPosition!=='GK' || bench[0]?.primaryPosition!=='GK')reasons.push('El arquero titular y S1 deben ser arqueros.');
    return {ready:reasons.length===0,reasons};
  }

  confirmLineup() {
    if(this.currentScreen!=='REVIEW'||this.getPendingReward())return false;
    if(this.staff&&!this.staff.captainId){this.squadMessage='Elegí un capitán antes de continuar.';return false;}
    const readiness=this.getSquadReadiness();
    if(!readiness.ready || !this.tournament || this.tournament.status!=='active') {
      this.squadMessage=readiness.reasons.join(' ') || 'El torneo no está disponible.';
      return false;
    }
    this.recalculateSquadStats();
    this.confirmedLineup={formationId:this.formationId,starters:this.getStartingXIList().map(p=>({id:p.id,slotId:p.slotId})),bench:DRAFT_CONFIG.BENCH_ROLES.map(s=>({id:this.getPlayerAtSlot(s.id).id,slotId:s.id})),chemistry:this.chemistry.score,ratings:{...this.ratings},roundIndex:this.tournament.roundIndex};
    this.selectedSquadSlot=null;this.squadMessage='';
    this.setScreen('OPPONENT');
    return true;
  }

  canSwapSquadSlots(firstId, secondId) {
    const first = this.getPlayerAtSlot(firstId), second = this.getPlayerAtSlot(secondId);
    if (!first || !second || firstId === secondId) return false;
    const formation = DRAFT_CONFIG.FORMATIONS[this.formationId];
    const accepts = (id, player) => {
      const role = formation.slots.find(s => s.id === id) || DRAFT_CONFIG.BENCH_ROLES.find(s => s.id === id);
      if (!role) return !!(this.survival?.variant!=='DREAM_TEAM'&&this.survival?.reserves?.some(p=>p.slotId===id));
      // Reserve S1 and the starting goalkeeper accept real goalkeepers only.
      return role.position !== 'GK' || player.primaryPosition === 'GK';
    };
    return accepts(firstId, second) && accepts(secondId, first);
  }

  selectSquadSlot(slotId) {
    if (!['DRAFTING', 'REVIEW'].includes(this.currentScreen) || this.activeDraftStep) return false;
    if (!this.getPlayerAtSlot(slotId)) return false;
    if (!this.selectedSquadSlot) { this.selectedSquadSlot = slotId; this.squadMessage=''; return true; }
    const firstId = this.selectedSquadSlot;
    if (firstId === slotId) { this.selectedSquadSlot = null; this.squadMessage=''; return true; }
    if (!this.canSwapSquadSlots(firstId, slotId)) {this.squadMessage='Intercambio no permitido: el puesto de arquero y S1 solo aceptan arqueros.';return false;}
    const formation = DRAFT_CONFIG.FORMATIONS[this.formationId];
    const first = this.getPlayerAtSlot(firstId), second = this.getPlayerAtSlot(slotId);
    const write = (id, player) => {
      const target = formation.slots.find(s => s.id === id);
      const placed = { ...player, slotId: id, slotPosition: target ? target.position : player.primaryPosition };
      if (target) this.startersMap[id] = placed;
      else if(this.benchList.some(p=>p.slotId===id))this.benchList[this.benchList.findIndex(p => p.slotId === id)] = placed;else this.survival.reserves[this.survival.reserves.findIndex(p=>p.slotId===id)]={...placed,slotId:'reserve:'+placed.id};
    };
    write(firstId, second); write(slotId, first);
    if(this.survival&&[firstId,slotId].some(id=>id.startsWith('reserve:'))&&!this.getStartingXIList().some(p=>p.id===this.staff?.captainId))this.staff.captainId=bestCaptain(this.getStartingXIList())?.id??null;
    this.confirmedLineup=null;this.squadMessage='Intercambio realizado. Química y valoración actualizadas.';
    this.selectedSquadSlot = null;
    this.recalculateSquadStats();
    return true;
  }

  selectCandidate(candidate) {
    const currentStep = this.activeDraftStep;
    if (this.currentScreen!=='DRAFTING'||this.pendingDraftSlotId!==currentStep?.slotId||!currentStep || !candidate || this.draftedIds.has(candidate.id) || !this.currentCandidates.some(p => p.id === candidate.id)) return;

    if (this.getPlayerAtSlot(currentStep.slotId)) return;
    if (currentStep.position === 'GK' && candidate.primaryPosition !== 'GK') return;
    if(!candidate.collectionWildcard) StateStore.onDraftSelection?.(this,candidate);
    this.draftedIds.add(candidate.id);

    if (currentStep.isStarter) {
      this.startersMap[currentStep.slotId] = {
        ...candidate,
        slotId: currentStep.slotId,
        slotPosition: currentStep.position || candidate.primaryPosition
      };
    } else {
      this.benchList.push({
        ...candidate,
        slotId: currentStep.slotId,
        slotPosition: currentStep.position || candidate.primaryPosition
      });
    }

    this.currentPickIndex++;
    delete this.candidateCache[currentStep.slotId];this.pendingDraftSlotId=null;
    this.closeDraftPick();
    this.recalculateSquadStats();

    if (this.currentPickIndex >= this.draftPlan.length) {
      // Draft complete! Recalculate squad chemistry & ratings
      this.recalculateSquadStats();
      if(this.career&&this.career.wildcard?.status==='pending'&&!this.career.wildcardId){this.currentScreen='CAREER_WILDCARD';this.squadCompletionPending=false;}else{this.beginTournament();this.currentScreen='REVIEW';}
      this.squadCompletionPending = true;
    }
  }

  beginTournament(seed = Date.now()) {
    this.initialDraft??=captureOriginal(this);
    if(this.survival){StateStore.survivalServices.begin(this,seed);return;}
    this.tournament = this.career ? StateStore.careerServices.tournament(this,seed) : createTournament(this.region, seed);
    this.initialDraftOverall = this.ratings.overall;
    this.round = this.tournament.rounds[0].label;
    this.rivalSquad = getNextOpponent(this.tournament);
    this.getFullSquad().forEach(p => { p.energy ??= DRAFT_CONFIG.FATIGUE.INITIAL_ENERGY; });
  }

  completeRound(match, result) {
    if(this.survival)return StateStore.survivalServices.complete(this,match,result);
    if (!this.tournament || !recordRoundResult(this.tournament, result,{completeOnElimination:false})) return false;
    this.selectedUpgradePlayerId=null;this.selectedRivalPlayer=null;this.selectedReplacePlayerId=null;
    const planned=match.getPlanningSquad(true);
    this.startersMap=Object.fromEntries(planned.starters.map(p=>[p.slotId,p]));
    this.benchList=planned.bench;
    accumulatePlayerStats(this.campaignStats, match, result);
    const rivalPlan=match.getPlanningSquad(false);
    this.rivalSquad.startingXI=rivalPlan.starters;this.rivalSquad.bench=rivalPlan.bench;
    accumulatePlayerStats(this.rivalSquad.campaignStats,{playerPerformance:match.rivalPerformance,roundLabel:match.roundLabel},result);
    this.lastMatchResult = result;
    this.recalculateSquadStats();
    // Resolve the remaining NPC bracket after recording the eliminator's actual match squad.
    completeEliminatedTournament(this.tournament);
    return true;
  }

  getPendingReward(){return pendingReward(this.tournament);}
  openRewardChoices(){
    const reward=this.getPendingReward();if(!reward)return false;
    reward.choice=null;
    this.setScreen('REWARD_CHOICE');return true;
  }
  previewReward(type){
    const reward=this.getPendingReward();if(!reward||reward.type==='RECRUIT'||!['ACQUISITION','UPGRADE'].includes(type))return false;
    if(type==='UPGRADE'&&!this.getFullSquad().some(canUpgrade))return false;
    reward.choice=null;
    this.setScreen(type==='UPGRADE'?'UPGRADE_PLAYER':'STEAL_RIVAL');return true;
  }
  chooseReward(type){
    const reward=this.getPendingReward();if(!reward||reward.type==='RECRUIT'||!['ACQUISITION','UPGRADE'].includes(type))return false;
    if(type==='UPGRADE'&&!this.getFullSquad().some(canUpgrade))return false;
    reward.choice=type;this.selectedUpgradePlayerId=null;this.selectedRivalPlayer=null;this.selectedReplacePlayerId=null;
    this.setScreen(type==='UPGRADE'?'UPGRADE_PLAYER':'STEAL_RIVAL');return true;
  }
  upgradePlayer(id){
    const reward=this.getPendingReward(),player=this.getFullSquad().find(p=>String(p.id)===String(id));
    if(!reward||reward.type==='RECRUIT'||(reward.choice!==null&&reward.choice!=='UPGRADE')||!canUpgrade(player)||!this.getSquadReadiness().ready)return false;
    const boost=(this.campaignUpgrades[player.id]??player.campaignBoost??0)+1;
    const improved=campaignPlayer(player,boost);if(improved.overall!==player.overall+1)return false;
    if(this.startersMap[player.slotId]?.id===player.id)this.startersMap[player.slotId]=improved;
    else this.benchList=this.benchList.map(p=>p.id===player.id?improved:p);
    this.campaignUpgrades={...this.campaignUpgrades,[player.id]:boost};this.recalculateSquadStats();
    consumeReward(this.tournament,{type:'UPGRADE',playerId:player.id,before:player.overall,after:improved.overall});
    recordDreamReward(this,reward,{kind:'UPGRADE',playerId:player.id,before:player.overall,after:improved.overall});
    this.lastRewardSummary={type:'UPGRADE',name:player.name,before:player.overall,after:improved.overall};
    this.selectedUpgradePlayerId=null;this.confirmedLineup=null;return true;
  }

  acquireRivalPlayer(oldId, player) {
    const reward=this.getPendingReward();if(!reward||reward.type==='RECRUIT'||(reward.choice!==null&&reward.choice!=='ACQUISITION')||!player||!this.getSquadReadiness().ready)return false;
    player=[...this.rivalSquad.startingXI,...this.rivalSquad.bench].find(p=>p.id===player.id);if(!player)return false;
    const old=this.getFullSquad().find(p=>p.id===oldId);if(!old||(['gk','b1'].includes(old.slotId)&&player.primaryPosition!=='GK'))return false;
    if (!this.replaceSquadPlayer(oldId, { ...campaignPlayer(player,this.campaignUpgrades[player.id]||0), energy: DRAFT_CONFIG.FATIGUE.INITIAL_ENERGY })) return false;
    consumeReward(this.tournament,{type:'ACQUISITION',incomingId:player.id,outgoingId:oldId});
    recordDreamReward(this,reward,{kind:'ACQUISITION',outgoingId:oldId,player:this.getFullSquad().find(p=>p.id===player.id)});
    this.lastRewardSummary={type:'ACQUISITION',name:player.name};this.confirmedLineup=null;
    this.selectedRivalPlayer = null;
    this.selectedReplacePlayerId = null;
    StateStore.onPlayerObtained?.(this,player,'acquisition');
    return true;
  }

  advanceCampaign() {
    if(this.survival)return StateStore.survivalServices.advance(this);
    if (!this.tournament || !advanceTournament(this.tournament)) return false;
    for(const team of Object.values(this.tournament.teams)) for(const p of [...(team.startingXI||[]),...(team.bench||[])]) p.energy=Math.min(100,(p.energy??100)+DRAFT_CONFIG.TOURNAMENT.RECOVERY_BETWEEN_MATCHES);
    this.activeMatch = null;
    this.selectedSquadSlot = null;
    if (this.tournament.status === 'champion') { this.setScreen('CAMPAIGN_END'); return true; }
    this.getFullSquad().forEach(p => { p.energy = Math.min(DRAFT_CONFIG.FATIGUE.INITIAL_ENERGY, (p.energy ?? DRAFT_CONFIG.FATIGUE.INITIAL_ENERGY) + DRAFT_CONFIG.TOURNAMENT.RECOVERY_BETWEEN_MATCHES); });
    this.round = this.tournament.rounds[this.tournament.roundIndex].label;
    this.rivalSquad = getNextOpponent(this.tournament);
    this.recalculateSquadStats();
    this.setScreen('NEXT_RIVAL');
    return true;
  }

  recalculateSquadStats() {
    if(this.survival?.variant==='DREAM_TEAM')this.getFullSquad().forEach(p=>{p.collectionWildcard=false;p.normalDreamChemistry=true;});
    this.chemistry = calculateChemistry(this.formationId, Object.fromEntries(Object.entries(this.startersMap).filter(([,p])=>!p.sentOff)));
    const startersList = Object.values(this.startersMap).filter(p=>!p.sentOff);
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
    if (this.getFullSquad().some(p => p.id === newPlayer.id && p.id !== oldPlayerId)) return false;
    if (!this.getFullSquad().some(p => p.id === oldPlayerId)) return false;
    this.temporaryAcquisitions.push(newPlayer.id);
    const reassignedCaptain=this.staff?.captainId===oldPlayerId;
    // If in starters:
    for (const [slotId, p] of Object.entries(this.startersMap)) {
      if (p.id === oldPlayerId) {
        this.startersMap[slotId] = {
          ...newPlayer,
          slotId,
          slotPosition: p.slotPosition || newPlayer.primaryPosition,
          temporaryAcquisition: true
        };
        if(reassignedCaptain)this.staff.captainId=bestCaptain(this.getStartingXIList())?.id??null;
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
      if(reassignedCaptain)this.staff.captainId=bestCaptain(this.getStartingXIList())?.id??null;
      this.recalculateSquadStats();
      return true;
    }

    return false;
  }
}

export const state = new StateStore();
