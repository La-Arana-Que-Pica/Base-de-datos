export const KEY='laqp-football-tier-list-v1';
export const colors=['#ff7f7f','#ffbf7f','#ffdf7f','#ffff7f','#bfff7f','#7fff7f'];
export function initial(){return {version:1,title:'Mi Tier List de fútbol',tiers:['S','A','B','C','D','F'].map((label,i)=>({id:'tier-'+i,label,color:colors[i],games:[]})),pool:[],covers:{}};}
export function validate(value){
 if(!value||value.version!==1||typeof value.title!=='string'||value.title.length>100||!Array.isArray(value.tiers)||value.tiers.length<1||value.tiers.length>20)throw Error('Copia incompatible o inválida.');
 const ids=new Set(),games=new Set();for(const t of value.tiers){if(!t||typeof t.id!=='string'||!/^tier-[a-z0-9-]+$/.test(t.id)||ids.has(t.id)||typeof t.label!=='string'||!t.label.trim()||t.label.length>40||!/^#[0-9a-f]{6}$/i.test(t.color)||!Array.isArray(t.games))throw Error('Categoría inválida.');ids.add(t.id);for(const id of t.games){if(typeof id!=='string'||id.length>120||games.has(id))throw Error('Juego duplicado o inválido.');games.add(id);}}
 // pool: games added by the user that are not classified yet. Optional for copies made before it existed.
 if(value.pool!==undefined){if(!Array.isArray(value.pool)||value.pool.length>2000)throw Error('Bandeja inválida.');for(const id of value.pool){if(typeof id!=='string'||id.length>120||games.has(id))throw Error('Juego duplicado o inválido.');games.add(id);}}
 if(!value.covers||typeof value.covers!=='object'||Array.isArray(value.covers)||Object.values(value.covers).some(x=>typeof x!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x)||x.length>300000))throw Error('Carátulas inválidas.');
 const copy=JSON.parse(JSON.stringify(value));if(!copy.pool)copy.pool=[];return copy;
}
export function move(state,id,target,before){const tier=state.tiers.find(t=>t.id===target);if(target!=='pool'&&!tier)throw Error('Categoría inexistente');if(id===before)return;remove(state,id);const list=tier?tier.games:(state.pool||=[]);const at=list.indexOf(before);list.splice(at<0?list.length:at,0,id);}
export function remove(state,id){for(const t of state.tiers)t.games=t.games.filter(x=>x!==id);if(state.pool)state.pool=state.pool.filter(x=>x!==id);}
export function placed(state){return [...state.tiers.flatMap(t=>t.games),...(state.pool||[])];}
export function matches(game,filters){const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return (!filters.search||norm(game.title+' '+game.series+' '+game.regionalVariants.map(x=>x.title).join(' ')).includes(norm(filters.search)))&&(!filters.series||game.series===filters.series)&&(!filters.year||game.releases.some(r=>r.date.slice(0,4)===filters.year))&&(!filters.platform||game.platforms.includes(filters.platform))&&(!filters.genre||game.genres.includes(filters.genre));}
