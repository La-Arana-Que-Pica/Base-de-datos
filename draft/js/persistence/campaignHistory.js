import {getCoach} from '../data/coaches.js';
import {createRng} from '../core/matchEngine.js';
import {StateStore} from '../state.js';
import {DRAFT_CONFIG} from '../config.js';
import {restoreCampaignSnapshot,validateCampaignSnapshot} from './campaignSnapshot.js';
export const HISTORY_VERSION=1;
export function completedCampaign(value){const t=value?.data?.tournament||value?.tournament;return !!t&&['eliminated','champion'].includes(t.status);}
export function canonicalFinalSnapshot(snapshot){if(!completedCampaign(snapshot))throw new Error('La campaña todavía está en curso.');const copy=structuredClone(snapshot);copy.data.currentScreen='CAMPAIGN_END';return copy;}
export function createHistoryDisplay(snapshot){
 validateCampaignSnapshot(snapshot);const state=new StateStore();restoreCampaignSnapshot(state,canonicalFinalSnapshot(snapshot));
 const fields=['id','name','image','overall','originalOverall','campaignBoost','slotId','slotPosition','primaryPosition','naturalPositions','secondaryPositions','nationality','countryId','teamId','teamName','energy','temporaryAcquisition','specialType','legendFranchise','legendVersion',...(state.staff?['age','hasCaptaincy']:[]),...(state.career?['collectionBoost','collectionWildcard','collectionOrigin']:[])];
 const coach=getCoach(state.staff?.coachId);
 return {version:HISTORY_VERSION,...(state.initialDraft?{initialDraft:structuredClone(state.initialDraft)}:{}),...(state.career?{career:structuredClone(state.career)}:{}),...(coach?{staff:{...state.staff,coachName:coach.name,ability:coach.ability,finalCaptainId:state.activeMatch?.captains?.user??state.staff.captainId}}:{}),formation:structuredClone(DRAFT_CONFIG.FORMATIONS[state.formationId]),players:state.getFullSquad().map(p=>Object.fromEntries(fields.filter(k=>p[k]!==undefined).map(k=>[k,structuredClone(p[k])]))),chemistry:structuredClone(state.chemistry),ratings:structuredClone(state.ratings)};
}
// Detached, read-only presentation model. Never restores into the live StateStore.
export function historyViewState(row){
 if(row?.history_version!==HISTORY_VERSION||row?.display?.version!==HISTORY_VERSION||!row.snapshot?.data||!Array.isArray(row.display.players)||!row.display.formation?.slots)throw new Error('Esta versión histórica requiere un lector compatible. El registro se conserva.');
 const d=structuredClone(row.snapshot.data),display=structuredClone(row.display),byId=new Map(display.players.map(p=>[String(p.id),p]));
 // Decode only a compatible legacy bracket for an isolated, deterministic view.
 // Unknown catalog versions remain readable through frozen display, without guessing NPC strength.
 if(d.tournament?.status==='eliminated'&&d.tournament.rounds.some(r=>r.matches.some(m=>!m.result))){
  try{const decoded=validateCampaignSnapshot(row.snapshot);d.tournament=decoded.tournament;d.tournament.rng=createRng(d.tournament.seed);d.tournament.rng.setState(decoded.tournamentRng);}catch{/* Keep original historical data; renderer explains why projection is unavailable. */}
 }
 const starters=Object.fromEntries(Object.entries(d.startersMap||{}).map(([slot,p])=>[slot,byId.get(p.$player)]));
 const bench=(d.benchList||[]).map(p=>byId.get(p.$player));if(Object.values(starters).some(p=>!p)||bench.some(p=>!p))throw new Error('No se puede reconstruir esta plantilla histórica. El registro se conserva.');
 return {...d,staff:display.staff??d.staff??null,startersMap:starters,benchList:bench,chemistry:display.chemistry,ratings:display.ratings,formation:display.formation,currentScreen:'OPPONENT',selectedSquadSlot:null,pendingDraftSlotId:null,activeDraftStep:null,getFullSquad:()=>[...Object.values(starters),...bench],getPlayerAtSlot:slot=>starters[slot]||bench.find(p=>p.slotId===slot),canSwapSquadSlots:()=>false};
}
