// A configured official context never falls back to sandbox stores.
let runtime=null,requested=false;
export const accountRuntime=()=>runtime;
export const officialContext=()=>requested;
export function setAccountRuntime(value,{enabled=true}={}){runtime=value;requested=enabled;}
export function requireAccount(){if(!runtime?.account?.view||!runtime.account.owner)throw Error('Ingresá y recuperá el progreso de tu cuenta.');return runtime;}
export const accountSubject=()=>officialContext()?'account:'+requireAccount().account.owner:null;
