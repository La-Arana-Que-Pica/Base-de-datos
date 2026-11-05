import {personalContext} from './context.js';
const KEY='laqp-draft-personal-cutover-v1';
export function legacyFences(){try{return JSON.parse(globalThis.localStorage?.getItem(KEY)||'{}');}catch{throw Error('No se pudo leer el control de migración; se conservan los guardados sin escribir.');}}
export function assertLegacyWritable(owner){if(personalContext())return;if(legacyFences()[owner])throw Error('Este progreso se importó al repositorio personal. Abrilo con personal=1; la copia antigua se conserva sin escribir.');}
export function fenceLegacyOwners(owners,target){const rows=legacyFences();for(const owner of owners)rows[owner]={target,at:Date.now()};localStorage.setItem(KEY,JSON.stringify(rows));if(typeof BroadcastChannel==='function'){const channel=new BroadcastChannel('laqp-personal-cutover');channel.postMessage({owners,target});channel.close();}}
export function installLegacyFenceWatcher(){
 if(personalContext())return;
 const owners=()=>[sessionStorage.getItem('laqp-career-menu-subject')||'sandbox-A','guest',window.LAQPAuth?.user?.id].filter(Boolean);
 const stop=()=>{if(owners().some(owner=>legacyFences()[owner])){document.querySelector('#app')?.setAttribute('inert','');const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='Este progreso fue importado en otra pestaña. Se detuvo la ruta anterior para conservar ambas copias. Abrí el perfil personal importado.';document.body.append(p);}};
 if(typeof BroadcastChannel==='function'){const channel=new BroadcastChannel('laqp-personal-cutover');channel.onmessage=stop;}window.addEventListener('storage',event=>{if(event.key===KEY)stop();});stop();
}
