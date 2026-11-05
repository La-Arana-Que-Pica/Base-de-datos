import {coachFactor,conversionFactor,coachedQuality,trackLeadership} from './coaching.js';
import {bestCaptain,activeCaptain} from './leadership.js';
import {DUEL_FIELDS,playPossession,actionQuality} from './duels.js';
import {initializeSpecialists} from './setPieceSpecialists.js';
/**
 * Match Engine for LAqP Draft
 * Decoupled from UI, supports seedable RNG for deterministic/reproducible simulations.
 * Incorporates XI strength, attack, midfield, defense, goalkeeper, fatigue, tactics, chemistry, and randomness.
 */

import {manageRivalTactics} from './tacticalDecisions.js';
import {setPieceTaker,resolveSetPieceCross,eligibleSetPiecePlayers} from './setPieces.js';
import { DRAFT_CONFIG } from '../config.js';
import { calculateTeamRatings, staminaDrain } from './teamRating.js';
import {getPositionFit} from './positions.js';
import { calculateChemistry } from './chemistry.js';
import { resetMatchStatus, goalkeeperWorkloadDrain, isGoalkeeper, effectiveGoalkeeperRating } from './fatigue.js';
import { selectShooter, selectDefender, selectBuilder, weightedAttributeScore } from './matchActions.js';
import { simulateMatchEvents, resolveFoul, resolveFreeKick, resolveInMatchPenalty, issueCard, injurePlayer } from './matchEvents.js';
import { resolveShootout, prepareShootout, validateShootoutOrder, selectShootoutKeeper } from './penalties.js';
import { manageRivalSubstitutions } from './rivalSubstitutions.js';
import {calculateMatchRating} from './playerMatchRating.js';
import {possessionPowers,controlProbability,clearChanceProbability} from './possessionModel.js';
import { shotProbability, targetProbability, goalProbability, clampProbability } from './matchProbabilities.js';

/**
 * Fast seedable PRNG (Mulberry32)
 */
export function createRng(seed = Date.now()) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  const rng = function mulberry32() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.getState=()=>s>>>0;
  rng.setState=value=>{if(!Number.isInteger(value)||value<0||value>4294967295)throw new Error('Estado RNG inválido');s=value>>>0;};
  return rng;
}

const COLLECTIVE_CREDITS={recoveries:'Recoveries',interceptions:'Interceptions',clearances:'Clearances',blocks:'Blocks',constructions:'Constructions',losses:'Losses',...Object.fromEntries(DUEL_FIELDS.map(k=>[k,k[0].toUpperCase()+k.slice(1)]))};

export class MatchEngine {
  constructor({
    userTeam,
    rivalTeam,
    userChemistry = null,
    roundLabel = '16avos de final',
    seed = Date.now(),
    onTick = null,
    onEvent = null,
    onFinish = null
  }) {
    this.coaches={user:userTeam.coachId??null,rival:rivalTeam.coachId??null};
    this.leadershipEnabled={user:userTeam.leadershipEnabled!==false,rival:rivalTeam.leadershipEnabled!==false};
    this.captains={user:userTeam.captainId??bestCaptain(userTeam.starters||[])?.id??null,rival:rivalTeam.captainId??bestCaptain(rivalTeam.startingXI||[])?.id??null};
    this.pregameOverall={user:(userTeam.starters||[]).reduce((s,p)=>s+p.overall,0)/Math.max(1,userTeam.starters?.length||0),rival:(rivalTeam.startingXI||[]).reduce((s,p)=>s+p.overall,0)/Math.max(1,rivalTeam.startingXI?.length||0)};
    this.entryMinutes={user:{},rival:{}};
    this.coachTelemetry={user:{activeMinutes:0,activations:0,captainMinutes:0,previousActive:false},rival:{activeMinutes:0,activations:0,captainMinutes:0,previousActive:false}};
    this.seed = seed;
    this.sportModelVersion = 'reform-2026-10-v1';
    this.roundLabel = roundLabel;
    this.playerPerformance = {};
    this.rivalPerformance = {};
    this.initialBenchIds = new Set((userTeam.bench||[]).map(p=>String(p.id)));
    this.rivalChemistry = rivalTeam.chemistry ?? 100;
    this.initialRivalChemistry = this.rivalChemistry;
    this.rivalFormation = rivalTeam.formation || 'Sin definir';
    this.rivalTactic = DRAFT_CONFIG.TACTICS[rivalTeam.tactic] ? rivalTeam.tactic : 'BALANCED';
    this.userSentOff=[];this.rivalSentOff=[];
    this.rivalBench = (rivalTeam.bench||[]).map(resetMatchStatus);
    this.extraTime = false;
    this.rng = createRng(seed);
    this.onTick = onTick;
    this.onEvent = onEvent;
    this.onFinish = onFinish;

    // Team references
    this.userTeamName = userTeam.name || 'Mi Draft';
    this.rivalTeamName = rivalTeam.name || 'Rival';
    this.rivalCrest = rivalTeam.crest || '../img/teams/default.webp';
    this.userChemistry = userChemistry ?? calculateChemistry(userTeam.formationId,Object.fromEntries((userTeam.starters||[]).map(p=>[p.slotId,p]))).score;
    this.initialUserChemistry=this.userChemistry;
    this.formationId = userTeam.formationId;
    this.departedIds = new Set();
    this.rivalDepartedIds = new Set();
    this.rivalInitialBenchIds = new Set((rivalTeam.bench||[]).map(player=>String(player.id)));
    this.rivalSubstitutionsUsed = 0;
    this.rivalSubstitutionWindowsUsed = 0;
    this.rivalSubstitutionWindowOpen = false;
    this.rivalLastSubstitutionMinute = -Infinity;

    // Lineups with individual energy tracking
    this.userStarters = (userTeam.starters || []).map(resetMatchStatus);
    this.userBench = (userTeam.bench || []).map(resetMatchStatus);

    this.rivalStarters = (rivalTeam.startingXI || []).map(resetMatchStatus);
    // Legacy callers may provide club lineup IDs rather than Draft slot IDs.
    // Infer the existing formation slots by role, without changing the caller's players.
    const formation=DRAFT_CONFIG.FORMATIONS[this.formationId]||DRAFT_CONFIG.FORMATIONS['4-3-3'];
    const available=formation.slots.filter(slot=>!this.userStarters.some(p=>p.slotId===slot.id));
    this.userGraphSlots={};this.kickoffUserMap={};
    for(const p of this.userStarters){
      const direct=formation.slots.find(slot=>slot.id===p.slotId);
      const index=direct?-1:Math.max(0,available.findIndex(slot=>slot.position===(p.slotPosition||p.primaryPosition)));
      const slot=direct||available.splice(index,1)[0];if(!slot)continue;
      this.userGraphSlots[p.id]=slot.id;p.slotX??=slot.x;p.slotY??=slot.y;this.kickoffUserMap[slot.id]={...p};
    }
    const kickoff=calculateChemistry(formation,this.kickoffUserMap);
    if(userChemistry===null){this.userChemistry=kickoff.score;this.initialUserChemistry=this.userChemistry;}
    for(const p of this.userStarters)p.matchChemistry=userTeam.individualChemistry?.[p.slotId]??userTeam.individualChemistry?.[this.userGraphSlots[p.id]]??kickoff.individuals[this.userGraphSlots[p.id]]?.score??5;
    for(const p of this.rivalStarters)p.matchChemistry=rivalTeam.individualChemistry?.[p.slotId]??10*getPositionFit(p,p.slotPosition||p.primaryPosition).chemistryMultiplier;
    this.planningSquads={user:{starters:this.userStarters.map(p=>({...p})),bench:this.userBench.map(p=>({...p}))},rival:{starters:this.rivalStarters.map(p=>({...p})),bench:this.rivalBench.map(p=>({...p}))}};

    // Tactics
    this.userTactic = 'BALANCED';
    this.userIntensity='NORMAL';this.rivalIntensity='NORMAL';this.rivalLastTacticalMinute=-Infinity;
    this.setPieces={user:{freeKick:null,indirectFreeKick:null,corner:null,penalty:null,approach:'AUTO'},rival:{freeKick:null,indirectFreeKick:null,corner:null,penalty:null,approach:'AUTO'}};
    initializeSpecialists(this);
    this.substitutionsUsed = 0;
    this.substitutionWindowsUsed = 0;
    this.substitutionWindowOpen = false;
    this.halftimePending = false;
    this.halftimeCompleted = false;
    // Fast, non-interactive simulations can advance through halftime directly.
    this.requiresHalftimeConfirmation = false;

    // Match clock & state
    this.minute = 0;
    this.userScore = 0;
    this.rivalScore = 0;
    this.isPaused = false;
    this.isFinished = false;
    this.penalties = null;
    this.shootoutPending = false;
    this.requiresShootoutSelection = false;
    this.shootoutOrder = null;

    // Stats
    this.stats = {
      userShots: 0,
      rivalShots: 0,
      userShotsOnTarget: 0,
      rivalShotsOnTarget: 0,
      userChances: 0,
      rivalChances: 0
    };

    for(const side of ['user','rival'])for(const stat of ['Assists','Fouls','YellowCards','RedCards','Penalties','FreeKicks','DirectFreeKicks','FreeKickGoals','Injuries','Saves','Errors','PlayerMinutes'])this.stats[side+stat]=0;
    this.events = [];
    this.actions=[];this.actionCounter=0;this.possessionOwner=null;this.pendingCorner=null;
    this.duelModelVersion=DRAFT_CONFIG.DUELS.VERSION;this.duelTrends={};this.lastDuelNarration=-100;this.transitionTeam=null;
    for(const side of ['user','rival'])for(const key of [...DUEL_FIELDS.map(k=>k[0].toUpperCase()+k.slice(1)),'PossessionSeconds','ClearChances','Corners','Recoveries','Interceptions','Clearances','Blocks','Constructions','Losses'])this.stats[side+key]=0;
    this.stats.userPossession=50;this.stats.rivalPossession=50;
    this.timerId = null;

    this.logEvent({
      minute: 0,
      type: 'start',
      team: 'neutral',
      text: `¡Comienza el partido de ${this.roundLabel} entre ${this.userTeamName} y ${this.rivalTeamName}!`
    });
  }

  logEvent(event) {
    if(!event.presentationOnly)event.actionId=this.recordAction(event.type,event.team==='user'?true:event.team==='rival'?false:null,null,{...event});
    this.events.unshift(event);
    if (this.onEvent) this.onEvent(event, this);
  }

  recordAction(type,isUser,player,details={}) {
    const action={...details,id:++this.actionCounter,minute:this.minute,type,team:isUser===null?'neutral':isUser?'user':'rival',playerId:player?.id??details.playerId};
    this.actions.push(action);return action.id;
  }
  credit(player,isUser,key,details={},journal=true) {
    if(!player)return;
    const record=this.performance(player,isUser);record[key]=(record[key]||0)+1;
    const collective=COLLECTIVE_CREDITS[key];
    if(collective)this.bumpStat(isUser,collective);
    if(journal)this.recordAction(key,isUser,player,details);record.rating=calculateMatchRating(record);
  }
  awardCorner(isUser) {
    this.bumpStat(isUser,'Corners');this.pendingCorner=isUser;
    this.logEvent({minute:this.minute,type:'corner',team:isUser?'user':'rival',text:'Córner para '+(isUser?this.userTeamName:this.rivalTeamName)+'.'});
  }

  setTactic(tacticId) {
    if (this.isFinished) return;
    if (['DEFENSIVE', 'BALANCED', 'OFFENSIVE'].includes(tacticId)) {
      this.userTactic = tacticId;
      const tInfo = DRAFT_CONFIG.TACTICS[tacticId];
      this.logEvent({
        minute: this.minute,
        type: 'tactic',
        team: 'user',
        text: `Cambio táctico: planteamiento ${tInfo.label.toUpperCase()}.`
      });
    }
  }

  setIntensity(id){
    if(this.isFinished||this.shootoutPending||!DRAFT_CONFIG.INTENSITIES[id])return false;
    if(this.userIntensity===id)return true;
    this.userIntensity=id;this.logEvent({minute:this.minute,type:'intensity',team:'user',text:'Intensidad activa: '+DRAFT_CONFIG.INTENSITIES[id].label+'.'});return true;
  }
  configureSetPieces(settings){
    if(this.isFinished||this.shootoutPending||this.minute>0&&!this.isPaused)return false;
    const pool=eligibleSetPiecePlayers(this),next={...this.setPieces.user};
    for(const key of ['freeKick','indirectFreeKick','corner','penalty'])if(key in settings){const id=settings[key];if(id!==null&&!pool.some(p=>String(p.id)===String(id)))return false;next[key]=id;}
    if('approach' in settings){if(!['AUTO','SHOT','CROSS'].includes(settings.approach))return false;next.approach=settings.approach;}
    this.setPieces.user=next;return true;
  }

  substitute(playerOutId, playerInId, isUser=true, halftime=false) {
    const starters=isUser?this.userStarters:this.rivalStarters,bench=isUser?this.userBench:this.rivalBench;
    const departed=isUser?this.departedIds:this.rivalDepartedIds;
    const countKey=isUser?'substitutionsUsed':'rivalSubstitutionsUsed',windowsKey=isUser?'substitutionWindowsUsed':'rivalSubstitutionWindowsUsed',openKey=isUser?'substitutionWindowOpen':'rivalSubstitutionWindowOpen';
    if (this.isFinished || this.shootoutPending) return { success: false, message: 'Partido terminado.' };
    if (departed.has(String(playerInId))) return { success: false, message: 'Un jugador sustituido no puede volver a entrar.' };
    if (this[countKey] >= DRAFT_CONFIG.MAX_SUBSTITUTIONS) {
      return { success: false, message: 'No quedan cambios disponibles.' };
    }
    if (!this.halftimePending && !halftime && !this[openKey] && this[windowsKey] >= DRAFT_CONFIG.MAX_SUBSTITUTION_WINDOWS) {
      return { success: false, message: 'No quedan ventanas de cambios disponibles.' };
    }

    const outIndex = starters.findIndex(p => String(p.id) === String(playerOutId));
    const inIndex = bench.findIndex(p => String(p.id) === String(playerInId));

    if (outIndex === -1 || inIndex === -1) {
      return { success: false, message: 'Jugadores no válidos para el cambio.' };
    }

    const playerOut = starters[outIndex];
    const playerIn = bench[inIndex];

    if(playerIn.injured || playerIn.sentOff)return {success:false,message:'Jugador no disponible.'};
    // Swap
    starters[outIndex] = {
      ...playerIn,
      slotId: playerOut.slotId,
      slotPosition: playerOut.slotPosition,
      slotX:playerOut.slotX,slotY:playerOut.slotY,
      energy: playerIn.energy ?? DRAFT_CONFIG.FATIGUE.INITIAL_ENERGY
    };
    const graphSlot=this.userGraphSlots[playerOut.id]??playerOut.slotId;
    if(isUser)this.userGraphSlots[playerIn.id]=graphSlot;
    starters[outIndex].matchChemistry=null; // No individual chemistry applies to bench entrants.
    bench.splice(inIndex, 1);
    bench.push({ ...playerOut, slotId: playerIn.slotId, substitutedOut:true });
    departed.add(String(playerOut.id));
    const injuryReplacement=playerOut.injured && this.actions.some(a=>a.type==='injury'&&a.team===(isUser?'user':'rival')&&String(a.playerId)===String(playerOut.id));
    starters[outIndex].superSubActive = (isUser?this.initialBenchIds:this.rivalInitialBenchIds).has(String(playerIn.id)) && playerIn.hasSuperSub === true && (this.halftimePending || this.minute >= DRAFT_CONFIG.SUPER_SUB_MINUTE || this.extraTime || injuryReplacement);
    if(starters[outIndex].superSubActive) this.logEvent({minute:this.minute,type:'super-sub',team:isUser?'user':'rival',text:'⚡ SUPER REFUERZO ACTIVADO: '+playerIn.name+' · +3 OVR temporal'});
    // Collective chemistry belongs to the kickoff XI and stays frozen.

    const appearance = this.performance(starters[outIndex], isUser);
    appearance.benchEntries++;
    this.entryMinutes[isUser?'user':'rival'][String(playerIn.id)]=this.halftimePending||halftime?46:this.minute;
    activeCaptain(this,isUser);
    if (!this.halftimePending && !halftime && !this[openKey]) {
      this[windowsKey]++;
      this[openKey] = true;
    }
    this[countKey]++;

    this.logEvent({
      minute: this.minute,
      type: 'sub',
      team: isUser?'user':'rival',
      playerOutId: playerOut.id, playerInId: playerIn.id, halftime: this.halftimePending || halftime,
      text: `CAMBIO: Entra ${playerIn.name} (${playerIn.primaryPosition}), sale ${playerOut.name}.`
    });

    return { success: true, playerOut, playerIn };
  }

  canSubstitute() {
    return !this.isFinished && !this.shootoutPending && this.substitutionsUsed < DRAFT_CONFIG.MAX_SUBSTITUTIONS &&
      (this.halftimePending || this.substitutionWindowOpen || this.substitutionWindowsUsed < DRAFT_CONFIG.MAX_SUBSTITUTION_WINDOWS);
  }

  continueSecondHalf() {
    if (!this.halftimePending || this.isFinished) return false;
    this.halftimePending = false;
    this.halftimeCompleted = true;
    this.substitutionWindowOpen = false;
    this.isPaused = false;
    return true;
  }

  getEffectiveRatings() {
    const user=calculateTeamRatings(this.userStarters,this.userChemistry,this.userTactic,true);
    const rival=calculateTeamRatings(this.rivalStarters,this.rivalChemistry,this.rivalTactic,true);
    const pack=(r,xi)=>{const numerical=DRAFT_CONFIG.MATCH_EVENTS.MAN_DOWN_FACTOR**Math.max(0,DRAFT_CONFIG.STARTING_XI_SIZE-xi.length);return {att:r.effectiveAttack*numerical,mid:r.effectiveMidfield*numerical,def:r.effectiveDefense*numerical,gk:r.effectiveGoalkeeper*(xi.some(isGoalkeeper)?1:DRAFT_CONFIG.MATCH_EVENTS.MISSING_GK_FACTOR),base:r};};
    const ratings={user:pack(user,this.userStarters),rival:pack(rival,this.rivalStarters)};
    for(const isUser of [true,false]){const keeper=this.goalkeeper(isUser),side=isUser?'user':'rival';if(keeper)ratings[side].gk=coachedQuality(this,isUser,keeper,ratings[side].gk,effectiveGoalkeeperRating({...keeper,superSubActive:false}));}
    return ratings;
  }

  players(isUser) { return isUser?this.userStarters:this.rivalStarters; }
  goalkeeper(isUser) { return this.players(isUser).find(isGoalkeeper); }
  getAllPlayers(isUser=true) { return [...this.players(isUser),...(isUser?this.userBench:this.rivalBench),...(isUser?this.userSentOff:this.rivalSentOff)]; }
  getCampaignLineup(isUser=true) { return [...this.players(isUser),...(isUser?this.userSentOff:this.rivalSentOff)].map(resetMatchStatus); }
  getPlanningSquad(isUser=true) {
    const base=this.planningSquads[isUser?'user':'rival'],live=new Map(this.getAllPlayers(isUser).map(p=>[p.id,p]));
    const restore=p=>{const latest=live.get(p.id)||p;return {...resetMatchStatus({...p,...latest}),slotId:p.slotId,slotPosition:p.slotPosition,injured:latest.injured===true};};
    return {starters:base.starters.map(restore),bench:base.bench.map(restore)};
  }
  recalculateMatchChemistry(isUser) {
    return isUser?this.initialUserChemistry:this.initialRivalChemistry; // compatibility: never recalculate during play.
  }
  bumpStat(isUser,key,amount=1) { const field=(isUser?'user':'rival')+key;this.stats[field]=(this.stats[field]||0)+amount; }
  recordAttempt(isUser,player,onTarget) {
    this.bumpStat(isUser,'Shots');this.performance(player,isUser).shots++;
    this.recordAction('shot-attempt',isUser,player,{onTarget});
    if(onTarget){this.bumpStat(isUser,'ShotsOnTarget');this.performance(player,isUser).shotsOnTarget++;}
  }
  goalkeeperIntervention(keeper,isUser,work={}) {
    if(!keeper)return;
    const record=this.performance(keeper,isUser),drain=goalkeeperWorkloadDrain(keeper,work);
    keeper.energy=Math.max(DRAFT_CONFIG.FATIGUE.MIN_ENERGY,keeper.energy-drain);
    keeper.goalkeeperWorkload+=drain;record.goalkeeperWorkload+=drain;record.shotsFaced++;
    if(work.difficult&&work.saved)record.difficultSaves++;
    if(work.onTarget||work.penalty)record.interventions++;
    if(work.penalty)record.penaltiesFaced++;
    if(work.saved){record.saves++;this.bumpStat(isUser,'Saves');}
    record.rating=calculateMatchRating(record);
  }
  recordGoal(isUser,scorer,context={kind:'individual'}) {
    if(isUser)this.userScore++;else this.rivalScore++;
    const record=this.performance(scorer,isUser);record.goals++;
    const weight=context.kind==='penalty'?DRAFT_CONFIG.PLAYER_RATING.PENALTY_GOAL:context.kind==='direct-free-kick'?DRAFT_CONFIG.PLAYER_RATING.FREE_KICK_GOAL:DRAFT_CONFIG.PLAYER_RATING.GOAL;
    this.rate(scorer,isUser,weight);
    if(this.minute>=75&&(isUser?this.userScore-this.rivalScore:this.rivalScore-this.userScore)===1){record.decisiveGoals=(record.decisiveGoals||0)+1;this.rate(scorer,isUser,.12);}
    const keeper=this.goalkeeper(!isUser);if(keeper){this.performance(keeper,!isUser).goalsConceded++;this.rate(keeper,!isUser,DRAFT_CONFIG.PLAYER_RATING.CONCEDED);}
    const assist=['penalty','direct-free-kick','rebound','error','individual'].includes(context.kind)||context.assist?.id===scorer.id||!this.players(isUser).some(p=>p.id===context.assist?.id)?null:context.assist;
    if(assist && assist.id!==scorer.id){this.performance(assist,isUser).assists++;this.bumpStat(isUser,'Assists');this.rate(assist,isUser,DRAFT_CONFIG.PLAYER_RATING.ASSIST);}
    if(context.errorPlayer){this.performance(context.errorPlayer,!isUser).errors++;this.bumpStat(!isUser,'Errors');this.rate(context.errorPlayer,!isUser,DRAFT_CONFIG.PLAYER_RATING.ERROR);}
    const suffix=context.kind==='penalty'?' · Penal':context.kind==='direct-free-kick'?' · Tiro libre directo':context.kind==='rebound'?' · Rebote':context.kind==='error'?' · Error de '+context.errorPlayer?.name:context.kind==='individual'?' · Jugada individual':'';
    this.logEvent({minute:this.minute,type:'goal',team:isUser?'user':'rival',playerName:scorer.name,playerId:scorer.id,scorerId:scorer.id,assistId:assist?.id??null,goalKind:context.kind,setPieceSource:context.setPieceSource||null,text:'⚽ GOL de '+scorer.name+suffix+' ('+this.userScore+'–'+this.rivalScore+')'+(assist?' · Asistencia: '+assist.name:'')});
  }
  resolveFoul(options) { return resolveFoul(this,options); }
  resolveFreeKick(isUser,zone) { return resolveFreeKick(this,isUser,zone); }
  resolveInMatchPenalty(isUser) { return resolveInMatchPenalty(this,isUser); }
  issueCard(player,isUser,card) { return issueCard(this,player,isUser,card); }
  injurePlayer(player,isUser) { return injurePlayer(this,player,isUser); }

  performance(player,isUser) {
    const records=isUser?this.playerPerformance:this.rivalPerformance;
    return records[player.id] ||= {id:player.id,name:player.name,minutes:0,goals:0,assists:0,shots:0,shotsOnTarget:0,benchEntries:0,yellowCards:0,redCards:0,fouls:0,errors:0,freeKicks:0,freeKickGoals:0,penaltiesTaken:0,penaltyGoals:0,penaltiesMissed:0,penaltySaves:0,interventions:0,shotsFaced:0,saves:0,penaltiesFaced:0,goalkeeperWorkload:0,position:player.slotPosition||player.primaryPosition,recoveries:0,interceptions:0,clearances:0,blocks:0,constructions:0,chancesCreated:0,possessionTouches:0,losses:0,...Object.fromEntries(DUEL_FIELDS.map(k=>[k,0])),effortEnergy:0,decisiveGoals:0,clearMisses:0,difficultSaves:0,goalsConceded:0,ratingAdjustment:0,rating:DRAFT_CONFIG.PLAYER_RATING.BASE};
  }
  rate(player,isUser,delta) {
    const r=this.performance(player,isUser);
    r.ratingAdjustment=(r.ratingAdjustment||0)+delta;
    r.rating=calculateMatchRating(r);
  }

  tick() {
    if (this.isPaused || this.isFinished || this.halftimePending || this.shootoutPending) return;

    // A stoppage closes only when sporting time actually advances.
    this.substitutionWindowOpen = false;
    this.rivalSubstitutionWindowOpen = false;

    this.minute++;
    trackLeadership(this);

    for(const [side,xi,tactic] of [[true,this.userStarters,this.userTactic],[false,this.rivalStarters,this.rivalTactic]]) {
      this.bumpStat(side,'PlayerMinutes',xi.length);
      for(const p of xi) {
        const appearance=this.performance(p,side);appearance.minutes++;appearance.rating=calculateMatchRating(appearance);
        p.energy=Math.max(DRAFT_CONFIG.FATIGUE.MIN_ENERGY,p.energy-staminaDrain(p,tactic,side?this.userIntensity:this.rivalIntensity)*(isGoalkeeper(p)?1:coachFactor(this,side,'fatigue',p)));
      }
    }

    manageRivalTactics(this);if(this.userAutoTactics===true)manageRivalTactics(this,true);
    // Match Simulation Step for this minute
    this.simulateMinuteEvents();
    if (this.minute < DRAFT_CONFIG.EXTRA_TIME_END && (this.minute < DRAFT_CONFIG.MATCH_DURATION_MINUTES || this.userScore === this.rivalScore || this.extraTime)) {manageRivalSubstitutions(this);if(this.userAutoSubstitutions===true)manageRivalSubstitutions(this,true);}

    // Halftime follows every event of minute 45 and precedes minute 46.
    if (this.minute === 45) {
      this.logEvent({minute:45,type:'halftime',team:'neutral',text:`ENTRETIEMPO · ${this.userTeamName} ${this.userScore} - ${this.rivalScore} ${this.rivalTeamName}.`});
      if (this.requiresHalftimeConfirmation) {
        this.halftimePending = true;
        this.isPaused = true;
        this.stopTimer();
      } else this.halftimeCompleted = true;
    }

    // Check fulltime
    if(this.minute === DRAFT_CONFIG.MATCH_DURATION_MINUTES && this.userScore === this.rivalScore) {
      this.extraTime=true;
      this.logEvent({minute:90,type:'extra-time',team:'neutral',text:'ALARGUE · 90–105 y 105–120. Energía, táctica y cambios continúan.'});
    }
    if (this.onTick) this.onTick(this);
    if((this.minute === DRAFT_CONFIG.MATCH_DURATION_MINUTES && !this.extraTime) || this.minute >= DRAFT_CONFIG.EXTRA_TIME_END) this.finishMatch();
    if(this.minute===105) this.logEvent({minute:105,type:'extra-time',team:'neutral',text:'Segundo tiempo del ALARGUE · hasta 120′.'});
  }

  simulateMinuteEvents() {
    const ratings=this.getEffectiveRatings(),powers=possessionPowers(this,ratings),c=DRAFT_CONFIG.POSSESSION_MODEL;
    for(let sequence=0;sequence<c.SEQUENCES_PER_MINUTE;sequence++){
      const isUser=this.pendingCorner!==null?this.pendingCorner:this.rng()<controlProbability(powers,this.possessionOwner);
      const setPiece=this.pendingCorner!==null;this.pendingCorner=null;this.possessionOwner=isUser;
      this.bumpStat(isUser,'PossessionSeconds',60/c.SEQUENCES_PER_MINUTE);
      const seconds=this.stats.userPossessionSeconds+this.stats.rivalPossessionSeconds;
      this.stats.userPossession=Math.round(this.stats.userPossessionSeconds/seconds*1000)/10;
      this.stats.rivalPossession=Number((100-this.stats.userPossession).toFixed(1));
      if(setPiece){this.transitionTeam=null;resolveSetPieceCross(this,isUser,'corner',setPieceTaker(this,isUser,'corner'));continue;}
      playPossession(this,isUser,ratings);
    }
    simulateMatchEvents(this);
  }

  resolveAttack(isUser,ratings,contextOverride=null) {
    const squad=this.players(isUser),attack=isUser?ratings.user:ratings.rival,defense=isUser?ratings.rival:ratings.user;
    const shooter=contextOverride?.shooter||selectShooter(squad,this.rng);if(!shooter)return;
    this.bumpStat(isUser,'Chances');
    const powers=possessionPowers(this,ratings),a=isUser?powers.user:powers.rival,d=isUser?powers.rival:powers.user;
    const qualityRoll=this.rng(),clear=qualityRoll<(contextOverride?.clearProbability??clearChanceProbability(a,d));
    const chanceKind=clear?'clear':qualityRoll>.82?'low':'normal';
    if(clear)this.bumpStat(isUser,'ClearChances');
    const creator=contextOverride?.builder||contextOverride?.assist;
    if(creator&&creator.id!==shooter.id)this.credit(creator,isUser,'chancesCreated',{shooterId:shooter.id,chanceKind});
    const context={...contextOverride,setPieceSource:['corner','indirect-free-kick'].includes(contextOverride?.kind)?contextOverride.kind:null,kind:contextOverride?.kind==='indirect-free-kick'?'indirect-free-kick':creator&&creator.id!==shooter.id?'assisted':'individual',assist:creator&&creator.id!==shooter.id?creator:null};
    this.logEvent({minute:this.minute,type:'opportunity',presentationOnly:true,team:isUser?'user':'rival',playerId:shooter.id,playerName:shooter.name,dangerous:clear,chanceKind,source:context.setPieceSource,text:context.setPieceSource?shooter.name+' llega al remate tras el centro de '+creator.name+'.':shooter.name+' encuentra '+(clear?'una ocasión clara.':'espacio para rematar.')});
    this.recordAction('chance',isUser,shooter,{chanceKind,creatorId:creator?.id??null});
    if(this.rng()>shotProbability(attack.att,defense.def)){
      this.possessionOwner=!isUser;
      const blocker=selectDefender(this.players(!isUser).filter(p=>!isGoalkeeper(p)),this.rng);
      this.credit(blocker,!isUser,'blocks');if(blocker)this.rate(blocker,!isUser,DRAFT_CONFIG.PLAYER_RATING.BLOCK);
      this.logEvent({minute:this.minute,type:'defense',team:isUser?'rival':'user',playerId:blocker?.id,text:'Cierre defensivo de '+(blocker?.name||'la defensa')+' ante '+shooter.name+'.'});
      if(this.rng()<DRAFT_CONFIG.POSSESSION_MODEL.CORNER_ON_BLOCK)this.awardCorner(isUser);
      return;
    }
    const finishing=coachedQuality(this,isUser,shooter,actionQuality(shooter,'finish'),actionQuality({...shooter,superSubActive:false},'finish')),keeper=this.goalkeeper(!isUser);
    const onTarget=this.rng()<targetProbability(finishing,clear)*(chanceKind==='low'?.85:1);
    if(context.assist)this.credit(context.assist,isUser,'keyPasses',{shooterId:shooter.id});
    this.recordAttempt(isUser,shooter,onTarget);
    if(!onTarget){
      this.possessionOwner=!isUser;this.goalkeeperIntervention(keeper,!isUser);
      if(clear)this.credit(shooter,isUser,'clearMisses');
      this.rate(shooter,isUser,DRAFT_CONFIG.PLAYER_RATING.WIDE);
      this.logEvent({minute:this.minute,type:'shot',team:isUser?'user':'rival',playerId:shooter.id,chanceKind,text:'Remate de '+shooter.name+' que se va desviado.'});return;
    }
    this.rate(shooter,isUser,DRAFT_CONFIG.PLAYER_RATING.TARGET);
    const scored=!keeper||this.rng()<Math.min(.95,goalProbability(finishing,defense.gk,clear)*(chanceKind==='low'?.70:1)*conversionFactor(this,isUser,shooter,{...context,clear}));
    this.possessionOwner=!isUser;this.goalkeeperIntervention(keeper,!isUser,{onTarget:true,saved:!scored,difficult:!scored&&clear});
    if(scored)this.recordGoal(isUser,shooter,context);
    else{
      if(clear)this.credit(shooter,isUser,'clearMisses');
      if(keeper)this.rate(keeper,!isUser,DRAFT_CONFIG.PLAYER_RATING.SAVE);
      this.logEvent({minute:this.minute,type:'save',team:isUser?'rival':'user',playerId:keeper?.id,shooterId:shooter.id,chanceKind,text:'¡Atajada de '+(keeper?.name||'la defensa')+' ante '+shooter.name+'!'});
      if(this.rng()<DRAFT_CONFIG.POSSESSION_MODEL.CORNER_ON_SAVE)this.awardCorner(isUser);
    }
  }

  finishMatch() {
    if (this.isFinished) return;
    if (this.userScore === this.rivalScore && this.requiresShootoutSelection && this.shootoutOrder === null) {
      this.shootoutPending = true;this.isPaused = true;this.stopTimer();
      return;
    }
    this.isFinished = true;
    this.stopTimer();

    // Tick reaches this draw only at the end of extra time.
    if (this.userScore === this.rivalScore) {
      this.resolvePenaltyShootout();
    }

    const userWon = this.userScore > this.rivalScore || Boolean(this.penalties && this.penalties.user > this.penalties.rival);

    this.logEvent({
      minute: this.minute,
      type: 'end',
      team: 'neutral',
      text: userWon
        ? `¡Final del partido! Victoria de ${this.userTeamName}. ¡Avanzaste a la siguiente ronda!`
        : `¡Final del partido! Derrota de ${this.userTeamName}. Fin del torneo en ${this.roundLabel}.`
    });

    if (this.onFinish) {
      this.onFinish({
        ...(this.initialForecast?{initialForecast:structuredClone(this.initialForecast)}:{}),
        duration: this.minute,
        extraTime: this.extraTime,
        userWon,
        userScore: this.userScore,
        rivalScore: this.rivalScore,
        penalties: this.penalties,
        stats: this.stats,
        events: this.events,
        actions:this.actions
      }, this);
    }
  }

  getShootoutPreparation() { return prepareShootout(this.userStarters,this.rivalStarters); }

  confirmShootoutOrder(ids) {
    if(!this.shootoutPending||this.isFinished)return false;
    const prepared=this.getShootoutPreparation();
    if(!validateShootoutOrder(prepared.home,ids))return false;
    this.shootoutOrder=ids.map(String);this.shootoutPending=false;
    this.finishMatch();return true;
  }

  resolvePenaltyShootout() {
    const result=resolveShootout(this.userStarters,this.rivalStarters,this.rng,kick=>{const defendingUser=kick.side!=='home',keeper=selectShootoutKeeper(this.players(defendingUser));if(keeper){const drain=goalkeeperWorkloadDrain(keeper,{penalty:true});keeper.energy=Math.max(DRAFT_CONFIG.FATIGUE.MIN_ENERGY,keeper.energy-drain);keeper.goalkeeperWorkload+=drain;const record=this.performance(keeper,defendingUser);record.goalkeeperWorkload+=drain;record.shootoutPenaltiesFaced=(record.shootoutPenaltiesFaced||0)+1;}this.logEvent({minute:this.minute,type:'penalty-kick',playerName:kick.name,playerId:kick.playerId,team:kick.side==='home'?'user':'rival',text:kick.name+' '+(kick.scored?'✅':'❌')+(kick.suddenDeath?' · Muerte súbita':'')});},this.shootoutOrder);
    this.penalties={user:result.home,rival:result.away,kicks:result.kicks};
    this.logEvent({minute:this.minute,type:'penalties',team:'neutral',text:'Penales: '+result.home+'–'+result.away});
  }

  start() {
    if(this.playback)return this.playback.resume();
    if (this.timerId || this.isFinished) return;
    if (this.halftimePending) return false;
    this.requiresHalftimeConfirmation = true;
    this.isPaused = false;
    this.timerId = window.setInterval(() => {
      this.tick();
    }, DRAFT_CONFIG.SIMULATION_TICK_MS);
  }

  pause() {
    if(this.playback)return this.playback.pause();
    this.isPaused = true;
    this.stopTimer();
  }

  resume() {
    if(this.playback)return this.playback.resume();
    if (this.isFinished || this.halftimePending) return false;
    this.isPaused = false;
    this.start();
  }

  stopTimer() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
