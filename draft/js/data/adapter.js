import {CAPTAINCY} from './captaincy.js';
import {LEGENDS} from './legends.js';
/**
 * Data Adapter for LAqP Draft
 * Normalizes players, clubs and opponents from the dataset.
 */

import { getChemistryLeagueId } from '../core/chemistryLeague.js';
import { DATASET } from './dataset.js';
import { CONCACAF_SUBSET } from './concacaf-subset.js';
import { DRAFT_CONFIG } from '../config.js';
import { calculateLineupChemistry } from '../core/lineupChemistry.js';
import { RIVALS } from './rivals-subset.js';

// Shared source revision also refreshes changed minifaces without changing their IDs.
export function draftAssetPath(path) {
 const revision=DATASET.sourceVersion;
 return revision && !/[?&]v=/.test(path)?path+(path.includes('?')?'&':'?')+'v='+revision:path;
}
const extraPlayersById=new Map(),extraTeamsById=new Map();
export function registerSupplementalDataset(data){for(const p of data.players||[])if(!playersById.has(String(p.id)))extraPlayersById.set(String(p.id),normalizePlayer(p));for(const t of data.teams||[])if(!teamsById.has(String(t.id)))extraTeamsById.set(String(t.id),t);}
const playersById = new Map();
const teamsById = new Map();
const lineupChemistryByTeamId = new Map();
const americanSourceRegions = new Set(['SUDAMERICA', 'NORTEAMERICA']);
const rivalPlayersById = new Map(RIVALS.players.map(p => [String(p.id), normalizePlayer(p)]));

[...DATASET.players, ...CONCACAF_SUBSET.players,...LEGENDS.players].forEach(p => {
  playersById.set(String(p.id), normalizePlayer(p));
});

[...DATASET.teams, ...RIVALS.teams, ...CONCACAF_SUBSET.teams].forEach(t => {
  teamsById.set(String(t.id), t);
});

function numeric(value,fallback) { return value!=null && value!=='' && Number.isFinite(Number(value)) ? Number(value) : fallback; }
export function normalizePlayer(raw = {}) {
  const imagePath = raw.image && raw.image.trim()
    ? (raw.image.startsWith('../') ? raw.image : `../${raw.image.replace(/^\/+/, '')}`)
    : '../img/players/default.webp';

  return {
    id: String(raw.id || ''),
    name: raw.name || 'Desconocido',
    teamId: String(raw.teamId || ''),
    teamName: raw.teamName || 'Equipo Libre',
    leagueId: String(raw.leagueId || ''),
    leagueName: raw.leagueName || 'Liga',
    chemistryLeagueId: getChemistryLeagueId(raw),
    region: (raw.region || 'EUROPA').toUpperCase(),
    nationality: raw.nationality || 'Internacional',
    countryId: String(raw.countryId || ''),
    primaryPosition: (raw.primaryPosition || 'CMF').toUpperCase(),
    naturalPositions: [...new Set([raw.primaryPosition, ...(raw.naturalPositions || [])].filter(Boolean).map(p => p.toUpperCase()))],
    secondaryPositions: Array.isArray(raw.secondaryPositions) ? raw.secondaryPositions.map(p => p.toUpperCase()) : [],
    overall: Number(raw.overall) || 70,
    image: draftAssetPath(imagePath),
    age: numeric(raw.age,null)>0 ? Number(raw.age) : null,
    hasCaptaincy: Object.hasOwn(CAPTAINCY,String(raw.id)) ? CAPTAINCY[String(raw.id)] : null,
    hasSuperSub: raw.hasSuperSub === true,
    setPieceAttributes: Object.fromEntries(['placeKicking','controlledSpin','finishing','loftedPass'].map(key=>[key,numeric(raw[key],null)])),
    finishing: Number(raw.finishing) || Number(raw.overall) || 70,
    goalkeeping: Number(raw.goalkeeping) || Number(raw.overall) || 70,
    stamina: numeric(raw.stamina,0)>0 ? Number(raw.stamina) : DRAFT_CONFIG.FATIGUE.STAMINA_FALLBACK,
    staminaSource: numeric(raw.stamina,0)>0 ? 'PES' : 'fallback',
    injuryResistance: numeric(raw.injuryResistance,DRAFT_CONFIG.MATCH_EVENTS.INJURY_RESISTANCE_FALLBACK),
    lowPass: numeric(raw.lowPass,Number(raw.overall)||70),
    loftedPass: numeric(raw.loftedPass,Number(raw.overall)||70),
    placeKicking: numeric(raw.placeKicking,Number(raw.overall)||70),
    controlledSpin: numeric(raw.controlledSpin,Number(raw.overall)||70),
    kickingPower: numeric(raw.kickingPower,Number(raw.overall)||70),
    defensiveProwess: numeric(raw.defensiveProwess,Number(raw.overall)||70),
    ballWinning: numeric(raw.ballWinning,Number(raw.overall)||70),
    energy: DRAFT_CONFIG.FATIGUE.INITIAL_ENERGY,
    ...(raw.specialType==='LEGEND'?{specialType:'LEGEND',legendFranchise:raw.legendFranchise,legendVersion:raw.legendVersion}:{}),
    temporaryAcquisition: Boolean(raw.temporaryAcquisition)
  };
}

export function getPlayerById(id) {
  return playersById.get(String(id)) || rivalPlayersById.get(String(id)) || extraPlayersById.get(String(id)) || null;
}

export function getPlayersByRegion(region) {
  const normRegion = region.toUpperCase();
  return Array.from(playersById.values()).filter(p => normRegion === 'EUROPA' && p.region === 'EUROPA' || normRegion === 'AMERICA' && americanSourceRegions.has(p.region));
}

export function getLegendPlayers(){return LEGENDS.players.map(p=>playersById.get(String(p.id)));}

export function getTeamsByRegion(region) {
  const normRegion = region.toUpperCase();
  return Array.from(teamsById.values()).filter(t => normRegion === 'EUROPA' && t.region === 'EUROPA' || normRegion === 'AMERICA' && americanSourceRegions.has(t.region));
}

export function getTeamById(id) {
  return teamsById.get(String(id)) || extraTeamsById.get(String(id)) || null;
}

/**
 * Returns a fully populated rival squad (starters, bench, club metadata)
 */
export function getRivalSquad(teamId) {
  const team = getTeamById(teamId);
  if (!team) return null;

  const defaultLineup = team.defaultLineup || {};
  const xiSlots = defaultLineup.xi || [];
  
  const startingXI = [];
  const xiIdSet = new Set();

  xiSlots.forEach(slot => {
    const player = getPlayerById(slot.playerId);
    if (player) {
      startingXI.push({
        ...player,
        slotPosition: slot.position || player.primaryPosition,
        slotX: slot.x,
        slotY: slot.y
      });
      xiIdSet.add(player.id);
    }
  });

  // Bench: other players belonging to the team
  const allTeamPlayerIds = team.playerIds || [];
  const bench = [];
  for (const pid of allTeamPlayerIds) {
    if (!xiIdSet.has(pid)) {
      const p = getPlayerById(pid);
      if (p) {
        bench.push({...p});
        if (bench.length >= DRAFT_CONFIG.BENCH_SIZE) break; // adequate bench
      }
    }
  }

  // Calculate actual starting XI average OVR
  const xiOvrs = startingXI.map(p => p.overall);
  const calculatedOvr = xiOvrs.length
    ? Math.round(xiOvrs.reduce((a, b) => a + b, 0) / xiOvrs.length)
    : team.overall || 78;

  const crestPath = team.crest && team.crest.trim()
    ? (team.crest.startsWith('../') ? team.crest : `../${team.crest.replace(/^\/+/, '')}`)
    : '../img/teams/default.webp';

  if(!lineupChemistryByTeamId.has(String(team.id)))lineupChemistryByTeamId.set(String(team.id),calculateLineupChemistry(startingXI));
  const lineupChemistry=lineupChemistryByTeamId.get(String(team.id));
  return {
    id: String(team.id),
    name: team.name,
    region: team.region,
    leagueId: team.leagueId,
    leagueName: team.leagueName,
    crest: draftAssetPath(crestPath),
    overall: calculatedOvr,
    formation: (() => { const roles = startingXI.map(p => p.slotPosition); return [roles.filter(p=>['CB','LB','RB'].includes(p)).length, roles.filter(p=>['DMF','CMF','LMF','RMF','AMF'].includes(p)).length, roles.filter(p=>['CF','SS','LWF','RWF'].includes(p)).length].join('-'); })(),
    chemistry: lineupChemistry.score,
    chemistrySource: lineupChemistry.source,
    campaignStats: {},
    startingXI,
    bench
  };
}
