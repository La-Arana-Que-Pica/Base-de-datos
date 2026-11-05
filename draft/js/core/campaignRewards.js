// The victory ledger is authoritative; buttons never own reward consumption.
// Campaign-only progression. Database objects are never changed.
export function pendingReward(tournament){
 const reward=tournament?.rewards?.[tournament.pendingRewardId];
 return tournament?.status==='active'&&tournament.pendingAcquisition&&reward?.status==='pending'?reward:null;
}
export function createVictoryReward(tournament,match,opponentId){
 const id=String(tournament.seed)+':'+match.id;tournament.rewards ||= {};
 tournament.rewards[id] ||= {id,roundIndex:tournament.roundIndex,opponentId,status:'pending',choice:null};
 tournament.pendingRewardId=id;tournament.pendingAcquisition=tournament.rewards[id].status==='pending';
}
export function consumeReward(tournament,details){
 const reward=pendingReward(tournament);if(!reward)return false;
 Object.assign(reward,details,{status:'consumed'});tournament.pendingAcquisition=false;tournament.pendingRewardId=null;return true;
}
// overall remains the campaign base consumed by existing chemistry/fatigue helpers.
// Copy the player: never mutate database objects or inherit the outgoing slot boost.
export function campaignPlayer(player,boost=0){
 const originalOverall=player.originalOverall??player.overall;
 const campaignBoost=Math.min(Math.max(0,boost),Math.max(0,99-originalOverall));
 return {...player,originalOverall,campaignBoost,overall:Math.min(99,originalOverall+campaignBoost)};
}
export function canUpgrade(player){return !!player&&Number.isFinite(player.overall)&&player.overall<99;}
