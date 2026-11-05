import {DRAFT_CONFIG} from '../config.js';
import {isNaturalPosition,getPositionFit} from '../core/positions.js';
export const POSITION_GROUPS={all:null,GK:['GK'],DEF:['CB','LB','RB','LWB','RWB','SW'],MID:['DMF','CMF','AMF','LMF','RMF'],ATT:['CF','SS','LWF','RWF']};
export function substitutionPositions(p){return [...new Set([p.primaryPosition,...(p.naturalPositions||[]),...(p.secondaryPositions||[])].filter(Boolean).map(s=>String(s).toUpperCase()))];}
export function matchesSubstitutionFilter(p,filter){if(!p)return false;const group=POSITION_GROUPS[filter];return !group||substitutionPositions(p).some(pos=>group.includes(pos));}
export function substitutionFit(p,position){const fit=getPositionFit(p,position),natural=isNaturalPosition(p,position),alternative=(p.secondaryPositions||[]).includes(position);return {...fit,compatible:natural||alternative,kind:natural?'Posición A / principal':alternative?'Posición alternativa B':'Posición no declarada'};}
export const availableSubstitutes=m=>m.userBench.filter(p=>!m.departedIds.has(String(p.id))&&!p.substitutedOut&&!p.sentOff&&!p.injured);
export class SubstitutionPlan{
 constructor(match){this.match=match;this.queue=[];this.outId=null;this.inId=null;this.filter='all';}
 select(direction,id){const key=direction==='out'?'outId':'inId';this[key]=this[key]===String(id)?null:String(id);}
 get current(){return this.outId&&this.inId?{outId:this.outId,inId:this.inId}:null;}
 get prepared(){return [...this.queue,...(this.current?[this.current]:[])];}
 validate(pairs=this.prepared){const m=this.match;if(!pairs.length)return 'Elegí quién sale y quién entra.';if(!m.canSubstitute())return 'No quedan cambios o ventanas disponibles.';if(pairs.length>DRAFT_CONFIG.MAX_SUBSTITUTIONS-m.substitutionsUsed)return 'La selección supera los cambios disponibles.';const outs=new Set(),ins=new Set();for(const p of pairs){if(outs.has(p.outId)||ins.has(p.inId))return 'Un jugador no puede participar en dos cambios preparados.';outs.add(p.outId);ins.add(p.inId);if(!m.userStarters.some(o=>String(o.id)===p.outId)||!availableSubstitutes(m).some(i=>String(i.id)===p.inId))return 'Revisá los jugadores: alguno ya no está disponible.';}return null;}
 add(){const error=this.validate();if(error)return error;this.queue.push(this.current);this.outId=null;this.inId=null;return null;}
 remove(index){this.queue.splice(index,1);}
 confirm(apply){const error=this.validate();if(error)return {success:false,message:error};const pairs=this.prepared;let applied=0;for(const pair of pairs){const result=apply(pair.outId,pair.inId);if(!result.success){this.queue=pairs.slice(applied);this.outId=null;this.inId=null;return {...result,applied};}applied++;}this.queue=[];this.outId=null;this.inId=null;return {success:true,applied};}
}
