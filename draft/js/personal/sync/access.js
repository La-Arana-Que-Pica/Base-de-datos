// Rollout controls availability, never authorization. RPC/RLS still owns access.
export const SYNC_CONFIG_EVENT='laqp-personal-sync-config-change';
const observed=new WeakMap();
export function syncAccess(scope,projectRef,owner,now=Date.now()){
 const c=scope?.LAQP_DRAFT_PERSONAL_SYNC_CONFIG;
 if(c?.projectRef!==projectRef||scope?.LAQP_SUPABASE?.supabaseUrl!=='https://'+projectRef+'.supabase.co')return false;
 const r=c.rollout,previous=observed.get(scope);
 if(r===undefined)return !previous&&c.enabled===true&&c.contractVerified===true; // Existing staging only.
 if(r?.version!==1||typeof r.enabled!=='boolean'||!Number.isSafeInteger(r.revision)||r.revision<0||!Number.isSafeInteger(r.issuedAt)||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<r.issuedAt||r.expiresAt-r.issuedAt>15*60*1000||!Array.isArray(r.userIds)||r.userIds.length>64||r.userIds.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))return false;
 const signature=JSON.stringify([r.enabled,[...r.userIds].sort(),r.issuedAt,r.expiresAt]);if(previous&&(r.revision<previous.revision||r.revision===previous.revision&&signature!==previous.signature))return false;
 const expired=r.expiresAt<=now||previous?.revision===r.revision&&previous.expired;observed.set(scope,{revision:r.revision,signature,expired});if(c.enabled!==true||c.contractVerified!==true||!r.enabled)return false;
 if(r.issuedAt>now||expired)return false;
 return typeof owner==='string'&&owner.startsWith('account:'+projectRef+':')&&r.userIds.includes(owner.split(':')[2]);
}
export function watchSyncAccess(scope,fn){let timer;const schedule=()=>{clearTimeout(timer);const r=scope?.LAQP_DRAFT_PERSONAL_SYNC_CONFIG?.rollout,delay=r?.expiresAt-Date.now();if(r?.enabled&&Number.isFinite(delay)&&delay>0&&delay<=15*60*1000)timer=setTimeout(changed,delay+1);},changed=()=>{fn();schedule();};scope?.addEventListener?.(SYNC_CONFIG_EVENT,changed);schedule();return()=>{clearTimeout(timer);scope?.removeEventListener?.(SYNC_CONFIG_EVENT,changed);};}
