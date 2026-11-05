import {escapeHtml as e} from './html.js';
export const EVENT_PRESENTATION_TIMING={NORMAL:300,INTRO:450,DANGER:500,STRIKE:450,REVEAL:1000,DECISIVE_REVEAL:1200,GOAL_HOLD:1800,DECISIVE_GOAL_HOLD:2200,CARD:400,YELLOW_INTRO:250,YELLOW_HOLD:750,STATUS_HOLD:1150,ENTRY:220};
const outcomes=new Set(['goal','save','shot','defense','penalty-miss','free-kick-result']);
function lookup(view,id){return [...view.userStarters,...view.userBench,...view.userSentOff,...view.rivalStarters,...view.rivalBench,...view.rivalSentOff].find(p=>p.id===id);}
export function classifyEvent(event,view) {
 const close=Math.abs(view.userScore-view.rivalScore)<=1,late=event.minute>=85;
 if(event.type==='goal')return event.minute>90||late&&close?3:2;
 if(event.type==='red-card'||event.type==='save'||event.type==='penalty-miss')return late&&close?3:2;
 if(event.type==='injury'||event.type==='penalty'||event.type==='free-kick'&&event.zone!=='normal'||event.type==='opportunity'&&event.dangerous)return 2;
 return 1;
}
export function groupPresentations(entries) {
 const groups=[];
 for(let i=0;i<entries.length;i++) {
  const entry=entries[i],event=entry.event,group=[entry];
  if(['opportunity','penalty','free-kick'].includes(event.type)&&!(event.type==='free-kick'&&event.zone==='normal')){
   while(i+1<entries.length&&entries[i+1].event.minute===event.minute){
    const next=entries[i+1];
    if(next.event.type==='opportunity'){group.push(next);i++;continue;}
    if(outcomes.has(next.event.type)){group.push(next);i++;}break;
   }
  } else if(event.type==='yellow-card'&&entries[i+1]?.event.type==='red-card'&&entries[i+1].event.playerId===event.playerId){group.push(entries[++i]);}
  groups.push(group);
 }
 return groups;
}
function variant(event,words){return words[(event.minute+String(event.playerId||'').split('').reduce((n,c)=>n+c.charCodeAt(0),0))%words.length];}
export function eventSequence(group,before,{reduced=false,simple=false}={}) {
 const first=group[0].event,last=group.at(-1).event,after=group.at(-1).view;
 if(['penalty-kick','penalties'].includes(first.type))return null;
 const level=Math.max(...group.map(x=>classifyEvent(x.event,x.view)));
 if(first.type==='opportunity'&&!first.dangerous&&last.type!=='goal')return null;
 if(level===1&&last.type!=='yellow-card')return null;
 const player=lookup(after,last.playerId||first.playerId)||lookup(after,first.playerId);
 const shooter=lookup(after,first.playerId||last.scorerId),team=first.team==='user'?before.userTeamName:before.rivalTeamName;
 const action=first.type==='penalty'?'penalty':first.type==='free-kick'?'free-kick':last.type==='red-card'?'red-card':last.type==='yellow-card'?'yellow-card':last.type==='injury'?'injury':'chance';
 const keeper=lookup(after,last.keeperId||(['save'].includes(last.type)?last.playerId:null))||[...(first.team==='user'?before.rivalStarters:before.userStarters)].find(p=>p.slotPosition==='GK'||p.primaryPosition==='GK');
 let intro=action==='penalty'?'Penal para '+team:action==='free-kick'?'Tiro libre para '+team:action.includes('card')?'El árbitro interviene…':action==='injury'?'El partido se interrumpe…':variant(first,['¡Atención al ataque de '+team+'!','¡Hay una oportunidad para '+team+'!']);
 let danger=action==='penalty'?(shooter?.name||first.playerName||'El ejecutor')+' se prepara. '+(keeper?'En el arco: '+keeper.name:''):action==='free-kick'?(shooter?.name||first.playerName||'El ejecutor')+' prepara el balón parado.':action.includes('card')?'¡El árbitro toma una decisión!':action==='injury'?'Atención a '+(player?.name||'un jugador')+'…':(shooter?.name||first.playerName||'El atacante')+(first.dangerous?' tiene una ocasión peligrosa.':' tiene una oportunidad.');
 const strike=action==='penalty'?'¡VA A PATEAR…!':action==='free-kick'?'¡EJECUTA…!':'¡BUSCA EL ARCO…!';
 let headline=last.text,kind=last.type;
 if(last.type==='goal') {
  headline=variant(last,['¡¡¡GOOOOOOL!!!','¡LA MANDÓ A GUARDAR!']);
  const us=last.team==='user',oldDiff=(us?before.userScore-before.rivalScore:before.rivalScore-before.userScore),newDiff=(us?after.userScore-after.rivalScore:after.rivalScore-after.userScore);
  if(newDiff===0)headline+=' ¡Lo empata '+(us?before.userTeamName:before.rivalTeamName)+'!';
  else if(newDiff===1&&oldDiff<=0){
   let running=0,trailed=false;
   for(const ev of before.events.slice().reverse()){if(ev.type==='goal'){running+=(ev.team===(us?'user':'rival')?1:-1);if(running<0)trailed=true;}}
   headline+=trailed?' ¡Lo da vuelta '+(us?before.userTeamName:before.rivalTeamName)+'!':' ¡Se pone por delante!';
  }
  if(newDiff>=3)headline+=' ¡Amplía la ventaja!';
  if(last.minute>90)headline+=' ¡En el alargue!';
  else if(last.minute>=85&&Math.abs(newDiff)<=1)headline+=' ¡En los últimos minutos!';
  if(typeof before.getEffectiveRatings==='function'){const r=before.getEffectiveRatings(),own=us?r.user:r.rival,other=us?r.rival:r.user;const strength=x=>(x.att+x.mid+x.def)/3;if(strength(own)<strength(other)*.9&&oldDiff<=0)headline+=' ¡Gol ante un rival de mayor fuerza!';}
 }else if(last.type==='save')headline=variant(last,['¡QUÉ ATAJADA!','¡SE LO NEGÓ EL ARQUERO!'])+(player?' '+player.name:'');
 else if(last.type==='penalty-miss')headline=last.result==='saved'?'¡PENAL ATAJADO! '+(keeper?.name||''):'¡PENAL FUERA!';
 else if(last.type==='shot')headline=variant(last,['¡SE FUE AFUERA!','¡REMATE DESVIADO!']);
 else if(last.type==='free-kick-result')headline=last.text; // The motor combines wall/wide: never invent a specific outcome.
 else if(last.type==='red-card')headline=last.text.includes('Doble amarilla')?'¡SEGUNDA AMARILLA: EXPULSADO!':'¡ROJA DIRECTA: EXPULSADO!';
 else if(last.type==='yellow-card')headline='🟨 AMONESTADO';
 else if(last.type==='injury')headline='🤕 LESIÓN · Necesita sustitución';
 const t=EVENT_PRESENTATION_TIMING,base={reducedMotion:reduced,minute:first.minute,team:first.team,teamName:team,level:Math.min(2,level),kind:action.includes('card')?'discipline':action,protagonist:shooter?{name:shooter.name,image:shooter.image}:null};
 const stages=reduced?[]:[{...base,phase:'intro',label:intro,delay:t.INTRO},{...base,phase:'danger',label:danger,delay:action.includes('card')||action==='injury'?t.CARD:t.DANGER}];
 if(!reduced&&!simple&&['chance','penalty','free-kick'].includes(action))stages.push({...base,phase:'strike',label:strike,delay:t.STRIKE});
 const assist=last.assistId?lookup(after,last.assistId):null;
 if(last.type==='yellow-card'){stages.splice(1);if(stages[0])stages[0].delay=t.YELLOW_INTRO;}
 const resultPlayer=(last.type==='penalty-miss'&&last.result==='saved'||last.type==='free-kick-result'&&last.result==='saved')?keeper:player;
 const result={...base,animationMs:t.ENTRY,team:last.team,teamName:last.team==='user'?before.userTeamName:before.rivalTeamName,phase:'reveal',kind,level,label:headline,protagonist:resultPlayer?{name:resultPlayer.name,image:resultPlayer.image}:null,details:last.type==='goal'?[assist?'Asistencia: '+assist.name:null,after.userTeamName+' '+after.userScore+'–'+after.rivalScore+' '+after.rivalTeamName].filter(Boolean):[last.text],delay:last.type==='goal'?(level===3?t.DECISIVE_GOAL_HOLD:t.GOAL_HOLD):last.type==='yellow-card'?t.YELLOW_HOLD:['red-card','injury'].includes(last.type)?t.STATUS_HOLD:level===3?t.DECISIVE_REVEAL:t.REVEAL};
 return {stages,result};
}
export function renderEventScene(scene) {
 if(!scene)return '<strong>Seguimos en juego…</strong>';
 const p=scene.protagonist,icons={goal:'⚽',save:'🧤',shot:'↗',defense:'🛡',penalty:'⚽', 'penalty-miss':'⚽','yellow-card':'🟨','red-card':'🟥',injury:'🤕',discipline:'⚑','free-kick':'⚽'};
 return '<div class="event-scene scene-'+e(scene.kind)+' phase-'+e(scene.phase||'danger')+' level-'+scene.level+(scene.reducedMotion?' reduced-motion':'')+'"><div class="event-scene-meta">'+scene.minute+'′ · '+e(scene.teamName||'')+' · '+(scene.level===3?'MOMENTO DECISIVO':'EN JUEGO')+'</div><div class="event-scene-art" aria-hidden="true">'+(icons[scene.kind]||'⚽')+'</div>'+'<strong class="event-scene-headline">'+e(scene.label)+'</strong>'+(p?'<div class="event-protagonist"><img src="'+e(p.image||'../img/players/default.webp')+'" alt="" onerror="this.onerror=null;this.src=\'../img/players/default.webp\'"><span>'+e(p.name)+'</span></div>':'')+(scene.details?'<p>'+scene.details.map(text=>'<span>'+e(text)+'</span>').join('')+'</p>':'')+'</div>';
}
