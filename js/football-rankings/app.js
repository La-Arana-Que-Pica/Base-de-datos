import {TOP_KEY,RECEIPT_KEY,POINTS,versions,initial,validateTop,reorder,voterId,cover,slots,compact} from './model.mjs';
import config from './config.js';
import {createApi} from './api.mjs';
import {loadCatalog,year} from './catalog.mjs';
import {openPicker} from './picker.mjs';

const $=s=>document.querySelector(s),node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(text,fn,label,cls)=>{const b=node('button',cls,text);b.type='button';if(label)b.setAttribute('aria-label',label);b.onclick=fn;return b;};
const HISTORY_KEY='laqp-football-top-history-v1',RESERVE_KEY='laqp-football-top-reserve-v1',PAGE=50;
let catalog,known=new Map(),top=initial(),reserve=[],history=[],api=null,identity='',receipt=false,busy=false,blocked=false,rows=[],scoring=POINTS,communityLimit=PAGE,toastTimer;

function notify(text){const t=$('#fr-status');t.textContent=text;t.classList.add('lr-show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('lr-show'),5000);}
function store(){
 if(blocked)return;
 top.choices=compact(top.choices);
 try{localStorage.setItem(TOP_KEY,JSON.stringify(top));localStorage.setItem(RESERVE_KEY,JSON.stringify(reserve));}
 catch{notify('No se pudo guardar en este navegador. Descargá una copia JSON para conservar tu Top.');}
}
function download(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function image(game,size=60){const img=node('img');img.src=cover(game);img.alt='';img.width=size;img.height=Math.round(size*4/3);img.loading='lazy';img.decoding='async';img.draggable=false;img.onerror=()=>{img.onerror=null;img.style.visibility='hidden';};return img;}
function options(select,values,empty){select.replaceChildren();if(empty){const o=node('option',null,empty);o.value='';select.append(o);}for(const v of values){const o=node('option',null,v);o.value=v;select.append(o);}}
const filledCount=()=>slots(top).filter(Boolean).length;
const points=i=>(scoring[top.mode]||POINTS[top.mode])[i];

/* ---------- Views ---------- */
function selectView(){
 const name=['#community','#tier-list'].includes(location.hash)?location.hash:'#top';
 for(const panel of document.querySelectorAll('[data-ranking-panel]'))panel.hidden='#'+panel.id!==name;
 for(const a of document.querySelectorAll('.fr-tabs a')){if(a.hash===name)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 document.body.dataset.rankingView=name.slice(1);
 $('#fr-status').classList.remove('lr-show');
 if(name==='#community')loadResults();
}
window.addEventListener('hashchange',selectView);

/* ---------- Top 5 / Top 10 ---------- */
function chooseFor(index,startGame){
 const current=slots(top)[index];
 openPicker({
  title:(current?'Cambiar el puesto ':'Puesto ')+(index+1),
  subtitle:'Top '+top.mode+' · '+points(index)+' puntos',
  current,startGame,takenWhere:'en tu Top',takenLabel:'Ya en tu Top',
  taken:id=>{const at=slots(top).indexOf(id);return at>=0&&at!==index?'Puesto '+(at+1):null;},
  onPick:v=>{
   const s=slots(top),dup=s.indexOf(v.id);if(dup>=0&&dup!==index)return {close:true};
   s[index]=v.id;top.choices=s;store();render();
   const next=slots(top).indexOf(null);
   notify(next<0?'¡Top '+top.mode+' completo! '+(api&&!receipt?'Ya podés votar o descargar la imagen.':'Ya podés guardarlo o descargar la imagen.'):v.game.title+' quedó en el puesto '+(index+1)+'.');
   pendingFocus=next<0?'#vote-top':'[data-index="'+next+'"] .lr-slot-add';
   return {close:true};
  },
  onClose:()=>{const target=pendingFocus&&$(pendingFocus);pendingFocus=null;if(target&&!target.disabled)setTimeout(()=>target.focus({preventScroll:false}));}
 });
}
let pendingFocus=null;
function move(from,to,focus=true){
 const s=slots(top);if(to<0||to>=s.length||from===to)return;reorder(s,from,to);top.choices=s;store();render();
 if(focus)$('#top-order').children[to]?.querySelector('.lr-handle,.lr-slot-add')?.focus();
}
function remove(index){const s=slots(top),v=known.get(s[index]);s[index]=null;top.choices=s;store();render();notify((v?v.game.title:'El juego')+' salió del puesto '+(index+1)+'.');$('#top-order').children[index]?.querySelector('.lr-slot-add')?.focus();}

function filledSlot(id,index){
 const v=known.get(id),row=node('li','lr-slot fr-position');row.dataset.version=id;row.dataset.index=index;row.dataset.rank=index+1;
 const handle=button('',null,'Puesto '+(index+1)+': '+v.game.title+'. Arrastrá o usá las flechas para reordenar','lr-handle');
 handle.append(node('b','fr-position-number',index+1),node('span','lr-grip','⠿'));
 handle.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();move(index,index+(e.key==='ArrowUp'?-1:1));}};
 dragHandle(handle,row,index);
 const art=button('',()=>chooseFor(index),'Cambiar '+v.game.title,'lr-slot-cover');art.append(image(v.game,66));
 const info=node('div','lr-slot-info');
 const platform=button(v.platform+(versions(v.game).length>1?' ▾':''),()=>chooseFor(index,v.game),'Cambiar versión de '+v.game.title+' (ahora '+v.platform+')','lr-platform');
 info.append(node('strong',null,v.game.title),node('span','lr-slot-meta'),node('small','lr-points',points(index)+' pts'));
 info.children[1].append(platform,node('span',null,year(v.game)));
 const actions=node('div','lr-slot-actions');
 for(const [text,delta,verb] of [['↑',-1,'Subir'],['↓',1,'Bajar']]){const b=button(text,()=>move(index,index+delta),verb+' '+v.game.title,'lr-icon');b.disabled=index+delta<0||index+delta>=top.mode;actions.append(b);}
 actions.append(button('✕',()=>remove(index),'Quitar '+v.game.title,'lr-icon lr-remove'));
 row.append(handle,art,info,actions);return row;
}
function emptySlot(index){
 const row=node('li','lr-slot lr-empty-slot');row.dataset.index=index;row.dataset.rank=index+1;
 const add=button('',()=>chooseFor(index),'Elegir videojuego para el puesto '+(index+1),'lr-slot-add');
 const text=node('span','lr-slot-add-text');text.append(node('strong',null,'Elegir videojuego'),node('small',null,points(index)+' pts'));
 add.append(node('b','lr-rank',index+1),node('span','lr-ghost-cover','+'),text);
 row.append(add);return row;
}
function dragHandle(handle,row,index){
 let drag=null;
 const target=e=>document.elementFromPoint(e.clientX,e.clientY)?.closest('#top-order .lr-slot');
 const clear=()=>document.querySelectorAll('.lr-drop-target').forEach(x=>x.classList.remove('lr-drop-target'));
 handle.onpointerdown=e=>{if(e.button>0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};handle.setPointerCapture(e.pointerId);};
 handle.onpointermove=e=>{
  if(!drag)return;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6){drag.moved=true;row.classList.add('fr-dragging');}
  if(!drag.moved)return;
  if(e.clientY<70)scrollBy(0,-14);else if(e.clientY>innerHeight-90)scrollBy(0,14);
  clear();const t=target(e);if(t&&t!==row)t.classList.add('lr-drop-target');
 };
 handle.onpointerup=e=>{if(!drag)return;const moved=drag.moved,t=moved&&target(e);drag=null;row.classList.remove('fr-dragging');clear();if(t)move(index,Number(t.dataset.index));};
 handle.onpointercancel=()=>{drag=null;row.classList.remove('fr-dragging');clear();};
 handle.onclick=e=>e.preventDefault();
}
function renderTop(){
 const s=slots(top),filled=s.filter(Boolean).length;
 for(const b of document.querySelectorAll('.lr-mode button'))b.setAttribute('aria-checked',String(Number(b.dataset.mode)===top.mode));
 if(document.activeElement!==$('#top-title'))$('#top-title').value=top.title;
 $('#top-progress span').textContent=filled+' de '+top.mode+(filled===top.mode?' · ¡completo!':'');
 $('#top-progress b').style.width=(filled/top.mode*100)+'%';
 $('#top-order').classList.toggle('lr-ten',top.mode===10);
 $('#top-order').replaceChildren(...s.map((id,i)=>id?filledSlot(id,i):emptySlot(i)));
 renderVote(filled);renderBar(filled);
 $('#save-top').disabled=!filled;$('#top-png').disabled=!filled;
}
function render(){renderTop();}
function renderVote(filled){
 const complete=filled===top.mode,rule=$('#vote-rule');
 let text;
 if(!api)text='La votación global todavía no está habilitada. Mientras tanto, armá, guardá y descargá tu Top.';
 else if(receipt)text='¡Tu voto ya está en el ranking! Los Tops que armes ahora quedan como personales.';
 else if(!identity)text='Este navegador no permite guardar el identificador anónimo, así que no puede votar. Igual podés armar y descargar tu Top.';
 else if(busy)text='Enviando tu voto…';
 else if(!complete)text='Completá los '+top.mode+' puestos para votar. Te '+(top.mode-filled===1?'falta 1':'faltan '+(top.mode-filled))+'.';
 else if(!rule.checked)text='Tu Top está completo. Confirmá la regla y votá.';
 else text='Todo listo: tu Top '+top.mode+' va a sumar puntos al ranking.';
 $('#vote-state').textContent=text;
 $('#vote-card').classList.toggle('lr-voted',receipt);$('#vote-card').classList.toggle('lr-ready',!!api&&!!identity&&!receipt&&complete);
 rule.closest('label').hidden=!api||receipt||!identity;
 const vote=$('#vote-top');vote.hidden=!api;
 vote.disabled=busy||!api||!identity||receipt||!complete;
 vote.textContent=receipt?'Tu primer voto ya fue contado ✓':busy?'Enviando…':'Aportar mi primer Top al ranking';
}
function renderBar(filled){
 const next=slots(top).indexOf(null),action=$('#top-bar-action');
 $('#top-bar-progress').textContent=filled+' de '+top.mode;
 if(next>=0){action.textContent='＋ Puesto '+(next+1);action.onclick=()=>chooseFor(next);}
 else if(api&&identity&&!receipt){action.textContent='Votar ↓';action.onclick=()=>{$('#vote-card').scrollIntoView({behavior:'smooth',block:'center'});$('#vote-rule').focus({preventScroll:true});};}
 else{action.textContent='⤓ Descargar imagen';action.onclick=()=>$('#top-png').click();}
}
function setMode(mode){
 if(mode===top.mode)return;
 const s=slots(top);
 if(mode===5){reserve=s.slice(5);top.choices=s.slice(0,5);top.mode=5;const n=reserve.filter(Boolean).length;if(n)notify('Guardamos '+(n===1?'el juego':'los '+n+' juegos')+' de los puestos 6 a 10 por si volvés a Top 10.');}
 else{const next=[...s,null,null,null,null,null];reserve.forEach((id,i)=>{if(id&&!s.includes(id))next[5+i]=id;});top.choices=next;top.mode=10;reserve=[];}
 store();render();
}

/* ---------- Saved copies ---------- */
function renderHistory(){options($('#saved-tops'),history.map((h,i)=>(i+1)+'. '+h.title+' · Top '+h.mode+' · '+h.choices.filter(Boolean).length+'/'+h.mode),history.length?'Elegí un Top guardado':'Todavía no guardaste Tops');$('#saved-tops').disabled=!history.length;}
function markReceipt(){receipt=true;try{localStorage.setItem(RECEIPT_KEY,'counted');}catch{}render();}

/* ---------- Community ranking ---------- */
function skeleton(){$('#community-podium').replaceChildren();$('#community-list').replaceChildren(...Array.from({length:6},()=>{const li=node('li','lr-skeleton');li.setAttribute('aria-hidden','true');return li;}));$('#community-more').hidden=true;}
async function loadResults(){
 if(!api){$('#community-status').textContent='El ranking global todavía no está habilitado. Acá no se muestran votos simulados.';$('#community-podium').replaceChildren();$('#community-list').replaceChildren(emptyState('Cuando se habilite la votación, acá vas a ver los juegos más votados.'));$('#community-more').hidden=true;return;}
 $('#community-status').textContent='Consultando el ranking…';skeleton();$('#refresh-ranking').disabled=true;
 try{
  const data=await api('results');rows=data.rows;scoring=data.scoring||POINTS;
  $('#community-status').textContent=(data.environment==='local'?'PRUEBA LOCAL AISLADA · ':'Ranking histórico mundial · ')+(data.ballots===1?'1 votación válida':data.ballots+' votaciones válidas');
  $('#points-info').textContent='Top 5: '+scoring[5].join(', ')+' puntos · Top 10: '+scoring[10].join(', ')+' puntos.';
  communityLimit=PAGE;renderResults();render();
 }catch(e){rows=[];$('#community-podium').replaceChildren();$('#community-list').replaceChildren();$('#community-more').hidden=true;$('#community-status').textContent=e.message;}
 finally{$('#refresh-ranking').disabled=false;}
}
function emptyState(text,cta){const li=node('li','fr-empty lr-empty',text);if(cta){const a=node('a','lr-cta','Crear mi Top');a.href='#top';li.append(a);}return li;}
function rowMeta(r){return r.platform+' · '+r.series;}
function renderResults(){
 const q=$('#community-search').value.trim(),platform=$('#community-platform').value,series=$('#community-series').value;
 // Ranking filter favours precision: keep games close to the best match.
 let ids=null;if(q&&catalog){const found=catalog.index.search(q,{limit:Infinity,min:.5}),best=found[0]?.score||0;ids=new Set(found.filter(r=>r.score>=best*.8).map(r=>r.game.id));}
 const filtered=rows.filter(r=>(!platform||r.platform===platform)&&(!series||r.series===series)&&(!ids||ids.has(known.get(r.id)?.gameId)));
 const podium=!q&&!platform&&!series?filtered.filter(r=>r.position<=3).slice(0,3):[];
 const rest=filtered.filter(r=>!podium.includes(r));
 $('#community-podium').replaceChildren(...podium.map(r=>{
  const li=node('li','lr-podium-item lr-p'+r.position),game=known.get(r.id)?.game;
  li.append(node('b','lr-medal',r.position));if(game)li.append(image(game,140));
  const info=node('div','lr-podium-info');info.append(node('h3',null,r.title),node('p',null,r.platform),node('strong','fr-score',r.points.toLocaleString('es')+' pts'),node('span','fr-voters',r.voters+' votante'+(r.voters===1?'':'s')));
  li.append(info);return li;
 }));
 $('#community-list').replaceChildren(...rest.slice(0,communityLimit).map(r=>{
  const row=node('li','fr-standing');row.append(node('b','fr-position-number',r.position));const game=known.get(r.id)?.game;row.append(game?image(game,48):node('span','lr-noimg'));
  const info=node('div','fr-standing-info');info.append(node('h3',null,r.title),node('p',null,rowMeta(r)));
  const score=node('div','lr-score');score.append(node('strong','fr-score',r.points.toLocaleString('es')+' pts'),node('span','fr-voters',r.voters+' votante'+(r.voters===1?'':'s')));
  row.append(info,score);return row;
 }));
 $('#community-more').hidden=rest.length<=communityLimit;
 if(!filtered.length)$('#community-list').append(rows.length?emptyState('No hay juegos votados con estos filtros.'):emptyState('Todavía no hay votos. ¡El primer Top válido inaugura el ranking!',true));
}

/* ---------- Events ---------- */
$('#vote-top').onclick=async()=>{
 if(busy||receipt||!api||!identity)return;
 try{
  const submitted=validateTop(top,known,true);
  if(!$('#vote-rule').checked){notify('Antes de votar, confirmá que entendés la regla del primer voto.');$('#vote-rule').focus();$('#vote-card').classList.remove('lr-shake');void $('#vote-card').offsetWidth;$('#vote-card').classList.add('lr-shake');return;}
  busy=true;render();
  const result=await api('vote',{voterId:identity,mode:submitted.mode,choices:submitted.choices});
  if(result.accepted||result.alreadyVoted){markReceipt();await loadResults();notify(result.accepted?'Tu primer Top ya aportó puntos. Podés seguir creando Tops personales.':'Este navegador ya votó. Este Top queda como una creación personal.');}
 }catch(e){notify(e.message);}finally{busy=false;render();}
};
$('#vote-rule').onchange=()=>render();
for(const b of document.querySelectorAll('.lr-mode button'))b.onclick=()=>setMode(Number(b.dataset.mode));
$('.lr-mode').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setMode(top.mode===5?10:5);$('.lr-mode [aria-checked="true"]').focus();}};
$('#top-title').oninput=e=>{top.title=e.target.value;store();};
$('#top-title').onkeydown=e=>{if(e.key==='Enter')e.target.blur();};
for(const id of ['community-search','community-series','community-platform'])$('#'+id).addEventListener(id==='community-search'?'input':'change',()=>{communityLimit=PAGE;renderResults();});
$('#community-more').onclick=()=>{communityLimit+=PAGE;renderResults();};
$('#refresh-ranking').onclick=loadResults;
$('#save-top').onclick=()=>{try{const copy=validateTop({...top,choices:compact(top.choices)},known);const next=[...history,copy].slice(-50);localStorage.setItem(HISTORY_KEY,JSON.stringify(next));history=next;renderHistory();notify('Guardado en «Mis Tops». Guardar copias no suma votos.');}catch(e){notify('No se pudo guardar la copia: '+e.message);}};
$('#saved-tops').onchange=e=>{if(!e.target.value)return;const index=Number(e.target.value.split('.')[0])-1;if(filledCount()&&!confirm('¿Abrir este Top guardado en lugar del actual?')){e.target.value='';return;}top=structuredClone(history[index]);reserve=[];blocked=false;store();render();notify('Abriste «'+top.title+'».');};
$('#top-png').onclick=async()=>{const b=$('#top-png');b.disabled=true;try{download(await poster(),'laqp-top-'+top.mode+'.png');notify('Imagen descargada.');}catch(e){notify(e.message);}finally{b.disabled=!filledCount();}};
window.addEventListener('storage',e=>{if(e.key===RECEIPT_KEY&&e.newValue==='counted'){receipt=true;render();}});

/* ---------- PNG poster ---------- */
async function poster(){
 const s=slots(top),W=1080,rowH=top.mode===10?118:150,head=230,H=head+s.length*rowH+70;
 const canvas=node('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#0b1a20');bg.addColorStop(1,'#07100f');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='rgba(33,212,194,.08)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(W-40,120,190,0,Math.PI*2);ctx.stroke();ctx.strokeRect(-10,H-260,260,270);
 const font=(w,size)=>w+' '+size+'px Bahnschrift, "Segoe UI", Arial, sans-serif';
 ctx.fillStyle='#21d4c2';ctx.font=font(700,24);ctx.fillText('LAqP RANKINGS · MI TOP '+top.mode,56,78);
 ctx.fillStyle='#fff';ctx.font=font(800,52);ctx.fillText(top.title.slice(0,34)||'Mi Top de fútbol',56,146);
 ctx.fillStyle='#9fb5bd';ctx.font=font(400,22);ctx.fillText('Mi selección personal de videojuegos de fútbol',56,186);
 const imgs=await Promise.all(s.map(id=>{if(!id)return null;const img=new Image();img.src=cover(known.get(id).game);return img.decode().then(()=>img,()=>null);}));
 const medal=['#f5c451','#d5dde2','#d9935a'];
 s.forEach((id,i)=>{
  const y=head+i*rowH,h=rowH-14;
  ctx.fillStyle=i<3?'rgba(255,255,255,.06)':'rgba(255,255,255,.035)';ctx.beginPath();ctx.roundRect(40,y,W-80,h,14);ctx.fill();
  ctx.fillStyle=medal[i]||'#21d4c2';ctx.font=font(800,h>110?64:50);ctx.textAlign='center';ctx.fillText(String(i+1),110,y+h/2+(h>110?22:17));ctx.textAlign='left';
  const ch=h-20,cw=ch*.75;
  if(!id){ctx.strokeStyle='#33505a';ctx.setLineDash([6,6]);ctx.strokeRect(175,y+10,cw,ch);ctx.setLineDash([]);ctx.fillStyle='#5f7a84';ctx.font=font(400,26);ctx.fillText('—',175+cw+30,y+h/2+9);return;}
  const v=known.get(id);if(imgs[i])ctx.drawImage(imgs[i],175,y+10,cw,ch);
  const x=175+cw+30;ctx.fillStyle='#fff';ctx.font=font(700,h>110?32:27);
  let title=v.game.title;while(ctx.measureText(title).width>W-x-70&&title.length>4)title=title.slice(0,-2);if(title!==v.game.title)title=title.trimEnd()+'…';
  ctx.fillText(title,x,y+h/2-4);ctx.fillStyle='#8fd9cc';ctx.font=font(400,22);ctx.fillText([v.platform,year(v.game)].filter(Boolean).join(' · '),x,y+h/2+30);
 });
 ctx.fillStyle='#6f8790';ctx.font=font(400,20);ctx.fillText('Armá el tuyo en laqp.website/tier-list.html',56,H-30);
 const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw Error('El navegador no pudo crear la imagen.');return blob;
}

/* ---------- Start ---------- */
try{
 catalog=await loadCatalog();known=catalog.versionById;
 try{
  const raw=localStorage.getItem(TOP_KEY);if(raw)top=validateTop(JSON.parse(raw),known);
  receipt=localStorage.getItem(RECEIPT_KEY)==='counted';
  const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(!Array.isArray(h))throw Error();history=h.map(t=>validateTop(t,known));
 }catch{blocked=true;notify('El guardado anterior no se pudo leer y se conserva sin sobrescribir. Podés abrir una copia o empezar otro Top.');}
 try{const r=JSON.parse(localStorage.getItem(RESERVE_KEY)||'[]');reserve=Array.isArray(r)&&r.length<=5&&r.every(id=>id===null||known.has(id))?r:[];}catch{reserve=[];}
 options($('#community-series'),[...new Set(catalog.games.map(g=>g.series))].sort((a,b)=>a.localeCompare(b,'es')),'Todas las sagas');
 options($('#community-platform'),[...new Set(catalog.games.flatMap(g=>g.platforms))].sort((a,b)=>a.localeCompare(b,'es')),'Todas las plataformas');
 api=createApi(config);
 if(api){try{identity=await (navigator.locks?navigator.locks.request('laqp-football-identity',()=>voterId(localStorage)):Promise.resolve(voterId(localStorage)));}catch{notify('El navegador no permite conservar el identificador. Podés crear Tops personales, pero no votar.');}}
 const state=$('#backend-state');state.textContent=api?(config.localTest?'PRUEBAS LOCALES · los votos no salen de esta computadora':'Votación anónima · sin cuenta'):'Ranking global pendiente de habilitar · podés crear y guardar Tops personales';state.dataset.state=api?(config.localTest?'local':'live'):'pending';
 renderHistory();render();selectView();
 if(api){if(identity){try{const status=await api('status',{voterId:identity});if(status.alreadyVoted)markReceipt();}catch(e){notify(e.message);}}if(location.hash!=='#community')await loadResults();}
}catch(e){
 $('#top-order').replaceChildren(node('li','fr-empty lr-empty',e.message));$('#vote-top').disabled=true;notify(e.message);
}
