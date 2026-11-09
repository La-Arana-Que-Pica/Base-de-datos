// Shared, memoised catalogue for Top 5/10, ranking and Tier List: one fetch and one search index per page.
import {catalogVersions} from './model.mjs';
import {createIndex} from './search.mjs';
let pending;
export function loadCatalog(url='/database/football-games.json'){
 if(!pending)pending=(async()=>{
  const response=await fetch(url);
  if(!response.ok)throw Error('No se pudo cargar el catálogo. Recargá la página para reintentar.');
  const data=await response.json();
  if(data.schemaVersion!==1||!Array.isArray(data.games))throw Error('Catálogo incompatible. Recargá la página.');
  const games=data.games,versions=catalogVersions(games);
  return {games,versions,gameById:new Map(games.map(g=>[g.id,g])),versionById:new Map(versions.map(v=>[v.id,v])),index:createIndex(games)};
 })().catch(error=>{pending=null;throw error;});
 return pending;
}
export const year=game=>(game.releases?.[0]?.date||'').slice(0,4);
