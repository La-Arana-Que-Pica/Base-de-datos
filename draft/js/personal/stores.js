import {clone,fail,canonical} from './format.js';
import {settleLocalCareer} from '../career/progression.js';
import {canonicalFinalSnapshot,createHistoryDisplay} from '../persistence/campaignHistory.js';
import {decodeLocalState} from '../persistence/campaignSnapshot.js';
import {capturePlayers} from '../ecosystem/model.js';
import {creditCampaign} from '../expansion/economy.js';
const unwrap=row=>row?.legacy??row;
export class PersonalCareerStore {
 constructor(runtime){this.runtime=runtime;}
 async open(){}
 async profile(subject){this.runtime.assertOwner(subject);await this.runtime.flush();return clone(this.runtime.progress);}
 async active(subject,region){this.runtime.assertOwner(subject);await this.runtime.flush();const r=this.runtime.bundle.data.runs.find(r=>r.id==='career:'+region);return r?clone(unwrap(r)):null;}
 async historyRow(subject,id){this.runtime.assertOwner(subject);await this.runtime.flush();const r=this.runtime.bundle.data.history.find(r=>r.id==='career:'+id);return r?clone(unwrap(r)):null;}
 async page(subject,{before=null,limit=10}={}){this.runtime.assertOwner(subject);await this.runtime.flush();const rows=this.runtime.bundle.data.history.filter(r=>r.id.startsWith('career:')).map(unwrap).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)||b.campaignId.localeCompare(a.campaignId)).filter(r=>!before||r.finishedAt<before[0]||r.finishedAt===before[0]&&r.campaignId<before[1]).slice(0,limit);return {rows:clone(rows),next:rows.length===limit?[rows.at(-1).finishedAt,rows.at(-1).campaignId]:null};}
 mutate(subject,fn){return this.runtime.mutate(subject,fn);}
 async save(subject,snapshot,{expectedRevision=0,allowReplace=false,writeId=crypto.randomUUID()}={}){
  this.runtime.assertOwner(subject);await this.runtime.flush();const previous=unwrap(this.runtime.bundle.data.runs.find(r=>r.id==='career:'+snapshot.data.region));
  if(previous?.revision===expectedRevision+1&&canonical(previous.snapshot)===canonical(snapshot))return {revision:previous.revision,progress:clone(this.runtime.progress),receipt:this.runtime.progress.grants[snapshot.campaignId]??null};
  const final=['champion','eliminated'].includes(snapshot.data.tournament?.status);
  const saved=await this.runtime.update('career:'+writeId,'career',data=>{
   data.shared.settings.careerRegion=snapshot.data.region;
   const id='career:'+snapshot.data.region,previous=unwrap(data.runs.find(r=>r.id===id));
   if((previous?.revision||0)!==expectedRevision)fail('CONFLICT','Otra pestaña modificó esta Carrera');
   if(previous&&previous.campaignId!==snapshot.campaignId&&!allowReplace)fail('REPLACE','Confirmá el reemplazo de la campaña');
   if(previous&&previous.campaignId!==snapshot.campaignId){data.shared.legacy.replaced??=[];data.shared.legacy.replaced.push(previous);}
   this.runtime.discoveries(data,snapshot);let receipt=null;
   if(final){const existing=data.history.find(r=>r.id==='career:'+snapshot.campaignId);if(existing)receipt=unwrap(existing).receipt;else if(!data.shared.legacy.importedFinals?.[snapshot.campaignId]||data.shared.progress.grants[snapshot.campaignId]){
     const result=settleLocalCareer(data.shared.progress,snapshot.campaignId,{career:snapshot.data.career,region:snapshot.data.region,tournament:snapshot.data.tournament});data.shared.progress=result.progress;receipt=result.receipt;
     data.history.push({id:'career:'+snapshot.campaignId,mode:'CAREER',legacy:{subject,campaignId:snapshot.campaignId,finishedAt:new Date().toISOString(),history_version:1,snapshot:canonicalFinalSnapshot(snapshot),display:createHistoryDisplay(snapshot),receipt}});
   }else{data.history.push({id:'career:'+snapshot.campaignId,mode:'CAREER',legacy:{subject,campaignId:snapshot.campaignId,finishedAt:'',archivedAt:new Date().toISOString(),importedUnverified:true,snapshot:canonicalFinalSnapshot(snapshot),display:createHistoryDisplay(snapshot),receipt:null}});}}
   const row={subject,region:snapshot.data.region,campaignId:snapshot.campaignId,revision:expectedRevision+1,snapshot};data.runs=data.runs.filter(r=>r.id!==id);data.runs.push({id,legacy:row});return {revision:row.revision,receipt};
  });return {...saved.result,progress:saved.progress};
 }
 async abandon(subject,region,campaignId,revision){this.runtime.assertOwner(subject);return this.runtime.update('abandon:'+campaignId,'abandon',data=>{const id='career:'+region,row=unwrap(data.runs.find(r=>r.id===id));if(row?.campaignId!==campaignId||row.revision!==revision)fail('CONFLICT','La Carrera cambió');data.shared.legacy.abandoned??=[];data.shared.legacy.abandoned.push({...row,abandonedAt:new Date().toISOString()});data.runs=data.runs.filter(r=>r.id!==id);});}
}
export class PersonalSurvivalStore {
 constructor(runtime){this.runtime=runtime;}
 variant(subject){if(subject===this.runtime.identity)return 'traditional';if(subject==='dream:'+this.runtime.identity)return 'dream';fail('OWNER','Racha de otro propietario');}
 async open(){}
 async load(subject){const variant=this.variant(subject);await this.runtime.flush();const row=this.runtime.bundle.data.runs.find(r=>r.id==='survival:'+variant),profile=this.runtime.bundle.data.shared.survivalProfiles[variant]||{subject,best:0,played:0};return {active:row?clone(unwrap(row)):null,profile:clone(profile)};}
 async save(subject,snapshot,revision){const variant=this.variant(subject),id='survival:'+variant;const saved=await this.runtime.update('survival-save:'+crypto.randomUUID(),'survival',data=>{
  const previous=unwrap(data.runs.find(r=>r.id===id)),run=snapshot.data.survival;
  if(previous&&previous.revision===revision+1&&canonical(previous.snapshot)===canonical(snapshot))return {row:previous,profile:data.shared.survivalProfiles[variant]};
  if((previous?.revision||0)!==revision)fail('CONFLICT','Otra pestaña modificó la racha');
  if(data.history.some(r=>r.id==='survival:'+run.id))fail('CLOSED','La participación ya terminó');
  this.runtime.discoveries(data,{campaignId:run.id,...snapshot});const profile=data.shared.survivalProfiles[variant]??={subject,best:0,played:0};profile.best=Math.max(profile.best,run.wins);
  data.shared.legacy.survivalResults??={};const key=run.id+':'+run.lastResult?.index;
  if(run.lastResult&&!data.shared.legacy.survivalResults[key]){data.shared.legacy.survivalResults[key]={subject,runId:run.id,...run.lastResult};profile.played++;}
  const row={subject,runId:run.id,revision:revision+1,snapshot};data.runs=data.runs.filter(r=>r.id!==id);data.runs.push({id,legacy:row});return {row,profile};
 });return saved.result;}
 async close(subject,runId,revision,reason){const variant=this.variant(subject),id='survival:'+variant;const saved=await this.runtime.update('survival-close:'+runId+':'+crypto.randomUUID(),'survival-close',data=>{
  const old=data.history.find(r=>r.id==='survival:'+runId);if(old){if(unwrap(old).reason!==reason)fail('CONFLICT','El cierre anterior es distinto');return unwrap(old);}
  const row=unwrap(data.runs.find(r=>r.id===id));if(!row||row.runId!==runId||row.revision!==revision)fail('CONFLICT','La racha cambió');
  const d=row.snapshot.data,run=d.survival,roster=decodeLocalState({xi:d.startersMap,bench:d.benchList,reserves:run.reserves||[]},{allowPermanent:variant==='dream'});
  const record=JSON.parse(JSON.stringify({subject,runId,reason,finishedAt:new Date().toISOString(),wins:run.wins,losses:run.losses,goalsFor:run.goalsFor,goalsAgainst:run.goalsAgainst,variant:run.variant||'TRADITIONAL',economySubject:this.runtime.identity,economyVersion:run.economyVersion||null,pendingCoins:run.pendingCoins??null,coachId:d.staff?.coachId,captainId:d.staff?.captainId,formationId:d.formationId,albumSubject:d.albumSubject??null,initialDraft:d.initialDraft??null,finalPlayers:capturePlayers([...Object.values(roster.xi||{}),...(roster.bench||[]),...(roster.reserves||[])]),campaignStats:d.campaignStats,played:run.wins+run.losses}));
  if(record.economyVersion===1)creditCampaign(data.shared.progress,(variant==='dream'?'SURVIVAL_DREAM:':'SURVIVAL:')+runId,{mode:variant==='dream'?'SURVIVAL_DREAM':'SURVIVAL',played:record.played,wins:record.wins,abandoned:reason==='abandoned'});
  data.history.push({id:'survival:'+runId,mode:variant==='dream'?'SURVIVAL_DREAM':'SURVIVAL',legacy:record});data.shared.survivalProfiles[variant]??={subject,best:0,played:0};data.shared.survivalProfiles[variant].lastParticipation=record;data.runs=data.runs.filter(r=>r.id!==id);return record;
 });return saved.result;}
 async history(subject,{before=null,limit=30}={}){const variant=this.variant(subject);await this.runtime.flush();return clone(this.runtime.bundle.data.history.filter(r=>r.mode===(variant==='dream'?'SURVIVAL_DREAM':'SURVIVAL')||r.id.startsWith('survival:')&&unwrap(r).variant===(variant==='dream'?'DREAM_TEAM':'TRADITIONAL')).map(unwrap).sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)||b.runId.localeCompare(a.runId)).filter(r=>!before||r.finishedAt<before[1]||r.finishedAt===before[1]&&r.runId<before[2]).slice(0,limit));}
 async results(subject,runId,{after=0,limit=30}={}){this.variant(subject);await this.runtime.flush();const legacy=this.runtime.bundle.data.shared.legacy,rows=[...Object.values(legacy.survivalResults||{}),...(legacy.sourceArchive||[]).filter(r=>r.type==='survival'&&r.store==='results'&&r.valid).map(r=>r.payload)],unique=new Map(rows.filter(r=>r.runId===runId&&r.index>after).map(r=>[r.index,r]));return clone([...unique.values()].sort((a,b)=>a.index-b.index).slice(0,limit));}
}
