// Shared game picker (Top 5/10 slots and Tier List). Binds once to <dialog id="game-picker">.
import {loadCatalog,year} from './catalog.mjs';
import {versions,cover} from './model.mjs';

const RECENT_KEY='laqp-football-picker-recent-v1';
const SAGAS=[['PES','PES / Winning Eleven / eFootball'],['FIFA','FIFA'],['EA SPORTS FC','EA SPORTS FC'],['Football Manager','Football Manager'],['Winning Eleven','Winning Eleven'],['ISS','ISS'],['FIFA Street','FIFA Street'],['Captain Tsubasa','Captain Tsubasa'],['Inazuma Eleven','Inazuma Eleven'],['Sensible Soccer','Sensible Soccer'],['PC Fútbol','PC Fútbol'],['Championship Manager','Championship Manager'],['Dream League Soccer','Dream League Soccer']];
const PAGE=30;
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};

let ui,catalog,options,query='',limit=PAGE,timer,opener,game=null;

function recent(){try{const list=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(list)?list.filter(id=>catalog.gameById.has(id)).slice(0,8):[];}catch{return [];}}
function remember(id){try{localStorage.setItem(RECENT_KEY,JSON.stringify([id,...recent().filter(x=>x!==id)].slice(0,8)));}catch{}}
function image(g,size){const img=el('img');img.src=cover(g);img.alt='';img.width=size;img.height=Math.round(size*4/3);img.loading='lazy';img.decoding='async';img.draggable=false;img.onerror=()=>{img.onerror=null;img.style.visibility='hidden';};return img;}

function bind(){
 const dialog=document.getElementById('game-picker');
 ui={dialog,title:dialog.querySelector('#picker-title'),subtitle:dialog.querySelector('#picker-subtitle'),input:dialog.querySelector('#picker-search'),clear:dialog.querySelector('#picker-clear'),chips:dialog.querySelector('#picker-chips'),hint:dialog.querySelector('#picker-hint'),results:dialog.querySelector('#picker-results'),more:dialog.querySelector('#picker-more'),versions:dialog.querySelector('#picker-versions'),back:dialog.querySelector('#picker-back'),toast:dialog.querySelector('#picker-toast'),searchStep:dialog.querySelector('#picker-search-step')};
 dialog.querySelector('#picker-close').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>{clearTimeout(timer);options?.onClose?.();options=null;game=null;if(opener?.isConnected)opener.focus();opener=null;});
 ui.back.onclick=()=>showSearch(true);
 ui.input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{query=ui.input.value;limit=PAGE;renderResults();},60);ui.clear.hidden=!ui.input.value;});
 ui.input.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){e.preventDefault();ui.results.querySelector('button')?.focus();}
  if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);query=ui.input.value;renderResults();ui.results.querySelector('button:not([aria-disabled="true"])')?.click();}
 });
 ui.clear.onclick=()=>{ui.input.value='';query='';ui.clear.hidden=true;renderResults();ui.input.focus();};
 ui.results.addEventListener('keydown',e=>{
  const items=[...ui.results.querySelectorAll('button')],i=items.indexOf(document.activeElement);if(i<0)return;
  if(e.key==='ArrowDown'){e.preventDefault();items[i+1]?.focus();}
  if(e.key==='ArrowUp'){e.preventDefault();(items[i-1]||ui.input).focus();}
 });
 ui.more.onclick=()=>{limit+=PAGE;renderResults();};
 ui.chips.replaceChildren(...SAGAS.map(([label,q])=>{const b=el('button','lr-chip',label);b.type='button';b.onclick=()=>{ui.input.value=q;query=q;limit=PAGE;ui.clear.hidden=false;renderResults();ui.input.focus();};return b;}));
}

function availability(g){
 const list=versions(g),taken=list.filter(v=>options.taken?.(v.id)&&v.id!==options.current);
 return {list,taken,free:list.length-taken.length};
}
function resultButton(g){
 const {list,free}=availability(g),b=el('button','lr-result');b.type='button';b.dataset.game=g.id;b.setAttribute('role','option');
 const info=el('span','lr-result-info');info.append(el('strong',null,g.title),el('small',null,[year(g),g.series!=='Independientes'?g.series:'',list.length>1?list.length+' versiones':list[0].platform].filter(Boolean).join(' · ')));
 b.append(image(g,48),info);
 if(!free){b.setAttribute('aria-disabled','true');b.append(el('span','lr-badge',options.takenLabel||'Ya elegido'));}
 else b.append(el('span','lr-result-go',list.length>1?'Elegir versión ›':'Elegir ›'));
 b.onclick=()=>{if(!free){toast('Todas las versiones de '+g.title+' ya están '+(options.takenWhere||'en tu Top')+'.');return;}choose(g);};
 return b;
}
function section(title,games){const head=el('li','lr-results-head',title);head.setAttribute('role','presentation');return [head,...games.map(g=>{const li=el('li');li.setAttribute('role','presentation');li.append(resultButton(g));return li;})];}
function renderResults(){
 const q=query.trim();ui.more.hidden=true;ui.results.dataset.query=query;
 if(!q){
  const rec=recent().map(id=>catalog.gameById.get(id));ui.chips.hidden=false;
  ui.hint.textContent=rec.length?'':'Escribí el nombre como lo recuerdes: «PES 2013», «FIFA 14», «FM 2024»… o elegí una saga.';
  ui.results.replaceChildren(...(rec.length?section('Elegidos recientemente',rec):[]));
  return;
 }
 ui.chips.hidden=true;
 let found=catalog.index.search(q,{limit:limit+1});
 const approximate=!found.length||found[0].score<.7;
 if(!found.length)found=catalog.index.search(q,{limit:12,min:.18});
 ui.more.hidden=found.length<=limit;found=found.slice(0,limit);
 ui.hint.textContent=!found.length?'No encontramos juegos parecidos a «'+q+'». Probá con otro nombre, la saga o el año.':approximate?'No hay una coincidencia exacta. ¿Es alguno de estos?':'';
 ui.results.replaceChildren(...found.map(r=>{const li=el('li');li.setAttribute('role','presentation');li.append(resultButton(r.game));return li;}));
 ui.results.scrollTop=0;
}
function choose(g){
 const list=versions(g),free=list.filter(v=>!(options.taken?.(v.id)&&v.id!==options.current));
 if(list.length===1&&free.length===1){pick(free[0]);return;}
 showVersions(g);
}
function showVersions(g){
 game=g;ui.searchStep.hidden=true;ui.versions.hidden=false;ui.back.hidden=false;
 const head=el('div','lr-version-head'),info=el('div');
 info.append(el('h3',null,g.title),el('p',null,[year(g),g.series!=='Independientes'?g.series:''].filter(Boolean).join(' · ')),el('p','lr-version-ask','¿En qué plataforma lo jugaste?'));
 head.append(image(g,96),info);
 const grid=el('div','lr-version-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Versiones de '+g.title);
 for(const v of versions(g)){
  const b=el('button','lr-version');b.type='button';b.dataset.version=v.id;const where=v.id!==options.current&&options.taken?.(v.id);
  b.append(el('span',null,v.platform));
  if(v.id===options.current)b.append(el('small',null,'Actual'));
  else if(where){b.disabled=true;b.append(el('small',null,where));}
  b.onclick=()=>pick(v);grid.append(b);
 }
 ui.versions.replaceChildren(head,grid);
 ui.title.textContent='Elegí la versión';
 (grid.querySelector('button:not(:disabled)')||ui.back).focus();
}
function showSearch(focus){
 game=null;ui.versions.hidden=true;ui.searchStep.hidden=false;ui.back.hidden=true;ui.title.textContent=options.title;renderResults();
 if(focus)ui.input.focus();
}
function pick(v){
 remember(v.gameId);
 const result=options.onPick(v)||{};
 if(options.keepOpen&&!result.close){showSearch(false);toast(result.message||('Agregado: '+v.game.title+' · '+v.platform));ui.input.focus();ui.input.select();}
 else ui.dialog.close();
}
function toast(text){ui.toast.textContent=text;ui.toast.classList.remove('lr-show');void ui.toast.offsetWidth;ui.toast.classList.add('lr-show');}

// options: {title, subtitle, onPick(version)→{close?,message?}, taken(versionId)→label|null, current, keepOpen, takenWhere, startGame, onClose}
export async function openPicker(next){
 catalog=await loadCatalog();if(!ui)bind();
 if(ui.dialog.open)ui.dialog.close();
 opener=document.activeElement;options=next;query='';limit=PAGE;
 ui.input.value='';ui.clear.hidden=true;ui.title.textContent=next.title;ui.subtitle.textContent=next.subtitle||'';ui.toast.textContent='';ui.toast.classList.remove('lr-show');
 ui.dialog.showModal();
 if(next.startGame)showVersions(next.startGame);else{showSearch(false);ui.input.focus();}
}
