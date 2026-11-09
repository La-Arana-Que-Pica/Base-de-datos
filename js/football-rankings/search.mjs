// Flexible local search for the football games catalogue (Top 5/10, Tier List and ranking filters).
// Pure module: no DOM, no network. Index is built once (~800 games) and queried in a few milliseconds.

const STOP=new Set(['the','of','de','del','la','el','los','las','and','y','en','for','edition','edicion','version','juego','game']);

// Common names used by players for each saga. Only applied to games of that saga, so they rank
// related titles without inventing equivalences between different games.
// Nicknames weigh almost like the title (.85–.98); generic words of the saga weigh less (.6).
const SERIES_ALIASES={
 'PES / Winning Eleven / eFootball':[['pes',.9],['we',.9],['pro evolution soccer',.85],['winning eleven',.85],['pro evo',.85],['efootball',.6]],
 'FIFA / EA SPORTS FC':[['fifa',.6],['ea sports fc',.6],['ea fc',.6],['fc',.6]],
 'FIFA Street':[['fifa street',.85]],
 'FIFA Manager':[['fifa manager',.85]],
 'Football Manager':[['fm',.96],['football manager',.85]],
 'Championship Manager':[['cm',.98],['championship manager',.85]],
 'Dream League Soccer':[['dls',.98],['dream league',.85]],
 'International Superstar Soccer':[['iss',.98],['superstar soccer',.85]],
 'Captain Tsubasa':[['supercampeones',.85],['super campeones',.85],['oliver y benji',.85]],
 'Inazuma Eleven':[['inazuma',.85]],
 'UEFA Champions League':[['ucl',.9],['champions league',.85]],
 'UEFA Euro':[['euro',.85],['eurocopa',.85]],
 'PC Fútbol':[['pc futbol',.85],['pcf',.9]],
 'Mario Strikers':[['mario strikers',.85]],
 'First Touch Soccer':[['fts',.9],['first touch',.85]],
 'LMA Manager':[['lma',.9]]
};

export function normalize(value){
 const words=String(value??'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
  .replace(/&/g,' and ').replace(/['’`´]/g,'')
  .replace(/([a-z])(\d)/g,'$1 $2').replace(/(\d)([a-z])/g,'$1 $2')
  .replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
 // "F.A." / "E.A." → "fa" / "ea": join runs of single letters.
 const out=[];let run='';
 for(const w of words){if(w.length===1&&/[a-z]/.test(w)){run+=w;continue;}if(run){out.push(run);run='';}out.push(w);}
 if(run)out.push(run);
 return out.join(' ');
}
const tokens=text=>normalize(text).split(' ').filter(Boolean);
const isNum=t=>/^\d+$/.test(t);

// 2013 ↔ 13, 98 ↔ 1998. Exact form scores higher than the derived form.
export function numberForms(token){
 const value=Number(token),forms=new Map([[String(value),1]]);
 if(/^(19|20)\d\d$/.test(token))forms.set(String(value%100),.9);
 else if(token.length<=2)forms.set(String(value>=70?1900+value:2000+value),.9);
 return forms;
}

function distance(a,b,max){
 // Optimal string alignment (Damerau-Levenshtein with adjacent transpositions), early exit above max.
 if(Math.abs(a.length-b.length)>max)return max+1;
 const prev2=new Array(b.length+1),prev=new Array(b.length+1),cur=new Array(b.length+1);
 for(let j=0;j<=b.length;j++)prev[j]=j;
 for(let i=1;i<=a.length;i++){
  cur[0]=i;let best=cur[0];
  for(let j=1;j<=b.length;j++){
   const cost=a[i-1]===b[j-1]?0:1;
   let v=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+cost);
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,prev2[j-2]+1);
   cur[j]=v;if(v<best)best=v;
  }
  if(best>max)return max+1;
  for(let j=0;j<=b.length;j++){prev2[j]=prev[j];prev[j]=cur[j];}
 }
 return prev[b.length];
}

function addWord(map,word,weight,covers=1){const old=map.get(word);map.set(word,old?{weight:Math.max(old.weight,weight),covers:Math.max(old.covers,covers)}:{weight,covers});}
function addNumber(map,token,weight){for(const [form,factor] of numberForms(token)){const w=weight*factor,old=map.get(form);if(old===undefined||old<w)map.set(form,w);}}

function addText(doc,text,weight,{acronyms=false,title=false}={}){
 const list=tokens(text);
 for(let i=0;i<list.length;i++){
  const t=list[i];
  if(isNum(t))addNumber(doc.numbers,t,weight);
  else addWord(doc.words,t,weight);
  // Joined neighbours: "e football" ↔ "efootball", "winningeleven".
  if(i+1<list.length&&!isNum(t)&&!isNum(list[i+1]))addWord(doc.words,t+list[i+1],weight*.95,2);
 }
 // Year ranges such as "Dream League Soccer (2019–2026)".
 for(const m of String(text).matchAll(/((?:19|20)\d\d)\s*[–—-]\s*((?:19|20)\d\d)/g)){
  const a=Number(m[1]),b=Number(m[2]);if(b>a&&b-a<=30)for(let y=a+1;y<b;y++)addNumber(doc.numbers,String(y),weight*.9);
 }
 if(acronyms){
  // Acronym of every run of words before a number: "Pro Evolution Soccer 2013" → "pes".
  let run=[];
  const flush=()=>{const words=run.filter(w=>!STOP.has(w));if(words.length>=2){const acr=words.map(w=>w[0]).join('');for(let n=2;n<=acr.length;n++)addWord(doc.words,acr.slice(0,n),weight*.95,n);}run=[];};
  for(const t of list){if(isNum(t))flush();else run.push(t);}flush();
 }
 if(title)doc.titleWords+=list.length;
}

export function createIndex(games){
 const docs=games.map(game=>{
  const doc={game,words:new Map(),numbers:new Map(),titleWords:0,titles:[normalize(game.title),...(game.regionalVariants||[]).map(v=>normalize(v.title))],year:Number((game.releases?.[0]?.date||'').slice(0,4))||0};
  addText(doc,game.title,1,{acronyms:true,title:true});
  for(const variant of game.regionalVariants||[])addText(doc,variant.title,.95,{acronyms:true});
  if(game.edition)addText(doc,game.edition,.7);
  if(game.series&&game.series!=='Independientes'){
   addText(doc,game.series,.6,{acronyms:true});
   for(const [alias,weight] of SERIES_ALIASES[game.series]||[])addText(doc,alias,weight);
  }
  doc.wordList=[...doc.words.entries()];
  return doc;
 });
 const vocabulary=new Set(docs.flatMap(d=>[...d.words.keys()])),vocabularyList=[...vocabulary];
 return {docs,search:(query,options)=>search(docs,query,{...options,vocabulary,vocabularyList})};
}

function matchWord(doc,q,isLast,known){
 const exact=doc.words.get(q);
 let best=exact?{score:exact.weight,covers:exact.covers,weight:exact.weight}:null;
 if(best&&best.score>=1)return best;
 const fuzzyMax=q.length>=8?2:q.length>=4?1:0;
 for(const [word,info] of doc.wordList){
  let s=0;
  if(q.length>=2&&word.length>q.length&&word.startsWith(q))s=(.72+.22*q.length/word.length)*(isLast?1:.92);
  else if(fuzzyMax&&word[0]===q[0]||fuzzyMax&&q.length>=6){
   const d=distance(q,word,fuzzyMax);
   if(d<=fuzzyMax)s=(.74-.12*(d-1))*(word[0]===q[0]?1:.82);
   else if(isLast&&q.length>=4&&word.length>q.length&&distance(q,word.slice(0,q.length),1)<=1)s=.6;
   // A word that exists in the catalogue is not a typo: keep near spellings well below it.
   if(known)s*=.45;
  }
  s*=info.weight;
  if(s>(best?.score||0))best={score:s,covers:info.covers,weight:info.weight};
 }
 return best;
}

function score(doc,query,qWords,qNumbers,known){
 let got=0,total=0,mismatched=0,coveredTitle=0,strongWords=0;
 qWords.forEach((q,i)=>{
  const stop=STOP.has(q)&&qWords.length>1,weight=stop?.25:1;total+=weight;
  const m=matchWord(doc,q,i===qWords.length-1&&!qNumbers.length,known[i]);
  if(m){got+=m.score*weight;if(m.weight>=.9){coveredTitle+=m.covers;strongWords++;}}
 });
 // Titles without a number ("eFootball") are not penalised as hard as a different number.
 const numberless=!doc.numbers.size;
 for(const n of qNumbers){
  if(numberless){mismatched++;continue;}
  total+=1.1;let best=0;for(const [form,factor] of numberForms(n)){const w=doc.numbers.get(form);if(w)best=Math.max(best,w*factor);}
  if(best){got+=best*1.1;coveredTitle++;}else mismatched++;
 }
 if(!total)return 0;
 let s=got/total;
 if(mismatched)s*=numberless?.7:Math.pow(.5,mismatched);
 if(doc.titles.includes(query))s+=.35;
 else if(doc.titles.some(t=>t.startsWith(query+' ')))s+=.12;
 else if(doc.titles.some(t=>(' '+t+' ').includes(' '+query+' ')))s+=.06;
 if(qWords.length&&strongWords===qWords.length)s+=.04;
 s-=Math.min(.12,Math.max(0,doc.titleWords-coveredTitle)*.02);
 return s;
}

function variants(query){
 // "e football" → also "efootball".
 const list=query.split(' '),out=[query];
 if(list.some(t=>t.length===1&&!isNum(t))){
  const joined=[];
  for(let i=0;i<list.length;i++){if(list[i].length===1&&!isNum(list[i])&&i+1<list.length&&!isNum(list[i+1])){joined.push(list[i]+list[i+1]);i++;}else joined.push(list[i]);}
  out.push(joined.join(' '));
 }
 return [...new Set(out)];
}
export function search(docs,raw,{limit=40,min=.34,vocabulary,vocabularyList=[]}={}){
 const base=normalize(raw);if(!base)return [];
 const forms=variants(base).map(query=>{
  const list=query.split(' '),qWords=list.filter(t=>!isNum(t)),qNumbers=list.filter(isNum);
  const known=qWords.map((q,i)=>!!vocabulary&&(vocabulary.has(q)||(i===qWords.length-1&&q.length>=3&&vocabularyList.some(w=>w.startsWith(q)))));
  return {query,qWords,qNumbers,known};
 });
 const scored=[];
 for(const doc of docs){let s=0;for(const f of forms)s=Math.max(s,score(doc,f.query,f.qWords,f.qNumbers,f.known));if(s>=min)scored.push({game:doc.game,score:s,year:doc.year});}
 scored.sort((a,b)=>b.score-a.score||b.year-a.year||a.game.title.localeCompare(b.game.title,'es'));
 return scored.slice(0,limit);
}
