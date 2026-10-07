/**
 * Match Engine for LAqP Draft
 * Decoupled from UI, supports seedable RNG for deterministic/reproducible simulations.
 * Incorporates XI strength, attack, midfield, defense, goalkeeper, fatigue, tactics, chemistry, and randomness.
 */

import { DRAFT_CONFIG } from '../config.js';
import { calculateTeamRatings } from './teamRating.js';

/**
 * Fast seedable PRNG (Mulberry32)
 */
export function createRng(seed = Date.now()) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return function mulberry32() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MatchEngine {
  constructor({
    userTeam,
    rivalTeam,
    userChemistry = 50,
    seed = Date.now(),
    onTick = null,
    onEvent = null,
    onFinish = null
  }) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.onTick = onTick;
    this.onEvent = onEvent;
    this.onFinish = onFinish;

    // Team references
    this.userTeamName = userTeam.name || 'Mi Draft';
    this.rivalTeamName = rivalTeam.name || 'Rival';
    this.rivalCrest = rivalTeam.crest || '../img/teams/default.webp';
    this.userChemistry = userChemistry;

    // Lineups with individual stamina tracking
    this.userStarters = (userTeam.starters || []).map(p => ({
      ...p,
      stamina: DRAFT_CONFIG.FATIGUE.INITIAL_STAMINA
    }));
    this.userBench = (userTeam.bench || []).map(p => ({
      ...p,
      stamina: DRAFT_CONFIG.FATIGUE.INITIAL_STAMINA
    }));

    this.rivalStarters = (rivalTeam.startingXI || []).map(p => ({
      ...p,
      stamina: DRAFT_CONFIG.FATIGUE.INITIAL_STAMINA
    }));

    // Tactics
    this.userTactic = 'BALANCED';
    this.substitutionsUsed = 0;

    // Match clock & state
    this.minute = 0;
    this.userScore = 0;
    this.rivalScore = 0;
    this.isPaused = false;
    this.isFinished = false;
    this.penalties = null;

    // Stats
    this.stats = {
      userShots: 0,
      rivalShots: 0,
      userShotsOnTarget: 0,
      rivalShotsOnTarget: 0,
      userChances: 0,
      rivalChances: 0
    };

    this.events = [];
    this.timerId = null;

    this.logEvent({
      minute: 0,
      type: 'start',
      team: 'neutral',
      text: `¡Comienza el partido de 16avos de Final entre ${this.userTeamName} y ${this.rivalTeamName}!`
    });
  }

  logEvent(event) {
    this.events.unshift(event);
    if (this.onEvent) this.onEvent(event, this);
  }

  setTactic(tacticId) {
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

  substitute(playerOutId, playerInId) {
    if (this.substitutionsUsed >= DRAFT_CONFIG.MAX_SUBSTITUTIONS) {
      return { success: false, message: 'No quedan cambios disponibles.' };
    }

    const outIndex = this.userStarters.findIndex(p => String(p.id) === String(playerOutId));
    const inIndex = this.userBench.findIndex(p => String(p.id) === String(playerInId));

    if (outIndex === -1 || inIndex === -1) {
      return { success: false, message: 'Jugadores no válidos para el cambio.' };
    }

    const playerOut = this.userStarters[outIndex];
    const playerIn = this.userBench[inIndex];

    // Swap
    this.userStarters[outIndex] = {
      ...playerIn,
      stamina: playerIn.stamina || DRAFT_CONFIG.FATIGUE.INITIAL_STAMINA
    };
    this.userBench.splice(inIndex, 1);
    this.userBench.push(playerOut);

    this.substitutionsUsed++;

    this.logEvent({
      minute: this.minute,
      type: 'sub',
      team: 'user',
      text: `CAMBIO: Entra ${playerIn.name} (${playerIn.primaryPosition}), sale ${playerOut.name}.`
    });

    return { success: true, playerOut, playerIn };
  }

  getEffectiveRatings() {
    // User dynamic ratings
    const baseUserRatings = calculateTeamRatings(this.userStarters, this.userChemistry, this.userTactic);

    // Apply fatigue penalties
    const { TIRED_THRESHOLD, PERFORMANCE_PENALTY_PER_POINT } = DRAFT_CONFIG.FATIGUE;
    const avgStamina = this.userStarters.reduce((acc, p) => acc + p.stamina, 0) / (this.userStarters.length || 1);
    let fatiguePenalty = 0;
    if (avgStamina < TIRED_THRESHOLD) {
      fatiguePenalty = (TIRED_THRESHOLD - avgStamina) * PERFORMANCE_PENALTY_PER_POINT;
    }

    const userEffAtt = Math.round(baseUserRatings.effectiveAttack * (1 - fatiguePenalty));
    const userEffMid = Math.round(baseUserRatings.effectiveMidfield * (1 - fatiguePenalty));
    const userEffDef = Math.round(baseUserRatings.effectiveDefense * (1 - fatiguePenalty));
    const userEffGk = Math.round(baseUserRatings.effectiveGoalkeeper * (1 - fatiguePenalty));

    // Rival ratings (neutral chemistry & balanced tactic)
    const baseRivalRatings = calculateTeamRatings(this.rivalStarters, 50, 'BALANCED');
    const rivalAvgStamina = this.rivalStarters.reduce((acc, p) => acc + p.stamina, 0) / (this.rivalStarters.length || 1);
    let rivalFatigue = 0;
    if (rivalAvgStamina < TIRED_THRESHOLD) {
      rivalFatigue = (TIRED_THRESHOLD - rivalAvgStamina) * PERFORMANCE_PENALTY_PER_POINT;
    }

    const rivalEffAtt = Math.round(baseRivalRatings.effectiveAttack * (1 - rivalFatigue));
    const rivalEffMid = Math.round(baseRivalRatings.effectiveMidfield * (1 - rivalFatigue));
    const rivalEffDef = Math.round(baseRivalRatings.effectiveDefense * (1 - rivalFatigue));
    const rivalEffGk = Math.round(baseRivalRatings.effectiveGoalkeeper * (1 - rivalFatigue));

    return {
      user: { att: userEffAtt, mid: userEffMid, def: userEffDef, gk: userEffGk, base: baseUserRatings },
      rival: { att: rivalEffAtt, mid: rivalEffMid, def: rivalEffDef, gk: rivalEffGk, base: baseRivalRatings }
    };
  }

  tick() {
    if (this.isPaused || this.isFinished) return;

    this.minute++;

    // Degrade stamina
    const drain = DRAFT_CONFIG.FATIGUE.DRAIN_PER_MINUTE;
    this.userStarters.forEach(p => {
      p.stamina = Math.max(30, p.stamina - drain);
    });
    this.rivalStarters.forEach(p => {
      p.stamina = Math.max(30, p.stamina - drain);
    });

    // Check halftime
    if (this.minute === 45) {
      this.logEvent({
        minute: 45,
        type: 'halftime',
        team: 'neutral',
        text: `Fin del primer tiempo. Marcador: ${this.userTeamName} ${this.userScore} - ${this.rivalScore} ${this.rivalTeamName}.`
      });
    }

    // Match Simulation Step for this minute
    this.simulateMinuteEvents();

    if (this.onTick) this.onTick(this);

    // Check fulltime
    if (this.minute >= DRAFT_CONFIG.MATCH_DURATION_MINUTES) {
      this.finishMatch();
    }
  }

  simulateMinuteEvents() {
    const ratings = this.getEffectiveRatings();
    const tacticConfig = DRAFT_CONFIG.TACTICS[this.userTactic];

    // Base chance of a dangerous opportunity happening this minute (~8%)
    const baseChanceRate = 0.085;
    const combinedRate = baseChanceRate * ((tacticConfig.ownChanceMod + tacticConfig.rivalChanceMod) / 2);

    if (this.rng() < combinedRate) {
      // Determine attacking side based on midfield battle + tactics
      const userMidPower = ratings.user.mid * tacticConfig.ownChanceMod;
      const rivalMidPower = ratings.rival.mid * tacticConfig.rivalChanceMod;
      const userChanceProb = userMidPower / (userMidPower + rivalMidPower);

      const isUserAttacking = this.rng() < userChanceProb;
      this.resolveAttack(isUserAttacking, ratings);
    }
  }

  resolveAttack(isUser, ratings) {
    const attackingTeam = isUser ? this.userTeamName : this.rivalTeamName;
    const defendingTeam = isUser ? this.rivalTeamName : this.userTeamName;
    const attSquad = isUser ? this.userStarters : this.rivalStarters;
    const attRatings = isUser ? ratings.user : ratings.rival;
    const defRatings = isUser ? ratings.rival : ratings.user;

    if (isUser) this.stats.userChances++;
    else this.stats.rivalChances++;

    // Select shooter from squad (prefer attackers, then midfielders)
    const candidates = attSquad.filter(p => ['CF', 'SS', 'LWF', 'RWF', 'AMF'].includes(p.primaryPosition));
    const shooterPool = candidates.length ? candidates : attSquad;
    const shooter = shooterPool[Math.floor(this.rng() * shooterPool.length)] || { name: 'Delantero' };

    // Shot resolution: Attack vs Defense
    const shotProb = 0.72 + ((attRatings.att - defRatings.def) * 0.005);
    if (this.rng() > shotProb) {
      // Chance cut off by defense
      this.logEvent({
        minute: this.minute,
        type: 'defense',
        team: isUser ? 'rival' : 'user',
        text: `Cierre defensivo impecable de ${defendingTeam} ante el avance de ${shooter.name}.`
      });
      return;
    }

    // Shot occurs!
    if (isUser) this.stats.userShots++;
    else this.stats.rivalShots++;

    // Shot on target check
    const onTargetProb = 0.60 + ((attRatings.att - 70) * 0.004);
    const isOnTarget = this.rng() < onTargetProb;

    if (!isOnTarget) {
      this.logEvent({
        minute: this.minute,
        type: 'shot',
        team: isUser ? 'user' : 'rival',
        text: `Remate de ${shooter.name} (${attackingTeam}) que se va desviado por poco.`
      });
      return;
    }

    if (isUser) this.stats.userShotsOnTarget++;
    else this.stats.rivalShotsOnTarget++;

    // Goal resolution: Shooter Attack vs Goalkeeper
    const goalProb = Math.min(0.58, Math.max(0.12, 0.32 + ((attRatings.att - defRatings.gk) * 0.008)));
    const isGoal = this.rng() < goalProb;

    if (isGoal) {
      if (isUser) this.userScore++;
      else this.rivalScore++;

      this.logEvent({
        minute: this.minute,
        type: 'goal',
        team: isUser ? 'user' : 'rival',
        text: `¡¡¡GOOOOL de ${shooter.name} para ${attackingTeam}!!! (${this.userScore} - ${this.rivalScore})`
      });
    } else {
      this.logEvent({
        minute: this.minute,
        type: 'save',
        team: isUser ? 'rival' : 'user',
        text: `¡Gran atajada del arquero de ${defendingTeam} evitando el gol de ${shooter.name}!`
      });
    }
  }

  finishMatch() {
    this.isFinished = true;
    this.stopTimer();

    // Tie-break resolution if draw at 90'
    if (this.userScore === this.rivalScore) {
      this.resolvePenaltyShootout();
    }

    const userWon = this.userScore > this.rivalScore || (this.penalties && this.penalties.user > this.penalties.rival);

    this.logEvent({
      minute: 90,
      type: 'end',
      team: 'neutral',
      text: userWon
        ? `¡Final del partido! Victoria de ${this.userTeamName}. ¡Avanzaste a la siguiente ronda!`
        : `¡Final del partido! Derrota de ${this.userTeamName}. Fin del torneo en 16avos.`
    });

    if (this.onFinish) {
      this.onFinish({
        userWon,
        userScore: this.userScore,
        rivalScore: this.rivalScore,
        penalties: this.penalties,
        stats: this.stats,
        events: this.events
      }, this);
    }
  }

  resolvePenaltyShootout() {
    let uPens = 0;
    let rPens = 0;

    for (let round = 1; round <= 5; round++) {
      if (this.rng() < 0.75) uPens++;
      if (this.rng() < 0.72) rPens++;
    }

    // Sudden death if still tied
    while (uPens === rPens) {
      if (this.rng() < 0.70) uPens++;
      if (this.rng() < 0.70) rPens++;
    }

    this.penalties = { user: uPens, rival: rPens };

    this.logEvent({
      minute: 90,
      type: 'penalties',
      team: 'neutral',
      text: `Definición por penales: ${this.userTeamName} ${uPens} - ${rPens} ${this.rivalTeamName}.`
    });
  }

  start() {
    if (this.timerId || this.isFinished) return;
    this.isPaused = false;
    this.timerId = window.setInterval(() => {
      this.tick();
    }, DRAFT_CONFIG.SIMULATION_TICK_MS);
  }

  pause() {
    this.isPaused = true;
    this.stopTimer();
  }

  resume() {
    if (this.isFinished) return;
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
