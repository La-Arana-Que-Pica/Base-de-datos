// Presentation only: sporting coordinates, roles, IDs and chemistry remain unchanged.
export const TEAM_CARD_CLEARANCE = {x: 11, y: 20.7};
export function projectField(x,y){
 const depth=y/100,denominator=1-.3913043478*depth;
 return {x:50+(x/100-.5)*56/denominator,y:4+54.17391304*depth/denominator};
}

// The formation signature defines the tactical lines. Original depth determines
// membership, original horizontal order determines the order within each line.
// This also groups DM + CM in a midfield of three, without changing their roles.
export function formationRows(formation) {
 const counts = formation.id.split('-').map(Number);
 if (counts.some(n => !Number.isInteger(n) || n < 1) || counts.reduce((a,b)=>a+b,0) !== 10) throw new Error('Invalid tactical signature: '+formation.id);
 const field = formation.slots.filter(s => s.position !== 'GK').sort((a,b)=>b.y-a.y || a.x-b.x || a.id.localeCompare(b.id));
 let offset = 0;
 const rows = counts.map(count => {
  const row = field.slice(offset,offset+count).sort((a,b)=>a.x-b.x || a.id.localeCompare(b.id));
  offset += count;
  return row;
 });
 return [...rows.reverse(), formation.slots.filter(s=>s.position === 'GK')];
}

const MIN_ROW_GAP = 10.5;
function rowCandidates(row,index,total) {
 const idealY = 11.5 + index * 75.5 / (total-1);
 const ys = index === 0 ? [11.5] : index === total-1 ? [87] : Array.from({length:29},(_,i)=>Math.round(idealY)-14+i).filter(y=>y>=26 && y<=77);
 const candidates = [];
 for(const y of ys) {
  // Leave room for the card at the narrower (upper) edge of its footprint.
  const edge = 22 - 18 * (y-12-4)/89;
  const maxSpan = 2*(50-edge-5.5);
  const preferred = row.length === 2 ? (index === 0 ? 30 : 42) : maxSpan*.94;
  const spans = row.length === 1 ? [0] : Array.from({length:76},(_,i)=>i).filter(span=>span >= (row.length-1)*TEAM_CARD_CLEARANCE.x && span<=maxSpan);
  for(const span of spans) {
   const xs = row.map((_,i)=>row.length===1 ? 50 : 50-span/2+i*span/(row.length-1));
   candidates.push({y,xs,cost:(y-idealY)**2 + (span-(row.length===1?0:preferred))**2*.16});
  }
 }
 return candidates;
}
function separated(a,b) {
 return b.y-a.y >= TEAM_CARD_CLEARANCE.y ||
  a.xs.every(x=>b.xs.every(other=>Math.abs(x-other)>=TEAM_CARD_CLEARANCE.x));
}
function compatible(a,b,lastRow=false) {
 return b.y-a.y >= (lastRow ? 9 : MIN_ROW_GAP) && separated(a,b);
}

// Choose spacing for whole, centred rows rather than displacing individual cards.
// Dynamic programming balances tactical depth and width with compact-card bounds.
// Outfield rows two lines apart clear the card height. The goalkeeper also
// checks the penultimate line. No formation-specific offsets or iteration drift.
const layoutCache = new WeakMap();
export function layoutFormation(formation) {
 const cached = layoutCache.get(formation);
 if(cached) return cached;
 const rows = formationRows(formation);
 let previous = [];
 const layers = rows.map((row,index)=>{
  const candidates = rowCandidates(row,index,rows.length);
  for(const candidate of candidates) {
   candidate.total = index === 0 ? candidate.cost : Infinity;
   candidate.previous = null;
   if(index) for(const parent of previous) {
    const cost = parent.total+candidate.cost;
    if(cost < candidate.total && compatible(parent,candidate,index === rows.length-1) && (!parent.previous || separated(parent.previous,candidate))) {
     candidate.total = cost;
     candidate.previous = parent;
    }
   }
  }
  previous = candidates.filter(c=>Number.isFinite(c.total));
  return previous;
 });
 let chosen = layers.at(-1).reduce((best,c)=>!best || c.total<best.total?c:best,null);
 if(!chosen) throw new Error('No readable tactical layout: '+formation.id);
 const result = {};
 for(let i=rows.length-1;i>=0;i--) {
  rows[i].forEach((slot,j)=>{result[slot.id]=Object.freeze({x:Number(chosen.xs[j].toFixed(3)),y:chosen.y});});
  chosen = chosen.previous;
 }
 Object.freeze(result);
 layoutCache.set(formation,result);
 return result;
}
export function fieldPath(points,closed=false){return points.map(([x,y],i)=>{const p=projectField(x,y);return (i?'L':'M')+p.x.toFixed(3)+' '+p.y.toFixed(3);}).join(' ')+(closed?' Z':'');}
export function fieldCircle(x,y,rx,ry,from=0,to=Math.PI*2){return fieldPath(Array.from({length:65},(_,i)=>{const a=from+(to-from)*i/64;return [x+rx*Math.cos(a),y+ry*Math.sin(a)];}));}
