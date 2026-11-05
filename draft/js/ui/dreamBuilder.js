import {permanentCard} from './collectionViews.js';
import {DRAFT_CONFIG} from '../config.js';
import {renderBuilderPitch,renderBuilderBench,renderCompactDraftPlayer} from './teamBuilder.js';
import {escapeHtml as e} from './html.js';
export function dreamCollectionCard(p){return permanentCard(p);}
export function dreamFieldHtml(model,stats,formation){const state={chemistry:stats.chemistry,startersMap:stats.starters,benchList:stats.bench,pendingDraftSlotId:null,selectedSquadSlot:null,currentScreen:'DREAM_TEAM',staff:{coachId:model.coachId},getPlayerAtSlot:id=>stats.starters[id]||stats.bench.find(p=>p.slotId===id),canSwapSquadSlots:()=>false};const adapt=html=>html.replaceAll('data-team-slot=','data-eco-slot=').replace(/ data-(?:squad|draft)-slot="[^"]*"/g,'').replaceAll('FICHAJE','COLECCIÓN').replaceAll('Elegir jugador','Elegir carta de Colección');return adapt(renderBuilderPitch(state,formation))+adapt(renderBuilderBench(state,DRAFT_CONFIG.BENCH_ROLES));}
