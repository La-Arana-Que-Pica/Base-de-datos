const legacy=['16avos de final','Octavos de final','Cuartos de final','Semifinal','Final'];
export const DEFAULT_TOURNAMENT_SIZE=16;
export function tournamentFormat(participants=DEFAULT_TOURNAMENT_SIZE){if(![16,32].includes(participants))throw Error('Formato de torneo incompatible');return {version:1,participants,roundCount:Math.log2(participants),labels:legacy.slice(-Math.log2(participants))};}
export function savedTournamentFormat(t){const size=Object.keys(t.teams||{}).length,format=tournamentFormat(size);if(t.format&&(t.format.version!==1||t.format.participants!==size||t.format.roundCount!==format.roundCount||JSON.stringify(t.format.labels)!==JSON.stringify(format.labels)))throw Error('Metadatos de formato incoherentes');return format;}
