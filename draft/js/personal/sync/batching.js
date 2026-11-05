// Transport only: manifests, blob hashes and commit receipts remain v1.
import {bytes,SYNC_LIMITS} from './limits.js';
import {fail} from '../format.js';
export const LEGACY_TRANSPORT=Object.freeze({version:1,maxChunks:8,putBytes:2*1024*1024,getBytes:4*1024*1024});
export const ADAPTIVE_TRANSPORT=Object.freeze({version:2,maxChunks:128,putBytes:2*1024*1024,getBytes:4*1024*1024});
const TARGET=1024*1024;
// PostgreSQL jsonb text adds spaces; reserve them plus the RPC argument wrapper.
export const putCost=blob=>bytes(JSON.stringify(blob))+8;
export function* uploadBatches(blobs,transport=LEGACY_TRANSPORT){
 let batch=[],size=32;
 for(const blob of blobs){const cost=putCost(blob);
  if(cost+32>transport.putBytes)fail('SYNC_SIZE','Un fragmento supera el límite de transporte');
  if(batch.length&&(batch.length>=transport.maxChunks||size+cost>Math.min(transport.targetBytes??TARGET,transport.putBytes))){yield batch;batch=[];size=32;}
  batch.push(blob);size+=cost;
 }if(batch.length)yield batch;
}
export function* downloadBatches(manifest,transport=LEGACY_TRANSPORT){
 const sources=new Map();for(const c of manifest.components)for(const hash of c.chunks){const old=sources.get(hash);if(!old||c.bytes<old.bytes)sources.set(hash,c);}
 // Distinct pieces assigned to one component cannot together contain more
 // bytes than that entire component. Do not charge its full size per piece.
 // Sixfold escaping + 100 bytes/row is the server's conservative envelope.
 // This is planning only: SQL and unpackSnapshot still enforce actual limits.
 const limit=Math.min(transport.targetBytes??transport.getBytes,transport.getBytes);
 let batch=[],groups=new Map(),size=2;
 for(const [hash,c] of sources){
  const previous=groups.get(c)||0,next=previous+1;
  let delta=6*(Math.min(c.bytes,next*SYNC_LIMITS.chunkBytes)-Math.min(c.bytes,previous*SYNC_LIMITS.chunkBytes))+100;
  if(batch.length&&(batch.length>=transport.maxChunks||size+delta>limit)){yield batch;batch=[];groups=new Map();size=2;delta=6*Math.min(c.bytes,SYNC_LIMITS.chunkBytes)+100;}
  if(size+delta>transport.getBytes)fail('SYNC_SIZE','Un fragmento supera el límite de respuesta');
  batch.push(hash);groups.set(c,(groups.get(c)||0)+1);size+=delta;
 }if(batch.length)yield batch;
}
