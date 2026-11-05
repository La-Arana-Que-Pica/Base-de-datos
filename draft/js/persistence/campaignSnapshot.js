import {savedTournamentFormat} from '../core/tournamentFormat.js';
import {getCoach} from '../data/coaches.js';
import {DRAFT_CONFIG as config} from '../config.js';
import {DATASET} from '../data/dataset.js';
import {getPlayerById,getTeamById} from '../data/adapter.js';
import {StateStore} from '../state.js';
import {MatchEngine,createRng} from '../core/matchEngine.js';
import {getDraftPlan} from '../core/draftEngine.js';
import {getNextOpponent,USER_TEAM_ID} from '../core/tournament.js';
import {campaignPlayer} from '../core/campaignRewards.js';
export const SAVE_VERSION=1;
export const DATA_REVISION=DATASET.sourceVersion||DATASET.version;
export const SAFE_SCREENS=['FORMATION','DRAFTING','CAREER_WILDCARD','REVIEW','OPPONENT','MATCH_RESULT','REWARD_CHOICE','UPGRADE_PLAYER','STEAL_RIVAL','BRACKET','BRACKET_PREVIEW','NEXT_RIVAL','CAMPAIGN_END'];
const fields=['albumSubject','expansionRunId','expansionSubject','region','formationId','formationOffer','selectedFormationId','formationConfirmed','currentPickIndex','pendingDraftSlotId','squadCompletionPending','confirmedLineup','startersMap','benchList','temporaryAcquisitions','campaignUpgrades','lastRewardSummary','round','tournament','campaignStats','initialDraftOverall','initialDraft','lastMatchResult'];
const playerFields=['slotId','slotPosition','slotX','slotY','energy','originalOverall','campaignBoost','temporaryAcquisition','matchChemistry','superSubActive','injured','sentOff','yellowCards','redCards','substitutedOut','goalkeeperWorkload','emergencyKeeper','emergencyOriginalPosition','collectionBoost','collectionWildcard','collectionOrigin'];
const runtime=new Set(['rng','playback','onTick','onEvent','onFinish','timerId','listeners']);
const bad=new Set(['__proto__','prototype','constructor']);
const fail=message=>{throw new Error(message);};
export function validateAlbumSubject(value){if(value!==null&&(typeof value!=='string'||!value.trim()||value.length>200||/[\u0000-\u001f\u007f]/.test(value)))fail('Procedencia del Álbum inválida');return value;}
export function safeCheckpoint(state){return SAFE_SCREENS.includes(state.currentScreen)&&(!state.activeMatch||state.activeMatch.isFinished||state.currentScreen!=='MATCH');}
function encode(value){
 if(value==null||typeof value!=='object')return value;
 if(value.permanentVariantId)return {$permanent:JSON.parse(JSON.stringify(value))};
 if(value instanceof Set)return {$set:[...value]};
 if(Array.isArray(value))return value.map(encode);
 if(value.id&&value.name&&value.primaryPosition&&Array.isArray(value.naturalPositions)&&Number.isFinite(value.overall))return {$player:String(value.id),state:Object.fromEntries(playerFields.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))};
 return Object.fromEntries(Object.entries(value).filter(([k,v])=>!runtime.has(k)&&typeof v!=='function'&&v!==undefined).map(([k,v])=>[k,encode(v)]));
}
function decode(value,depth=0,allowPermanent=false){
 if(depth>100)fail('Guardado demasiado profundo');
 if(value==null||typeof value!=='object'){if(typeof value==='number'&&!Number.isFinite(value))fail('Número inválido');return value;}
 if(Array.isArray(value))return value.map(v=>decode(v,depth+1,allowPermanent));
 for(const key of Object.keys(value))if(bad.has(key))fail('Clave no permitida');
 if('$permanent' in value){if(!allowPermanent)fail('Las cartas permanentes no pertenecen a esta modalidad');const p=value.$permanent;if(!p?.id||!p.permanentVariantId||!Array.isArray(p.naturalPositions)||!Number.isFinite(p.overall)||p.overall<40||p.overall>99)fail('Carta permanente incompatible');return decode(p,depth+1,allowPermanent);}
 if('$set' in value){if(!Array.isArray(value.$set))fail('Conjunto inválido');return new Set(value.$set);}
 if('$player' in value){const original=getPlayerById(value.$player);if(!original||!value.state||typeof value.state!=='object'||Array.isArray(value.state))fail('Futbolista no disponible en esta base');
  for(const key of Object.keys(value.state))if(!playerFields.includes(key))fail('Propiedad de futbolista no permitida');
  if('emergencyKeeper' in value.state&&typeof value.state.emergencyKeeper!=='boolean')fail('Arquero de emergencia inválido');if(value.state.emergencyKeeper&&value.state.slotPosition!=='GK')fail('Posición de emergencia incompatible');
  const collectionBoost=value.state.collectionBoost??0;
  if(!Number.isInteger(collectionBoost)||collectionBoost<0||collectionBoost>10||collectionBoost>Math.max(0,95-original.overall))fail('Mejora permanente inválida');
  const base=collectionBoost?{...original,overall:original.overall+collectionBoost}:original;
  const p=value.state.originalOverall!=null||value.state.campaignBoost!=null?campaignPlayer(base,value.state.campaignBoost??0):{...base};
  if(value.state.originalOverall!=null&&value.state.originalOverall!==base.overall)fail('Media original incompatible');
  if(!Number.isInteger(value.state.campaignBoost??0)||(value.state.campaignBoost??0)<0||(value.state.campaignBoost??0)>99-base.overall)fail('Mejora inválida');
  if('collectionWildcard' in value.state&&typeof value.state.collectionWildcard!=='boolean'||value.state.collectionWildcard===true&&!['EUROPA','AMERICA'].includes(value.state.collectionOrigin)||collectionBoost>0&&value.state.collectionWildcard!==true)fail('Identidad de colección inválida');
  if(value.state.energy!=null&&(!Number.isFinite(value.state.energy)||value.state.energy<0||value.state.energy>100))fail('Energía inválida');
  return {...p,...decode(value.state,depth+1,allowPermanent),overall:p.overall};
 }
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v,depth+1,allowPermanent)]));
}
export function createCampaignSnapshot(state,campaignId){
 if(!safeCheckpoint(state))fail('Este momento no admite un checkpoint seguro');
 const data=Object.fromEntries(fields.filter(k=>!['expansionRunId','expansionSubject'].includes(k)||state[k]!=null).map(k=>[k,encode(state[k])]));
 if(state.staff)data.staff=encode(state.staff);
 if(state.career)data.career=encode(state.career);
 data.currentScreen=state.currentScreen;data.candidateCache=Object.fromEntries(Object.entries(state.candidateCache).map(([slot,players])=>[slot,players.map(p=>p.id)]));data.activeDraftSlot=state.activeDraftStep?.slotId??null;
 data.tournamentRng=state.tournament?.rng?.getState?.()??null;
 data.finalMatch=state.activeMatch?.isFinished?encode(state.activeMatch):null;
 // The result and final engine share the same journal. Store it once, restore both views.
 if(data.finalMatch&&data.lastMatchResult)for(const key of ['actions','events','stats']){
  if(state.lastMatchResult?.[key]===state.activeMatch[key]&&state.activeMatch[key]!=null)data.lastMatchResult[key]={$finalMatchRef:key};
 }
 const snapshot={version:SAVE_VERSION,dataRevision:DATA_REVISION,campaignId,data};
 validateCampaignSnapshot(snapshot);return snapshot;
}
function validateTournament(t,players,career){
 if(!t)return;
 let format;try{format=savedTournamentFormat(t);}catch{fail('Formato de torneo incompatible');}const participants=format.participants,n=format.roundCount;if(![16,32].includes(participants))fail('Cantidad incompatible');
 if(!['active','eliminated','champion'].includes(t.status)||!Number.isInteger(t.roundIndex)||t.roundIndex<0||t.roundIndex>=n||!Number.isInteger(t.seed)||!t.teams||Object.keys(t.teams).length!==participants||!t.teams[USER_TEAM_ID]||!Array.isArray(t.rounds)||t.rounds.length!==n||!Array.isArray(t.history)||t.history.length>n)fail('Cuadro incompatible');
 const teamIds=new Set(Object.keys(t.teams));for(const [id,team] of Object.entries(t.teams)){if(team.id!==id||id!==USER_TEAM_ID&&!getTeamById(id))fail('Participante inválido');}
 t.rounds.forEach((round,index)=>{if(round.label!==format.labels[index]||!Array.isArray(round.matches)||round.matches.length!==participants/2**(index+1))fail('Ronda inválida');round.matches.forEach((m,i)=>{if(m.id!==index+'-'+i||[m.homeId,m.awayId].some(id=>id!==null&&!teamIds.has(id)))fail('Cruce inválido');if(index===0&&(!m.homeId||!m.awayId))fail('Cuadro inicial incompleto');if(m.winnerId!==null&&(!m.result||![m.homeId,m.awayId].includes(m.winnerId)))fail('Ganador inválido');if(m.result){for(const key of ['homeScore','awayScore'])if(!Number.isInteger(m.result[key])||m.result[key]<0)fail('Resultado inválido');const r=m.result,homeWins=r.homeScore>r.awayScore||r.homeScore===r.awayScore&&r.penalties?.home>r.penalties?.away;if(m.winnerId!==(homeWins?m.homeId:m.awayId))fail('Resultado y ganador no coinciden');}});});
 if(new Set(t.rounds[0].matches.flatMap(m=>[m.homeId,m.awayId])).size!==participants)fail('Participantes duplicados');
 for(let round=1;round<n;round++)t.rounds[round].matches.forEach((m,i)=>{const prev=t.rounds[round-1].matches;if(m.homeId!==prev[i*2].winnerId||m.awayId!==prev[i*2+1].winnerId)fail('Avance del cuadro inconsistente');});
 if(t.pendingAcquisition!==!!t.pendingRewardId)fail('Recompensa incoherente');
 for(const [id,r]of Object.entries(t.rewards||{})){if(r.id!==id||!Number.isInteger(r.roundIndex)||r.roundIndex<0||r.roundIndex>=n-1||!['pending','consumed'].includes(r.status))fail('Recompensa inválida');const win=t.rounds[r.roundIndex].matches.find(m=>m.homeId===USER_TEAM_ID||m.awayId===USER_TEAM_ID);if(win?.winnerId!==USER_TEAM_ID||id!==String(t.seed)+':'+win.id)fail('Recompensa sin victoria');}
 if(t.pendingRewardId&&t.rewards?.[t.pendingRewardId]?.status!=='pending')fail('Recompensa pendiente ausente');
 if(t.status==='champion'&&t.rounds[n-1].matches[0].winnerId!==USER_TEAM_ID)fail('Campeonato no registrado');
 if(players.length!==23)fail('Plantel del torneo incompleto');
}
export function validateCampaignSnapshot(snapshot){
 if(!snapshot||snapshot.version!==SAVE_VERSION)fail('Versión de guardado incompatible');
 if(snapshot.dataRevision!==DATA_REVISION)fail('La base de jugadores cambió; este guardado requiere revisión');
 if(typeof snapshot.campaignId!=='string'||!/^[0-9a-f-]{36}$/i.test(snapshot.campaignId))fail('Identificador de campaña inválido');
 const json=JSON.stringify(snapshot);if(json.length>2000000)fail('Guardado demasiado grande');
 if(!snapshot.data||typeof snapshot.data!=='object'||Array.isArray(snapshot.data))fail('Snapshot incompleto');
 const rawPlayers=[...Object.values(snapshot.data.startersMap||{}),...(Array.isArray(snapshot.data.benchList)?snapshot.data.benchList:[])];if(rawPlayers.some(p=>!p?.$player&&!(snapshot.data.career&&p?.$permanent)))fail('El plantel debe usar referencias a la base');
 const data=decode(snapshot.data,0,!!snapshot.data.career);
 for(const key of ['actions','events','stats']){
  const ref=data?.lastMatchResult?.[key];
  if(ref&&typeof ref==='object'&&Object.hasOwn(ref,'$finalMatchRef')){
   if(Object.keys(ref).length!==1||ref.$finalMatchRef!==key||!data.finalMatch||data.finalMatch[key]==null)fail('Referencia de partido inválida');
   data.lastMatchResult[key]=data.finalMatch[key];
  }
 }
 if(!data||!SAFE_SCREENS.includes(data.currentScreen)||!['EUROPA','AMERICA'].includes(data.region)||!config.FORMATIONS[data.formationId])fail('Estado incompatible');
 // Legacy checkpoints predate the frozen original; never reconstruct it from the final squad.
 if(!Object.hasOwn(data,'initialDraft'))data.initialDraft=null;
 for(const k of ['albumSubject','expansionRunId','expansionSubject'])if(!Object.hasOwn(data,k))data[k]=null;
 // Missing provenance is unknown, never inferred from the current account or squad.
 validateAlbumSubject(data.albumSubject);
 for(const field of fields)if(!(field in data))fail('Snapshot incompleto: '+field);
 if('staff' in data&&data.staff!==null){const s=data.staff;if(!s||typeof s!=='object'||Array.isArray(s)||s.version!==1||!Array.isArray(s.offer)||![3,4].includes(s.offer.length)||new Set(s.offer).size!==s.offer.length||s.offer.some(id=>typeof id!=='string'||!getCoach(id))||s.coachId!==null&&(typeof s.coachId!=='string'||!getCoach(s.coachId)||!s.offer.includes(s.coachId))||s.captainId!==null&&(typeof s.captainId!=='string'||![...Object.values(data.startersMap||{}),...(data.benchList||[])].some(p=>p.id===s.captainId)))fail('Entrenador o capitán incompatible');}
 if(Object.hasOwn(data,'career')){const c=data.career;if(!c||typeof c!=='object'||Array.isArray(c))fail('Carrera incompatible');if(c.version!==1||!['BRONZE','SILVER','GOLD','PLATINUM'].includes(c.cup)||!Number.isSafeInteger(c.level)||c.level<1||c.wildcardId!==null&&(typeof c.wildcardId!=='string'||c.wildcardId.length>100))fail('Carrera incompatible');const wildcards=[...Object.values(data.startersMap||{}),...(data.benchList||[])].filter(p=>p.collectionWildcard);if(wildcards.length>1||wildcards.length&&wildcards[0].id!==c.wildcardId)fail('Comodín incompatible');if(c.wildcard){const w=c.wildcard;if(w.version!==1||!['pending','used','skipped'].includes(w.status)||!['intro','roster','cards','compare'].includes(w.step))fail('Etapa de comodín inválida');if(w.status==='used'&&(!c.wildcardId||wildcards.length!==1))fail('Comodín utilizado ausente');if(w.status==='skipped'&&c.wildcardId)fail('Decisión de comodín incompatible');}if(data.currentScreen==='CAREER_WILDCARD'&&(c.wildcard?.status!=='pending'||c.wildcardId||data.currentPickIndex!==23||data.pendingDraftSlotId||data.staff?.captainId||data.tournament))fail('Etapa de comodín incompatible');}
 else if(data.currentScreen==='CAREER_WILDCARD')fail('La etapa de comodín solo pertenece a Carrera');
 else if([...Object.values(data.startersMap||{}),...(data.benchList||[])].some(p=>p.collectionBoost||p.collectionWildcard))fail('La colección no pertenece al Clásico');
 const formation=config.FORMATIONS[data.formationId],validSlots=new Map([...formation.slots,...config.BENCH_ROLES].map(s=>[s.id,s]));
 if(!data.startersMap||!Array.isArray(data.benchList)||!Array.isArray(data.formationOffer)||data.formationOffer.some(id=>!config.FORMATIONS[id])||new Set(data.formationOffer).size!==data.formationOffer.length)fail('Formación o plantel inválido');
 const players=[...Object.values(data.startersMap),...data.benchList];if(players.length>23||new Set(players.map(p=>p.id)).size!==players.length||new Set(players.map(p=>p.slotId)).size!==players.length)fail('Plantel duplicado');
 for(const [slot,p]of Object.entries(data.startersMap))if(!formation.slots.some(s=>s.id===slot)||p.slotId!==slot)fail('Casilla titular inválida');
 for(const p of players){if(!validSlots.has(p.slotId)||(!getPlayerById(p.id)&&!p.permanentVariantId)||validSlots.get(p.slotId).position==='GK'&&p.primaryPosition!=='GK')fail('Asignación de futbolista inválida');if(data.campaignUpgrades[p.id]!=(p.campaignBoost||0)&&data.campaignUpgrades[p.id]!=null)fail('Mejora no coincide con futbolista');}
 if(!Number.isInteger(data.currentPickIndex)||data.currentPickIndex<0||data.currentPickIndex>23)fail('Progreso inválido');
 if(data.currentPickIndex!==players.length)fail('Cantidad de elecciones inconsistente');
 if(!data.candidateCache||typeof data.candidateCache!=='object'||Array.isArray(data.candidateCache))fail('Ofertas inválidas');
 for(const [slot,ids]of Object.entries(data.candidateCache)){if(slot!==data.pendingDraftSlotId||!validSlots.has(slot)||players.some(p=>p.slotId===slot)||!Array.isArray(ids)||ids.length!==5||new Set(ids).size!==5||ids.some(id=>!getPlayerById(id)||players.some(p=>p.id===id)))fail('Candidatos pendientes inválidos');if(validSlots.get(slot).position==='GK'&&ids.some(id=>getPlayerById(id).primaryPosition!=='GK'))fail('Oferta de arquero inválida');}
 if(data.pendingDraftSlotId&&!data.candidateCache[data.pendingDraftSlotId]||data.activeDraftSlot&&data.activeDraftSlot!==data.pendingDraftSlotId)fail('Elección pendiente incompleta');
 validateTournament(data.tournament,players,data.career);
 if(data.pendingDraftSlotId&&data.currentScreen!=='DRAFTING')fail('Pantalla incompatible con elección pendiente');
 if(data.tournament&&(!Number.isInteger(data.tournamentRng)||data.tournamentRng<0||data.tournamentRng>4294967295))fail('Estado RNG ausente');
 if(data.finalMatch&&Object.keys(data.finalMatch).some(k=>typeof MatchEngine.prototype[k]==='function'))fail('Propiedad de motor no permitida');
 if(data.finalMatch&&(!data.finalMatch.isFinished||!Array.isArray(data.finalMatch.events)||!data.finalMatch.playerPerformance||!data.finalMatch.rivalPerformance||!data.finalMatch.stats))fail('Partido final inválido');
 if(['MATCH_RESULT','CAMPAIGN_END','REWARD_CHOICE','STEAL_RIVAL','UPGRADE_PLAYER'].includes(data.currentScreen)&&(!data.tournament||!data.lastMatchResult||!data.finalMatch))fail('Resultado final incompleto');
 return data;
}
export function restoreCampaignSnapshot(target,snapshot){
 const data=validateCampaignSnapshot(snapshot),next=new StateStore();
 for(const field of fields)next[field]=data[field];next.currentScreen=data.currentScreen;next.staff=data.staff??null;next.career=data.career??null;if(next.career&&!next.career.wildcard&&!next.career.wildcardId&&next.currentScreen==='DRAFTING'&&!next.tournament)next.career.wildcard={version:1,status:'pending',step:'intro',slotId:null,cardKey:null};
 next.draftPlan=next.formationConfirmed?getDraftPlan(next.formationId):[];next.draftedIds=new Set(next.getFullSquad().map(p=>p.id));
 next.candidateCache=Object.fromEntries(Object.entries(data.candidateCache).map(([slot,ids])=>[slot,ids.map(id=>({...getPlayerById(id)}))]));
 next.activeDraftStep=data.activeDraftSlot?next.draftPlan.find(s=>s.slotId===data.activeDraftSlot):null;next.currentCandidates=next.activeDraftStep?next.candidateCache[data.activeDraftSlot]:[];
 if(next.tournament){next.tournament.rng=createRng(next.tournament.seed);next.tournament.rng.setState(data.tournamentRng);next.rivalSquad=getNextOpponent(next.tournament);}
 if(data.finalMatch){next.activeMatch=Object.assign(Object.create(MatchEngine.prototype),data.finalMatch,{playback:null,onTick:null,onEvent:null,onFinish:null,timerId:null});next.activeMatch.rng=createRng(next.activeMatch.seed);}
 next.recalculateSquadStats();if(next.tournament&&!next.getSquadReadiness().ready)fail('Plantel recuperado inválido');
 const listeners=target.listeners;target.activeMatch?.playback?.dispose();target.activeMatch?.stopTimer?.();
 for(const key of Object.keys(next))if(key!=='listeners')target[key]=next[key];target.listeners=listeners;target.notify();return snapshot.campaignId;
}

// Separate local mode codecs may reuse player encoding, without the Classic contract.
export {encode as encodeLocalState};
export function decodeLocalState(value,{allowPermanent=false}={}){return decode(value,0,allowPermanent);}
