import { CHEMISTRY_LEAGUE_GROUPS } from '../data/chemistry-leagues.js';

const groupsByClub = new Map();
const groupedSourceIds = new Set(CHEMISTRY_LEAGUE_GROUPS.map(group => group.sourceLeagueId));
const groupedNames = new Set(CHEMISTRY_LEAGUE_GROUPS.flatMap(group => [group.name, group.sourceName].filter(Boolean).map(name => name.toLowerCase())));
for (const group of CHEMISTRY_LEAGUE_GROUPS) {
  for (const clubId of group.clubIds) {
    if (!groupsByClub.has(clubId)) groupsByClub.set(clubId, new Set());
    groupsByClub.get(clubId).add(group.id);
  }
}

// Competition membership can overlap. Links only check whether one identity is
// shared, so no second league bonus can be awarded.
export function getChemistryLeagueIds(player = {}) {
  const identities = new Set(groupsByClub.get(String(player.teamId || '')) || []);
  const sourceId = String(player.leagueId || '');
  if (sourceId && !groupedSourceIds.has(sourceId)) identities.add('league:' + sourceId);
  else if (!sourceId && player.leagueName && !groupedNames.has(String(player.leagueName).toLowerCase())) identities.add('name:' + player.leagueName);
  return identities;
}

export function getChemistryLeagueId(player = {}) {
  return getChemistryLeagueIds(player).values().next().value || '';
}

export function shareChemistryLeague(a, b) {
  const first = getChemistryLeagueIds(a), second = getChemistryLeagueIds(b);
  return [...first].some(identity => second.has(identity));
}
