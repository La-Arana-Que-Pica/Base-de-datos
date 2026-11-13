// Same field projection and paths as the Draft squad screen. No Draft data or chemistry.
import {projectField,fieldPath,fieldCircle,layoutFormation} from './team-geometry.js?v=formation-layout-4';

function unprojectField(x,y) {
  const depth=(y-4)/(54.17391304+.3913043478*(y-4));
  return {x:50+(x-50)*(1-.3913043478*depth)/.56,y:depth*100};
}
function pitchSurface() {
  const outline=fieldPath([[0,0],[100,0],[100,100],[0,100]],true);
  const bands=Array.from({length:10},(_,i)=>`<path fill="${i%2?'#295e27':'#225322'}" d="${fieldPath([[0,i*10],[100,i*10],[100,(i+1)*10],[0,(i+1)*10]],true)}"/>`).join('');
  const angle=Math.asin((15.714-10.476)/8.714);
  const lines=[fieldPath([[0,50],[100,50]]),fieldPath([[17.65,0],[17.65,15.714],[82.35,15.714],[82.35,0]]),fieldPath([[36.5,0],[36.5,5.238],[63.5,5.238],[63.5,0]]),fieldPath([[17.65,100],[17.65,84.286],[82.35,84.286],[82.35,100]]),fieldPath([[36.5,100],[36.5,94.762],[63.5,94.762],[63.5,100]]),fieldCircle(50,50,13.456,8.714),fieldCircle(50,10.476,13.456,8.714,angle,Math.PI-angle),fieldCircle(50,89.524,13.456,8.714,Math.PI+angle,Math.PI*2-angle),fieldCircle(0,0,1.47,.952,0,Math.PI/2),fieldCircle(100,0,1.47,.952,Math.PI/2,Math.PI),fieldCircle(0,100,1.47,.952,-Math.PI/2,0),fieldCircle(100,100,1.47,.952,Math.PI,Math.PI*1.5)].join(' ');
  const points=[[50,50],[50,10.476],[50,89.524]].map(([x,y])=>{const p=projectField(x,y);return `<ellipse cx="${p.x}" cy="${p.y}" rx=".35" ry=".5"/>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="builder-draft-surface" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path fill="#092410" d="M4 93H96V95H4Z"/><path fill="#163d1a" stroke="#123a1c" stroke-width="2" d="${outline}"/>${bands}<path fill="none" stroke="#c2db9b" stroke-width=".35" opacity=".65" d="${outline} ${lines}"/><g fill="#c2db9b" opacity=".7">${points}</g><path fill="none" stroke="#b4d7b5" stroke-width=".45" opacity=".55" d="${fieldPath([[44.6,0],[44.6,-2.2],[55.4,-2.2],[55.4,0]])} ${fieldPath([[44.6,100],[44.6,102.2],[55.4,102.2],[55.4,100]])}"/></svg>`;
}
function compactName(name) {
  const words=String(name).trim().split(/\s+/);
  if(name.length<=13 || words.length===1 || words[0].endsWith('.')) return name;
  const surname=/^(de|del|da|dos|di|van|von|mac|st\.|san)$/i.test(words.at(-2)) ? words.at(-2)+' '+words.at(-1) : words.at(-1);
  return Array.from(words[0])[0]+'. '+surname;
}
const tier=overall=>overall>=90?'elite':overall>=85?'highlight':overall>=75?'bright':'standard';
const standardCache=new WeakMap();
// Reserve enough room for a full card and its caption in front of the fixed GK.
function separateGoalkeeperSlots(formation,positions) {
  const keeper=formation.slots.find(slot=>slot.position==='GK');
  if(!keeper || !positions[keeper.id])return;
  const goal=projectField(positions[keeper.id].x,positions[keeper.id].y);
  formation.slots.filter(slot=>['CB','LB','RB'].includes(slot.position)).forEach(slot=>{
    const point=positions[slot.id];if(!point)return;
    const at=projectField(point.x,point.y);
    if(Math.abs(at.x-goal.x)<11 && Math.abs(at.y-goal.y)<23.5) {
      point.y=unprojectField(at.x,goal.y-23.5).y;
    }
  });
}
function standardPositions(formation) {
  if(standardCache.has(formation))return standardCache.get(formation);
  let positions;
  try { const visual=layoutFormation(formation);positions=Object.fromEntries(formation.slots.map(slot=>{const point=unprojectField(visual[slot.id].x,visual[slot.id].y);return [slot.id,{x:Math.min(95,Math.max(5,point.x)),y:Math.min(95,Math.max(5,point.y))}];})); }
  catch { positions=Object.fromEntries(formation.slots.map(slot=>[slot.id,{x:slot.x,y:slot.y}])); }
  const keeper=formation.slots.find(slot=>slot.position==='GK');
  if(keeper)positions[keeper.id]=unprojectField(50,87);
  separateGoalkeeperSlots(formation,positions);
  standardCache.set(formation,positions);return positions;
}
window.LAQPBuilderDraftView={projectField,unprojectField,pitchSurface,compactName,tier,fieldPath,standardPositions,separateGoalkeeperSlots};
await import('./squad-builder.js?v=20261113-ga4');
