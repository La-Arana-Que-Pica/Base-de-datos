/** Ages belong to the frozen dataset, never to the browser's current date. */
export function leadership(player){
 const age=Number.isFinite(player?.age)&&player.age>=15&&player.age<=60?player.age:null;
 const experience=age===null?.0015:.006*(1-Math.exp(-Math.max(0,age-18)/12));
 const skill=player?.hasCaptaincy===true?.008:0;
 return {age,experience,skill,bonus:Math.min(.015,experience+skill),knownSkill:player?.hasCaptaincy!==null&&player?.hasCaptaincy!==undefined};
}
export const captainEligible=p=>p&&!p.sentOff&&!p.substitutedOut;
export function bestCaptain(players){return players.filter(captainEligible).slice().sort((a,b)=>leadership(b).bonus-leadership(a).bonus||String(a.id).localeCompare(String(b.id),'en'))[0]||null;}
export function activeCaptain(match,isUser){
 const key=isUser?'user':'rival',players=match.players(isUser).filter(captainEligible);
 if(!match.leadershipEnabled?.[key])return null;
 const current=players.find(p=>String(p.id)===String(match.captains?.[key]));
 if(current)return current;
 const next=bestCaptain(players);match.captains[key]=next?.id??null;return next;
}
export function captainMultiplier(match,isUser){
 const p=activeCaptain(match,isUser);if(!p)return 1;
 const losing=isUser?match.userScore<match.rivalScore:match.rivalScore<match.userScore;
 // One coordination effect only: half strength normally, full strength under pressure.
 return 1+leadership(p).bonus*(losing||match.minute>=75?1:.5);
}
