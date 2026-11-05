import {canonical,verify,fail} from './format.js';
import {verifyMatchCheckpoint} from '../persistence/matchCheckpoint.js';
// Independent comparison: enumerate permitted differences instead of remapping again.
export async function verifyTransferParity(source,result){
 await verify(source.active);await verify(result.active);
 const a=source.active.bundle,b=result.active.bundle,from=a.identity,to=b.identity;
 if(a.revision!==b.revision||a.updatedAt!==b.updatedAt||canonical(a.receipts)!==canonical(b.receipts))fail('TRANSFER_PARITY','Cabecera o recibos alterados');
 function compare(x,y,path){
  if(canonical(x)===canonical(y))return;
  const allowed=/^data\.(runs|history)\.\d+\.(?:(?:legacy\.)?(?:subject|economySubject|albumSubject)|(?:legacy\.)?snapshot\.data\.(?:albumSubject|expansionSubject|survival\.economySubject))$/.test(path)||/^data\.shared\.survivalProfiles\.[^.]+\.(?:subject|lastParticipation\.(?:subject|economySubject|albumSubject))$/.test(path)||path==='data.shared.settings.albumSource'||/^data\.shared\.legacy\.survivalResults\.[^.]+\.(?:subject|economySubject|albumSubject)$/.test(path);
  const archiveAllowed=/^data\.shared\.legacy\.(?:replaced|abandoned)\.\d+\.(?:(?:legacy\.)?(?:subject|economySubject|albumSubject)|(?:legacy\.)?snapshot\.data\.(?:albumSubject|expansionSubject|survival\.economySubject))$/.test(path);
  if((allowed||archiveAllowed)&&((x===from&&y===to)||(x==='dream:'+from&&y==='dream:'+to)))return;
  if(!x||!y||typeof x!=='object'||typeof y!=='object'||Array.isArray(x)!==Array.isArray(y))fail('TRANSFER_PARITY','Cambio no autorizado: '+path);
  const mapped=k=>['data.shared.albumNamespaces','data.shared.progress.expansion.albums'].includes(path)?(k===from?to:k==='dream:'+from?'dream:'+to:k):k;
  if(Object.keys(x).length!==Object.keys(y).length)fail('TRANSFER_PARITY','Cantidad alterada: '+path);
  for(const k of Object.keys(x)){const next=mapped(k);if(!Object.hasOwn(y,next))fail('TRANSFER_PARITY','Referencia perdida: '+path);compare(x[k],y[next],path+'.'+k);}
 }
 compare(a.data,b.data,'data');
 if((source.matches||[]).length!==(result.matches||[]).length)fail('TRANSFER_PARITY','Generaciones omitidas');
 for(let i=0;i<(source.matches||[]).length;i++){
  const x=source.matches[i],y=result.matches[i];
  if(x.key.startsWith('lf3-protected:'+from+':')){const back={...y,key:x.key,owner:x.owner};delete back.sourceOwner;delete back.transferDisposition;if(y.sourceOwner!==from||y.transferDisposition!=='preserved-only'||y.owner!==to||y.key!=='lf3-protected:'+to+':'+x.key.slice(('lf3-protected:'+from+':').length)||canonical(back)!==canonical(x))fail('TRANSFER_PARITY','Se alteró o promovió una recuperación protegida');continue;}
  if(x.runId!==y.runId||x.sequence!==y.sequence||x.generations.length!==y.generations.length)fail('TRANSFER_PARITY','Secuencia alterada');
  for(let j=0;j<x.generations.length;j++){
   const g=x.generations[j],h=y.generations[j];await verifyMatchCheckpoint(g.sealed,{owner:from,runId:x.runId});await verifyMatchCheckpoint(h.sealed,{owner:to,runId:y.runId});
   if(g.sequence!==h.sequence||g.operationId!==h.operationId||canonical({...g.sealed.checkpoint,owner:to})!==canonical(h.sealed.checkpoint))fail('TRANSFER_PARITY','El estado deportivo cambió');
  }
 }
 return true;
}
