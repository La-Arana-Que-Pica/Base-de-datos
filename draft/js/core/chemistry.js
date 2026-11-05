import {CHEMISTRY_LEAGUE_GROUPS} from '../data/chemistry-leagues.js';
import {CAREER_RULES} from '../career/rules.js';
import { DRAFT_CONFIG } from '../config.js';
import { getChemistryLeagueId, getChemistryLeagueIds } from './chemistryLeague.js';
import { getPositionFit } from './positions.js';

export function getLinkStrength(a, b) {
  if (!a || !b) return 0;
  const normal=!!(a.normalDreamChemistry||b.normalDreamChemistry),isIcon=p=>!normal&&p.specialType==='ICON',isCharacter=p=>!normal&&p.specialType==='CHARACTER',nationality=p=>!['Fictional','Internacional','International',''].includes(p.nationality||'')?p.nationality:null;
  if(isIcon(a)||isIcon(b)){const icon=isIcon(a)?a:b,other=icon===a?b:a,leagues=getChemistryLeagueIds(other),sourceIds=icon.iconLeague==='LATAM'?['9005','147']:[icon.iconLeague],sameLeague=other.iconLeague===icon.iconLeague||sourceIds.some(id=>leagues.has('league:'+id)||CHEMISTRY_LEAGUE_GROUPS.some(group=>group.sourceLeagueId===id&&leagues.has(group.id))),sameNation=!!nationality(a)&&nationality(a)===nationality(b)||!!a.countryId&&a.countryId===b.countryId;return sameLeague||sameNation?DRAFT_CONFIG.CHEMISTRY.LINK_POINTS.STRONG:DRAFT_CONFIG.CHEMISTRY.LINK_POINTS.WEAK;}
  if(isCharacter(a)||isCharacter(b)){return !!nationality(a)&&nationality(a)===nationality(b)?DRAFT_CONFIG.CHEMISTRY.LINK_POINTS.STRONG:DRAFT_CONFIG.CHEMISTRY.LINK_POINTS.WEAK;}
  if(!normal&&(a.specialType==='LEGEND'||b.specialType==='LEGEND')){const points=DRAFT_CONFIG.CHEMISTRY.LINK_POINTS,nation=!!a.countryId&&a.countryId===b.countryId||!!a.nationality&&!['Internacional','International'].includes(a.nationality)&&a.nationality===b.nationality;return a.specialType==='LEGEND'&&b.specialType==='LEGEND'||nation?points.STRONG:points.WEAK;}
  const club = Boolean(a.teamId && a.teamId === b.teamId);
  const nation = Boolean(a.nationality && a.nationality === b.nationality);
  const leagueId=getChemistryLeagueId(a);
  const league=Boolean(leagueId && leagueId===getChemistryLeagueId(b));
  const points = DRAFT_CONFIG.CHEMISTRY.LINK_POINTS;
  const originMatches=(wild,other)=>!normal&&CAREER_RULES.wildcard.yellowInOrigin&&wild.collectionWildcard&&wild.collectionOrigin&&(other.region==='EUROPA'?'EUROPA':['AMERICA','SUDAMERICA','NORTEAMERICA'].includes(other.region)?'AMERICA':null)===wild.collectionOrigin;
  const floor=originMatches(a,b)||originMatches(b,a)?points.WEAK:points.DEAD;
  if (club && nation) return Math.max(floor,points.HYPER);
  if (club || (league && nation)) return Math.max(floor,points.STRONG);
  if (league || nation) return Math.max(floor,points.WEAK);
  return floor;
}

export function calculateIndividualChemistry(actual, required) {
  if (!required) return 0;
  return Math.min(DRAFT_CONFIG.CHEMISTRY.INDIVIDUAL_MAX, Math.max(0, actual / required * DRAFT_CONFIG.CHEMISTRY.INDIVIDUAL_MAX));
}

export function calculateChemistry(formationId, startersMap = {}) {
  const formation = typeof formationId==='object' ? formationId : DRAFT_CONFIG.FORMATIONS[formationId];
  if (!formation) return { score: 0, totalPoints: 0, linkDetails: [], individuals: {} };
  const individuals = Object.fromEntries(formation.slots.map(slot => [slot.id, {
    requiredLinkPoints: 0, actualLinkPoints: 0, score: 0,
    natural: getPositionFit(startersMap[slot.id], slot.position).natural
  }]));
  const linkDetails = formation.links.map(([slotA, slotB]) => {
    const populated = Boolean(startersMap[slotA] && startersMap[slotB]);
    const points = getLinkStrength(startersMap[slotA], startersMap[slotB]);
    const special=![startersMap[slotA],startersMap[slotB]].some(p=>p?.normalDreamChemistry)&&[startersMap[slotA],startersMap[slotB]].some(p=>['ICON','CHARACTER'].includes(p?.specialType)),chemistryPoints=special&&points===DRAFT_CONFIG.CHEMISTRY.LINK_POINTS.WEAK?.5:points;
    for (const id of [slotA, slotB]) {
      individuals[id].requiredLinkPoints++;
      individuals[id].actualLinkPoints += chemistryPoints;
    }
    return { slotA, slotB, points, populated,...(special?{chemistryPoints}:{}) };
  });
  for (const slot of formation.slots) {
    const item = individuals[slot.id];
    item.score = startersMap[slot.id]
      ? calculateIndividualChemistry(item.actualLinkPoints, item.requiredLinkPoints) * getPositionFit(startersMap[slot.id], slot.position).chemistryMultiplier
      : 0;
  }
  return {
    score: Math.min(DRAFT_CONFIG.CHEMISTRY.TEAM_MAX, Math.round(Object.values(individuals).reduce((sum, item) => sum + item.score, 0))),
    totalPoints: linkDetails.reduce((sum, link) => sum + link.points, 0), linkDetails, individuals
  };
}
