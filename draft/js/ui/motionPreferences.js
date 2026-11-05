// Shared presentation preference. Never changes the browser or OS setting.
import {personalContext} from '../personal/context.js';
export const MOTION_STORAGE_KEY='laqp-draft-motion';
const modes=['system','full','fast','reduced'];
const media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
let mode='system';
try { const saved=globalThis.localStorage?.getItem(MOTION_STORAGE_KEY); if(modes.includes(saved))mode=saved; } catch {}
const listeners=new Set();
export function getMotionMode(){return mode;}
export function isReducedMotion(){return mode==='reduced'||(mode==='system'&&!!media?.matches);}
function apply(){
 const root=globalThis.document?.documentElement;
 if(root){root.dataset.motionMode=mode;root.dataset.motion=isReducedMotion()?'reduced':'full';}
 for(const listener of listeners)listener(isReducedMotion(),mode);
}
export function setMotionMode(value){
 if(!modes.includes(value))return false;
 mode=value;try{if(!personalContext())globalThis.localStorage?.setItem(MOTION_STORAGE_KEY,mode);}catch{}
 apply();return true;
}
export function subscribeMotion(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
media?.addEventListener?.('change',()=>{if(mode==='system')apply();});
apply();

// Fast retains the exact same half-turns; only presentation time changes.
export function getRevealMotionScale(){return mode==='fast'?.5:1;}
