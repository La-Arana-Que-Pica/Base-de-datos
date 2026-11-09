-- READ-ONLY audit for rankings-games.sql. Run before and after the migration (SQL editor, owner role).
-- Changes nothing.

-- 1. Volume and point consistency (sum of ballot points must equal legacy totals).
select (select count(*) from laqp_rankings_private.ballots) as ballots,
       (select coalesce(sum(p),0) from laqp_rankings_private.ballots b, unnest(b.points) p) as ballot_points,
       (select coalesce(sum(points),0) from laqp_rankings_private.totals) as legacy_total_points;

-- 2. Ballots containing the same canonical game twice (expected: 0 rows).
select b.voter_hash, v.game_id, array_agg(v.platform order by c.n) as platforms, array_agg(c.n order by c.n) as positions
from laqp_rankings_private.ballots b
cross join lateral unnest(b.choices) with ordinality c(version_id,n)
join laqp_rankings_private.versions v on v.id=c.version_id
group by b.voter_hash, v.game_id having count(*) > 1;

-- 3. Votes for versions missing from the catalogue (expected: 0 rows; such picks cannot be grouped).
select distinct c.version_id
from laqp_rankings_private.ballots b cross join lateral unnest(b.choices) c(version_id)
left join laqp_rankings_private.versions v on v.id=c.version_id where v.id is null;
