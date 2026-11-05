import {identity,fail} from './format.js';
export const accountIdentity=(projectRef,userId)=>identity('account:'+projectRef+':'+userId);
export const laboratoryIdentity=id=>identity('laboratory:'+id);
// Atomic get-or-create in repository metadata; two first-run tabs share one guest.
export async function guestIdentity(repository){return repository.guestIdentity();}
export function identityKind(id){identity(id);return id.slice(0,id.indexOf(':'));}
export function assertSameOwner(left,right){if(identity(left)!==identity(right))fail('OWNER','Los perfiles pertenecen a identidades distintas');}
