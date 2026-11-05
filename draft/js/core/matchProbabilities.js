import {DRAFT_CONFIG as config} from '../config.js';
const c=config.POSSESSION_MODEL,balance=config.MATCH_BALANCE;
export const clampProbability=p=>Math.max(balance.MIN_PROBABILITY,Math.min(balance.MAX_PROBABILITY,p));
export const shotProbability=(attack,defense)=>clampProbability(c.SHOT_BASE+(attack-defense)*c.SHOT_DIFFERENCE);
export const targetProbability=(quality,clear=false)=>clampProbability(c.TARGET_BASE+(quality-80)*c.TARGET_SKILL+(clear?c.CLEAR_TARGET:0));
export const goalProbability=(quality,goalkeeper,clear=false)=>clampProbability(c.GOAL_BASE+(quality-goalkeeper)*c.FINISH_DIFFERENCE+(clear?c.CLEAR_GOAL:0));
