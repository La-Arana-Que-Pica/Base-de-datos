// LF5.1 preview compatibility only. Deliberately not connected to Auth/bootstrap.
// Its preview consent is NOT an installation token. LF5.2B installation uses
// GuestTransferRepository's durable, transaction-bound consent and receipt.
import {verify,identity,clone,digest,fail} from './format.js';
export async function prepareGuestTransfer({source,target,selectedAccount,playing=false}){
 await verify(source.active);await verify(target.active);
 const from=identity(source.active.bundle.identity),to=identity(target.active.bundle.identity);
 if(!from.startsWith('guest:')||!to.startsWith('account:')||to!==selectedAccount)fail('TRANSFER_OWNER','Elegí explícitamente una cuenta de destino');
 if(playing)fail('TRANSFER_PLAYING','Pausá el partido y confirmá su guardado antes de continuar');
 // Metadata/outbox and LF3 ownership need a dedicated, reviewed remapping.
 // Never reinterpret a source snapshot as an account-owned export here.
 const original=clone(source),destination=clone(target);
 const binding={version:1,source:from,target:to,sourceHash:await digest(original),targetHash:await digest(destination)};
 return {binding,id:await digest(binding),source:original,target:destination,status:'awaiting-consent',verification:'personal-unverified'};
}
export async function consentToGuestTransfer(prepared,{operationId,selectedAccount,sourceHash,targetHash,confirmed=false}){
 if(!confirmed)fail('CONFIRMATION','Confirmá qué progreso querés conservar');
 if(prepared.status!=='awaiting-consent'||selectedAccount!==prepared.binding.target||sourceHash!==prepared.binding.sourceHash||targetHash!==prepared.binding.targetHash)fail('TRANSFER_CHANGED','El progreso o la cuenta cambiaron; revisá la vista previa');
 if(await digest(prepared.source)!==sourceHash||await digest(prepared.target)!==targetHash||await digest(prepared.binding)!==prepared.id)fail('INTEGRITY','La preparación cambió');
 if(typeof operationId!=='string'||!operationId.length||operationId.length>200)fail('STRUCTURE','Operación inválida');
 return {version:1,operationId,preparationId:prepared.id,source:prepared.binding.source,target:prepared.binding.target,status:'consented-not-installed',cloudConfirmed:false};
}
