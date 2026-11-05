import {assertLegacyWritable} from '../personal/legacyFence.js';
import {personalContext} from '../personal/context.js';
import {officialContext} from '../accounts/context.js';
import {albumCatalog,albumContext,localAlbumFor} from './catalog.js';
import {readLocal} from '../ecosystem/sources.js';
import {DATA_REVISION} from '../persistence/campaignSnapshot.js';
import {getPlayerById} from '../data/adapter.js';
import {ExpansionStore} from '../expansion/store.js';
import {albumState} from '../expansion/album.js';
const pending=new Map();
// Inspect only rosters actually owned by the user. Never traverse opponents/offers/packs.
export function historicalDiscoveries(row){
 const snapshot=row.snapshot||row,data=snapshot.data||{},career=data.career||row.display?.career;
 if(data.survival?.variant==='DREAM_TEAM'||row.variant==='DREAM_TEAM')return [];
 const ids=new Set(),wildcard=String(career?.wildcardId||'');
 const add=(value)=>{if(!value)return;const flags=value.state||value;
  if(value.$permanent||flags.collectionWildcard||value.collectionWildcard||value.permanentVariantId)return;
  const id=String(value.$player||value.playerId||value.id||value);
  if(id===wildcard||!albumCatalog.players.has(id))return;
  if(value.$player&&snapshot.dataRevision&&snapshot.dataRevision!==DATA_REVISION)return;
  if(value.name&&getPlayerById(id)?.name!==value.name)return;
  ids.add(id);
 };
 for(const list of [data.initialDraft?.players,row.initialDraft?.players,row.display?.initialDraft?.players,row.finalPlayers,row.display?.players,data.benchList,data.survival?.reserves])if(Array.isArray(list))list.forEach(add);
 Object.values(data.startersMap||{}).forEach(add);
 if(Array.isArray(data.temporaryAcquisitions))data.temporaryAcquisitions.forEach(add);
 if(career?.wildcard?.outgoingId)add(career.wildcard.outgoingId);
 return [...ids];
}
export function mergeHistoricalAlbums(progress,context,discovered){
 const target=albumState(progress,context.subject,discovered);
 for(const alias of context.aliases){const old=progress.expansion.albums[alias];if(!old)continue;
  for(const field of ['claims','rights','events']){target[field]??={};for(const [key,value]of Object.entries(old[field]||{}))if(!['__proto__','prototype','constructor'].includes(key)&&!Object.hasOwn(target[field],key))target[field][key]=structuredClone(value);}
  for(const [id,cycle]of Object.entries(old.cycles||{})){if(!albumCatalog.teams.has(id)||!Number.isInteger(cycle.index)||cycle.index<1)continue;const current=target.cycles[id];if(!current||cycle.index>current.index)target.cycles[id]=structuredClone(cycle);else if(current.index===cycle.index){current.found={...cycle.found,...current.found};current.claimed=!!(current.claimed||cycle.claimed);}}
 }
 return target;
}
export async function recoverAlbum(state,{cloudHistory=null}={}){if(personalContext()){const r=personalContext();await r.flush();const discovered=localAlbumFor(state).read();return {discovered,progress:structuredClone(r.progress),report:{version:1,added:0,total:Object.keys(discovered).length,campaigns:r.bundle.data.history.length,notes:['Álbum del perfil personal; no se infieren derechos de otras fuentes.']}};}if(officialContext())throw Error('Los descubrimientos de cuenta provienen únicamente del servidor.');
 const context=albumContext(state);assertLegacyWritable(context.profile);const key=context.subject+'|'+context.owner+'|'+context.test;
 if(pending.has(key))return pending.get(key);
 const work=(async()=>{
  const album=localAlbumFor(state),before=album.read(),known=new Map(Object.entries(before)),notes=[],records=[],campaigns=new Set();
  const valid=()=>{const now=albumContext(state);return now.subject===context.subject&&now.owner===context.owner&&now.test===context.test;};
  const add=(row,label)=>{const source=row.albumSubject||row.snapshot?.data?.albumSubject||row.data?.albumSubject;if(source&&![context.subject,...context.aliases].includes(source))return;for(const id of historicalDiscoveries(row))if(!known.has(id))known.set(id,{clubId:albumCatalog.players.get(id).teamId,source:'history-recovery',evidence:label,recoveredAt:new Date().toISOString()});const id=row.campaignId||row.campaign_id||row.runId||row.snapshot?.campaignId;if(id)campaigns.add(String(id));};
  const profile=context.profile,traditional=context.laboratory?'lab:traditional:rewards-lab':'guest';
  const [career,survival]=await Promise.all([readLocal('laqp-career-local-v1',['active','history','backups','profiles'],profile),readLocal('laqp-survival-local-v1',['active','history'],traditional)]);
  for(const store of ['active','history','backups'])for(const row of career[store]||[])records.push([row,'Carrera · '+store]);
  for(const store of ['active','history'])for(const row of survival[store]||[])if((row.economySubject||row.snapshot?.data?.survival?.economySubject||'sandbox-A')===profile)records.push([row,'Supervivencia · '+store]);
  const progress=career.profiles?.[0]?.progress;
  for(const source of [context.subject,...context.aliases])for(const [id,value]of Object.entries(progress?.expansion?.albums?.[source]?.historical||{}))if(albumCatalog.players.has(id)&&!known.has(id))known.set(id,value);
  const storage=album.storage,keys=Array.from({length:storage.length},(_,i)=>storage.key(i));
  const navPrefix='laqp-draft-navigation-copy-v1:'+context.owner+':'+(context.laboratory?'rewards-lab:':'')+(context.test?'test':'main')+':';
  for(const storageKey of keys){try{
   if(storageKey.startsWith(navPrefix)){const row=JSON.parse(storage.getItem(storageKey));if(row.owner===context.owner)records.push([row,'Clásico · copia local']);}
   else if(storageKey==='laqp-draft-outbox-v1:'+context.owner){const row=JSON.parse(storage.getItem(storageKey));if(row.owner===context.owner)for(const job of row.jobs||[])records.push([job,'Clásico · guardado pendiente']);}
  }catch{notes.push('Se conservó una copia local ilegible sin modificarla.');}}
  // Active roster and confirmed acquisitions, not the five pending candidates.
  add({data:{albumSubject:state.albumSubject,startersMap:state.startersMap,benchList:state.benchList,temporaryAcquisitions:state.temporaryAcquisitions,initialDraft:state.initialDraft,career:state.career,survival:state.survival}},'Plantilla actual');
  for(const [row,label]of records)add(row,label);
  if(cloudHistory&&!context.laboratory){try{let cursor=null;const seen=new Set();do{if(!valid())throw Error('La cuenta cambió durante la revisión.');const page=await cloudHistory.list(cursor);for(const item of page.items){const row=await cloudHistory.detail(item.campaign_id);if(row.user_id!==context.owner)throw Error('Historial ajeno a la cuenta actual.');add(row,'Clásico · historial de cuenta');}cursor=page.next;if(cursor!==null){if(seen.has(cursor))throw Error('El historial devolvió una página repetida.');seen.add(cursor);}}while(cursor!==null);}catch(error){notes.push('Historial de cuenta incompleto: '+error.message);}}
  if(!valid())throw Error('La identidad cambió. No se aplicó la recuperación a otro perfil.');
  const recovered=Object.fromEntries(known),added=[...known.keys()].filter(id=>!Object.hasOwn(before,id));
  // Journals are append-only. Old keys, histories, inventories and balances are retained.
  for(const id of added){const record={subject:context.subject,playerId:id,discovery:recovered[id]};storage.setItem(album.key+':player:'+id,JSON.stringify(record));}
  let updatedProgress=progress;
  if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&progress&&(known.size||context.aliases.some(source=>progress.expansion?.albums?.[source]))){
   const backupKey='laqp-album-recovery-backup-v1:'+profile;
   if(!storage.getItem(backupKey))storage.setItem(backupKey,JSON.stringify({profile,albums:progress.expansion?.albums||{},savedAt:new Date().toISOString()}));
   const store=new ExpansionStore(indexedDB);try{const result=await store.mutate(profile,p=>{if(!valid())throw Error('La cuenta cambió.');mergeHistoricalAlbums(p,context,recovered);});updatedProgress=result.progress;}finally{store.db?.close();}
  }
  const report={version:1,subject:context.subject,owner:context.owner,added:added.length,total:known.size,campaigns:campaigns.size,notes,checkedAt:new Date().toISOString()};
  storage.setItem('laqp-album-recovery-report-v1:'+context.subject,JSON.stringify(report));
  return {discovered:recovered,progress:updatedProgress,report};
 })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
