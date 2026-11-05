import {PersonalCoordinator} from './coordinator.js';
import {personalContext,transferLabRequested,stagingTransferRequested} from './context.js';
import {PersonalRepository} from './repository.js';
import {state} from '../state.js';
import {createCampaignSnapshot,restoreCampaignSnapshot,safeCheckpoint} from '../persistence/campaignSnapshot.js';
import {renderMainMenu,refreshMainMenu,menuDialog} from '../ui/menuShell.js';
import {routeURL} from '../navigation/routes.js';
import {configureCollectionReader} from '../ui/collection.js';
import {setMotionMode} from '../ui/motionPreferences.js';
import {historicalDiscoveries} from '../album/recovery.js';
export async function bootPersonalGame({mode}){
 const params=new URLSearchParams(location.search);let selected=params.get('personalProfile');
 if(stagingTransferRequested()&&!selected){
  const remembered=localStorage.getItem('lf5-staging-active'),{data}=await window.LAQP_SUPABASE.auth.getSession();
  if(remembered&&remembered==='account:niyqnkoqngyoogpwkegl:'+data?.session?.user?.id){selected=remembered;params.set('personalProfile',selected);const url=new URL(location.href);url.search=params.toString();history.replaceState(history.state,'',url.href);}
 }
 const runtime=new PersonalCoordinator(transferLabRequested()?new PersonalRepository({name:'laqp-draft-lf5-laboratory'}):stagingTransferRequested()?new PersonalRepository({name:'laqp-draft-personal-lf5-staging'}):undefined);
 const {assertPersonalSelection,revokeLocalAccountAccess}=await import('./sync/identity.js');await assertPersonalSelection(runtime.repository,selected);
 await runtime.open(selected);
 window.LAQPDraftPersonal=runtime;
 if(runtime.bundle.data.shared.legacy.sourceArchive&&!runtime.bundle.data.shared.legacy.lf2Activated){
  const classic=runtime.bundle.data.runs.filter(r=>r.id.startsWith('classic:'));if(classic.length>1)throw Error('Hay varias campañas clásicas importadas. Elegí una fuente activa antes de continuar. Las copias se conservan.');
  await runtime.update('lf2-activate:'+runtime.identity,'migration-activation',data=>{
   data.shared.legacy.personalSeen??={};data.shared.legacy.importedFinals??={};
   for(const row of data.runs){const s=row.snapshot||row.legacy?.snapshot;if(!s)continue;const id=s.campaignId||s.data.survival?.id;data.shared.legacy.personalSeen[id]=Object.fromEntries(historicalDiscoveries(s).map(id=>[id,true]));if(['champion','eliminated'].includes(s.data.tournament?.status))data.shared.legacy.importedFinals[id]=true;}
   for(const [owner,profile]of Object.entries({...data.shared.survivalProfiles})){if(['traditional','dream'].includes(owner))continue;const variant=owner.startsWith('dream:')?'dream':'traditional';if(!data.shared.survivalProfiles[variant])data.shared.survivalProfiles[variant]=profile;}
   data.shared.legacy.lf2Activated=true;
  });
 }
 configureCollectionReader(async()=>{await runtime.flush();return {subject:runtime.identity,progress:structuredClone(runtime.progress)};});
 setMotionMode(runtime.bundle.data.shared.settings.motion||'system');
 runtime.renderStatus();
 if(!transferLabRequested()&&!stagingTransferRequested()){const {installMigrationControls}=await import('./migration.js');await installMigrationControls(runtime);}
 let hooks,main;
 if(mode==='career'){const active=runtime.bundle.data.runs.find(r=>r.id.startsWith('career:'));hooks=await(await import('../career/boot.js')).bootCareer({resumeRegion:params.get('continue')||runtime.bundle.data.shared.settings.careerRegion||active?.legacy?.region});main=await import('../main.js');}
 else if(mode.startsWith('survival')){hooks=await(await import('../survival/boot.js')).bootSurvival({resume:params.get('continue')==='1'||runtime.bundle.data.runs.some(r=>r.id==='survival:'+(mode==='survivalDream'?'dream':'traditional'))});main=await import('../main.js');}
 else{
  main=await import('../main.js?v=rewards-redesign-1');let campaignId=null,last='',loading=true;
  const row=runtime.bundle.data.runs.find(r=>r.id==='classic'||r.id.startsWith('classic:'));if(row){const snapshot=row.snapshot||row.legacy?.snapshot;campaignId=snapshot.campaignId;restoreCampaignSnapshot(state,snapshot);}
  function capture(){if(loading||state.currentScreen==='START'||state.career||state.survival||!safeCheckpoint(state))return;campaignId??=crypto.randomUUID();state.expansionRunId??=campaignId;state.expansionSubject??=runtime.identity;const snapshot=createCampaignSnapshot(state,campaignId),json=JSON.stringify(snapshot);if(json===last)return;last=json;runtime.saveClassic(snapshot).catch(()=>{last='';});}
  const prepare=async()=>{capture();await runtime.flush();};
  const reset=async(confirm=false)=>{await prepare();if(confirm&&!['champion','eliminated'].includes(state.tournament?.status)&&!window.confirm('¿Conservar una copia de este Draft e iniciar otro?'))return;await runtime.update('classic-reset:'+crypto.randomUUID(),'classic-reset',data=>{const row=data.runs.find(r=>r.id==='classic'||r.id.startsWith('classic:'));if(row){const snapshot=row.snapshot||row.legacy?.snapshot;data.shared.legacy.replaced??=[];data.shared.legacy.replaced.push(row);if(!['champion','eliminated'].includes(snapshot.data.tournament?.status)){data.shared.legacy.abandoned??=[];data.shared.legacy.abandoned.push({mode:'CLASSIC',snapshot,campaignId:snapshot.campaignId,abandonedAt:new Date().toISOString()});}}data.runs=data.runs.filter(r=>r.id!=='classic'&&!r.id.startsWith('classic:'));});loading=true;state.activeMatch?.playback?.dispose();state.reset();campaignId=null;last='';loading=false;state.notify();main.showMainMenu();};
  main.init({persistence:false,personal:runtime,personalSave:prepare,onRestart:()=>reset(),onNewClassic:()=>reset(true),onAbandon:()=>reset(true)});state.subscribe(capture);loading=false;
  hooks={prepareNavigation:prepare,suspendNavigation:()=>{loading=true;}};
 }
 if(mode==='career'){const existingMain=main;main={...existingMain,resumeOpenClassic:({initial}={})=>initial&&state.currentScreen!=='CAMPAIGN_END'?existingMain.resumeOpenClassic():hooks.showHub()};}
 const prepare=hooks.prepareNavigation;
 const {PersonalMatchRecovery}=await import('./matchRecovery.js');
 runtime.matchRecovery=new PersonalMatchRecovery(runtime,{prepare:async()=>{await prepare();await runtime.flush();},mount:(match,display)=>main.mountPersonalMatch(match,display)});
 hooks.prepareNavigation=async()=>{await runtime.matchRecovery.flush();await prepare();await runtime.flush();};
 runtime.onFailure=()=>state.activeMatch?.playback?.pause();
 runtime.pauseGame=()=>state.activeMatch?.playback?.pause();
 runtime.onRecovered=async()=>{await hooks.prepareNavigation();state.notify();document.dispatchEvent(new CustomEvent('laqp-expansion-change',{detail:{subject:runtime.identity}}));};
 state.subscribe(()=>{runtime.matchActive=state.currentScreen==='MATCH';runtime.renderStatus();if(runtime.matchActive){if(state.activeMatch?.playback&&runtime.matchRecovery.playback!==state.activeMatch.playback)runtime.matchRecovery.attach(state.activeMatch.playback);runtime.matchRecovery.request(runtime.matchRecovery.lastMinute<0?'initial':'boundary',runtime.matchRecovery.lastMinute<0);}else runtime.matchRecovery.recover().catch(e=>runtime.matchRecovery.fail(e));runtime.matchRecovery.display();});
 await runtime.matchRecovery.recover();
 document.addEventListener('change',event=>{if(['draft-motion','pick-motion'].includes(event.target.id))runtime.update('settings:'+crypto.randomUUID(),'settings',data=>{data.shared.settings.motion=event.target.value;}).catch(()=>{});});
 window.addEventListener('beforeunload',event=>{if(runtime.saving||runtime.failure){event.preventDefault();event.returnValue='';}});
 runtime.detachAccount=async()=>{
  if(runtime.detached)return;
  runtime.cloudIntegration?.dispose();runtime.detached=true;runtime.matchRecovery.suspend();state.activeMatch?.playback?.dispose();const loading=document.createElement('p');loading.setAttribute('role','status');loading.textContent='Cambiando de perfil local…';document.body.replaceChildren(loading);
  const url=new URL(location.href);url.searchParams.delete('personalProfile');try{await revokeLocalAccountAccess(runtime.repository,runtime.identity);}finally{location.replace(url.href);}
 };
 if(!transferLabRequested()&&runtime.identity.startsWith('account:'))document.addEventListener('laqp-auth-change',async event=>{
  if(event.detail?.error&&!event.detail?.session){runtime.cloudSync?.sessionExpired();return;}
  if(window.LAQPAuth?.user?.id===runtime.identity.split(':')[2])return;
  await runtime.detachAccount();
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){runtime.matchRecovery.request('hidden',true);hooks.prepareNavigation().catch(()=>{});}});
 document.addEventListener('click',event=>{if(event.target.closest('[data-personal-menu]')){renderMainMenu(document.querySelector('#app'));refreshMainMenu();}});
 runtime.renderStatus();
 runtime.cloudIntegration=transferLabRequested()?await(await import('../../tests/transfer-lab-ui.js')).installTransferLaboratory(runtime,{prepareNavigation:hooks.prepareNavigation}):stagingTransferRequested()?await(await import('./transferUI.js')).installGuestTransfer(runtime,{prepareNavigation:hooks.prepareNavigation,adapter:await(await import('./transferStaging.js')).createStagingTransferAdapter()}):await(await import('./sync/bootstrap.js')).installPersonalSync(runtime,{prepareNavigation:hooks.prepareNavigation});
 return {main,hooks};
}
