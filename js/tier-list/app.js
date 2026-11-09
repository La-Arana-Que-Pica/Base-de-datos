import {KEY,colors,initial,validate,move,remove,placed} from './model.mjs';
import {loadCatalog,year} from '../football-rankings/catalog.mjs';
import {openPicker} from '../football-rankings/picker.mjs';
import {versions} from '../football-rankings/model.mjs';
const $=s=>document.querySelector(s),el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const SWATCHES=['#ff7f7f','#ffbf7f','#ffdf7f','#ffff7f','#bfff7f','#7fff7f','#7fffff','#7fbfff','#7f7fff','#ff7fff','#bf7fbf','#cfcfcf'];
let state=initial(),catalog=null,selected=null,blocked=false,editing=null;
const status=text=>$('#tl-status').textContent=text;
// Entries are platform versions ("LAQP-GAME-0201:PS3"); copies made before versions existed keep plain game IDs.
function entry(id){const v=catalog.versionById.get(id);if(v)return {id,game:v.game,platform:v.platform};const g=catalog.gameById.get(id);return g?{id,game:g,platform:''}:null;}
const label=e=>e.game.title+(e.platform?' · '+e.platform:'');
function where(id){if(state.pool.includes(id))return 'Por clasificar';const t=state.tiers.find(t=>t.games.includes(id));return t?'En '+t.label:null;}
const EMPTY='Tu Tier List está vacía. Tocá ＋ en una fila o «Agregar juegos» para empezar.';
function save(){if(blocked)return;try{localStorage.setItem(KEY,JSON.stringify(state));const n=placed(state).length;status(n?'Guardado en este navegador · '+n+' juego'+(n===1?'':'s')+' en tu lista.':EMPTY);}catch{status('No se pudo guardar: almacenamiento lleno o deshabilitado. Descargá una copia JSON para conservar los cambios.');}}
function cover(e){if(state.covers[e.id])return state.covers[e.id];const game=e.game;if(game.cover?.src&&game.cover.license&&game.cover.credit&&game.cover.src.startsWith('/')&&!game.cover.src.startsWith('//'))return game.cover.src;const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="240"><rect width="180" height="240" fill="#17252d"/><path d="M0 170L180 90V240H0Z" fill="#21d4c2" opacity=".16"/><circle cx="150" cy="210" r="65" fill="none" stroke="#21d4c2" opacity=".35"/><text x="16" y="28" font-family="sans-serif" font-size="12" fill="#21d4c2">LAqP / FÚTBOL</text>${(game.title.match(/.{1,18}(?:\s|$)|.{1,18}/g)||[]).slice(0,6).map((s,i)=>`<text x="14" y="${74+i*21}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#f2f6f7">${esc(s)}</text>`).join('')}<text x="14" y="222" font-family="sans-serif" font-size="13" fill="#9dabb4">${year(game)}</text></svg>`;return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
const clearDrop=()=>document.querySelectorAll('.tl-drop').forEach(x=>x.classList.remove('tl-drop'));
// Card = cover only (title as tooltip). Mouse: native drag of the whole card. Touch/pen: drag from the ⠿ corner.
function card(e){
 const c=el('div','tl-card');c.dataset.game=e.id;c.tabIndex=0;c.setAttribute('role','button');c.setAttribute('aria-label',label(e)+' · Mover o ver detalles');c.title=label(e);c.draggable=true;
 const img=el('img');img.loading='lazy';img.decoding='async';img.width=60;img.height=80;img.src=cover(e);img.alt='';img.draggable=false;img.onerror=()=>{img.onerror=null;img.style.visibility='hidden';};
 c.append(img);if(e.platform)c.append(el('span','tl-badge',e.platform));
 c.onclick=()=>openGame(e.id);c.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();openGame(e.id);}};
 c.ondragstart=ev=>{ev.dataTransfer.setData('text/plain',e.id);ev.dataTransfer.effectAllowed='move';c.classList.add('tl-dragging');};c.ondragend=()=>{c.classList.remove('tl-dragging');clearDrop();};
 const grip=el('button','tl-grip','⠿');grip.type='button';grip.tabIndex=-1;grip.setAttribute('aria-hidden','true');
 let pointer;
 grip.onclick=ev=>ev.stopPropagation();
 grip.onpointerdown=ev=>{if(ev.pointerType==='mouse')return;ev.preventDefault();ev.stopPropagation();pointer={x:ev.clientX,y:ev.clientY,moved:false};grip.setPointerCapture(ev.pointerId);};
 grip.onpointermove=ev=>{if(!pointer)return;if(Math.hypot(ev.clientX-pointer.x,ev.clientY-pointer.y)>8)pointer.moved=true;c.classList.toggle('tl-dragging',pointer.moved);clearDrop();if(pointer.moved){if(ev.clientY<70)scrollBy(0,-14);else if(ev.clientY>innerHeight-90)scrollBy(0,14);document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-tier]')?.classList.add('tl-drop');}};
 grip.onpointerup=ev=>{if(!pointer)return;const at=document.elementFromPoint(ev.clientX,ev.clientY),zone=at?.closest('[data-tier]'),moved=pointer.moved;pointer=null;c.classList.remove('tl-dragging');clearDrop();if(moved&&zone){move(state,e.id,zone.dataset.tier,at?.closest('[data-game]')?.dataset.game);save();render();}else if(!moved)openGame(e.id);};
 grip.onpointercancel=()=>{pointer=null;c.classList.remove('tl-dragging');clearDrop();};
 c.append(grip);return c;
}
function dropZone(zone){zone.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';zone.classList.add('tl-drop');};zone.ondragleave=e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('tl-drop');};zone.ondrop=e=>{e.preventDefault();zone.classList.remove('tl-drop');const id=e.dataTransfer.getData('text/plain');if(!placed(state).includes(id))return;move(state,id,zone.dataset.tier,e.target.closest('[data-game]')?.dataset.game);save();render();};}
function button(text,fn,aria,cls){const b=el('button',cls,text);b.type='button';if(aria)b.setAttribute('aria-label',aria);b.onclick=fn;return b;}
function addGames(target){
 const name=target==='pool'?'Por clasificar':state.tiers.find(t=>t.id===target)?.label;
 openPicker({title:target==='pool'?'Agregar juegos':'Agregar a «'+name+'»',subtitle:'Elegí todos los que quieras y cerrá cuando termines.',keepOpen:true,takenWhere:'en tu Tier List',takenLabel:'Ya en tu lista',
  taken:id=>where(id),
  onPick:v=>{move(state,v.id,target);save();render();return {message:'✓ '+v.game.title+' · '+v.platform+' → '+name};}});
}
function render(){
 const board=$('#board');board.replaceChildren();
 state.tiers.forEach((tier,index)=>{
  const row=el('div','tl-row'),head=el('div','tl-tier-head');head.style.background=tier.color;
  const name=el('textarea');name.rows=1;name.value=tier.label;name.maxLength=40;name.setAttribute('aria-label','Nombre de categoría '+(index+1));
  name.onchange=()=>{tier.label=name.value.trim()||tier.label;name.value=tier.label;save();};name.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();name.blur();}};
  head.append(name);
  const games=el('div','tl-cards');games.dataset.tier=tier.id;games.setAttribute('aria-label','Juegos en '+tier.label);
  for(const id of tier.games){const e=entry(id);games.append(e?card(e):el('span','tl-missing','Título no disponible: '+id));}
  games.append(button('＋',()=>addGames(tier.id),'Agregar juegos a '+tier.label,'tl-add'));
  dropZone(games);
  const tools=button('⚙',()=>editTier(tier.id),'Opciones de la categoría '+tier.label,'tl-settings');
  row.append(head,games,tools);board.append(row);
 });
 const pool=$('#pool');pool.replaceChildren(...state.pool.map(id=>{const e=entry(id);return e?card(e):el('span','tl-missing','Título no disponible: '+id);}));
 pool.append(button('＋',()=>addGames('pool'),'Agregar juegos para clasificar después','tl-add'));
 dropZone(pool);
 if(document.activeElement!==$('#list-title'))$('#list-title').value=state.title;
}
/* ---------- Category settings ---------- */
function editTier(id){
 editing=id;const tier=state.tiers.find(t=>t.id===id);if(!tier)return;const index=state.tiers.indexOf(tier);
 $('#tier-name').value=tier.label;$('#tier-color').value=tier.color;
 for(const b of document.querySelectorAll('#tier-swatches button'))b.setAttribute('aria-pressed',String(b.dataset.color===tier.color.toLowerCase()));
 $('#tier-up').disabled=index===0;$('#tier-down').disabled=index===state.tiers.length-1;$('#tier-clear').disabled=!tier.games.length;
 $('#tier-dialog').showModal();
}
const editingTier=()=>state.tiers.find(t=>t.id===editing);
function newTier(){return {id:'tier-'+crypto.randomUUID(),label:'Nueva',color:colors[state.tiers.length%colors.length],games:[]};}
function setColor(color){const t=editingTier();if(!t)return;t.color=color;$('#tier-color').value=color;for(const b of document.querySelectorAll('#tier-swatches button'))b.setAttribute('aria-pressed',String(b.dataset.color===color));save();render();}
$('#tier-swatches').replaceChildren(...SWATCHES.map(color=>{const b=button('',()=>setColor(color),'Color '+color,'lr-swatch');b.dataset.color=color;b.style.background=color;return b;}));
$('#tier-color').oninput=e=>setColor(e.target.value);
$('#tier-name').oninput=e=>{const t=editingTier();if(!t||!e.target.value.trim())return;t.label=e.target.value.trim();save();render();};
for(const [name,delta] of [['up',-1],['down',1]])$('#tier-'+name).onclick=()=>{const i=state.tiers.findIndex(t=>t.id===editing),j=i+delta;if(i<0||j<0||j>=state.tiers.length)return;[state.tiers[i],state.tiers[j]]=[state.tiers[j],state.tiers[i]];save();render();editTier(editing);};
$('#tier-clear').onclick=()=>{const t=editingTier();if(!t)return;state.pool.push(...t.games);t.games=[];save();render();editTier(editing);status('Los juegos de «'+t.label+'» pasaron a «Por clasificar».');};
$('#tier-delete').onclick=()=>{const t=editingTier();if(!t)return;if(state.tiers.length===1)return status('Conservá al menos un nivel.');if(t.games.length&&!confirm('¿Borrar «'+t.label+'»? Sus juegos pasan a «Por clasificar».'))return;state.pool.push(...t.games);state.tiers=state.tiers.filter(x=>x!==t);$('#tier-dialog').close();save();render();};
for(const [name,offset] of [['above',0],['below',1]])$('#tier-add-'+name).onclick=()=>{if(state.tiers.length>=20)return status('Máximo: 20 niveles.');const i=state.tiers.findIndex(t=>t.id===editing);if(i<0)return;const t=newTier();state.tiers.splice(i+offset,0,t);$('#tier-dialog').close();save();render();editTier(t.id);$('#tier-name').select();};
/* ---------- Game dialog ---------- */
function openGame(id){
 selected=id;const e=entry(id);if(!e)return;const g=e.game;
 $('#game-title').textContent=g.title;$('#game-cover').src=cover(e);
 $('#game-info').textContent=[e.platform||'Sin versión elegida',g.series!=='Independientes'?g.series:'',g.releases.map(r=>r.date).join(', ')].filter(Boolean).join(' · ');
 $('#game-cover-credit').textContent=g.cover?.src&&g.cover.credit?'Portada: '+g.cover.credit+'. '+(g.cover.license||''):'';
 $('#destination').replaceChildren(...[...state.tiers,{id:'pool',label:'Por clasificar'}].map(t=>{const o=el('option',null,t.label);o.value=t.id;return o;}));
 $('#destination').value=state.tiers.find(t=>t.games.includes(id))?.id||'pool';
 $('#change-version').hidden=versions(g).length<2&&!!e.platform;
 $('#game-sources').replaceChildren(...g.sources.filter(url=>/^https:\/\//.test(url)).map((url,i)=>{const a=el('a',null,'Fuente '+(i+1)+' ↗ ');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}));
 $('#game-dialog').showModal();
}
function listOf(id){return state.tiers.find(t=>t.games.includes(id))?.games||(state.pool.includes(id)?state.pool:null);}
$('#move-game').onclick=()=>{move(state,selected,$('#destination').value);save();render();$('#game-dialog').close();};
for(const [name,delta] of [['left',-1],['right',1]])$('#move-'+name).onclick=()=>{const list=listOf(selected);if(!list)return;const i=list.indexOf(selected),j=i+delta;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];save();render();};
$('#remove-game').onclick=()=>{const e=entry(selected);remove(state,selected);delete state.covers[selected];save();render();$('#game-dialog').close();status((e?label(e):'El juego')+' salió de tu lista.');};
$('#change-version').onclick=()=>{const e=entry(selected),old=selected;if(!e)return;$('#game-dialog').close();openPicker({title:'Cambiar versión',startGame:e.game,current:e.platform?old:undefined,takenWhere:'en tu Tier List',taken:id=>id!==old&&where(id),onPick:v=>{const list=listOf(old);if(!list||list.includes(v.id))return {close:true};list[list.indexOf(old)]=v.id;if(state.covers[old]){state.covers[v.id]=state.covers[old];delete state.covers[old];}save();render();status(v.game.title+' ahora figura como '+v.platform+'.');return {close:true};}});};
/* ---------- Toolbar ---------- */
const closeMenu=()=>document.querySelector('.lr-menu')?.removeAttribute('open');
$('#list-title').oninput=e=>{state.title=e.target.value;save();};
$('#tl-add-games').onclick=()=>addGames('pool');
$('#add-tier').onclick=()=>{if(state.tiers.length>=20)return status('Máximo: 20 niveles.');const t=newTier();state.tiers.push(t);save();render();editTier(t.id);$('#tier-name').select();};
function download(blob,name){const u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
$('#backup').onclick=()=>{closeMenu();download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'laqp-tier-list.json');};
$('#restore').onchange=async e=>{closeMenu();try{const file=e.target.files[0];if(!file)return;if(file.size>8*1024**2)throw Error('Copia demasiado grande (máximo 8 MB).');const value=validate(JSON.parse(await file.text()));if(confirm('¿Reemplazar tu clasificación con esta copia?')){state=value;blocked=false;save();render();}}catch(error){status(error.message);}finally{e.target.value='';}};
$('#reset').onclick=()=>{closeMenu();if(confirm('¿Reiniciar la clasificación? Se vacían todas las categorías.')){state=initial();blocked=false;save();render();}};
$('#custom-cover').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>10*1024**2)throw Error('Elegí PNG, JPEG o WebP de hasta 10 MB.');const bitmap=await createImageBitmap(f),c=document.createElement('canvas');c.width=180;c.height=240;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0,180,240);bitmap.close();state.covers[selected]=c.toDataURL('image/jpeg',.85);save();render();$('#game-cover').src=state.covers[selected];}catch(error){status('No se pudo cargar la carátula: '+error.message);}finally{e.target.value='';}};
$('#remove-cover').onclick=()=>{delete state.covers[selected];save();render();const e=entry(selected);if(e)$('#game-cover').src=cover(e);};
/* ---------- PNG (classic tier list look) ---------- */
function fit(ctx,text,width){let t=text;while(ctx.measureText(t).width>width&&t.length>2)t=t.slice(0,-1);return t===text?t:t.trimEnd()+'…';}
function wrapCenter(ctx,text,cx,cy,width,lh,max=3){const words=text.split(' '),lines=[];let line='';for(const w of words){if(ctx.measureText(line+' '+w).width>width&&line){lines.push(line);line=w;}else line+=(line?' ':'')+w;}lines.push(line);const shown=lines.slice(0,max).map(l=>fit(ctx,l,width));shown.forEach((l,i)=>ctx.fillText(l,cx,cy+(i-(shown.length-1)/2)*lh));}
$('#export-png').onclick=async()=>{const b=$('#export-png');b.disabled=true;try{
 const W=1200,labelW=130,cw=72,ch=96,gap=4,pad=4,cols=Math.floor((W-labelW-pad*2)/(cw+gap)),rowH=t=>Math.max(1,Math.ceil(t.games.length/cols))*(ch+gap)+pad*2-gap,top=70,H=top+state.tiers.reduce((n,t)=>n+rowH(t)+2,0)+34;
 if(H>16000)throw Error('La clasificación es demasiado alta para PNG. Dividila en menos juegos.');
 const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#fff';ctx.font='bold 30px Bahnschrift, "Segoe UI", sans-serif';ctx.fillText(fit(ctx,state.title||'Mi Tier List de fútbol',W-40),20,46);
 const imgs=new Map();await Promise.all(placed(state).map(async id=>{const e=entry(id);if(!e)return;const img=new Image();img.src=cover(e);try{await img.decode();imgs.set(id,img);}catch{}}));
 let y=top;for(const t of state.tiers){const h=rowH(t);ctx.fillStyle=t.color;ctx.fillRect(0,y,labelW,h);ctx.fillStyle='#1a1a17';ctx.fillRect(labelW,y,W-labelW,h);ctx.fillStyle='#111';ctx.font='600 22px Bahnschrift, "Segoe UI", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';wrapCenter(ctx,t.label,labelW/2,y+h/2,labelW-16,24);ctx.textAlign='left';ctx.textBaseline='alphabetic';
  t.games.forEach((id,j)=>{const x=labelW+pad+(j%cols)*(cw+gap),gy=y+pad+Math.floor(j/cols)*(ch+gap),img=imgs.get(id);if(img)ctx.drawImage(img,x,gy,cw,ch);else{ctx.fillStyle='#333';ctx.fillRect(x,gy,cw,ch);}});
  y+=h+2;}
 ctx.fillStyle='#8a8a8a';ctx.font='14px Bahnschrift, "Segoe UI", sans-serif';ctx.fillText('Hecha en laqp.website · LAqP Rankings',20,H-12);
 const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('El navegador no pudo crear la imagen.');download(blob,'laqp-tier-list.png');status('Imagen descargada.');
}catch(e){status('No se pudo exportar: '+e.message);}finally{b.disabled=false;}};
try{
 catalog=await loadCatalog();
 try{const raw=localStorage.getItem(KEY);if(raw)state=validate(JSON.parse(raw));}catch{blocked=true;status('No se pudo recuperar el guardado. Se conserva sin sobrescribir: abrí una copia o reiniciá para habilitar el guardado.');}
 render();
 if(!blocked){const n=placed(state).length;status(n?'Todo listo · '+n+' juego'+(n===1?'':'s')+' en tu lista · guardado automático.':EMPTY);}
}catch(e){status(e.message);$('#export-png').disabled=true;$('#tl-add-games').disabled=true;}
