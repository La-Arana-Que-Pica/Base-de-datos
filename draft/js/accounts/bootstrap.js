import {ACCOUNT_STATUS} from './protocol.js';
import {AccountClient,sharedSupabaseClient,sharedIdentity,supabaseAccountTransport} from './client.js';
// Explicit account bootstrap, reused by the normal UI and isolated laboratory.
// Server capabilities and UI flags remain required; no local profile import.
export function installAccountIntegration({scope=window,config=scope.LAQP_DRAFT_ACCOUNT_CONFIG}={}){
 if(config?.enabled!==true)return null;
 if(scope.LAQPDraftAccountIntegration)return scope.LAQPDraftAccountIntegration;
 const client=sharedSupabaseClient(scope);if(!client)return null;
 let storage;try{storage=scope.localStorage;}catch{return null;}
 const account=new AccountClient({identity:sharedIdentity(client),transport:supabaseAccountTransport(client,{endpoint:config.endpoint}),storage,context:new URL(client.supabaseUrl).origin,onChange:state=>document.dispatchEvent(new CustomEvent('laqp-draft-account-state',{detail:{owner:state.owner,status:state.status,revision:state.revision}}))});
 const refresh=()=>account.refresh().catch(()=>{}),auth=(event,session)=>{const next=session??event?.detail?.session;if(next?.user?.id===account.owner&&account.view)return;account.disconnect();refresh();};
 const subscription=client.auth.onAuthStateChange((event,session)=>queueMicrotask(()=>auth(event,session)));document.addEventListener('laqp-auth-change',auth);scope.addEventListener('online',refresh);
 scope.LAQPDraftAccount=account;refresh();const installation={account,dispose(){account.disconnect();subscription.data.subscription.unsubscribe();document.removeEventListener('laqp-auth-change',auth);scope.removeEventListener('online',refresh);if(scope.LAQPDraftAccount===account)delete scope.LAQPDraftAccount;if(scope.LAQPDraftAccountIntegration===installation)delete scope.LAQPDraftAccountIntegration;}};scope.LAQPDraftAccountIntegration=installation;return installation;
}
export function officialModeAvailability(account,mode){return !!(account?.view&&account?.status===ACCOUNT_STATUS.ready&&account?.serverCapabilities?.authoritative&&account?.serverCapabilities?.liveGameUI&&account?.serverCapabilities?.modes?.includes(mode));}
