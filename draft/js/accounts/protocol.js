// Public wire protocol. A valid command is not proof of a sporting result.
export const ACCOUNT_PROTOCOL=1;
export const ACCOUNT_RULESET='draft-16-reform-2026-10-account-v1';
export class AccountError extends Error{constructor(code,message){super(message);this.code=code;}}
export const reject=(code,message)=>{throw new AccountError(code,message);};
export const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))reject('invalid','La solicitud contiene campos incompatibles.');}
export function canonical(value){return JSON.stringify(value,function(k,v){if(['__proto__','constructor','prototype'].includes(k))reject('invalid','Clave no permitida.');return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v;});}
export function validateEnvelope(value){exact(value,['version','ruleset','operationId','expectedRevision','kind','args']);if(value.version!==ACCOUNT_PROTOCOL||value.ruleset!==ACCOUNT_RULESET||!uuid(value.operationId)||!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision<0||typeof value.kind!=='string'||!value.args||typeof value.args!=='object'||Array.isArray(value.args)||canonical(value).length>2200000)reject('invalid','Comando incompatible.');return value;}
export async function requestHash(value){const bytes=new TextEncoder().encode(canonical(value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
export const ACCOUNT_STATUS={guest:'Invitado · progreso local',loading:'Buscando tu progreso…',ready:'Progreso confirmado por el servidor',saving:'Guardando…',pending:'Sincronización pendiente · tu decisión está conservada en este navegador',conflict:'Hay una versión más nueva · revisá el guardado antes de continuar',expired:'Tu sesión venció · ingresá nuevamente',unavailable:'El guardado de cuenta todavía no está habilitado'};
