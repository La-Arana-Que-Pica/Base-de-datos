import {assertLegacyWritable} from '../personal/legacyFence.js';
import {officialContext} from '../accounts/context.js';
// Extends the existing Carrera profile store; no second account/collection database.
import {CareerLocalStore} from '../career/localStore.js';
import {freshCareer} from '../career/rules.js';
export class ExpansionStore extends CareerLocalStore{
 async mutate(subject,operation){assertLegacyWritable(subject);if(officialContext())throw Error('La cuenta oficial no permite operaciones económicas locales.');if(!subject)throw Error('Perfil local inexistente');return this.transaction(['profiles'],'readwrite',async tx=>{const store=tx.objectStore('profiles'),row=await new Promise((resolve,reject)=>{const r=store.get(subject);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),progress=structuredClone(row?.progress??freshCareer()),result=operation(progress);if(result?.then)throw Error('Una operación atómica no puede esperar trabajo externo');store.put({...row,subject,progress});return {progress,result};});}
}
