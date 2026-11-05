import {MatchEngine} from '../core/matchEngine.js';
import {decodeLocalState} from '../persistence/campaignSnapshot.js';
// Read helpers come from the existing engine. All mutating sporting methods use commands.
export function remoteMatch(runtime,run){
 const m=Object.assign(Object.create(MatchEngine.prototype),decodeLocalState(run.display,{allowPermanent:true}));m.authoritative=true;m.stopTimer=()=>{};m.timerId=null;m.presentationSeed=0;
 const update=display=>{const callbacks={onEvent:m.onEvent,onTick:m.onTick,onFinish:m.onFinish,playback:m.playback};Object.assign(m,decodeLocalState(display,{allowPermanent:true}),callbacks);};
 m.receive=(response,{events=false}={})=>{const current=response.view.runs[run.id];if(events){for(const entry of response.playback?.frames||[]){update(entry.view);m.onEvent?.(entry.event,m);}}update(current.display);if(events&&m.isFinished)m.onFinish?.(current.ui.lastMatchResult);return true;};
 m.advance=async()=>m.receive(await runtime.command('match.present',{runId:run.id,minutes:1},{apply:false}),{events:true});
 m.tick=()=>{throw Error('La simulación oficial solo se ejecuta en el servidor.');};m.start=m.tick;
 const decision=async(kind,args={})=>{const response=await runtime.command(kind,{runId:run.id,...args},{apply:false});m.receive(response,{events:true});if(m.minute===0)runtime.main.refreshKickoffForecast();return true;};
 m.setRemotePause=value=>decision(value?'match.pause':'match.resume');m.pause=()=>{if(m.playback)m.playback.pause();};m.resume=()=>m.playback?.resume();
 m.continueSecondHalf=()=>decision('match.halftime');m.setTactic=tactic=>decision('match.tactic',{tactic});m.setIntensity=intensity=>decision('match.intensity',{intensity});m.configureSetPieces=settings=>decision('match.setPieces',{settings});
 m.confirmShootoutOrder=async playerIds=>m.receive(await runtime.command('match.shootout',{runId:run.id,playerIds},{apply:false}),{events:true});
 m.substitute=()=>{throw Error('Confirmá la ventana de cambios completa.');};m.substituteBatch=async pairs=>decision('match.substitutions',{pairs});
 return m;
}
