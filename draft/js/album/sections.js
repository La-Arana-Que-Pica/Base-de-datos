// Beta 1.0 initial catalog organization; not a season/expansion or an economic rule.
export const ALBUM_SECTIONS=[['204','Premier League'],['236','LaLiga'],['208','Ligue 1'],['215','Serie A'],['210','Bundesliga'],['9003','Otros Europa'],['144','Liga Argentina'],['ARG_ASCENSO','Ascenso Argentino'],['146','Brasileirão'],['147','Liga Chilena'],['LATAM','Otros Latinoamericanos'],['9004','CONCACAF Leagues Cup']];
// Stable club IDs: source groups these under 9005; two source country fields are inconsistent.
export const ARGENTINE_SECONDARY_CLUBS=new Set(['1921','4996','4910','1923','1924','4999','2540','2729','1925']);
export function albumSection(team){
 const league=String(team.leagueId);
 if(ARGENTINE_SECONDARY_CLUBS.has(String(team.id)))return 'ARG_ASCENSO';
 if(league==='147'||league==='9005'&&String(team.countryId)==='147')return '147';
 if(league==='9005')return 'LATAM';
 if(['9003','29','30','32','1000','1001'].includes(league))return '9003';
 return league;
}
