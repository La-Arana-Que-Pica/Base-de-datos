import {DRAFT_CONFIG as config} from '../config.js';
// Legacy notes remain stored as played; missing action fields mean zero, not NaN.
export function calculateMatchRating(record){
 const n=k=>Number.isFinite(record[k])?record[k]:0,role=record.position;
 const legacy=record.duels===undefined;let work=0;
 if(legacy){
  if(role==='GK')work=.09*n('saves')+.10*n('difficultSaves')-.04*n('goalsConceded');
  else if(['CB','LB','RB'].includes(role))work=.06*n('recoveries')+.07*n('interceptions')+.05*n('clearances')+.06*n('blocks')+.015*n('constructions')-.12*n('losses');
  else if(['DMF','CMF','LMF','RMF','AMF'].includes(role))work=.06*n('recoveries')+.075*n('interceptions')+.025*n('constructions')+.09*n('chancesCreated')+.004*n('possessionTouches')-.13*n('losses');
  else work=.12*n('chancesCreated')+.04*n('shotsOnTarget')+.025*n('constructions')-.18*n('clearMisses')-.10*n('losses');
 }else if(role==='GK'){
  // Quality of intervention matters; four difficult saves can be an excellent game.
  work=.10*n('saves')+.24*n('difficultSaves');
 }else{
  const defensive=['CB','LB','RB','DMF'].includes(role),mid=['DMF','CMF','AMF','LMF','RMF'].includes(role);
  // Tackles, interceptions and dribbles are subsets of duels: award the duel once.
  work=(defensive?.065:mid?.050:.035)*(n('duelsWon')-.55*n('duels'));
  work+=(mid?.025:.012)*(n('passesCompleted')-.75*n('passesAttempted'));
  work+=(mid?.16:.12)*n('keyPasses')+.018*n('blocks')+.012*n('clearances')-.04*n('clearMisses');
  // A goal's assist already carries its own award; don't stack a second key-pass award.
  work-=(mid?.16:.12)*n('assists');
 }
 const exposure=Math.sqrt(Math.max(30,n('minutes'))/90);
 const note=config.PLAYER_RATING.BASE+n('ratingAdjustment')+Math.max(-1.4,Math.min(3.6,work/exposure));
 return Math.max(config.PLAYER_RATING.MIN,Math.min(config.PLAYER_RATING.MAX,note));
}
