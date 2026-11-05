import {escapeHtml as e} from './html.js';
export function specialCardClass(p){const variant=p?.variant==='global99'?' album-ultimate-card':p?.variant==='club2'?' album-reward-card':'';return variant+(p?.specialType==='ICON'?' legend-card legend-historical':p?.specialType==='LEGEND'?' legend-card legend-'+(p.legendFranchise==='METEGOL'?'metegol':'o11ce'):p?.specialType==='CHARACTER'?' album-character-card':'');}

export function candidateStyle(player) {
 const q=player.overall;
 const tier=q>=90?'elite':q>=85?'highlight':q>=75?'bright':'standard';
 const variant=[...String(player.id)].reduce((sum,c)=>sum+c.charCodeAt(0),0)%3;
 return {tier,variant};
}
export function renderCandidateCard(player) {
 const {tier,variant}=candidateStyle(player);
 const flag=/^\d+$/.test(player.countryId||'')?'../img/flags/'+player.countryId+'.webp':'';
 return '<div role="button" tabindex="0" class="player-card candidate-card quality-'+tier+' finish-'+variant+specialCardClass(player)+'" aria-pressed="false" data-player-id="'+e(player.id)+'" aria-label="Elegir '+e(player.name)+', '+player.overall+' OVR, '+e(player.primaryPosition)+', '+e(player.teamName)+', '+e(player.nationality)+'">'+
 '<div class="card-top"><span class="card-ovr">'+player.overall+'</span><span class="card-pos">'+e(player.primaryPosition)+'</span></div>'+
 '<div class="card-photo-wrap"><img class="card-photo" src="'+e(player.image||'../img/players/default.webp')+'" alt="'+e(player.name)+'" loading="eager" decoding="async" onerror="this.onerror=null;this.src=\'../img/players/default.webp\'"></div>'+
 '<div class="card-name">'+e(player.name)+'</div><div class="card-meta">'+
 '<div class="card-club-row"><img class="card-crest" src="../img/teams/'+e(player.teamId)+'.webp" alt="" onerror="this.style.display=\'none\'"><span>'+e(player.teamName)+'</span></div>'+
 '<div class="card-nat">'+(flag?'<img class="card-flag" src="'+e(flag)+'" alt="" onerror="this.style.display=\'none\'">':'')+'<span>'+e(player.nationality)+'</span></div>'+
 '<div class="natural-positions">A: '+e(player.naturalPositions.join(' · '))+'</div></div>'+
 (['ICON','LEGEND'].includes(player.specialType)?'<span class="legend-ribbon">LEYENDA · '+e(player.legendFranchise||'HISTÓRICA')+'</span>':'')+
 (player.hasSuperSub?'<span class="candidate-super-sub">⚡ Super Refuerzo</span>':'')+'</div>';
}
