// Shared secondary panels. Pause never moves or replaces the broadcast nodes.
const tabs=['report','stats','info'];
export function matchTabsHtml(){return '<nav class="match-tabs" role="tablist" aria-label="Información del encuentro">'+tabs.map((id,i)=>'<button type="button" role="tab" id="match-tab-'+id+'" aria-controls="match-panel-'+id+'" aria-selected="'+(i===0)+'" tabindex="'+(i===0?0:-1)+'" data-match-tab="'+id+'">'+['Relato','Estadísticas','Información'][i]+'</button>').join('')+'</nav>';}
export function selectMatchTab(root,id,{focus=false}={}){
 if(!tabs.includes(id))return false;
 for(const tab of root.querySelectorAll('[data-match-tab]')){const active=tab.dataset.matchTab===id;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();}
 for(const panel of root.querySelectorAll('[data-match-panel]')){
  const scroller=panel.querySelector?.('#match-feed-list')||panel,active=panel.dataset.matchPanel===id;
  if(!panel.hidden&&!active&&Number.isFinite(scroller.scrollTop)){
   panel.dataset.savedScrollTop=String(scroller.scrollTop);
   panel.dataset.followLatest=String(panel.dataset.matchPanel==='report'&&scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<55);
  }
  panel.hidden=!active;
  if(active&&panel.dataset.savedScrollTop!==undefined)scroller.scrollTop=panel.dataset.followLatest==='true'?scroller.scrollHeight:Number(panel.dataset.savedScrollTop);
 }
 const workspace=root.querySelector?.('.match-secondary-panels');if(workspace)workspace.dataset.activePanel=id;
 return true;
}
export function navigateMatchTab(event,root){
 const tab=event.target?.closest?.('[data-match-tab]');if(!tab)return false;
 const index=tabs.indexOf(tab.dataset.matchTab);let next;
 if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return false;
 event.preventDefault();selectMatchTab(root,tabs[next],{focus:true});return true;
}
// A scene that cannot fit its normal track gets the existing temporary presentation.
export function fitMatchEvent(doc=document){
 const panel=doc.querySelector('#match-suspense'),host=doc.querySelector('#event-scene-host');
 if(!panel?.dataset||panel.dataset.kind==='idle'||!host?.clientHeight||!host.firstElementChild?.getBoundingClientRect)return;
 const important=panel.dataset.kind==='goal'||panel.dataset.level==='3';
 panel.classList.toggle('is-expanded-event',important);
 if(!important&&host.firstElementChild.getBoundingClientRect().height>host.clientHeight+1)panel.classList.toggle('is-expanded-event',true);
}
const observed=new WeakSet();
export function fitMatchWorkspace(doc=document){
 const feed=doc.querySelector('#match-feed-list');
 if(feed?.dataset&&!feed.dataset.initialized){feed.scrollTop=feed.scrollHeight;feed.dataset.initialized='true';}
 const container=doc.querySelector('.draft-container'),header=doc.querySelector('.draft-header');if(!container||!header?.getBoundingClientRect||!container.style?.setProperty)return;
 const fit=()=>{
  container.style.setProperty('--draft-header-height',Math.ceil(header.getBoundingClientRect().height)+'px');
  const app=doc.querySelector('#app'),view=doc.defaultView;
  if(app?.getBoundingClientRect&&view){
   const viewport=view.visualViewport?.height||view.innerHeight;
   const top=app.getBoundingClientRect().top+(view.scrollY||0);
   const bottom=parseFloat(view.getComputedStyle?.(container)?.paddingBottom)||0;
   container.style.setProperty('--match-available-height',Math.max(0,Math.floor(viewport-top-bottom))+'px');
  }
  fitMatchEvent(doc);
 };fit();
 if(typeof ResizeObserver!=='undefined'&&!observed.has(header)){observed.add(header);new ResizeObserver(fit).observe(header);doc.defaultView?.addEventListener('resize',fit);doc.defaultView?.visualViewport?.addEventListener('resize',fit);}
}
