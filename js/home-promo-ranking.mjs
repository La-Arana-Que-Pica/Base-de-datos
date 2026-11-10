// Top 3 real del ranking histórico para el carrusel de la portada.
// Usa el mismo endpoint, la misma validación (createApi) y la misma agrupación (gameRows)
// que la clasificación de /tier-list.html: no hay cálculos paralelos ni datos de ejemplo.
import config from './football-rankings/config.js';
import {createApi} from './football-rankings/api.mjs';
import {gameRows,cover} from './football-rankings/model.mjs';

let pending;
export function loadTop3(){
 if(!pending)pending=(async()=>{
  const api=createApi(config);
  if(!api)return {state:'disabled',rows:[]};
  const data=await api('results');
  const rows=gameRows(data).filter(r=>r.position<=3).sort((a,b)=>a.position-b.position).slice(0,3);
  return {state:rows.length?'ready':'empty',rows,ballots:data.ballots};
 })().catch(error=>{pending=null;throw error;});
 return pending;
}

// Portadas: el catálogo es pesado, así que se pide solo después de tener resultados.
// loadCatalog está memoizado y comparte la caché HTTP con /tier-list.html.
export async function coversFor(rows){
 const {loadCatalog}=await import('./football-rankings/catalog.mjs');
 const catalog=await loadCatalog();
 return rows.map(r=>{const game=catalog.gameById.get(r.game_id);return game?cover(game):null;});
}
