export function validateConfig(config,page=location){
 const loopback=['localhost','127.0.0.1'].includes(page.hostname);
 if(typeof config.endpoint!=='string'||!config.endpoint.trim())throw Error('Falta configurar el endpoint del ranking.');
 const url=new URL(config.endpoint,page.origin);
 if(config.localTest&&(!loopback||url.origin!==page.origin))throw Error('Las pruebas del ranking solo funcionan en el servidor local aislado.');
 if(!config.localTest&&(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/functions/v1/football-rankings')))throw Error('El endpoint público del ranking no es válido.');
 if(config.publishableKey&&!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey))throw Error('El ranking solo admite una clave pública publishable.');
 return url;
}
export function createApi(config){
 if(!config.enabled)return null;
 const url=validateConfig(config);
 // Deliberately do not use the shared Auth client or any account/session token.
 return async function api(action,payload){
  const headers={};if(config.publishableKey)headers.apikey=config.publishableKey;
  const init={method:payload?'POST':'GET',credentials:'omit',headers,signal:AbortSignal.timeout(15000),cache:'no-store'};
  if(payload){headers['Content-Type']='application/json';init.body=JSON.stringify({action,...payload});}
  let response;try{response=await fetch(url.href+(payload?'':'?action='+encodeURIComponent(action)),init);}catch{
   const local=['localhost','127.0.0.1'].includes(location.hostname);
   throw Error('No se pudo conectar con el ranking. Tu Top sigue guardado; reintentá más tarde.'+(local?' Revisá la conexión y que el backend admita el origen '+location.origin+'.':''));
  }
  let data;try{data=await response.json();}catch{throw Error('El servicio del ranking no respondió correctamente. Tu Top sigue guardado.');}
  if(!response.ok)throw Error(data?.message||'No se pudo conectar con el ranking. Tu Top sigue guardado.');
  if(!data||typeof data!=='object'||(action==='results'&&(!Array.isArray(data.rows)||!Number.isSafeInteger(data.ballots)||data.ballots<0||![5,10].every(mode=>Array.isArray(data.scoring?.[mode])&&data.scoring[mode].length===mode))))throw Error('El ranking devolvió una respuesta incompatible. Tu Top sigue guardado.');
  if(action==='vote'&&data.accepted!==true&&data.alreadyVoted!==true)throw Error('No se pudo confirmar el voto. Podés reintentar sin duplicar puntos.');
  return data;
 };
}
