// Presentation of the existing reward state; never grants or captures rights.
import {specialDefinitionReady} from '../expansion/album.js';
export function rewardState(m,a,x){if(m.key==='global:100'&&x.ledger['reward:global99'])return 'RECLAMADA';if(a.claims[m.key])return a.claims[m.key].status==='pending-validation'?'PENDIENTE DE VALIDACIÓN':'RECLAMADA';if(!m.unlocked)return 'BLOQUEADA';if(m.key!=='global:100'&&!specialDefinitionReady(m.candidate)||m.key==='global:55')return 'PENDIENTE DE VALIDACIÓN';return 'DESBLOQUEADA';}
