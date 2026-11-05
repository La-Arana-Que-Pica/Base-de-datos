import {closeSubModal,getSubstitutionPlan,updateSubModal} from './ui/substitutions.js';
import {openMatchPreview,closeMatchPreview} from './ui/matchPreviewModal.js';
import {getPlanningAnalysis,estimateQualification} from './core/preMatchAnalysis.js';
import {advisoryForecast,kickoffForecastInput} from './core/forecastWorkerClient.js';
import {recordExpansionSelection,observeClassic,laboratorySubject} from './expansion/bridge.js';
import {initCampaignSaveControls,campaignSaveController,refreshCampaignSaveUi} from './ui/campaignSaveControls.js';
import {openCampaignDialog} from './ui/campaignDialog.js';
import {focusCupPath} from './ui/cupPath.js';
import {rewardChoiceHtml,upgradeScreenHtml,updateUpgradeSelection} from './ui/rewards.js?v=rewards-redesign-1';
import {initFullscreen} from './ui/fullscreen.js?v=fullscreen-1';
import {openSetPiecePanel,setPiecePanelHtml} from './ui/setPiecePanel.js';
import {fitMatchWorkspace,fitMatchEvent,selectMatchTab,navigateMatchTab} from './ui/matchWorkspace.js';
import {updateAcquisitionComparison,acquisitionSelection} from './ui/rivalAcquisition.js';
import {matchPeriod,renderMatchIdle,updateMatchPeriod} from './ui/matchView.js';
import {syncMatchTeam,matchStatShare,renderMatchFeedContentHtml} from './ui/matchPanels.js?v=phase5c-1';
import { handlePickNavigation } from './ui/pickStage.js?v=shared-reveal-1';
import { getMotionMode, setMotionMode, isReducedMotion, subscribeMotion } from './ui/motionPreferences.js';
import {renderEventScene,EVENT_PRESENTATION_TIMING} from './ui/eventPresentation.js?v=event-sync-2';
import { startFormationReveal, cancelFormationReveal, skipFormationReveal, canSelectFormation, updateFormationSelection, refreshFormationMotion } from './ui/formationReveal.js?v=shared-reveal-1';
import { renderShootoutScene } from './ui/shootoutPresentation.js';
/**
 * Main Application Orchestrator for LAqP Draft
 * Event delegation, screen lifecycle, and match loop binding.
 */

import { startReveal, skipReveal, cancelReveal, canSelectFromReveal, refreshRevealMotion } from './ui/pickReveal.js?v=shared-reveal-1';
import { chemistryImpactText, renderCompactTeamHtml, matchStatValue } from './ui/render.js?v=phase6-1';
import { state,StateStore } from './state.js';
import {localAlbumFor,configureAlbumIdentity} from './album/catalog.js';
import { DRAFT_CONFIG } from './config.js';
import { getPlayerById } from './data/adapter.js';
import { showShootoutSelection } from './ui/shootoutSelection.js';
import { MatchPlayback } from './ui/matchPlayback.js?v=phase5c-1';
import { MatchEngine } from './core/matchEngine.js';
import {
  renderStartScreen,
  renderFormationScreen,
  renderDraftingScreen,
  renderReviewScreen,
  renderMatchScreen,
  renderSubModal,
  renderMatchResultScreen,
  renderStealScreen,
  renderTournamentScreen,
  renderCampaignEndScreen,
  escapeHtml,renderPlanningAnalysisHtml
} from './ui/render.js?v=phase6-1';

import {coachSelectionHtml,captainSelectionHtml,staffSummaryHtml} from './ui/staff.js';
import {installMenuShell,renderMainMenu,refreshMainMenu,setMenuActivity,menuDialog} from './ui/menuShell.js';
let appContainer = null;let appOptions={};let menuVisible=false;
const hasOpenClassic=()=>state.currentScreen!=='START'&&!campaignSaveController()?.suspended;
export function showMainMenu(){state.activeMatch?.playback?.pause();menuVisible=true;cancelReveal();cancelFormationReveal();if(appOptions.official&&appOptions.onHome){appOptions.onHome();return;}renderCurrentScreen();}
export function resumeOpenClassic(){menuVisible=false;renderCurrentScreen();}
export async function enterClassic(){
 if(hasOpenClassic()){menuDialog('DRAFT CLÁSICO','<p>Tu Draft sigue abierto. Podés retomarlo o iniciar otro usando la confirmación de reemplazo habitual.</p>','<button class="menu-primary" data-menu-resume>Volver a mi Draft</button><button class="menu-secondary" data-menu-new-classic>Jugar un nuevo Draft</button>');return;}
 menuVisible=false;renderCurrentScreen();
}
async function navigateFromClassic(href){if(appOptions.personal){await appOptions.personalSave();return true;}
 if(!hasOpenClassic())return true;const saves=campaignSaveController();
 if(!saves?.owner){menuDialog('Tu Draft sigue abierto','<p>Esta campaña de invitado permanece en memoria en esta pestaña. Iniciá sesión y guardala antes de cambiar de página, o abrí el otro modo en otra pestaña.</p>','<button class="menu-primary" data-menu-resume>Volver al Draft</button><a class="menu-secondary" href="'+href+'" target="_blank" rel="noopener">Abrir en otra pestaña</a><button class="menu-secondary" data-save-action="login">Ingresar para guardar</button>');return false;}
 return await saves.saveAndExit();
}
let pickConfirmationPending = false;

let renderedPickOffer=null,renderedPickSlot=null;
let renderedMatch=null,renderedFormationOffer=null,renderedFormationRegion=null;
function renderCurrentScreen() {
  queueMicrotask(refreshCampaignSaveUi);
  if (!appContainer) return;
  if(menuVisible&&!appOptions.renderStart){const cupButton=document.querySelector('#draft-cup-path');if(cupButton)cupButton.hidden=true;document.body?.classList?.add('is-menu');const h=document.querySelector('.draft-header');if(h)h.inert=false;document.querySelector('.menu-brand .menu-context')?.remove();document.querySelector('.menu-brand .menu-context')?.remove();setMenuActivity('home');renderMainMenu(appContainer);return;}
  if(state.currentScreen==='START'&&!appOptions.renderStart)document.body?.classList?.add('is-menu');else document.body?.classList?.remove('is-menu');
  if(document.body?.dataset?.menuShell==='classic'){const brand=document.querySelector('.menu-brand');let context=brand?.querySelector('.menu-context');if(state.currentScreen==='START'&&!appOptions.renderStart){if(brand&&!context){context=document.createElement('span');context.className='menu-context';brand.append(context);}if(context)context.textContent='DRAFT CLÁSICO';}else context?.remove();}
  const cupAccess=document.querySelector('#draft-cup-path');if(cupAccess)cupAccess.hidden=!state.tournament||!!state.survival;
  const tools=document.querySelector('.menu-tools-panel');let abandon=tools?.querySelector('[data-abandon-tournament]');if(state.tournament?.status==='active'){if(tools&&!abandon){abandon=document.createElement('button');abandon.type='button';abandon.className='menu-secondary';abandon.dataset.abandonTournament='';abandon.textContent=state.survival?'ABANDONAR SUPERVIVENCIA':'ABANDONAR TORNEO';tools.append(abandon);}}else abandon?.remove();

  if(state.currentScreen!=='MATCH' && state.activeMatch?.playback && !state.activeMatch.playback.finished) state.activeMatch.playback.dispose();
  const existingFormation=document.querySelector('.formation-screen');
  if(state.currentScreen==='FORMATION'&&!(state.formationConfirmed&&state.staff&&!state.staff.coachId)&&renderedFormationOffer===state.formationOffer&&renderedFormationRegion===state.region&&existingFormation){updateFormationSelection(existingFormation,state.selectedFormationId);return;}
  const existingPick=document.querySelector('.pick-panel');
  if(state.currentScreen==='DRAFTING' && existingPick && renderedPickOffer===state.currentCandidates && renderedPickSlot===state.activeDraftStep?.slotId)return;
  const header=document.querySelector('.draft-header');
  if(header)header.inert=!document.body?.dataset.menuShell&&state.currentScreen==='DRAFTING' && !!state.activeDraftStep;
  cancelReveal();
  cancelFormationReveal();
  if(appOptions.renderScreen?.(appContainer,state)===true){appOptions.onRender?.(appContainer,state);return;}
  switch (state.currentScreen) {
    case 'START':
      if(appOptions.renderStart)appOptions.renderStart(appContainer);else renderStartScreen(appContainer);
      break;
    case 'FORMATION':
      if(state.formationConfirmed&&state.staff&&!state.staff.coachId){appContainer.innerHTML=coachSelectionHtml(state);startReveal(appContainer.querySelector('.coach-reveal'),undefined,state.staff.offer);break;}
      renderFormationScreen(appContainer);renderedFormationOffer=state.formationOffer;renderedFormationRegion=state.region;
      startFormationReveal(appContainer.querySelector('.formation-screen'), state.formationOffer);
      break;
    case 'DRAFTING':
      renderDraftingScreen(appContainer);
      renderedPickOffer=state.currentCandidates;renderedPickSlot=state.activeDraftStep?.slotId;
      startReveal(document.querySelector('.pick-panel'), undefined, state.currentCandidates);
      break;
    case 'NEXT_RIVAL':
    case 'OPPONENT':
    case 'REVIEW':
      if(state.currentScreen==='REVIEW'&&state.staff&&!state.staff.captainId){appContainer.innerHTML=captainSelectionHtml(state);break;}
      renderReviewScreen(appContainer);state.squadCompletionPending=false;
      break;
    case 'MATCH':
      if(renderedMatch===state.activeMatch&&document.querySelector('.match-screen')){
        updateMatchUi(state.activeMatch.playback?.view||state.activeMatch);updatePlaybackControls(state.activeMatch.playback);state.activeMatch.playback?.trace('screen-render-preserved');break;
      }
      renderMatchScreen(appContainer);renderedMatch=state.activeMatch;state.activeMatch?.playback?.trace('screen-render-mounted');
      updateShootoutUi(state.activeMatch?.playback?.shootout);updatePlaybackControls(state.activeMatch?.playback);updateSuspense(state.activeMatch?.playback?.suspense);
      if(state.activeMatch?.minute===0&&!state.activeMatch.previewStarted)showKickoffPreview();
      break;
    case 'MATCH_RESULT':
      renderMatchResultScreen(appContainer);
      break;
    case 'REWARD_CHOICE':
      appContainer.innerHTML=rewardChoiceHtml(state);break;
    case 'UPGRADE_PLAYER':
      appContainer.innerHTML=upgradeScreenHtml(state);break;
    case 'STEAL_RIVAL':
      renderStealScreen(appContainer);
      break;
    case 'BRACKET_PREVIEW':
    case 'BRACKET':
      renderTournamentScreen(appContainer);
      break;
    case 'CAMPAIGN_END':
      renderCampaignEndScreen(appContainer);
      break;
    default:
      renderStartScreen(appContainer);
      break;
  }

  appOptions.onRender?.(appContainer,state);
  fitMatchWorkspace(document);
}

/**
 * Partial UI updates for live match tick to avoid full DOM rebuild
 */
function showKickoffPreview(){
 const m=state.activeMatch;if(!m||m.minute!==0||m.previewStarted)return;
 refreshKickoffForecast();
 openMatchPreview(renderPlanningAnalysisHtml(m.initialForecast),()=>{if(state.activeMatch!==m||m.minute!==0||m.previewStarted)return;m.previewStarted=true;closeMatchPreview();m.playback?.resume();});
}
export function refreshKickoffForecast(){
 const m=state.activeMatch;if(!m||m.minute!==0||m.previewStarted)return;
 if(m.authoritative){const input=kickoffForecastInput(m,state.rivalSquad),owner=state.albumSubject,key=JSON.stringify(input);const apply=result=>{if(state.activeMatch!==m||state.albumSubject!==owner||m.minute!==0||m.previewStarted||JSON.stringify(kickoffForecastInput(m,state.rivalSquad))!==key)return;m.initialForecast=result;if(m.playback)m.playback.view.initialForecast=structuredClone(result);const panel=document.querySelector('#match-start-preview');if(panel)panel.innerHTML=renderPlanningAnalysisHtml(result);};const result=advisoryForecast(input,apply,String(owner));apply(result);return;}
 m.initialForecast=estimateQualification({starters:m.userStarters,bench:m.userBench,formationId:m.formationId,chemistry:m.userChemistry,rival:{...state.rivalSquad,startingXI:m.rivalStarters,bench:m.rivalBench,tactic:m.rivalTactic},coachId:m.coaches.user,captainId:m.captains.user,tactic:m.userTactic,intensity:m.userIntensity,setPieces:m.setPieces.user,frozenChemistry:{user:Object.fromEntries(m.userStarters.map(p=>[String(p.id),p.matchChemistry])),rival:Object.fromEntries(m.rivalStarters.map(p=>[String(p.id),p.matchChemistry]))}});
 if(m.playback)m.playback.view.initialForecast=structuredClone(m.initialForecast);
 const panel=document.querySelector('#match-start-preview');if(panel)panel.innerHTML=renderPlanningAnalysisHtml(m.initialForecast);
}

function updateMatchUi(match) {
  if (state.currentScreen !== 'MATCH') return;
  const forecastPanel=document.querySelector('#match-start-preview');if(forecastPanel&&match.minute>0)closeMatchPreview();

  const scoreEl = document.querySelector('.scoreboard-score');
  const minuteEl = document.querySelector('.scoreboard-minute');
  const fillEl = document.querySelector('.minute-progress-fill');
  const subsBtn = document.querySelector('#btn-open-subs');

  if (scoreEl) scoreEl.textContent = `${match.userScore} - ${match.rivalScore}`;
  if (minuteEl) minuteEl.textContent = match.minute+'′';
  updateMatchPeriod(match,state.activeMatch?.playback,document);
  if (fillEl) {
    const pct = Math.min(100, (match.minute / (match.extraTime ? DRAFT_CONFIG.EXTRA_TIME_END : DRAFT_CONFIG.MATCH_DURATION_MINUTES)) * 100);
    fillEl.style.width = `${pct}%`;
  }

  if (subsBtn) {
    subsBtn.disabled = !state.activeMatch?.canSubstitute();
  }
  const limits=document.querySelector('#match-sub-limits');
  if(limits){const engine=state.activeMatch;limits.textContent=`Cambios disponibles: ${DRAFT_CONFIG.MAX_SUBSTITUTIONS-engine.substitutionsUsed}/${DRAFT_CONFIG.MAX_SUBSTITUTIONS} · Ventanas disponibles: ${DRAFT_CONFIG.MAX_SUBSTITUTION_WINDOWS-engine.substitutionWindowsUsed}/${DRAFT_CONFIG.MAX_SUBSTITUTION_WINDOWS}`;}


  for(const [isUser,selector] of [[true,'#live-team-user'],[false,'#live-team-rival']]) {
    const panel=document.querySelector(selector);if(!panel)continue;
    syncMatchTeam(panel,match,isUser);
  }
  const chemistry = document.querySelector('#live-chemistry');
  if (chemistry) chemistry.textContent = `Química: ${match.userChemistry} · ${chemistryImpactText(match.userChemistry)}`;

  document.querySelectorAll('.stats-row[data-stat]').forEach(row=>{
    const vals=row.querySelectorAll('.stats-row-val');
    if(vals.length===2){vals[0].textContent=matchStatValue(match,row.dataset.stat,true);vals[1].textContent=matchStatValue(match,row.dataset.stat,false);}
    const track=row.querySelector('.comparison-track'),share=matchStatShare(match,row.dataset.stat);if(track){track.hidden=share===null;if(track.firstElementChild)track.firstElementChild.style.width=(share??50)+'%';}
  });
}

export function updateMatchEvents(event) {
  const feedList = document.querySelector('#match-feed-list');
  if (!feedList || event.presentationOnly) return;
  const scroller=feedList;
  const visible=feedList.closest?.('[data-match-panel]')?.hidden!==true;
  const follow=visible&&scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<55;

  const item = document.createElement('div');
  item.className = `feed-item event-${event.type}`;
  item.innerHTML = renderMatchFeedContentHtml(event,state.activeMatch?.playback?.view||state.activeMatch);
  feedList.appendChild(item);if(follow)scroller.scrollTop=scroller.scrollHeight;
}

function revealSavedDraftOffer(slot){
 const saves=appOptions.personal?{enabled:true,flush:appOptions.personalSave}:campaignSaveController();
 if(!saves?.enabled){renderCurrentScreen();document.querySelector('#btn-close-pick')?.focus();return;}
 // Do not reveal a new offer before its durable checkpoint is acknowledged.
 pickConfirmationPending=true;
 saves.flush().then(()=>{renderCurrentScreen();document.querySelector('#btn-close-pick')?.focus();}).catch(e=>{state.closeDraftPick();state.squadMessage='Elección pendiente: '+e.message;renderCurrentScreen();}).finally(()=>{pickConfirmationPending=false;});
}

function bindGlobalEvents() {
 const motionSelect=document.querySelector('#draft-motion');
 if(motionSelect)motionSelect.value=getMotionMode();
 subscribeMotion((reduced,mode)=>{
  if(motionSelect)motionSelect.value=mode;
  if(reduced){skipFormationReveal();const pick=document.querySelector('.pick-panel');if(pick?.dataset.revealing==='true')skipReveal(pick);}
  const pickMotion=document.querySelector('#pick-motion');if(pickMotion)pickMotion.value=mode;
  if(state.activeMatch?.playback)state.activeMatch.playback.reducedMotion=reduced;
 });
 document.addEventListener('change',e=>{if(e.target.id==='draft-motion'||e.target.id==='pick-motion')setMotionMode(e.target.value);});
  document.addEventListener('change',async e=>{try{
    if(e.target.id==='sub-position-filter'){const plan=getSubstitutionPlan();if(plan){plan.filter=e.target.value;updateSubModal();}return;}
    const p=state.activeMatch?.playback,target=p||state.activeMatch,remote=!!state.activeMatch?.authoritative;
    if(e.target.id==='match-intensity'){const result=target?.setIntensity(e.target.value);if(remote&&!await result)return;refreshKickoffForecast();updateMatchUi(p?.view||state.activeMatch);}
    if(e.target.matches?.('[data-set-piece]')){const key=e.target.dataset.setPiece,value=e.target.value,result=target?.configureSetPieces({[key]:key==='approach'?value:value||null});if(remote?await result:result){refreshKickoffForecast();const dialog=document.querySelector('#set-pieces-dialog');if(dialog){dialog.innerHTML=setPiecePanelHtml(p?.view||state.activeMatch);dialog.querySelector('[data-set-piece="'+key+'"]')?.focus();}}}
    if(e.target.id==='match-simple-animations')p?.setSimpleAnimations(e.target.checked);
    if(e.target.id==='match-speed')p?.setSpeed(e.target.value);
    if(e.target.id==='match-tactic'){const choice=e.target.value,result=target?.setTactic(choice);if(remote&&!await result)return;refreshKickoffForecast();updateMatchUi(p?.view||state.activeMatch);const feedback=document.querySelector('#match-tactic-feedback');if(feedback)feedback.textContent='Planteamiento activo: '+(DRAFT_CONFIG.TACTICS[choice]?.label||'');}
  }catch(error){state.activeMatch?.onRemoteError?.(error);}});

  document.addEventListener('keydown', e => {
    if(document.querySelector('dialog[open] .player-sheet')||document.querySelector('#modal-subs-backdrop')?.open||document.querySelector('.match-preview-modal')?.open||document.querySelector('#campaign-dialog')?.open||document.querySelector('#draft-save-dialog')?.open||document.querySelector('#draft-save-confirm')?.open)return; // Native dialog owns Escape, Tab and focus.
    if(navigateMatchTab(e,document))return;
    const subDialog=document.querySelector('#modal-subs-backdrop');
    if(subDialog)return; // Native substitutions dialog owns Escape and focus.
    const panel = document.querySelector('.pick-panel');
    if(panel && pickConfirmationPending){e.preventDefault();return;}
    if(handlePickNavigation(e,panel))return;
    if(!panel && e.key==='Escape' && state.selectedSquadSlot){const detail=document.querySelector('.squad-player-details[open]');if(detail){detail.open=false;detail.querySelector('summary')?.focus();}else{state.selectedSquadSlot=null;state.squadMessage='';renderCurrentScreen();}return;}
    if (panel && e.key === 'Escape') { document.querySelector('#btn-close-pick')?.click(); return; }
    if (panel?.getAttribute('aria-modal') === 'true' && e.key === 'Tab') {
      const items = [...panel.querySelectorAll('button:not(:disabled), select:not(:disabled), [role=button]')].filter(el=>!el.closest('[inert]')&&!el.hidden);
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('click', async (e) => {
    if(appOptions.personal){try{await appOptions.personalSave();}catch{return;}}
    if(appOptions.handleAction&&await appOptions.handleAction(e,state))return;
    if(e.target.closest('[data-abandon-tournament]')){const playback=state.activeMatch?.playback,playing=playback&&!playback.paused&&!playback.finished;if(playing)playback.pause();let abandoned=false;const dialog=menuDialog(state.survival?'¿ABANDONAR SUPERVIVENCIA?':'¿ABANDONAR TORNEO?','<p>Si abandonás, finalizará tu participación actual y perderás las recompensas pendientes. Esta acción no se puede deshacer.</p>','<button class="menu-secondary" data-menu-dialog-close>CANCELAR</button><button class="menu-secondary abandon-danger" data-confirm-abandon>ABANDONAR TORNEO</button>');dialog.addEventListener('close',()=>{if(!abandoned&&playing&&!playback.disposed)playback.resume();},{once:true});dialog.querySelector('[data-confirm-abandon]').addEventListener('click',async event=>{event.target.disabled=true;try{if(campaignSaveController()?.owner&&!appOptions.onAbandon)throw Error('El abandono cloud necesita una operación de servidor todavía no instalada. Tu campaña se conserva.');if(appOptions.onAbandon)await appOptions.onAbandon();else{state.activeMatch?.playback?.dispose();state.reset();showMainMenu();}abandoned=true;dialog.close();}catch(error){event.target.disabled=false;menuDialog('No se abandonó la campaña','<p>'+escapeHtml(error.message)+'</p>');}});return;}
    if(pickConfirmationPending)return;
    const matchTab=e.target.closest('[data-match-tab]');if(matchTab){selectMatchTab(document,matchTab.dataset.matchTab);return;}
    if(e.target.closest('[data-cup-path]')){openCampaignDialog(state,'cup');return;}
    const finalStats=e.target.closest('[data-final-stats]');if(finalStats){openCampaignDialog(state,'stats',finalStats.dataset.finalStats);return;}
    if(e.target.closest('[data-close-campaign-dialog]')){document.querySelector('#campaign-dialog')?.close();return;}
    const cupFocus=e.target.closest('[data-cup-focus]');if(cupFocus){focusCupPath(cupFocus.closest?.('.cup-path')||document,cupFocus.dataset.cupFocus);return;}
    if(state.currentScreen==='DRAFTING'&&e.detail>1)return;
    const pickPanel=e.target.closest('.pick-panel');
    if(e.target.closest('#btn-skip-reveal')) { skipReveal(pickPanel||document.querySelector('.pick-panel'),true);return; }
    if(e.target.closest('#btn-toggle-play') && state.activeMatch?.playback){if(state.activeMatch.minute===0&&!state.activeMatch.previewStarted){showKickoffPreview();return;}const p=state.activeMatch.playback;p.halftimeReady?p.continueSecondHalf():p.paused?p.resume():p.pause();return;}
    if((e.target.closest('[data-skip-shootout]')||e.target.closest('#btn-skip-action'))&&e.detail>1)return;
    if(e.target.closest('#btn-skip-action')||e.target.closest('[data-skip-shootout]')){state.activeMatch?.playback?.skip();return;}
    if(e.target.closest('#btn-skip-coach-reveal')){skipReveal(document.querySelector('.coach-reveal'));return;}
    if(e.target.closest('#btn-skip-formation-reveal')) { skipFormationReveal(); return; }
    // 1. START SCREEN: Region selection
    const regionCard = e.target.closest('[data-choice-region]');
    if (regionCard) {
      if(campaignSaveController()?.suspended){state.region=regionCard.dataset.choiceRegion;state.notify();}else state.setRegion(regionCard.dataset.choiceRegion);
      return;
    }

    // 2. START SCREEN: Formation selection
    const formationCard = e.target.closest('[data-choice-formation]');
    if (formationCard && state.currentScreen==='FORMATION') {
      if (!canSelectFormation(formationCard)) return;
      state.setFormation(formationCard.dataset.choiceFormation);
      return;
    }

    if(e.target.closest('#btn-continue-region')){const saves=campaignSaveController();if(saves?.owner){const region=state.region;saves.beginNew().then(ok=>{if(!ok)return;state.reset();state.region=region;state.prepareFormationOffer();}).catch(e=>saves.emit(e.message,e));}else state.prepareFormationOffer();return;}
    if(e.target.closest('#btn-back-region')){if(state.survival&&appOptions.onRestart)Promise.resolve(appOptions.onRestart()).catch(error=>menuDialog('Tu progreso se conserva','<p>'+escapeHtml(error.message)+'</p>'));else state.backToRegion();return;}

    // 3. FORMATION SCREEN: Confirm before starting picks
    if(e.target.closest('[data-reassign-captain]')&&state.currentScreen==='REVIEW'){state.staff.captainId=null;state.notify();return;}
    const coachCard=e.target.closest('[data-coach-id]');if(coachCard){const reveal=coachCard.closest?.('.coach-reveal');if(reveal&&!canSelectFromReveal(reveal))return;state.chooseCoach(coachCard.dataset.coachId);return;}
    const captainCard=e.target.closest('[data-captain-id]');if(captainCard){state.chooseCaptain(captainCard.dataset.captainId);return;}
    if (e.target.closest('#btn-start-draft')) {
      state.confirmFormation();
      return;
    }

    if (e.target.closest('#btn-close-squad-details')) {const details=e.target.closest('details');if(details){details.open=false;details.querySelector('summary')?.focus();}return;}
    if (e.target.closest('#btn-cancel-team-swap')) {state.selectedSquadSlot=null;state.squadMessage='';renderCurrentScreen();return;}
    if (document.querySelector('.drafting-screen') && state.selectedSquadSlot && !e.target.closest('[data-squad-slot]') && !e.target.closest('.team-context')) {
      state.selectedSquadSlot = null; state.squadMessage=''; renderCurrentScreen(); return;
    }
    const draftSlot = e.target.closest('[data-draft-slot]');
    if(e.target.closest('#btn-resume-pending-pick')){if(state.resumePendingPick())revealSavedDraftOffer(state.pendingDraftSlotId);return;}
    if (draftSlot) {const slot=draftSlot.dataset.draftSlot,opened=state.openDraftSlot(slot);if(opened)revealSavedDraftOffer(slot);else renderCurrentScreen();return;}
    if (e.target.closest('#btn-close-pick')) { const slotId = state.activeDraftStep?.slotId; state.closeDraftPick(); renderCurrentScreen(); document.querySelector(`[data-draft-slot="${slotId}"]`)?.focus(); return; }
    const squadSlot = e.target.closest('[data-squad-slot]');
    if (state.activeDraftStep && !e.target.closest('.pick-panel')) return;
    if (squadSlot && ['DRAFTING','REVIEW'].includes(state.currentScreen)) {state.selectSquadSlot(squadSlot.dataset.squadSlot);renderCurrentScreen();return;}
    if (e.target.closest('#btn-preview-rival') && state.currentScreen === 'REVIEW') { if(!state.confirmLineup())renderCurrentScreen();return; }
    if (e.target.closest('#btn-prepare-next')) { state.setScreen('REVIEW'); return; }
    if (e.target.closest('#btn-back-prepare')) { state.setScreen('REVIEW'); return; }

    if (e.target.closest('#btn-advance-tournament')) { state.advanceCampaign(); return; }
    if (e.target.closest('#btn-show-bracket') && state.currentScreen === 'REVIEW') {openCampaignDialog(state,'cup');return; }
    if (e.target.closest('#btn-back-bracket')) { state.setScreen('REVIEW'); return; }

    // 4. DRAFTING: Candidate card selected
    const playerCard = e.target.closest('.candidates-grid .player-card');
    if (playerCard && state.currentScreen === 'DRAFTING') {
      if(!canSelectFromReveal(pickPanel))return;
      const pid = playerCard.dataset.playerId;
      const candidate = (state.currentCandidates || []).find(p => p.id === pid) || getPlayerById(pid);
      if (candidate) {
        const slotId=state.activeDraftStep.slotId;
        playerCard.classList.add('candidate-chosen');
        playerCard.setAttribute('aria-pressed','true');pickPanel.dataset.confirming='true';pickPanel.setAttribute('aria-busy','true');
        try{state.selectCandidate(candidate);}catch(error){playerCard.classList.remove('candidate-chosen');playerCard.setAttribute('aria-pressed','false');pickPanel.dataset.confirming='false';pickPanel.removeAttribute('aria-busy');menuDialog('No se confirmó la elección','<p>'+escapeHtml(error.message)+'</p><p>Tu oferta se conserva. Reintentá cuando el almacenamiento local esté disponible.</p>');return;}
        const finish=()=>{
          pickConfirmationPending=false;renderCurrentScreen();
          const placed=document.querySelector('[data-squad-slot="'+slotId+'"]');
          placed?.classList.add('draft-incorporated');placed?.focus({preventScroll:true});
        };
        if(isReducedMotion())finish();
        else {pickConfirmationPending=true;setTimeout(finish,140);}
      }
      return;
    }

    // 5. REVIEW SCREEN: Play Match button
    if (e.target.closest('#btn-play-match') && state.currentScreen === 'OPPONENT') {
      if(!state.getSquadReadiness().ready){state.squadMessage=state.getSquadReadiness().reasons.join(' ');state.setScreen('REVIEW');return;}
      state.recalculateSquadStats();
      const userStarters = state.getStartingXIList();
      const userBench = state.benchList;

      state.activeMatch = new MatchEngine({
        userTeam: {
          name: 'Mi Draft',
          coachId:state.staff?.coachId??null,captainId:state.matchCaptain()?.id??null,
          formationId: state.formationId,
          starters: userStarters,
          bench: userBench
        },
        rivalTeam: state.rivalSquad,
        userChemistry: state.chemistry.score,
        roundLabel: state.round,
        seed: state.tournament ? (state.tournament.seed + state.tournament.roundIndex * 1009) >>> 0 : Date.now(),
        onTick: updateMatchUi,
        onEvent: (ev, m) => updateMatchEvents(ev, m),
        onFinish: (result) => {
          state.completeRound(state.activeMatch, result);
          state.setScreen(state.tournament?.status==='champion'||!result.userWon ? 'CAMPAIGN_END' : 'MATCH_RESULT');
        }
      });

      state.activeMatch.initialForecast=structuredClone(getPlanningAnalysis(state));
      attachMatchPlayback(state.activeMatch);
      state.setScreen('MATCH');
      // Show the actual kickoff lineup before the user starts playback.
      return;
    }

    // 6. MATCH SCREEN: Tactical switch
    if(e.target.closest('#btn-set-pieces')){openSetPiecePanel(state.activeMatch?.playback?.view||state.activeMatch);return;}
    if(e.target.closest('#btn-close-set-pieces')){document.querySelector('#set-pieces-dialog')?.close();document.querySelector('#set-pieces-dialog')?.remove();document.querySelector('#btn-set-pieces')?.focus();return;}
    const tacticBtn = e.target.closest('[data-tactic]');
    if (tacticBtn && state.activeMatch) {
      const tid = tacticBtn.dataset.tactic;
      (state.activeMatch.playback||state.activeMatch).setTactic(tid);
      refreshKickoffForecast();
      document.querySelectorAll('[data-tactic]').forEach(b => {
        b.classList.toggle('is-active', b.dataset.tactic === tid);
      });
      return;
    }

    // 7. MATCH SCREEN: Open Substitutions Modal
    if (e.target.closest('#btn-open-subs') && state.activeMatch?.canSubstitute()) {
      state.activeMatch.pause();
      updatePlaybackControls(state.activeMatch.playback);
      state.subModalOpen = true;
      renderSubModal(document.body);
      return;
    }

    // 8. SUBS MODAL: Close without substituting
    if (e.target.closest('#btn-close-subs')) {
      closeSubModal();
      state.subModalOpen = false;
      updatePlaybackControls(state.activeMatch?.playback);document.querySelector('#btn-open-subs')?.focus();
      return;
    }

    const subOutItem=e.target.closest('#sub-starters-list .sub-item'),subInItem=e.target.closest('#sub-bench-list .sub-item');
    if(subOutItem||subInItem){const el=subOutItem||subInItem;if(!el.disabled)getSubstitutionPlan()?.select(subOutItem?'out':'in',subOutItem?el.dataset.subOut:el.dataset.subIn);checkSubConfirmationState();return;}
    if(e.target.closest('#btn-prepare-sub')){const error=getSubstitutionPlan()?.add();updateSubModal(error||'Cambio preparado. Elegí otra pareja o confirmá.');if(!error)document.querySelector('#sub-starters-list .sub-item:not(:disabled)')?.focus();return;}
    const removeSub=e.target.closest('[data-sub-remove]');if(removeSub){getSubstitutionPlan()?.remove(Number(removeSub.dataset.subRemove));updateSubModal();return;}
    if(e.target.closest('#btn-confirm-sub')&&state.activeMatch){const plan=getSubstitutionPlan();if(!plan)return;const res=plan.confirm((outId,inId)=>(state.activeMatch.playback||state.activeMatch).substitute(outId,inId));if(res.success){refreshKickoffForecast();updateMatchUi(state.activeMatch.playback?.view||state.activeMatch);updatePlaybackControls(state.activeMatch.playback);renderSubModal(document.body);updateSubModal(res.applied+' sustitución'+(res.applied>1?'es':'')+' confirmada'+(res.applied>1?'s':'')+'.');}else updateSubModal(res.message);return;}

    // 12. MATCH RESULT SCREEN: Go to steal after victory
    if (e.target.closest('#btn-go-steal') && state.tournament?.pendingAcquisition) {
      state.selectedRivalPlayer = null;
      state.selectedReplacePlayerId = null;
      state.openRewardChoices();
      return;
    }

    // Restart the campaign from its final screen
    if (e.target.closest('#btn-restart-draft')) {
      if(appOptions.onRestart){appOptions.onRestart();return;}
      const saves=campaignSaveController();if(saves?.owner){saves.restart().catch(e=>saves.emit(e.message,e));return;}
      state.activeMatch?.playback?.dispose();if (state.activeMatch) state.activeMatch.stopTimer();
      state.reset();
      state.setScreen('START');
      return;
    }

    const rewardOption=e.target.closest('[data-reward-type]');
    if(rewardOption){state.previewReward(rewardOption.dataset.rewardType);return;}
    if(e.target.closest('[data-reward-back]')){state.openRewardChoices();return;}
    const upgradeCard=e.target.closest('[data-upgrade-player]');
    if(upgradeCard&&state.currentScreen==='UPGRADE_PLAYER'&&state.getPendingReward()&&(state.getPendingReward().choice===null||state.getPendingReward().choice==='UPGRADE')){
      state.selectedUpgradePlayerId=upgradeCard.dataset.upgradePlayer;updateUpgradeSelection(state,document);return;
    }
    if(e.target.closest('#btn-confirm-upgrade')){
      if(state.currentScreen==='UPGRADE_PLAYER'&&state.upgradePlayer(state.selectedUpgradePlayerId))state.setScreen('BRACKET');
      else{const message=document.querySelector('#upgrade-feedback');if(message)message.textContent='Elegí un futbolista disponible con menos de 99 OVR.';}return;
    }

    // 14. STEAL SCREEN: Select Rival player to steal
    const stealRivalCard = e.target.closest('#steal-rival-list .choice-card');
    if (stealRivalCard) {
      const pid = stealRivalCard.dataset.stealRivalId;
      const rivalPool = [...(state.rivalSquad?.startingXI || []), ...(state.rivalSquad?.bench || [])];
      state.selectedRivalPlayer = rivalPool.find(p => p.id === pid) || getPlayerById(pid);

      document.querySelectorAll('#steal-rival-list .choice-card').forEach(c => c.classList.remove('is-selected'));
      stealRivalCard.classList.add('is-selected');

      updateAcquisitionComparison(state,document);
      return;
    }

    // 15. STEAL SCREEN: Select own player to replace
    const stealOwnCard = e.target.closest('#steal-own-list .choice-card');
    if (stealOwnCard) {
      state.selectedReplacePlayerId = stealOwnCard.dataset.stealOwnId;

      document.querySelectorAll('#steal-own-list .choice-card').forEach(c => c.classList.remove('is-selected'));
      stealOwnCard.classList.add('is-selected');

      updateAcquisitionComparison(state,document);
      return;
    }

    // Confirm the single acquisition for this completed round
    if (e.target.closest('#btn-confirm-steal')) {
      if(state.currentScreen!=='STEAL_RIVAL')return;
      const selection=acquisitionSelection(state);
      if (selection.valid) {
        if (!state.acquireRivalPlayer(selection.outgoing.id, selection.incoming)) {updateAcquisitionComparison(state,document);const message=document.querySelector('#steal-feedback');if(message)message.textContent='No se pudo aplicar el fichaje. Revisá las selecciones.';return;}
        state.setScreen('BRACKET');
      }else{updateAcquisitionComparison(state,document);const message=document.querySelector('#steal-feedback');if(message)message.textContent='Elegí un rival elegible y un jugador de tu plantel actual.';}
      return;
    }
  });
}

function checkSubConfirmationState(){updateSubModal();}

export function init(options = {}) {
  appOptions=options;
  configureAlbumIdentity(()=>campaignSaveController()?.owner||null);
  StateStore.onDraftSelection=StateStore.onPlayerObtained=(campaign,player,reason='pick')=>{if(options.official)return;if(campaign!==state||player.collectionWildcard||player.permanentVariantId)return;try{const album=localAlbumFor(campaign);campaign.albumSubject??=album.subject;const result=album.discover(player.id);campaign.expansionSubject??=laboratorySubject();recordExpansionSelection(campaign,player,album,reason);return result;}catch(error){window.dispatchEvent(new CustomEvent('laqp-album-warning',{detail:error.message}));}};
  if(!options.official)state.subscribe(()=>observeClassic(state));
  if(document.body?.dataset.menuShell==='classic'){
   menuVisible=true;installMenuShell({mode:'classic',onHome:showMainMenu,onClassic:enterClassic,onResume:resumeOpenClassic,onNavigate:navigateFromClassic,hasMemory:hasOpenClassic});
   document.addEventListener('click',async event=>{
    if(event.target.closest('[data-menu-new-classic]')){try{if(appOptions.personal){await appOptions.onNewClassic();document.querySelector('#menu-dialog')?.close();return;}const saves=campaignSaveController();if(saves?.owner){if(!await saves.restart())return;}else{if(!['champion','eliminated'].includes(state.tournament?.status)&&!confirm('Tu Draft está en curso. ¿Reemplazarlo por uno nuevo?'))return;state.activeMatch?.playback?.dispose();state.reset();}document.querySelector('#menu-dialog')?.close();menuVisible=false;renderCurrentScreen();}catch(err){menuDialog('No se reemplazó la campaña','<p>'+escapeHtml(err.message)+'</p>');}}
   });
   document.addEventListener('draft-menu-home',showMainMenu);
   document.addEventListener('laqp-auth-change',()=>queueMicrotask(refreshMainMenu));
  }
  initFullscreen(document,{fit:fitMatchWorkspace});
  appContainer = document.querySelector('#app');
  if (!appContainer) {
    console.error('LAqP Draft: Contenedor #app no encontrado.');
    return;
  }

  state.subscribe(() => {
    renderCurrentScreen();
  });

  const syncMotion=()=>{
    const control=document.querySelector('#draft-motion');
    if(control)control.value=getMotionMode();
    const panel=document.querySelector('.formation-screen');
    if(state.currentScreen==='FORMATION'&&panel)refreshFormationMotion(panel,state.formationOffer);const coaches=document.querySelector('.coach-reveal');if(coaches)refreshRevealMotion(coaches,state.staff?.offer);const picks=document.querySelector('.pick-panel');if(picks)refreshRevealMotion(picks,state.getPendingReward()?.type==='RECRUIT'?state.survival.recruitment.candidates:state.currentCandidates);
  };
  subscribeMotion(syncMotion);
  syncMotion();
  bindGlobalEvents();
  if(options.persistence!==false)initCampaignSaveControls(state);
  renderCurrentScreen();
}

document.addEventListener('DOMContentLoaded', ()=>{if(!document.body?.dataset.routeEntry)init();});

export function updateShootoutUi(scene) {
 const panel=document.querySelector('#match-shootout');if(!panel)return;
 const entering=panel.hidden&&scene;
 panel.hidden=!scene;panel.innerHTML=renderShootoutScene(scene);
 panel.classList.toggle('reduced-motion',!!scene?.reducedMotion);
 document.querySelector('.unified-match')?.classList.toggle('is-shootout',!!scene);
 if(entering)panel.scrollIntoView?.({block:'nearest'});
}
export function updateSuspense(action) {
 const panel=document.querySelector('#match-suspense'),text=document.querySelector('#suspense-text'),skip=document.querySelector('#btn-skip-action');if(!panel)return;
 panel.classList.toggle('is-active',!!action);
 panel.classList.toggle('is-expanded-event',!!action&&(action.kind==='goal'||action.level===3));
 const scene=document.querySelector('#event-scene-host'),view=state.activeMatch?.playback?.view||state.activeMatch,key=action&&action.kind!=='shootout'?[action.presentationId,action.phase,action.kind].join(':'):'idle:'+view?.minute+':'+!!state.activeMatch?.playback?.paused+':'+matchPeriod(view||{},state.activeMatch?.playback);
 if(scene&&scene.dataset.sceneKey!==key){const started=performance.now();scene.innerHTML=action&&action.kind!=='shootout'?renderEventScene(action):renderMatchIdle(state.activeMatch?.playback?.view||state.activeMatch,state.activeMatch?.playback);scene.dataset.sceneKey=key;state.activeMatch?.playback?.trace('scene-render-mounted',{sceneKey:key,cpuMs:performance.now()-started});}
 panel.dataset.kind=action?.kind||'idle';panel.dataset.phase=action?.phase||'idle';panel.dataset.level=String(action?.level||0);
 if(text)text.textContent=action?.label||(state.activeMatch?.playback?.paused?'Partido en pausa.':'Seguimos en juego…');
 if(skip){skip.hidden=!action;skip.textContent='Omitir animación';}
 fitMatchEvent(document);
}
export function updatePlaybackControls(playback) {
 if(!playback||state.currentScreen!=='MATCH')return;
 updateMatchPeriod(playback.view,playback,document);
 fitMatchWorkspace(document);
 const button=document.querySelector('#btn-toggle-play'),speed=document.querySelector('#match-speed'),status=document.querySelector('#playback-status');
 if(button){button.textContent=playback.halftimeReady?'▶ Continuar segundo tiempo':playback.paused?(playback.view.minute===0?'▶ INICIAR PARTIDO':'▶ Reanudar'):'Ⅱ Pausar';button.setAttribute('aria-pressed',String(!playback.paused));button.disabled=playback.finished||playback.shootoutReady||!!playback.halfContinuation;}
 if(speed)speed.value=String(playback.speed);
 if(status)status.textContent=playback.shootout?(playback.paused?'Tanda en pausa':playback.shootout.phase==='final'?'Tanda terminada':playback.shootout.context.status):playback.shootoutReady?'PREPARAR PENALES':playback.halftimeReady?'ENTRETIEMPO':playback.paused?'En pausa':playback.hasPendingAction?'Ocasión en curso':'En juego';
 const halftime=document.querySelector('#match-halftime-banner');if(halftime)halftime.hidden=!playback.halftimeReady;
 const engine=state.activeMatch,subs=document.querySelector('#btn-open-subs'),limits=document.querySelector('#match-sub-limits');
 if(subs)subs.disabled=!engine?.canSubstitute();
 if(limits&&engine)limits.textContent=`Cambios disponibles: ${DRAFT_CONFIG.MAX_SUBSTITUTIONS-engine.substitutionsUsed}/${DRAFT_CONFIG.MAX_SUBSTITUTIONS} · Ventanas disponibles: ${DRAFT_CONFIG.MAX_SUBSTITUTION_WINDOWS-engine.substitutionWindowsUsed}/${DRAFT_CONFIG.MAX_SUBSTITUTION_WINDOWS}`;
 document.querySelector('#match-suspense')?.classList.toggle('is-paused',playback.paused);
 document.querySelector('.event-scene')?.style?.setProperty('--event-phase-duration',Math.min(playback.suspense?.animationMs||EVENT_PRESENTATION_TIMING.ENTRY,playback.suspense?.delay||EVENT_PRESENTATION_TIMING.ENTRY)/playback.speed+'ms');
 const simpler=document.querySelector('#match-simple-animations');if(simpler)simpler.checked=playback.simpleAnimations;
 const intensity=document.querySelector('#match-intensity');if(intensity){intensity.value=playback.view.userIntensity;intensity.disabled=playback.match.shootoutPending||playback.match.isFinished;}const pieces=document.querySelector('#btn-set-pieces');if(pieces)pieces.disabled=playback.match.isFinished||playback.match.shootoutPending||playback.match.minute>0&&!playback.paused;
 const tactic=document.querySelector('#match-tactic');if(tactic){tactic.value=playback.view.userTactic;tactic.disabled=playback.match.shootoutPending||playback.match.isFinished||playback.finished;}
 const shootoutPanel=document.querySelector('#match-shootout');
 if(shootoutPanel){
  shootoutPanel.classList.toggle('is-paused',playback.paused);
  shootoutPanel.querySelector('.shootout-scene')?.style.setProperty('--shootout-stage-duration',(playback.shootout?.duration||350)/Math.min(playback.speed,2)+'ms');
  const skip=shootoutPanel.querySelector('[data-skip-shootout]');
  if(skip)skip.textContent=playback.shootout?.phase==='final'?(playback.paused?'Continuar al reanudar':'Continuar'):(playback.paused?'Omitir al reanudar':'Omitir este lanzamiento');
 }
 if(playback.shootoutReady)showShootoutSelection(playback);
 if(!playback.suspense)updateSuspense(null);
}
export function attachMatchPlayback(match,options={}) {
 if(match.playback&&!match.playback.disposed){match.playback.trace('playback-reused');return match.playback;}
 const finish=match.onFinish;let playback;
 playback=new MatchPlayback(match,{onView:updateMatchUi,onEvent:updateMatchEvents,onFinish:(result)=>{const recovery=appOptions.personal?.matchRecovery;if(recovery)recovery.finalize(playback,result,()=>finish?.(result,match));else finish?.(result,match);},onSuspense:updateSuspense,onShootout:updateShootoutUi,onControls:updatePlaybackControls,manualShootout:true,reducedMotion:isReducedMotion(),...options});
 appOptions.personal?.matchRecovery?.attach(playback);return playback;
}

export function mountAccountMatch(match,onFinish){match.onFinish=onFinish;return attachMatchPlayback(match);}

// Restored local matches use the same sporting completion and visual callbacks.
export function mountPersonalMatch(match,display){
 state.activeMatch?.playback?.dispose();state.activeMatch=match;
 match.onFinish=result=>{state.completeRound(match,result);state.setScreen(state.tournament?.status==='champion'||!result.userWon?'CAMPAIGN_END':'MATCH_RESULT');};
 const playback=attachMatchPlayback(match);playback.restoreCheckpoint(display);state.currentScreen='MATCH';state.notify();return playback;
}
