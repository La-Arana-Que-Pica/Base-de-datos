// LF1 is deliberately not imported by the game bootstrap. No Auth or network here.
export const FORMAT = 'laqp-draft-personal';
export const VERSION = 1;
export const LIMITS = Object.freeze({bytes:64*1024*1024,depth:96,nodes:1000000,records:100000});
export class PersonalError extends Error {
  constructor(code,message,details=null){super(message);this.name='PersonalError';this.code=code;this.details=details;}
}
export function fail(code,message,details){throw new PersonalError(code,message,details);}
export function identity(value){
  const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  if(typeof value!=='string'||!(new RegExp('^guest:'+uuid+'$','i').test(value)||new RegExp('^account:[a-z0-9]{20}:'+uuid+'$','i').test(value)||/^laboratory:[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,159}$/.test(value)))fail('IDENTITY','Identidad personal inválida');
  return value;
}
export function recordId(value){if(typeof value!=='string'||!value.length||value.length>400||/[\u0000-\u001f\u007f]/.test(value))fail('STRUCTURE','Identificador inválido');return value;}
const forbidden=new Set(['__proto__','prototype','constructor']);
const secret=/^(access_?token|refresh_?token|id_token|authorization|service_?role(_?key)?|anon_?key|supabase_?key|api_?key|password|session|sessions|jwt)$/i;
// Accept plain JSON only, never executable values, cyclic objects, getters or credentials.
export function canonical(value,limits=LIMITS){
  let nodes=0,characters=0;const ancestors=new Set(),encoder=new TextEncoder();
  // UTF-8 encoding once at the end avoids millions of tiny allocations on snapshots.
  const charge=s=>{characters+=s.length;if(characters>limits.bytes)fail('SIZE','La copia supera el límite de tamaño');return s;};
  function walk(v,depth){
    if(++nodes>limits.nodes||depth>limits.depth)fail('DEPTH','Estructura demasiado grande o profunda');
    if(v===null)return charge('null');
    if(typeof v==='string'){if(/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)||/^sb_(secret|publishable)_/.test(v))fail('SECRET','La copia contiene una credencial');return charge(JSON.stringify(v));}
    if(typeof v==='boolean')return charge(String(v));
    if(typeof v==='number'){if(!Number.isFinite(v))fail('STRUCTURE','Número no finito');return charge(JSON.stringify(v));}
    if(typeof v!=='object'||(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null&&!Array.isArray(v)))fail('STRUCTURE','Se requiere JSON sin objetos ejecutables');
    if(Object.getOwnPropertySymbols(v).length)fail('STRUCTURE','Propiedad simbólica no permitida');
    if(ancestors.has(v))fail('STRUCTURE','Referencia circular sin codificar');ancestors.add(v);
    let result;
    if(Array.isArray(v)){
      if(Object.keys(v).length!==v.length||Object.getOwnPropertyNames(v).length!==v.length+1)fail('STRUCTURE','Array disperso o con propiedades adicionales');
      result=charge('[')+Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value'in d))fail('STRUCTURE','Accesor no permitido');return walk(d.value,depth+1);}).join(charge(','))+charge(']');
    }else{
      if(Object.getOwnPropertyNames(v).length!==Object.keys(v).length)fail('STRUCTURE','Propiedad no enumerable no permitida');
      result=charge('{')+Object.keys(v).sort().map(k=>{
        if(forbidden.has(k))fail('STRUCTURE','Clave insegura');if(secret.test(k))fail('SECRET','Credenciales fuera del guardado personal');
        const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!('value'in d))fail('STRUCTURE','Accesor no permitido');
        return charge(JSON.stringify(k)+':')+walk(d.value,depth+1);
      }).join(charge(','))+charge('}');
    }
    ancestors.delete(v);return result;
  }
  const result=walk(value,0);if(encoder.encode(result).length>limits.bytes)fail('SIZE','La copia supera el límite de tamaño');return result;
}
export function clone(value){return JSON.parse(canonical(value));}
async function hashText(text){if(!globalThis.crypto?.subtle)fail('CRYPTO','Se necesita Web Crypto en un contexto seguro');const bytes=new TextEncoder().encode(text);return {hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join(''),bytes:bytes.byteLength};}
export async function digestInfo(value){return hashText(canonical(value));}
export async function digest(value){return (await digestInfo(value)).hash;}
export function parse(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>LIMITS.bytes)fail('SIZE','Archivo demasiado grande');let value;try{value=JSON.parse(text);}catch{fail('STRUCTURE','JSON inválido');}canonical(value);return value;}
export const blankData=()=>({shared:{progress:null,albumNamespaces:{},dreamTeam:null,survivalProfiles:{},settings:{},legacy:{}},runs:[],history:[],outbox:[]});
function dataShape(data){
  if(!data||Object.keys(data).sort().join(',')!=='history,outbox,runs,shared'||!data.shared||Array.isArray(data.shared)||typeof data.shared!=='object')fail('STRUCTURE','Datos personales incompletos');
  for(const key of ['progress','albumNamespaces','dreamTeam','survivalProfiles','settings','legacy'])if(!Object.hasOwn(data.shared,key))fail('STRUCTURE','Campo compartido ausente: '+key);
  for(const name of ['runs','history','outbox']){
    if(!Array.isArray(data[name])||data[name].length>LIMITS.records)fail('STRUCTURE','Colección personal inválida');const seen=new Set();
    for(const row of data[name]){if(!row||typeof row!=='object'||Array.isArray(row))fail('STRUCTURE','Registro inválido');recordId(row.id);if(seen.has(row.id))fail('STRUCTURE','Registro duplicado');seen.add(row.id);}
  }
  return data;
}
export function validateData(data){canonical(data);return dataShape(data);}
export function copyValidatedData(data){const text=canonical(data);dataShape(data);return JSON.parse(text);}
function bundleShape(bundle){
  if(!bundle||bundle.format!==FORMAT||bundle.version!==VERSION)fail('VERSION','Versión personal incompatible');identity(bundle.identity);
  if(!Number.isSafeInteger(bundle.revision)||bundle.revision<0||!Number.isSafeInteger(bundle.updatedAt)||bundle.updatedAt<0)fail('STRUCTURE','Revisión personal inválida');dataShape(bundle.data);
  if(!Array.isArray(bundle.receipts)||bundle.receipts.length>LIMITS.records)fail('STRUCTURE','Recibos inválidos');const ids=new Set();
  for(const r of bundle.receipts){recordId(r.id);recordId(r.kind);if(ids.has(r.id)||!/^[a-f0-9]{64}$/.test(r.requestHash)||!Number.isSafeInteger(r.revision)||r.revision<1||r.revision>bundle.revision)fail('STRUCTURE','Recibo incompatible');ids.add(r.id);}
  return bundle;
}
export function validateBundle(bundle){canonical(bundle);return bundleShape(bundle);}
// A canonical traversal already checks every nested value, accessor, limit and
// secret. Reuse that exact text for copying and hashing; do not walk it again.
export async function seal(bundle){const text=canonical(bundle);bundleShape(bundle);return {bundle:JSON.parse(text),hash:(await hashText(text)).hash};}
export async function verify(sealed){if(!sealed||typeof sealed.hash!=='string'||!sealed.bundle)fail('INTEGRITY','Copia incompleta');const text=canonical(sealed.bundle);bundleShape(sealed.bundle);if((await hashText(text)).hash!==sealed.hash)fail('INTEGRITY','La integridad del guardado no coincide');return sealed.bundle;}
// IndexedDB reconstructs row collections by ID. Seal that storage order while
// retaining any differently ordered input as an original protected generation.
export function storageBundle(bundle){const b=clone(bundle),sort=rows=>rows.sort((a,c)=>a.id<c.id?-1:a.id>c.id?1:0);for(const n of ['runs','history','outbox'])sort(b.data[n]);sort(b.receipts);return b;}
