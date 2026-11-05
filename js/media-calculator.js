'use strict';
const MEDIA_CALC_BASE_STAT=80,MEDIA_CALC_MIN_STAT=40,MEDIA_CALC_MAX_STAT=99,MEDIA_CALC_STORAGE_KEY='laqp.mediaCalculator.v2';
const MEDIA_CALC_POSITIONS=['GK','CB','LB','RB','DMF','CMF','LMF','RMF','AMF','LWF','RWF','SS','CF'];
const MEDIA_CALC_POSITION_LABELS={GK:'PT',CB:'DFC',LB:'LI',RB:'LD',DMF:'MCD',CMF:'MC',LMF:'MI',RMF:'MD',AMF:'MO',LWF:'EI',RWF:'ED',SS:'SD',CF:'DC'};
const MEDIA_CALC_POSITION_NAMES={GK:'goalkeeper',CB:'centerBack',LB:'leftBack',RB:'rightBack',DMF:'defensiveMidfielder',CMF:'centralMidfielder',LMF:'leftMidfielder',RMF:'rightMidfielder',AMF:'attackingMidfielder',LWF:'leftWinger',RWF:'rightWinger',SS:'secondStriker',CF:'centerForward'};
const MEDIA_CALC_POSITION_GRID_LAYOUT={LWF:[1,1],CF:[2,1],RWF:[3,1],SS:[2,2],AMF:[2,3],LMF:[1,4],CMF:[2,4],RMF:[3,4],DMF:[2,5],LB:[1,6],CB:[2,6],RB:[3,6],GK:[2,7]};
const MEDIA_CALC_STAT_SOURCE_KEYS={attacking_prowess:'Attacking Prowess',ball_control:'Ball Control',dribbling:'Dribbling',low_pass:'Low Pass',lofted_pass:'Lofted Pass',finishing:'Finishing',place_kicking:'Place Kicking',swerve:'Controlled Spin',header:'Header',defensive_prowess:'Defensive Prowess',ball_winning:'Ball Winning',kicking_power:'Kicking Power',speed:'Speed',explosive_power:'Explosive Power',body_control:'Body Control',physical_contact:'Physical Contact',jump:'Jump',stamina:'Stamina',goalkeeper:'Goalkeeping',catching:'Catching',clearing:'Clearing',reflexes:'Reflexes',coverage:'Coverage'};
const MEDIA_CALC_STAT_ORDER=Object.keys(MEDIA_CALC_STAT_SOURCE_KEYS);
const MEDIA_CALC_GOALKEEPER_STATS=new Set(['goalkeeper','catching','clearing','reflexes','coverage']);
const MEDIA_CALC_STAT_ALIASES={place_kicking:'set_piece_taking',swerve:'curve',goalkeeper:'goalkeeping'};
const MEDIA_CALC_DATABASE_URLS=['database/All players exported.csv','database/All teams exported.csv','database/All squads exported.csv','database/All leagues exported.csv'];
const mediaCalcState={stats:Object.fromEntries(MEDIA_CALC_STAT_ORDER.map(key=>[key,null])),selectedPosition:'CF',loadedPlayer:null,goalkeeperMinimum:false};
let mediaCalcDatabase=null,mediaCalcDatabasePromise=null,mediaCalcSaveTimer=null,mediaCalcAnnounceTimer=null,mediaCalcSearchTimer=null,mediaCalcSearchVersion=0;
function mediaCalcT(key,params={}){return typeof window.t==='function'?window.t(`calculator.${key}`,params)||key:key;}
function mediaCalcEscape(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function mediaCalcNormalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function mediaCalcClampStat(value,fallback=MEDIA_CALC_BASE_STAT){const n=parseInt(value,10);return Number.isFinite(n)?Math.max(40,Math.min(99,n)):fallback;}
function mediaCalcValidStat(value){return Number.isInteger(value)&&value>=40&&value<=99;}
function mediaCalcPositionName(position){return typeof window.i18nLookup==='function'?window.i18nLookup('positionNames',position,mediaCalcT(MEDIA_CALC_POSITION_NAMES[position])):mediaCalcT(MEDIA_CALC_POSITION_NAMES[position]);}
function mediaCalcPositionLabel(position){return typeof window.i18nLookup==='function'?window.i18nLookup('positions',position,MEDIA_CALC_POSITION_LABELS[position]):MEDIA_CALC_POSITION_LABELS[position];}
function mediaCalcStatLabel(key){const source=MEDIA_CALC_STAT_SOURCE_KEYS[key];return typeof window.i18nLookup==='function'?window.i18nLookup('stats',source,source):source;}
function mediaCalcValueClass(value){return value===null?'':`stat-range-${value>=95?6:value>=90?5:value>=80?4:value>=70?3:value>=60?2:1}`;}
function mediaCalcPesStats(stats=mediaCalcState.stats,weakFoot=null) {
  const read=key=>{const value=mediaCalcClampStat(stats[key]??MEDIA_CALC_BASE_STAT); return mediaCalcState.goalkeeperMinimum&&stats===mediaCalcState.stats&&MEDIA_CALC_GOALKEEPER_STATS.has(key)?MEDIA_CALC_MIN_STAT:value;};
  return {attacking_prowess:read('attacking_prowess'),ball_control:read('ball_control'),dribbling:read('dribbling'),low_pass:read('low_pass'),lofted_pass:read('lofted_pass'),finishing:read('finishing'),set_piece_taking:read('place_kicking'),curve:read('swerve'),header:read('header'),defensive_prowess:read('defensive_prowess'),ball_winning:read('ball_winning'),kicking_power:read('kicking_power'),speed:read('speed'),explosive_power:read('explosive_power'),body_control:read('body_control'),physical_contact:read('physical_contact'),jump:read('jump'),goalkeeping:read('goalkeeper'),catching:read('catching'),clearing:read('clearing'),reflexes:read('reflexes'),coverage:read('coverage'),stamina:read('stamina'),non_dom_leg_precision:Number(weakFoot??mediaCalcState.loadedPlayer?.weakFootPrecision??3)||3};
}
function mediaCalcFamiliarity(position) { const raw=mediaCalcState.loadedPlayer?.familiarity?.[position]; return Number.isFinite(Number(raw))?Math.max(0,Math.min(2,Number(raw))):0; }
function mediaCalcResult(position,stats=mediaCalcState.stats) { const loaded=mediaCalcState.loadedPlayer; const natural=loaded?.position||position; const familiarity=loaded&&position!==natural?mediaCalcFamiliarity(position):0; const rounded=window.PES2018Overall.pes2018Overall(mediaCalcPesStats(stats,loaded?.weakFootPrecision),position,natural,familiarity); return {decimal:rounded,rounded}; }
function mediaCalcPositionResults(stats=mediaCalcState.stats){
  const complete=MEDIA_CALC_STAT_ORDER.every(key=>mediaCalcValidStat(stats[key]));
  return MEDIA_CALC_POSITIONS.map(position=>({position,label:mediaCalcPositionLabel(position),name:mediaCalcPositionName(position),...(complete?mediaCalcResult(position,stats):{rounded:null,decimal:null})}));
}
// Migrate v2 preferences without filling blank attributes or retaining identities.
function mediaCalcLoadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(MEDIA_CALC_STORAGE_KEY)||'null');
    if(!saved||typeof saved!=='object')return;
    if(MEDIA_CALC_POSITIONS.includes(saved.selectedPosition))mediaCalcState.selectedPosition=saved.selectedPosition;
    for(const key of MEDIA_CALC_STAT_ORDER){
      const value=saved.stats?.[key];
      mediaCalcState.stats[key]=value===null||value===undefined||value===''?null:mediaCalcClampStat(value,null);
      if(saved.goalkeeperMinimum&&MEDIA_CALC_GOALKEEPER_STATS.has(key))mediaCalcState.stats[key]=40;
    }
  }catch{/* An unreadable preference must not prevent editing. */}
}
function mediaCalcSaveState(immediate=false){
  const save=()=>{try{localStorage.setItem(MEDIA_CALC_STORAGE_KEY,JSON.stringify({stats:mediaCalcState.stats,selectedPosition:mediaCalcState.selectedPosition}));}catch{mediaCalcSetFeedback(mediaCalcT('saveError'));}};
  clearTimeout(mediaCalcSaveTimer);if(immediate)save();else mediaCalcSaveTimer=setTimeout(save,160);
}
function mediaCalcSetFeedback(message){const el=document.getElementById('media-calc-feedback');if(el)el.textContent=message;}
function mediaCalcMapMarkup(){
  return `<div class="mc-pitch"><div class="mc-positions" role="group" aria-label="${mediaCalcEscape(mediaCalcT('positionMap'))}">${MEDIA_CALC_POSITIONS.map(p=>`<button type="button" class="mc-position" data-media-position-cell="${p}" style="grid-column:${MEDIA_CALC_POSITION_GRID_LAYOUT[p][0]};grid-row:${MEDIA_CALC_POSITION_GRID_LAYOUT[p][1]}" aria-pressed="${p===mediaCalcState.selectedPosition}"><span>${mediaCalcPositionLabel(p)}</span><b dir="ltr" data-media-position-score="${p}">—</b></button>`).join('')}</div></div>`;
}
function mediaCalcStatMarkup(key){
  return `<div class="mc-stat" data-media-stat="${key}"><label for="media-stat-${key}">${mediaCalcEscape(mediaCalcStatLabel(key))}</label><input dir="ltr" id="media-stat-${key}" class="media-stat-number" data-media-key="${key}" type="number" min="40" max="99" step="1" inputmode="numeric" value="${mediaCalcState.stats[key]??''}" placeholder="—" autocomplete="off" aria-describedby="media-calc-stat-range"></div>`;
}
function renderMediaCalculatorPage(){
  const content=document.getElementById('media-calculator-content');if(!content)return;
  content.innerHTML=`<div class="mc-dashboard">
    <section class="mc-player" aria-labelledby="media-calc-selected-label">
      <header class="mc-score-heading"><div><span class="mc-caption">${mediaCalcT('selectedPosition')}</span><h2 id="media-calc-selected-label"></h2><p id="media-calc-selected-name"></p></div><div class="media-calc-overall"><strong dir="ltr" id="media-calc-selected-score">—</strong><small>${mediaCalcT('overall')}</small></div></header>
      ${mediaCalcMapMarkup()}<p id="media-calc-empty-hint" class="mc-empty-hint">${mediaCalcT('emptyHint')}</p>
    </section>
    <section class="mc-editor" aria-labelledby="media-calc-stats-title">
      <header class="mc-editor-header"><div><h2 id="media-calc-stats-title">${mediaCalcT('attributes')}</h2><p id="media-calc-stat-range">${mediaCalcT('range')}</p></div><button class="mc-quiet-button" type="button" data-media-action="clear">${mediaCalcT('clear')}</button></header>
      <div class="mc-base"><label for="media-calc-player-search">${mediaCalcT('baseLabel')}</label><input id="media-calc-player-search" type="search" placeholder="${mediaCalcEscape(mediaCalcT('basePlaceholder'))}" autocomplete="off" aria-controls="media-calc-player-results"><ul id="media-calc-player-results" class="mc-search-results" aria-label="${mediaCalcEscape(mediaCalcT('baseResults'))}" hidden></ul></div>
      <form id="media-calc-editor" class="mc-stats-form" aria-labelledby="media-calc-stats-title" novalidate><div class="mc-stat-grid">${MEDIA_CALC_STAT_ORDER.map(mediaCalcStatMarkup).join('')}</div></form>
      <form id="media-calc-fill-form" class="mc-quick-tools" aria-label="${mediaCalcEscape(mediaCalcT('toolsHeading'))}">
        <div class="mc-fill"><label for="media-calc-fill-value">${mediaCalcT('fill')}</label><input dir="ltr" id="media-calc-fill-value" type="number" min="40" max="99" step="1" inputmode="numeric" required aria-label="${mediaCalcEscape(mediaCalcT('fillValue'))}"><select id="media-calc-fill-scope" aria-label="${mediaCalcEscape(mediaCalcT('scope'))}"><option value="all">${mediaCalcT('scopeAll')}</option><option value="field">${mediaCalcT('scopeField')}</option><option value="goalkeeper">${mediaCalcT('scopeKeeper')}</option></select><button type="submit">${mediaCalcT('apply')}</button></div>
        <div class="mc-adjust" role="group" aria-label="${mediaCalcEscape(mediaCalcT('adjust'))}"><span>${mediaCalcT('adjust')}</span>${[-5,-1,1,5].map(delta=>`<button type="button" data-media-adjust="${delta}" aria-label="${mediaCalcEscape(mediaCalcT('step',{delta:delta>0?`+${delta}`:delta}))}">${delta>0?'+':''}${delta}</button>`).join('')}</div>
      </form>
    </section>
  </div><p id="media-calc-feedback" class="mc-feedback" role="status" aria-live="polite" aria-atomic="true"></p>`;
  mediaCalcUpdateDynamicSections(false);
}
function mediaCalcUpdateDynamicSections(announce=true){
  const results=mediaCalcPositionResults(),selected=results.find(r=>r.position===mediaCalcState.selectedPosition);
  const label=document.getElementById('media-calc-selected-label'),name=document.getElementById('media-calc-selected-name'),score=document.getElementById('media-calc-selected-score');
  if(label)label.textContent=selected.label;if(name)name.textContent=selected.name;
  if(score){score.textContent=selected.rounded??'—';score.parentElement.className=`media-calc-overall ${mediaCalcValueClass(selected.rounded)}`;}
  for(const r of results){
    const cell=document.querySelector(`[data-media-position-cell="${r.position}"]`);if(!cell)continue;
    cell.setAttribute('aria-pressed',String(r.position===selected.position));
    cell.setAttribute('aria-label',`${r.name}: ${r.rounded??'—'}`);cell.title=`${r.name}: ${r.rounded??'—'}`;
    cell.querySelector('span').textContent=r.label;
    cell.querySelector('[data-media-position-score]').textContent=r.rounded??'—';
  }
  const hint=document.getElementById('media-calc-empty-hint');if(hint)hint.hidden=selected.rounded!==null;
  clearTimeout(mediaCalcAnnounceTimer);
  if(announce)mediaCalcAnnounceTimer=setTimeout(()=>mediaCalcSetFeedback(selected.rounded===null?mediaCalcT('emptyHint'):mediaCalcT('scoreStatus',{position:selected.label,score:selected.rounded})),250);
}
function mediaCalcUpdateStatControls(key,skipActive=false){
  const input=document.getElementById(`media-stat-${key}`);if(!input)return;
  const value=mediaCalcState.stats[key];if(!skipActive)input.value=value??'';
  input.setAttribute('aria-invalid',String(value!==null&&!mediaCalcValidStat(value)));
  input.setCustomValidity(value!==null&&!mediaCalcValidStat(value)?mediaCalcT('validValue'):'');
}
function updateMediaCalculatorStatInput(key,value){
  if(!MEDIA_CALC_STAT_ORDER.includes(key))return;
  mediaCalcState.stats[key]=String(value).trim()===''?null:Number(value);
  mediaCalcUpdateStatControls(key,true);mediaCalcUpdateDynamicSections();mediaCalcSaveState();
}
function commitMediaCalculatorStatInput(key,value){
  if(!MEDIA_CALC_STAT_ORDER.includes(key))return;
  mediaCalcState.stats[key]=String(value).trim()===''?null:mediaCalcClampStat(value,null);
  mediaCalcUpdateStatControls(key);mediaCalcUpdateDynamicSections();mediaCalcSaveState(true);
}
function setMediaCalculatorPosition(position){
  if(!MEDIA_CALC_POSITIONS.includes(position))return;
  mediaCalcState.selectedPosition=position;mediaCalcUpdateDynamicSections();mediaCalcSaveState();
}
function mediaCalcSyncStats(){MEDIA_CALC_STAT_ORDER.forEach(key=>mediaCalcUpdateStatControls(key));mediaCalcUpdateDynamicSections();mediaCalcSaveState(true);}
function fillMediaCalculatorStats(value,scope='all'){
  const number=Number(value);
  if(String(value).trim()===''||!mediaCalcValidStat(number)||!['all','field','goalkeeper'].includes(scope))return false;
  for(const key of MEDIA_CALC_STAT_ORDER)if(scope==='all'||(scope==='goalkeeper')===MEDIA_CALC_GOALKEEPER_STATS.has(key))mediaCalcState.stats[key]=number;
  mediaCalcSyncStats();return true;
}
function adjustAllMediaCalculatorStats(delta){
  if(![-5,-1,1,5].includes(Number(delta)))return;
  for(const key of MEDIA_CALC_STAT_ORDER)if(mediaCalcValidStat(mediaCalcState.stats[key]))mediaCalcState.stats[key]=mediaCalcClampStat(mediaCalcState.stats[key]+Number(delta));
  mediaCalcSyncStats();
}
function clearMediaCalculatorStats(){MEDIA_CALC_STAT_ORDER.forEach(key=>{mediaCalcState.stats[key]=null;});mediaCalcSyncStats();mediaCalcSetFeedback(mediaCalcT('cleared'));}
// One-shot copy: never retain identity, originalStats or familiarity.
function mediaCalcCopiedStats(raw){
  const canonical=window.PES2018Overall.statsFromLaqpRow(raw);
  return Object.fromEntries(MEDIA_CALC_STAT_ORDER.map(key=>{
    const value=canonical[MEDIA_CALC_STAT_ALIASES[key]||key];
    if(!mediaCalcValidStat(value))throw new Error(`Invalid PES stat: ${key}`);
    return [key,value];
  }));
}
function loadMediaCalculatorPlayer(playerId){
  const player=mediaCalcDatabase?.players.find(item=>item.id===String(playerId));if(!player)return;
  try{
    const copied=mediaCalcCopiedStats(player.raw);
    mediaCalcState.stats=copied;mediaCalcState.selectedPosition=player.position;mediaCalcState.loadedPlayer=null;mediaCalcState.goalkeeperMinimum=false;
    const input=document.getElementById('media-calc-player-search');if(input){input.value='';input.focus();}
    mediaCalcSearchVersion++;mediaCalcHidePlayerResults();mediaCalcSyncStats();
    clearTimeout(mediaCalcAnnounceTimer);mediaCalcSetFeedback(mediaCalcT('copiedStats'));
  }catch{mediaCalcSetFeedback(mediaCalcT('databaseError'));}
}
// The existing CSV sources are fetched once, only when search is used.
function mediaCalcParseCsv(text){
  const lines=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split('\n');if(lines.length<2)return [];
  const headers=lines.shift().split(';').map(v=>v.trim());
  return lines.filter(Boolean).map(line=>{const values=line.split(';');return Object.fromEntries(headers.map((h,i)=>[h,(values[i]??'').trim()]));});
}
async function mediaCalcLoadDatabase(){
  if(mediaCalcDatabase)return mediaCalcDatabase;if(mediaCalcDatabasePromise)return mediaCalcDatabasePromise;
  mediaCalcDatabasePromise=Promise.all(MEDIA_CALC_DATABASE_URLS.map(url=>fetch(url).then(r=>{if(!r.ok)throw new Error(String(r.status));return r.text();}))).then(([p,t,s,l])=>{
    const publicIds=new Set(mediaCalcParseCsv(l).flatMap(r=>String(r.team_ids||'').split(',').map(id=>id.trim()).filter(Boolean)));
    const teams=new Map(mediaCalcParseCsv(t).filter(r=>publicIds.has(String(r.Id))&&r.Name&&r.Name!=='-').map(r=>[String(r.Id),{id:String(r.Id),name:r.Name,type:String(r.Type)}]));
    const rawPlayers=new Map(mediaCalcParseCsv(p).map(r=>[String(r.Id),r])),unique=new Map();
    for(const squad of mediaCalcParseCsv(s)){
      const team=teams.get(String(squad.Id));if(!team)continue;
      for(let n=1;n<=32;n++){const id=String(squad[`Player ${n}`]||''),raw=rawPlayers.get(id),current=unique.get(id);if(raw&&id!=='0'&&(!current||(current.team.type==='2'&&team.type!=='2')))unique.set(id,{raw,team});}
    }
    const players=[];
    for(const {raw,team} of unique.values()){
      try{
        const position=window.PES2018Overall.positionFromLaqp(raw.POS);mediaCalcCopiedStats(raw);
        players.push({raw,id:String(raw.Id),name:raw.Name,teamName:team.name,position,searchText:mediaCalcNormalize(`${raw.Name} ${team.name} ${position} ${MEDIA_CALC_POSITION_LABELS[position]}`)});
      }catch{/* An incomplete source record cannot be used as a base. */}
    }
    mediaCalcDatabase={players,teams};return mediaCalcDatabase;
  }).catch(error=>{mediaCalcDatabasePromise=null;throw error;});
  return mediaCalcDatabasePromise;
}
function mediaCalcPlayerMatches(query){
  const terms=mediaCalcNormalize(query).split(/\s+/).filter(Boolean);
  return !terms.length||!mediaCalcDatabase?[]:mediaCalcDatabase.players.filter(p=>terms.every(term=>mediaCalcNormalize(`${p.searchText} ${mediaCalcPositionLabel(p.position)} ${mediaCalcPositionName(p.position)}`).includes(term))).slice(0,6);
}
function mediaCalcHidePlayerResults(){const list=document.getElementById('media-calc-player-results');if(list){list.hidden=true;list.innerHTML='';}}
async function updateMediaCalculatorPlayerSearch(value){
  const query=String(value||'').trim(),version=++mediaCalcSearchVersion,list=document.getElementById('media-calc-player-results');
  if(!query){mediaCalcHidePlayerResults();return;}if(!list)return;
  list.hidden=false;list.innerHTML=`<li><p>${mediaCalcT('loadingPlayers')}</p></li>`;
  try{
    await mediaCalcLoadDatabase();if(version!==mediaCalcSearchVersion)return;
    const players=mediaCalcPlayerMatches(query);
    list.innerHTML=players.length?players.map(p=>`<li><button type="button" data-media-player="${mediaCalcEscape(p.id)}"><span><strong>${mediaCalcEscape(p.name)}</strong><small>${mediaCalcEscape(p.teamName)} · ${mediaCalcPositionLabel(p.position)}</small></span><b>${mediaCalcT('copyStats')} ↗</b></button></li>`).join(''):`<li><p>${mediaCalcT('noPlayers')}</p></li>`;
  }catch{if(version===mediaCalcSearchVersion)list.innerHTML=`<li><p>${mediaCalcT('databaseError')}</p></li>`;}
}
function mediaCalcBindEvents(content){
  content.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.mediaKey)updateMediaCalculatorStatInput(input.dataset.mediaKey,input.value);
    if(input.id==='media-calc-fill-value')mediaCalcValidateFill();
    if(input.id==='media-calc-player-search'){clearTimeout(mediaCalcSearchTimer);mediaCalcSearchVersion++;mediaCalcSearchTimer=setTimeout(()=>updateMediaCalculatorPlayerSearch(input.value),120);}
  });
  content.addEventListener('focusout',event=>{if(event.target.dataset.mediaKey)commitMediaCalculatorStatInput(event.target.dataset.mediaKey,event.target.value);});
  content.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.mediaPositionCell)setMediaCalculatorPosition(button.dataset.mediaPositionCell);
    if(button.dataset.mediaAdjust)adjustAllMediaCalculatorStats(Number(button.dataset.mediaAdjust));
    if(button.dataset.mediaPlayer)loadMediaCalculatorPlayer(button.dataset.mediaPlayer);
    if(button.dataset.mediaAction==='clear')clearMediaCalculatorStats();
  });
  content.addEventListener('invalid',event=>{if(event.target.id==='media-calc-fill-value')mediaCalcValidateFill();},true);
  content.addEventListener('submit',event=>{
    event.preventDefault();
    if(event.target.id==='media-calc-fill-form')fillMediaCalculatorStats(document.getElementById('media-calc-fill-value').value,document.getElementById('media-calc-fill-scope').value);
  });
  content.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&event.target.dataset.mediaKey){event.preventDefault();event.target.blur();}
    if(event.key==='Escape'){mediaCalcSearchVersion++;clearTimeout(mediaCalcSearchTimer);mediaCalcHidePlayerResults();}
    if(event.target.id==='media-calc-player-search'&&event.key==='ArrowDown'){const first=content.querySelector('[data-media-player]');if(first){event.preventDefault();first.focus();}}
  });
  document.addEventListener('click',event=>{if(!event.target.closest('.mc-base')){mediaCalcSearchVersion++;clearTimeout(mediaCalcSearchTimer);mediaCalcHidePlayerResults();}});
}

function mediaCalcValidateFill(){
  const input=document.getElementById('media-calc-fill-value');
  if(input)input.setCustomValidity(input.value===''?mediaCalcT('valueRequired'):mediaCalcValidStat(Number(input.value))?'':mediaCalcT('validValue'));
}
function mediaCalcLocalizeNavigation(){
  const nav=document.querySelector('#header .header-nav');
  if(!nav)return;
  nav.setAttribute('aria-label',mediaCalcT('mainNav'));
  // Menu labels come from js/site.js so the header matches every other section.
  const switcher=document.querySelector('.language-switcher');
  if(switcher){
    switcher.setAttribute('aria-label',window.t('language.label'));
    switcher.querySelector('span').textContent=window.t('language.label');
    switcher.querySelector('select').setAttribute('aria-label',window.t('language.label'));
    switcher.querySelector('select').value=window.getCurrentLanguage();
  }
  const menu=document.querySelector('.header-menu-toggle');
  if(menu){menu.textContent=mediaCalcT('menu');menu.setAttribute('aria-label',mediaCalcT(menu.getAttribute('aria-expanded')==='true'?'menuClose':'menuOpen'));}
}
function mediaCalcLocalize(){
  window.applyI18nToDocument(document);
  const text={
    '.mc-caption':'selectedPosition','.media-calc-overall small':'overall',
    '#media-calc-stats-title':'attributes','#media-calc-stat-range':'range',
    '[data-media-action="clear"]':'clear','.mc-base>label':'baseLabel',
    '.mc-fill>label':'fill','#media-calc-fill-scope option[value="all"]':'scopeAll',
    '#media-calc-fill-scope option[value="field"]':'scopeField','#media-calc-fill-scope option[value="goalkeeper"]':'scopeKeeper',
    '.mc-fill>button':'apply','.mc-adjust>span':'adjust','#media-calc-empty-hint':'emptyHint',
    '.mc-footer a[href="/terms.html"]':'terms'
  };
  for(const [selector,key] of Object.entries(text)){
    const el=document.querySelector(selector);if(el)el.textContent=mediaCalcT(key);
  }
  const attributes={
    '#media-calc-fill-form':'toolsHeading','#media-calc-fill-value':'fillValue',
    '#media-calc-fill-scope':'scope','#media-calc-player-results':'baseResults',
    '#media-calc-player-search':'baseLabel','.mc-adjust':'adjust','.mc-positions':'positionMap',
    '.mc-footer nav':'legal'
  };
  for(const [selector,key] of Object.entries(attributes)){
    const el=document.querySelector(selector);if(el)el.setAttribute('aria-label',mediaCalcT(key));
  }
  for(const key of MEDIA_CALC_STAT_ORDER){
    const label=document.querySelector(`label[for="media-stat-${key}"]`);
    if(label)label.textContent=mediaCalcStatLabel(key);
    const input=document.getElementById(`media-stat-${key}`);
    if(input)input.setCustomValidity(input.value!==''&&!mediaCalcValidStat(Number(input.value))?mediaCalcT('validValue'):'');
  }
  document.querySelectorAll('[data-media-adjust]').forEach(button=>{
    const delta=Number(button.dataset.mediaAdjust);
    button.setAttribute('aria-label',mediaCalcT('step',{delta:delta>0?`+${delta}`:delta}));
  });
  const search=document.getElementById('media-calc-player-search');
  search.placeholder=mediaCalcT('basePlaceholder');
  if(search.value)updateMediaCalculatorPlayerSearch(search.value);
  mediaCalcValidateFill();
  mediaCalcLocalizeNavigation();
  document.title=`${mediaCalcT('pageTitle')} | LAqP`;
  for(const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]']){
    document.querySelector(selector)?.setAttribute('content',mediaCalcT('metaDescription'));
  }
  for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]']){
    document.querySelector(selector)?.setAttribute('content',document.title);
  }
  const ld=document.querySelector('script[type="application/ld+json"]');
  if(ld){const app=JSON.parse(ld.textContent);app.name=mediaCalcT('pageTitle');app.description=mediaCalcT('metaDescription');ld.textContent=JSON.stringify(app);}
  mediaCalcSetFeedback('');
  mediaCalcUpdateDynamicSections(false);
}
function mediaCalcBindLanguage(){
  window.addEventListener('laqp:language-change',event=>{
    event.preventDefault();
    mediaCalcSaveState(true);
    mediaCalcLocalize();
  });
  // The shared mobile menu changes its expanded state independently.
  const menu=document.querySelector('.header-menu-toggle');
  if(menu)new MutationObserver(()=>mediaCalcLocalizeNavigation()).observe(menu,{attributes:true,attributeFilter:['aria-expanded']});
}

async function initMediaCalculator(){
  const content=document.getElementById('media-calculator-content'),loading=document.getElementById('media-calculator-loading');
  if(!content||content.dataset.ready)return;content.dataset.ready='true';
  try{await window.LAQPEnsurePes2018Overall();mediaCalcLoadState();renderMediaCalculatorPage();mediaCalcBindEvents(content);mediaCalcLocalize();mediaCalcBindLanguage();}
  catch{content.innerHTML=`<p class="mc-error" role="alert">${mediaCalcT('formulaError')}</p>`;}
  finally{if(loading)loading.hidden=true;}
}
document.addEventListener('DOMContentLoaded',initMediaCalculator,{once:true});
Object.assign(window,{initMediaCalculator,setMediaCalculatorPosition,fillMediaCalculatorStats,adjustAllMediaCalculatorStats,clearMediaCalculatorStats,loadMediaCalculatorPlayer,updateMediaCalculatorPlayerSearch,updateMediaCalculatorStatInput,commitMediaCalculatorStatInput});
