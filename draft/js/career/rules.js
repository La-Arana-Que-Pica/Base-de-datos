// Provisional, explicit balance parameters. Confirmed rules are invariant elsewhere.
export const CAREER_RULES={version:1,overlap:{EUROPA:.5,AMERICA:.3},xp:{participation:100,win:40,champion:240,cup:25},cards:{initialSlope:-3,maximumSlope:0,saturation:18,cohesion:2,uniformFloor:.04,byCup:{BRONZE:{initialSlope:-3,maximumSlope:0},SILVER:{initialSlope:-1.5,maximumSlope:2},GOLD:{initialSlope:0,maximumSlope:4},PLATINUM:{initialSlope:1.5,maximumSlope:6}}},duplicates:{maxBoost:10,maxOverall:95},wildcard:{crossRegion:true,yellowInOrigin:true},postCompletionParticipationRewards:false};
export const CUPS=['BRONZE','SILVER','GOLD','PLATINUM'];
export const CUP_NAMES={BRONZE:'Bronce',SILVER:'Plata',GOLD:'Oro',PLATINUM:'Platino'};
export function levelThreshold(level){return level<=1?0:Math.round(100*(level-1)+30*(level-1)**1.5);}
export function levelFromXp(xp){if(!Number.isSafeInteger(xp)||xp<0)throw Error('Experiencia incompatible');let low=1,high=2;while(levelThreshold(high)<=xp){low=high;high*=2;}while(high-low>1){const mid=Math.floor((low+high)/2);if(levelThreshold(mid)<=xp)low=mid;else high=mid;}return {level:low,xp,next:levelThreshold(low+1),start:levelThreshold(low)};}
export function freshCareer(){return {version:1,regions:{EUROPA:{xp:0,unlocked:0,trophies:{}},AMERICA:{xp:0,unlocked:0,trophies:{}}},collection:{},grants:{},advancedCollectionUnlocked:false};}
