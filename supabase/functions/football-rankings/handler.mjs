// Same handler runs in Supabase/Deno and in isolated Node tests.
export function createHandler({rpc,origins,rateSecret,clock=Date.now,localTest=false}){
 const votingEnabled=typeof rateSecret==='string'&&rateSecret.length>=32;
 const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
 const encode=s=>new TextEncoder().encode(s);
 async function digest(s){return hex(await crypto.subtle.digest('SHA-256',encode(s)));}
 async function bucket(s){const key=await crypto.subtle.importKey('raw',encode(rateSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encode(s)));}
 return async request=>{
  const origin=request.headers.get('Origin')||'';
  const cors={'Access-Control-Allow-Origin':origins.includes(origin)?origin:'null','Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, apikey','Cache-Control':'no-store'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
  if(!origins.includes(origin)&&!(request.method==='GET'&&!origin))return reply(403,{message:'Origen no permitido.'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(!['GET','POST'].includes(request.method))return reply(405,{message:'Método no permitido.'});
  try{
   if(request.method==='GET'){
    const data=await rpc('laqp_rankings_results',{});
    return reply(200,{...data,environment:localTest?'local':'global',votingEnabled});
   }
   // Reads stay public; writes require the server's private rate-limit key.
   if(!votingEnabled)return reply(503,{message:'La votación global todavía no está habilitada.'});
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply(415,{message:'Se requiere JSON.'});
   const reader=request.body?.getReader();let size=0,chunks=[];
   if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return reply(413,{message:'Solicitud demasiado grande.'});}chunks.push(value);}}
   let body;try{body=JSON.parse(new TextDecoder().decode(new Uint8Array(chunks.flatMap(v=>[...v]))));}catch{return reply(400,{message:'JSON inválido.'});}
   if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.voterId!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.voterId))return reply(400,{message:'Identificador anónimo inválido.'});
   if(!['vote','status'].includes(body.action))return reply(400,{message:'Operación desconocida.'});
   if(body.action==='vote'&&(![5,10].includes(body.mode)||!Array.isArray(body.choices)||body.choices.length!==body.mode||new Set(body.choices).size!==body.mode||body.choices.some(x=>typeof x!=='string'||x.length>160)))return reply(400,{message:'Top inválido: elegí 5 o 10 versiones distintas.'});
   const hash=await digest('laqp-football-v1:'+body.voterId);
   // Per-browser limit: independent visitors on a shared Wi-Fi never consume each other's quota.
   // No IP, network fingerprint or dependency on proxy forwarding headers.
   const rateKey=await bucket(Math.floor(clock()/600000)+':'+hash);
   if(!await rpc('laqp_rankings_gate',{p_bucket:rateKey}))return reply(429,{message:'Demasiados intentos. Esperá diez minutos antes de volver a intentar.'});
   if(body.action==='status')return reply(200,{alreadyVoted:await rpc('laqp_rankings_status',{p_hash:hash})});
   // Retry after a lost response never contributes a second time.
   if(await rpc('laqp_rankings_status',{p_hash:hash}))return reply(200,{accepted:false,alreadyVoted:true});
   return reply(200,await rpc('laqp_rankings_vote',{p_hash:hash,p_mode:body.mode,p_choices:body.choices}));
  }catch(error){
   // Do not return database details or log request bodies, headers, voter IDs or network identifiers.
   if(error.code==='22023')return reply(400,{message:'El Top incluye una versión inexistente, repetida o no votable.'});
   return reply(503,{message:'El ranking no está disponible. Tu Top sigue guardado; podés reintentar.'});
  }
 };
}
