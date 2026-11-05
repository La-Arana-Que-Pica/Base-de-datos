import {DEFAULT_TOURNAMENT_SIZE} from '../core/tournamentFormat.js';
import {CAREER_CATALOG} from '../data/career-catalog.js';
import {registerSupplementalDataset,getPlayerById,getRivalSquad} from '../data/adapter.js';
import {CAREER_RULES,CUPS} from './rules.js';
registerSupplementalDataset(CAREER_CATALOG);
export function careerPlayers(region){return CAREER_CATALOG.players.filter(p=>region==='EUROPA'?p.region==='EUROPA':p.region!=='EUROPA').map(p=>getPlayerById(p.id));}
export function cupCatalog(region){const clubs=CAREER_CATALOG.teams.filter(t=>t.region===region).sort((a,b)=>a.strength-b.strength||a.id.localeCompare(b.id));const cuts=[.25,.5,.75].map(q=>clubs[Math.floor(clubs.length*q)].strength),overlap=CAREER_RULES.overlap[region];return CUPS.map((id,i)=>{const min=i===0?clubs[0].strength:cuts[i-1]-overlap,max=i===3?clubs.at(-1).strength:cuts[i]+overlap,eligible=clubs.filter(t=>t.strength>=min&&t.strength<=(i===3?max:max));if(eligible.length<15)throw Error('Copa sin 15 rivales adecuados');const participants=DEFAULT_TOURNAMENT_SIZE;return {id,index:i,region,min,max,clubs:eligible,participants,rounds:Math.log2(participants)};});}
export function careerRival(id){return getRivalSquad(id);}
export {CAREER_CATALOG};
