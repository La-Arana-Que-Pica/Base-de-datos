import {getCoach,registerLaboratoryCoach} from '../data/coaches.js';
export const REWARD_LAB_SUBJECT='rewards-lab';
export function rewardLaboratoryRequested(){return ['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname)&&new URLSearchParams(globalThis.location?.search||'').get('recompensasLab')==='1';}
export const TED_LAB_COACH={id:'lab:coach:ted-lasso',name:'Ted Lasso · BORRADOR',archetype:'Entrenador provisional',ability:'Habilidad pendiente de validación',description:'LABORATORIO: entrenador sin bonificación deportiva hasta validar su habilidad.',family:'creation',condition:'always',effect:0,counterFamily:null,counterEffect:0,originalEffect:0,application:'Sin efecto provisional',laboratory:true,image:'assets/special_players/Ted%20Lasso.png'};
export function prepareLaboratoryDefinitions(){if(rewardLaboratoryRequested()&&!getCoach(TED_LAB_COACH.id))registerLaboratoryCoach(TED_LAB_COACH);}
