import {albumState,clubCycle,completedCycle,milestones} from '../expansion/album.js';
import {albumCatalog} from '../album/catalog.js';
import {getPlayerById} from '../data/adapter.js';
import {ensureExpansion} from '../expansion/economy.js';
import {escapeHtml as e} from './html.js';
import {albumRewardModel,renderAlbumRewardGallery} from './albumRewardGallery.js';
export {rewardState} from './albumRewardState.js';
export const coinNumber=n=>Number(n||0).toLocaleString('es-AR');
export function albumRewardSummary(progress,source,legacy={}){return renderAlbumRewardGallery(albumRewardModel(progress,source,legacy));}
export function historicalRewardStrip(progress,source,legacy={},league='GLOBAL'){return renderAlbumRewardGallery(albumRewardModel(progress,source,legacy,league),{title:league==='GLOBAL'?'RECOMPENSAS DEL ÁLBUM':'HITOS HISTÓRICOS',subtitle:'Completá la competición y desbloqueá sus íconos históricos.'});}
export function clubRewardPanel(progress,source,legacy,clubId){const club=albumCatalog.teams.get(clubId);if(!club)return '';const v=structuredClone(progress||{collection:{}}),a=albumState(v,source,legacy),cycle=clubCycle(a,clubId),n=cycle.index===1?club.playerIds.filter(id=>a.historical[id]).length:Object.keys(cycle.found).length,ready=completedCycle(a,clubId),claimed=a.claims['club:'+clubId+':'+cycle.index],awarded=claimed&&getPlayerById(claimed.playerId)?.name;return '<section class="album-club-reward"><div><h2>RECOMPENSA DEL CLUB</h2><strong>Carta especial +2</strong><p>'+ (cycle.claimed?'RECLAMADA · '+e(awarded||'Carta registrada')+'. Podés iniciar otra vuelta.':ready?'DESBLOQUEADA · Elegí una carta del club.':'BLOQUEADA · Faltan '+(club.playerIds.length-n)+' figuritas de esta vuelta.')+'</p><button data-collection-club-reward>'+ (cycle.claimed?'VER CARTA Y SIGUIENTE CICLO':ready?'RECLAMAR CARTA +2':'CONSULTAR RECOMPENSA')+'</button></div><div><h2>CICLO ACTUAL · '+cycle.index+'</h2><strong>'+n+' / '+club.playerIds.length+'</strong><progress max="'+club.playerIds.length+'" value="'+n+'"></progress><p>'+ (cycle.index-1)+' ciclos anteriores · El progreso histórico se conserva.</p></div></section>';}
