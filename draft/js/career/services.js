import {rewardLaboratoryRequested} from '../expansion/laboratory.js';
import {expansionCards} from '../expansion/cards.js';
import {StateStore} from '../state.js';
import {careerOffer} from './offers.js';
import {cupCatalog,careerRival} from './catalog.js';
import {createTournament} from '../core/tournament.js';
import {collectionPlayer} from './progression.js';
import {CAREER_RULES} from './rules.js';
import {isNaturalPosition} from '../core/positions.js';
export function installCareerServices(getProgress){StateStore.careerServices={offer:(state,pos,rng)=>careerOffer(state.region,pos,state.career.level,state.draftedIds,rng,state.getStartingXIList(),state.career.cup),tournament:(state,seed)=>{const cup=cupCatalog(state.region).find(c=>c.id===state.career.cup);if(!cup)throw Error('Copa no disponible');return createTournament(state.region,seed,{participants:cup.participants,pool:cup.clubs.map(t=>careerRival(t.id))});},collection:(state,id)=>{const progress=getProgress(),card=progress?.collection[id];if(card&&!card.transformedTo&&(CAREER_RULES.wildcard.crossRegion||card.region===state.region))return collectionPlayer(card);const p=expansionCards(progress).find(p=>p.cardKey===id);if(!p||p.attributesValidation==='draft'&&!rewardLaboratoryRequested()||p.unavailable||!p.naturalPositions?.length)return null;const league=String(p.iconLeague||p.leagueId||''),origin=p.region||(['204','236','208','215','210'].includes(league)?'EUROPA':['144','146','LATAM','9004'].includes(league)?'AMERICA':null);return {...p,collectionWildcard:true,collectionOrigin:origin};},fits:isNaturalPosition};}
