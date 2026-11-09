-- LAqP football rankings. LOCAL PREPARATION ONLY; reviewed installation required.
-- Standalone additive migration, matching the existing supabase/*.sql layout.
begin;
create schema if not exists laqp_rankings_private;
revoke all on schema laqp_rankings_private from public, anon, authenticated;
grant usage on schema laqp_rankings_private to service_role;

create table laqp_rankings_private.versions (
 id text primary key, game_id text not null, title text not null,
 platform text not null, series text not null, active boolean not null default true,
 unique(game_id,platform)
);
create table laqp_rankings_private.scoring (
 mode smallint primary key check(mode in (5,10)), points smallint[] not null,
 check(cardinality(points)=mode and array_ndims(points)=1 and array_lower(points,1)=1 and array_position(points,null) is null and 0 < all(points))
);
insert into laqp_rankings_private.scoring values (5,array[10,8,6,4,2]),(10,array[10,9,8,7,6,5,4,3,2,1]);
create table laqp_rankings_private.ballots (
 voter_hash text primary key check(voter_hash ~ '^[a-f0-9]{64}$'),
 mode smallint not null references laqp_rankings_private.scoring(mode),
 choices text[] not null, points smallint[] not null, created_at timestamptz not null default now(),
 check(cardinality(choices)=mode and cardinality(points)=mode)
);
create table laqp_rankings_private.totals (
 version_id text primary key references laqp_rankings_private.versions(id),
 points bigint not null check(points>=0), voters bigint not null check(voters>=0)
);
-- Short-lived per-browser HMAC buckets only. No IPs or network identifiers.
create table laqp_rankings_private.throttles (
 bucket text primary key check(bucket ~ '^[a-f0-9]{64}$'), hits integer not null,
 expires_at timestamptz not null
);
create index on laqp_rankings_private.throttles(expires_at);
alter table laqp_rankings_private.versions enable row level security;
alter table laqp_rankings_private.scoring enable row level security;
alter table laqp_rankings_private.ballots enable row level security;
alter table laqp_rankings_private.totals enable row level security;
alter table laqp_rankings_private.throttles enable row level security;
-- No browser policies. Only the server may call the RPCs below; all use invoker rights.
revoke all on all tables in schema laqp_rankings_private from public,anon,authenticated;
grant select on laqp_rankings_private.versions,laqp_rankings_private.scoring to service_role;
grant select,insert on laqp_rankings_private.ballots to service_role;
grant select,insert,update on laqp_rankings_private.totals to service_role;
grant select,insert,update,delete on laqp_rankings_private.throttles to service_role;

create function public.laqp_rankings_gate(p_bucket text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 delete from laqp_rankings_private.throttles where expires_at <= now();
 insert into laqp_rankings_private.throttles as t values(p_bucket,1,now()+interval '10 minutes')
 on conflict(bucket) do update set hits=t.hits+1 returning hits into n;
 return n<=20;
end $$;

create function public.laqp_rankings_status(p_hash text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from laqp_rankings_private.ballots where voter_hash=p_hash);
$$;

create function public.laqp_rankings_vote(p_hash text,p_mode smallint,p_choices text[]) returns jsonb
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
 -- Deterministic lock order avoids deadlocks between different ballots with shared games.
 insert into laqp_rankings_private.totals as t(version_id,points,voters)
 select v.id,scores[v.n],1 from unnest(p_choices) with ordinality v(id,n) order by v.id
 on conflict(version_id) do update set points=t.points+excluded.points,voters=t.voters+1;
 return jsonb_build_object('accepted',true,'alreadyVoted',false);
end $$;

create function public.laqp_rankings_results() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('ballots',(select count(*) from laqp_rankings_private.ballots),
 'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.position) from (
 select row_number() over(order by t.points desc,t.voters desc,v.id) as position,
 v.id,v.game_id,v.title,v.platform,v.series,t.points,t.voters
 from laqp_rankings_private.totals t join laqp_rankings_private.versions v on v.id=t.version_id
 )r),'[]'::jsonb),
 'scoring',(select jsonb_object_agg(mode::text,points) from laqp_rankings_private.scoring));
$$;
revoke all on function public.laqp_rankings_gate(text),public.laqp_rankings_status(text),
 public.laqp_rankings_vote(text,smallint,text[]),public.laqp_rankings_results() from public,anon,authenticated;
grant execute on function public.laqp_rankings_gate(text),public.laqp_rankings_status(text),
 public.laqp_rankings_vote(text,smallint,text[]),public.laqp_rankings_results() to service_role;
commit;
