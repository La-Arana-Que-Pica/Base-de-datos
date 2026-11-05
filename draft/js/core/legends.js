import {getLegendPlayers} from '../data/adapter.js';
import {isNaturalPosition} from './positions.js';
export const LEGEND_RULES={version:1,offerProbability:.025,maxPerOffer:1,enabledModes:['CLASSIC','CAREER','SURVIVAL']};
export function withLegendCandidate(candidates,position,draftedIds,rng,{mode='CLASSIC',enabled=true}={}){if(!enabled||!LEGEND_RULES.enabledModes.includes(mode))return candidates;const legends=getLegendPlayers().filter(p=>!draftedIds.has(p.id)&&(!position||isNaturalPosition(p,position))&&(position!=='GK'||p.primaryPosition==='GK'));if(!legends.length||rng()>=LEGEND_RULES.offerProbability)return candidates;const p=legends[Math.floor(rng()*legends.length)],out=[...candidates];out[Math.floor(rng()*out.length)]=p;return out;}
