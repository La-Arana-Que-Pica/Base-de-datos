import {assertLegacyWritable} from '../personal/legacyFence.js';
import {personalContext} from '../personal/context.js';
import {officialContext,requireAccount,accountSubject} from '../accounts/context.js';
import {rewardLaboratoryRequested,REWARD_LAB_SUBJECT} from '../expansion/laboratory.js';
import {ALBUM_SOURCE} from '../data/album-catalog.js';
import {ALBUM_SECTIONS,albumSection} from './sections.js';
export {ALBUM_SECTIONS};
export const ALBUM_VERSION=1;
export function buildAlbumCatalog(source=ALBUM_SOURCE){const allowed=new Set(ALBUM_SECTIONS.map(x=>x[0])),teams=new Map(),players=new Map(),issues=[];for(const t of source.teams){const section=albumSection(t);if(!allowed.has(section))continue;if(teams.has(String(t.id))){issues.push('Club duplicado '+t.id);continue;}teams.set(String(t.id),{...t,section,playerIds:[]});}for(const p of source.players){const t=teams.get(String(p.teamId));if(!t)continue;const id=String(p.id);if(players.has(id)){issues.push('Jugador duplicado '+id);continue;}players.set(id,{...p,id,teamId:String(p.teamId)});if(!p.archived)t.playerIds.push(id);}return {version:ALBUM_VERSION,sourceVersion:source.sourceVersion,teams,players,issues};}
export const albumCatalog=buildAlbumCatalog();
export function albumProgress(ids,discovered){const unique=[...new Set(ids)],found=unique.filter(id=>Object.hasOwn(discovered,id)).length,total=unique.length;return {found,total,percent:total?Math.floor(found/total*1000)/10:0,complete:total>0&&found===total};}
export class LocalAlbum {
 constructor(storage,subject,catalog=albumCatalog,aliases=[]){Object.assign(this,{storage,subject,catalog,aliases});this.key='laqp-album-local-v1:'+subject;}
 preserve(key,raw){let hash=2166136261;for(const c of raw)hash=Math.imul(hash^c.charCodeAt(0),16777619);const backup=key+':unreadable:'+ (hash>>>0);if(!this.storage.getItem(backup))this.storage.setItem(backup,raw);globalThis.window?.dispatchEvent?.(new CustomEvent('laqp-album-warning',{detail:'Se conservó una copia de un registro ilegible del Álbum. Los descubrimientos válidos siguen disponibles.'}));}
 readSubject(subject){const key='laqp-album-local-v1:'+subject,discovered={};const raw=this.storage.getItem(key);if(raw){try{const row=JSON.parse(raw);if(row.version!==1||row.subject!==subject||!row.discovered||typeof row.discovered!=='object'||Array.isArray(row.discovered))throw Error();for(const [id,record]of Object.entries(row.discovered))if(this.catalog.players.has(id)&&record&&typeof record==='object')discovered[id]=record;}catch{this.preserve(key,raw);}}
  if(typeof this.storage.key==='function'){const keys=Array.from({length:this.storage.length},(_,i)=>this.storage.key(i));for(const k of keys){const prefix=key+':player:';if(!k?.startsWith(prefix)||k.includes(':unreadable:'))continue;const value=this.storage.getItem(k);try{const row=JSON.parse(value),id=k.slice(prefix.length);if(row.subject!==subject||row.playerId!==id||!row.discovery||typeof row.discovery!=='object'||!this.catalog.players.has(id))throw Error();discovered[id]=row.discovery;}catch{this.preserve(k,value||'');}}}return discovered;
 }
 read(){const result={};for(const subject of [...this.aliases,this.subject])Object.assign(result,this.readSubject(subject));return result;}
 discover(playerId,time=new Date().toISOString()){assertLegacyWritable(this.subject);const p=this.catalog.players.get(String(playerId));if(!p)return false;const discovered=this.read();if(Object.hasOwn(discovered,p.id))return false;discovered[p.id]={clubId:p.teamId,catalog:this.catalog.sourceVersion,firstDiscoveredAt:time};if(typeof this.storage.key==='function')this.storage.setItem(this.key+':player:'+p.id,JSON.stringify({subject:this.subject,playerId:p.id,discovery:discovered[p.id]}));else this.storage.setItem(this.key,JSON.stringify({version:1,subject:this.subject,discovered}));return true;}
}
let accountIdentity=()=>globalThis.window?.LAQPAuth?.user?.id||null;
export function configureAlbumIdentity(resolve){accountIdentity=resolve;}
export function albumContext(state){if(personalContext()){const r=personalContext();return {subject:r.albumSource,profile:r.identity,aliases:[],owner:r.identity,laboratory:r.identity.startsWith('laboratory:'),test:false};}
 const owner=accountIdentity()||'guest',test=new URLSearchParams(globalThis.location?.search||'').get('draftTest')==='1',local=['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname);
 if(rewardLaboratoryRequested())return {subject:'laboratory:'+REWARD_LAB_SUBJECT,profile:REWARD_LAB_SUBJECT,aliases:[],owner,laboratory:true,test};
 const profile=sessionStorage.getItem('laqp-career-menu-subject')||'sandbox-A',legacy='account-local:'+(test?'test:':'main:')+owner;
 // All local modes share the selected local profile; other accounts/profiles are not scanned.
 const subject=local?(test?'sandbox-test:':'sandbox:')+profile:legacy;return {subject,profile,aliases:local?[legacy,...(test?['sandbox:'+profile]:[])]:[],owner,laboratory:false,test};
}
export function localAlbumFor(state){if(personalContext()){const r=personalContext(),source=r.albumSource;return {subject:source,read:()=>{const result={...r.progress?.expansion?.albums?.[source]?.historical};for(const [key,row]of Object.entries(r.bundle.data.shared.albumNamespaces)){if(row.subject===source){Object.assign(result,row.discovered||{});if(row.playerId&&row.discovery)result[row.playerId]=row.discovery;}}return structuredClone(result);},discover:()=>false};}if(officialContext()){const r=requireAccount(),subject=accountSubject();return {subject,read:()=>structuredClone(r.account.view.progress.expansion?.albums?.[subject]?.historical||{}),discover:()=>{throw Error('Los descubrimientos oficiales los confirma el servidor.');}};}const context=albumContext(state);return new LocalAlbum(localStorage,context.subject,albumCatalog,context.aliases);}
