// Explicit personal capability. Auth never selects an engine or imports a profile.
let current=null;
export const personalContext=()=>current;
export function setPersonalContext(value){current=value;}
// The dedicated loopback fixture server supplies this marker. The database
// is fixed in game.js, never selected from a URL or a real account.
export function transferLabRequested(){return globalThis.window?.LAQP_LF5_LAB===true&&['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname)&&new URLSearchParams(location.search).get('transferLab')==='1';}
// Separate explicit staging capability. URL parameters never grant real access.
export function stagingTransferRequested(scope=globalThis.window){
 const c=scope?.LAQP_DRAFT_GUEST_TRANSFER_CONFIG,s=scope?.LAQP_DRAFT_PERSONAL_SYNC_CONFIG;
 return ['localhost','127.0.0.1','[::1]'].includes(scope?.location?.hostname)&&!scope.LAQP_LF5_LAB&&c?.enabled===true&&c.contractVerified===true&&c.projectRef==='niyqnkoqngyoogpwkegl'&&s?.enabled===true&&s.contractVerified===true&&s.projectRef===c.projectRef&&scope.LAQP_SUPABASE?.supabaseUrl==='https://niyqnkoqngyoogpwkegl.supabase.co';
}
export function personalRequested(){
 const l=globalThis.location;if(!l)return false;
 const local=['localhost','127.0.0.1','[::1]'].includes(l.hostname);
 return local&&new URLSearchParams(l.search).get('personal')==='1';
}
