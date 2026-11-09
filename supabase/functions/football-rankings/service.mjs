import {createHandler} from './handler.mjs';
// Production transport, also exercised through real local PostgREST in integration tests.
export function createService(env,fetcher=fetch){
 const get=name=>(env(name)||'').trim();
 // Public deployment defaults; secret values never have fallbacks.
 const defaults={RANKINGS_ALLOWED_ORIGINS:'https://laqp.website,https://www.laqp.website,http://127.0.0.1:5500'};
 const list=name=>(get(name)||defaults[name]||'').split(',').map(s=>s.trim()).filter(Boolean);
 // Keep the three explicitly supported origins even if the environment still has the old public-only list.
 const origins=[...new Set([...defaults.RANKINGS_ALLOWED_ORIGINS.split(','),...list('RANKINGS_ALLOWED_ORIGINS')])];
 const rpc=async(name,args)=>{
  const response=await fetcher(get('SUPABASE_URL').replace(/\/$/,'')+'/rest/v1/rpc/'+name,{
   method:'POST',headers:{'Content-Type':'application/json',apikey:get('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+get('SUPABASE_SERVICE_ROLE_KEY')},
   body:JSON.stringify(args),signal:AbortSignal.timeout(10000)
  });
  if(!response.ok){const details=await response.json().catch(()=>({}));throw Object.assign(new Error('RPC unavailable'),{code:details.code});}
  return response.json();
 };
 return createHandler({rpc,origins,rateSecret:get('RANKINGS_RATE_SECRET')});
}
