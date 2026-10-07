/**
 * Data Adapter for LAqP Draft
 * Normalizes players, clubs and opponents from the dataset.
 */

import { DATASET } from './dataset.js';

const playersById = new Map();
const teamsById = new Map();

DATASET.players.forEach(p => {
  playersById.set(String(p.id), normalizePlayer(p));
});

DATASET.teams.forEach(t => {
  teamsById.set(String(t.id), t);
});

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
    region: (raw.region || 'EUROPA').toUpperCase(),
    nationality: raw.nationality || 'Internacional',
    countryId: String(raw.countryId || ''),
    primaryPosition: (raw.primaryPosition || 'CMF').toUpperCase(),
    secondaryPositions: Array.isArray(raw.secondaryPositions) ? raw.secondaryPositions.map(p => p.toUpperCase()) : [],
    overall: Number(raw.overall) || 70,
    image: imagePath,
    age: Number(raw.age) || 24,
    temporaryAcquisition: Boolean(raw.temporaryAcquisition)
  };
}

export function getPlayerById(id) {
  return playersById.get(String(id)) || null;
}

export function getPlayersByRegion(region) {
  const normRegion = region.toUpperCase();
  return Array.from(playersById.values()).filter(p => p.region === normRegion);
}

export function getTeamsByRegion(region) {
  const normRegion = region.toUpperCase();
  return Array.from(teamsById.values()).filter(t => t.region === normRegion);
}

export function getTeamById(id) {
  return teamsById.get(String(id)) || null;
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
        bench.push(p);
        if (bench.length >= 7) break; // adequate bench
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

  return {
    id: String(team.id),
    name: team.name,
    region: team.region,
    leagueId: team.leagueId,
    leagueName: team.leagueName,
    crest: crestPath,
    overall: calculatedOvr,
    startingXI,
    bench
  };
}
