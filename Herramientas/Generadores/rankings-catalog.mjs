// Explicit, local catalogue seed generation. Does not connect to any database.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {catalogVersions} from '../../js/football-rankings/model.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const games=JSON.parse(await readFile(resolve(root,'database/football-games.json'),'utf8')).games;
const rows=catalogVersions(games).map(v=>({id:v.id,game_id:v.gameId,title:v.game.title,platform:v.platform,series:v.game.series}));
const sql=`-- Generated from database/football-games.json by rankings-catalog.mjs. Review locally before installation.
-- Additive: existing vote identities are never deleted or reassigned.
begin;
insert into laqp_rankings_private.versions(id,game_id,title,platform,series)
select id,game_id,title,platform,series from jsonb_to_recordset($catalog$${JSON.stringify(rows)}$catalog$::jsonb)
as r(id text,game_id text,title text,platform text,series text)
on conflict(id) do update set title=excluded.title,series=excluded.series
where laqp_rankings_private.versions.game_id=excluded.game_id and laqp_rankings_private.versions.platform=excluded.platform;
commit;
`;
await writeFile(resolve(root,'supabase/rankings-catalog.sql'),sql);
console.log(`${games.length} juegos, ${rows.length} versiones. SQL local preparado; no se ejecutó.`);
