import {campaignPlayer} from '../core/campaignRewards.js';
import {getPlayerById} from '../data/adapter.js';
export const DREAM_PLAYER_FIELDS=['overall','originalOverall','campaignBoost','primaryPosition','finishing','goalkeeping','stamina','lowPass','loftedPass','placeKicking','controlledSpin','kickingPower','defensiveProwess','ballWinning','fatigueScale','permanentVariantId','pesStats','naturalPositions','secondaryPositions','skills','setPieceAttributes','specialType','countryId','nationality','teamId','leagueId','iconLeague','ovrException','formulaOverall','sourcePlayerId'];
// Run-only evidence. The permanent Collection and the initial roster are never changed.
export function recordDreamReward(state,reward,details){
 if(state.survival?.variant!=='DREAM_TEAM')return;
 const run=state.survival;run.squadEvolutionVersion=1;run.squadChanges??=[];
 run.squadChanges.push({rewardId:reward.id,matchIndex:run.wins,...structuredClone(details)});
}
export function evolvedDreamRoster(state){
 const run=state.survival,players=new Map(run.lockedRoster.map(p=>[p.id,structuredClone(p)])),boosts={},seen=new Set();let previousMatch=0;
 if(run.squadEvolutionVersion!==1||!Array.isArray(run.squadChanges))throw Error('Evolución de plantilla incompatible');
 for(const change of run.squadChanges){
  if(!Number.isInteger(change.matchIndex)||change.matchIndex<=previousMatch||change.matchIndex>run.wins||seen.has(change.matchIndex)||change.rewardId!==String(run.seed)+':survival-'+change.matchIndex)throw Error('Recompensa de racha incompatible');
  seen.add(change.matchIndex);previousMatch=change.matchIndex;
  if(change.kind==='UPGRADE'){
   const old=players.get(change.playerId);if(!old||old.overall>=99||old.overall!==change.before)throw Error('Mejora de racha incompatible');
   const boost=(boosts[old.id]??old.campaignBoost??0)+1,improved=campaignPlayer(old,boost);
   if(improved.overall!==change.after||change.after!==change.before+1)throw Error('Mejora de racha incompatible');
   players.set(old.id,improved);boosts[old.id]=boost;
  }else if(change.kind==='ACQUISITION'){
   const incoming=change.player;
   if(!players.has(change.outgoingId)||!incoming||players.has(incoming.id)&&incoming.id!==change.outgoingId||!getPlayerById(incoming.id)||incoming.permanentVariantId||incoming.collectionWildcard||!incoming.temporaryAcquisition)throw Error('Refuerzo de racha incompatible');
   players.delete(change.outgoingId);players.set(incoming.id,campaignPlayer(incoming,boosts[incoming.id]||0));
  }else throw Error('Recompensa de racha incompatible');
 }
 if(Object.entries(state.campaignUpgrades||{}).some(([id,boost])=>(boosts[id]||0)!==boost)||Object.entries(boosts).some(([id,boost])=>(state.campaignUpgrades[id]||0)!==boost))throw Error('Mejoras externas a la racha');
 return players;
}
