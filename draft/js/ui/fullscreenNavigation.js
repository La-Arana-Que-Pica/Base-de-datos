// A stable fullscreen document owns one same-origin game surface across mode changes.
// Each mode keeps its existing boot, persistence and candidate-generation logic.
const controllers=new WeakMap();
export const registerFullscreenController=(doc,controller)=>controllers.set(doc,controller);
const key='__LAQPDraftFullscreenHost';
export function fullscreenParent(view=window){
 try{const host=view.parent!==view&&view.frameElement?.hasAttribute('data-draft-fullscreen-frame')?view.parent[key]:null;return host?.frame.contentWindow===view?host:null;}catch{return null;}
}
export const ownsFullscreenSurface=(view=window)=>!!view[key];
export function commitFullscreenRoute(url,{replace=false}={}){fullscreenParent()?.commit(url,replace);}
export async function navigateInFullscreen(url,{onError=()=>{},onSuspend=()=>{}}={}){
 const inherited=fullscreenParent();
 if(inherited){await inherited.go(url);return true;}
 if(window[key]){await window[key].go(url);return true;}
 if(document.fullscreenElement!==document.documentElement)return false;
 const validate=value=>{const target=new URL(value,location.href);if(target.origin!==location.origin||!target.pathname.startsWith('/draft/'))throw Error('La vista de juego solo permite navegar dentro de LAqP Draft.');return target;};
 validate(url);
 const frame=document.createElement('iframe');frame.title='LAqP Draft';frame.name=window.name;frame.setAttribute('data-draft-fullscreen-frame','');frame.allow='fullscreen';frame.setAttribute('allowfullscreen','');
 Object.assign(frame.style,{position:'fixed',inset:'0',width:'100%',height:'100dvh',border:'0',zIndex:'2147483000',background:'#061219'});
 let current=location.href,loading=null;
 const commit=(value,replace=false)=>{const target=validate(value);if(target.href!==location.href)history[replace?'replaceState':'pushState']({...history.state,laqpFullscreenSurface:true},'',target.href);current=target.href;};
 const go=async(value,{replace=false,fromHistory=false}={})=>{
  const target=validate(value);if(loading)await loading;
  // Replacing the child location avoids creating duplicate iframe history entries.
  loading=new Promise((resolve,reject)=>{
   let timeout;const finish=()=>{clearTimeout(timeout);frame.removeAttribute('aria-busy');resolve();};
   const loaded=()=>{const child=frame.contentWindow;if(!child)return;const ready=()=>{try{document.title=child.document.title;commit(child.location.href,true);finish();}catch(error){reject(error);}};if(child.LAQPDraftRouter)Promise.resolve(child.LAQPDraftRouter.ready).then(ready,reject);else child.addEventListener('laqp-route-ready',ready,{once:true});};
   frame.onload=loaded;frame.setAttribute('aria-busy','true');timeout=setTimeout(()=>{frame.removeAttribute('aria-busy');reject(Error('La sección tarda en cargar. Tus guardados se conservan; podés volver a intentar la navegación.'));},30000);
   if(!fromHistory)commit(target.href,replace);
   if(frame.contentWindow&&frame.getAttribute('src'))frame.contentWindow.location.replace(target.href);else frame.src=target.href;
  });
  try{await loading;}finally{loading=null;}
 };
 const host={frame,go,commit,isActive:()=>document.fullscreenElement===document.documentElement,
  get supported(){return controllers.get(document)?.supported??false;},
  toggle:()=>controllers.get(document)?.toggle()};
 window[key]=host;
 onSuspend();
 // Keep the original mode mounted but inaccessible; it was checkpointed by the router.
 for(const node of document.body.children)if(node instanceof HTMLElement)node.inert=true;
 document.body.append(frame);document.body.style.overflow='hidden';
 window.addEventListener('popstate',async()=>{
  const requested=location.href;
  try{await frame.contentWindow?.LAQPDraftRouter?.prepare();await go(requested,{fromHistory:true});}
  catch(error){history.replaceState(history.state,'',current);onError(error);}
 });
 await go(url);return true;
}
