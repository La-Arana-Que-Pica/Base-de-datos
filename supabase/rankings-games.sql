-- LAqP football rankings · v2: one ranking entry per canonical game (versions.game_id).
-- ADDITIVE MIGRATION, applied after rankings.sql + rankings-catalog.sql.
-- * Does not delete, rewrite or move any row: ballots and totals stay exactly as they are.
-- * Replaces only two functions (same signatures, so existing grants are kept).
-- * Reversible with rankings-games-rollback.sql.
--
-- Rules:
-- 1. A ballot may contain each canonical game only once, whatever the platform (validated here,
--    in the database, so the browser is never trusted).
-- 2. The ranking is computed from ballots (source of truth): points of every version are
--    added to its game; each platform keeps its own points and voters as a breakdown.
-- 3. Historical safety: if an old ballot had the same game twice, only the appearance with
--    the most points (its original position and platform) counts; the duplicate is ignored
--    by the calculation and nothing is reassigned to other games.
begin;

create or replace function public.laqp_rankings_vote(p_hash text,p_mode smallint,p_choices text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare scores smallint[]; inserted integer;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_VOTER' using errcode='22023'; end if;
 select points into scores from laqp_rankings_private.scoring where mode=p_mode;
 if scores is null or p_choices is null or cardinality(p_choices)<>p_mode or array_ndims(p_choices)<>1 or array_lower(p_choices,1)<>1
 or (select count(distinct id) from unnest(p_choices) id)<>p_mode
 or (select count(*) from laqp_rankings_private.versions where active and id=any(p_choices))<>p_mode
 then raise exception 'INVALID_TOP' using errcode='22023'; end if;
 -- One appearance per canonical game: two platforms of the same game are rejected.
 if (select count(distinct game_id) from laqp_rankings_private.versions where id=any(p_choices))<>p_mode
 then raise exception 'DUPLICATE_GAME' using errcode='22023'; end if;
 insert into laqp_rankings_private.ballots(voter_hash,mode,choices,points)
 values(p_hash,p_mode,p_choices,scores) on conflict(voter_hash) do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return jsonb_build_object('accepted',false,'alreadyVoted',true); end if;
 -- Legacy per-version totals are still maintained (rollback keeps working with no backfill).
 insert into laqp_rankings_private.totals as t(version_id,points,voters)
 select v.id,scores[v.n],1 from unnest(p_choices) with ordinality v(id,n) order by v.id
 on conflict(version_id) do update set points=t.points+excluded.points,voters=t.voters+1;
 return jsonb_build_object('accepted',true,'alreadyVoted',false);
end $$;

create or replace function public.laqp_rankings_results() returns jsonb
language sql stable security invoker set search_path='' as $$
 with picks as (
  select b.voter_hash,c.version_id,c.n,b.points[c.n]::bigint as pts,v.game_id,v.title,v.platform,v.series
  from laqp_rankings_private.ballots b
  cross join lateral unnest(b.choices) with ordinality c(version_id,n)
  join laqp_rankings_private.versions v on v.id=c.version_id
 ), kept as (
  -- One appearance per voter and game: the one with most points (lowest position) wins.
  select distinct on (voter_hash,game_id) * from picks order by voter_hash,game_id,pts desc,n
 ), per_version as (
  select game_id,version_id,platform,sum(pts)::bigint as points,count(*)::bigint as voters
  from kept group by game_id,version_id,platform
 ), per_game as (
  select game_id,min(title) as title,min(series) as series,sum(pts)::bigint as points,
         count(distinct voter_hash)::bigint as voters
  from kept group by game_id
 ), ranked as (
  select row_number() over(order by g.points desc,g.voters desc,g.game_id) as position,g.*
  from per_game g
 )
 select jsonb_build_object(
  'ballots',(select count(*) from laqp_rankings_private.ballots),
  'aggregation','game',
  'rows',coalesce((select jsonb_agg(jsonb_build_object(
     'position',r.position,'id',r.game_id,'game_id',r.game_id,'title',r.title,'series',r.series,
     'points',r.points,'voters',r.voters,
     'platforms',(select jsonb_agg(jsonb_build_object('id',p.version_id,'platform',p.platform,'points',p.points,'voters',p.voters)
                  order by p.points desc,p.voters desc,p.platform) from per_version p where p.game_id=r.game_id)
   ) order by r.position) from ranked r),'[]'::jsonb),
  'scoring',(select jsonb_object_agg(mode::text,points) from laqp_rankings_private.scoring));
$$;

-- Same server-only permissions as rankings.sql (create or replace keeps them; restated for clarity).
revoke all on function public.laqp_rankings_vote(text,smallint,text[]),public.laqp_rankings_results() from public,anon,authenticated;
grant execute on function public.laqp_rankings_vote(text,smallint,text[]),public.laqp_rankings_results() to service_role;
commit;
