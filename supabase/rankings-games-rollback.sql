-- Reverts rankings-games.sql: restores the per-version vote and results functions from rankings.sql.
-- Touches no data. Votes cast while v2 was active remain valid (their per-version totals were kept).
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
 insert into laqp_rankings_private.ballots(voter_hash,mode,choices,points)
 values(p_hash,p_mode,p_choices,scores) on conflict(voter_hash) do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return jsonb_build_object('accepted',false,'alreadyVoted',true); end if;
 insert into laqp_rankings_private.totals as t(version_id,points,voters)
 select v.id,scores[v.n],1 from unnest(p_choices) with ordinality v(id,n) order by v.id
 on conflict(version_id) do update set points=t.points+excluded.points,voters=t.voters+1;
 return jsonb_build_object('accepted',true,'alreadyVoted',false);
end $$;

create or replace function public.laqp_rankings_results() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('ballots',(select count(*) from laqp_rankings_private.ballots),
 'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.position) from (
 select row_number() over(order by t.points desc,t.voters desc,v.id) as position,
 v.id,v.game_id,v.title,v.platform,v.series,t.points,t.voters
 from laqp_rankings_private.totals t join laqp_rankings_private.versions v on v.id=t.version_id
 )r),'[]'::jsonb),
 'scoring',(select jsonb_object_agg(mode::text,points) from laqp_rankings_private.scoring));
$$;
revoke all on function public.laqp_rankings_vote(text,smallint,text[]),public.laqp_rankings_results() from public,anon,authenticated;
grant execute on function public.laqp_rankings_vote(text,smallint,text[]),public.laqp_rankings_results() to service_role;
commit;
