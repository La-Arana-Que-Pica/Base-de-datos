import {COLLECTION_ATTRIBUTES} from '../data/collection-attributes.js';
// Read verified PES values without mutating the catalogue or a saved player.
const aliases={low_pass:'lowPass',lofted_pass:'loftedPass',finishing:'finishing',curve:'controlledSpin',kicking_power:'kickingPower',defensive_prowess:'defensiveProwess',ball_winning:'ballWinning',goalkeeping:'goalkeeping',stamina:'stamina'};
export function sportAttribute(player,key){
 const own=player.pesStats?.[key];
 if(Number.isFinite(own))return own;
 // Explicit engine fields override original data for transformed or fixture players.
 const alias=aliases[key];if(alias&&Number.isFinite(player[alias]))return player[alias];
 const original=COLLECTION_ATTRIBUTES[String(player.sourcePlayerId??player.id)]?.stats?.[key];
 return Number.isFinite(original)?original:(player.overall??70);
}
export function sportAttributeReference(player){
 // Permanent legacy OVR upgrades retain their full effect; original PES values are unchanged.
 return player.pesStats?(player.overall??70):player.originalOverall??COLLECTION_ATTRIBUTES[String(player.sourcePlayerId??player.id)]?.overall??player.overall??70;
}
