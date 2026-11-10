// Stable catalogue identities: regional titles are aliases, not extra ballots.
export const TOP_KEY='laqp-football-tops-v1';
export const VOTER_KEY='laqp-football-voter-v1';
export const RECEIPT_KEY='laqp-football-vote-receipt-v1';
export const POINTS=Object.freeze({5:[10,8,6,4,2],10:[10,9,8,7,6,5,4,3,2,1]});
export function versions(game){return (game.platforms.length?game.platforms:['Edición general']).map(platform=>({id:game.id+':'+platform,gameId:game.id,platform,game}));}
export function catalogVersions(games){return games.flatMap(versions);}
export function initial(){return {version:1,mode:5,title:'Mi Top de fútbol',choices:[]};}
// choices[i] is the version at position i+1; null marks an empty position while the Top is being built.
export function validateTop(top,known,complete=false){
 const filled=Array.isArray(top?.choices)?top.choices.filter(id=>id!==null):[];
 if(!top||top.version!==1||![5,10].includes(top.mode)||typeof top.title!=='string'||top.title.length>100||!Array.isArray(top.choices)||top.choices.length>top.mode||filled.some(id=>typeof id!=='string'||!known.has(id))||new Set(filled).size!==filled.length)throw Error('Top inválido: revisá el modo, las versiones y los duplicados.');
 // Un juego canónico (game_id) aparece una sola vez por Top, aunque tenga varias plataformas.
 const gameIds=filled.map(id=>known.get(id).gameId);
 if(new Set(gameIds).size!==gameIds.length)throw Error('Top inválido: un mismo juego aparece en dos puestos (aunque sea en otra plataforma).');
 if(complete&&(top.choices.length!==top.mode||filled.length!==top.mode))throw Error('Elegí exactamente '+top.mode+' versiones antes de votar.');
 return structuredClone(top);
}
// Copias guardadas antes de esta regla: conserva la aparición con más puntos (el puesto más alto)
// y deja vacío el puesto repetido. Devuelve los juegos quitados para avisar al usuario.
export function dedupeGames(choices,known){
 const seen=new Set(),removed=[];
 const out=choices.map(id=>{if(id===null||!known.has(id))return id;const g=known.get(id).gameId;if(seen.has(g)){removed.push(id);return null;}seen.add(g);return id;});
 return {choices:out,removed};
}
export function gameOf(id,known){return known.get(id)?.gameId??null;}
export function slots(top){return Array.from({length:top.mode},(_,i)=>top.choices[i]??null);}
export function compact(choices){const out=[...choices];while(out.length&&out[out.length-1]===null)out.pop();return out;}
export function reorder(choices,from,to){if(from<0||to<0||from>=choices.length||to>=choices.length)return;choices.splice(to,0,choices.splice(from,1)[0]);}
export function voterId(storage,cryptoAPI=globalThis.crypto){
 let id=storage.getItem(VOTER_KEY);
 if(id&&!/^[A-Za-z0-9_-]{43}$/.test(id))throw Error('El identificador anónimo guardado está dañado. Podés seguir creando Tops personales.');
 if(!id){const bytes=cryptoAPI.getRandomValues(new Uint8Array(32));id=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');storage.setItem(VOTER_KEY,id);if(storage.getItem(VOTER_KEY)!==id)throw Error('No se pudo conservar el identificador anónimo.');}
 return id;
}
export function cover(game){
 if(game.cover?.src?.startsWith('/')&&!game.cover.src.startsWith('//')&&game.cover.credit&&game.cover.license)return game.cover.src;
 const text=game.title.slice(0,42).replace(/[<>&"']/g,'');
 const lines=(text.match(/.{1,15}(?:\s|$)|.{1,15}/g)||[]).slice(0,4);
 return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#142a32"/><circle cx="225" cy="270" r="140" fill="#21d4c2" opacity=".15"/><text x="18" y="38" fill="#21d4c2" font-family="sans-serif" font-size="18">LAqP / FÚTBOL</text>${lines.map((line,i)=>`<text x="18" y="${110+i*28}" fill="white" font-family="sans-serif" font-size="22">${line}</text>`).join('')}</svg>`);
}
// Una fila por juego canónico (game_id). Si el backend todavía responde por versión (antes de la
// migración rankings-games.sql), se agrupa acá; los votantes únicos no se pueden deducir: «aprox.».
// Compartido con la portada (js/home-promo-ranking.mjs): un único criterio de agrupación y orden.
export function gameRows(data,known=new Map()){
 if(data.aggregation==='game'||data.rows.every(r=>Array.isArray(r.platforms)))return data.rows.map(r=>({...r,game_id:r.game_id||r.id,platforms:r.platforms||[]}));
 const by=new Map();
 for(const r of data.rows){const gid=r.game_id||known.get(r.id)?.gameId||r.id;const g=by.get(gid)||{id:gid,game_id:gid,title:r.title,series:r.series,points:0,voters:0,platforms:[],approximate:true};g.points+=r.points;g.voters+=r.voters;g.platforms.push({id:r.id,platform:r.platform,points:r.points,voters:r.voters});by.set(gid,g);}
 return [...by.values()].sort((a,b)=>b.points-a.points||b.voters-a.voters||String(a.game_id).localeCompare(b.game_id)).map((g,i)=>({...g,position:i+1}));
}
