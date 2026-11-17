-- Checks the one-interview-per-commit rule in the database. Runs after 01_rls.sql and 02_screens.sql.
\set ON_ERROR_STOP on
create function pg_temp.check_eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.check_raises(label text, stmt text, want text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlerrm like '%' || want || '%' then raise notice 'ok   %', label; return; end if;
    raise exception 'FAIL %: raised "%", want "%"', label, sqlerrm, want;
  end;
  raise exception 'FAIL %: did not raise', label;
end $$;

reset role;
-- Cy, repo 'cy/app', commit aaaa…: a started interview.
insert into public.interviews (user_id, repo_id, commit_sha, status, started_at)
values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', repeat('a', 40), 'completed', now());

select pg_temp.check_raises('a second interview on the same commit is refused',
  $$insert into public.interviews (user_id, repo_id, commit_sha) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', repeat('a', 40))$$,
  'duplicate key');

-- A failure before starting does not count, so the candidate can try again on the same commit.
insert into public.interviews (user_id, repo_id, commit_sha, status)
values ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', repeat('b', 40), 'error');
insert into public.interviews (user_id, repo_id, commit_sha, status)
values ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', repeat('b', 40), 'preparing');
select pg_temp.check_eq('retry allowed after a failure before starting',
  (select count(*) from public.interviews where commit_sha = repeat('b', 40)), 2);

-- A new commit allows a new interview.
insert into public.interviews (user_id, repo_id, commit_sha)
values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', repeat('c', 40));
select pg_temp.check_eq('a new commit allows a new interview',
  (select count(*) from public.interviews where user_id = '00000000-0000-0000-0000-00000000000c' and commit_sha is not null), 2);

select pg_temp.check_raises('commit ids must be full SHAs',
  $$insert into public.interviews (user_id, repo_id, commit_sha) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'abc')$$,
  'violates check constraint');
-- Controls (20261117000007): a canceled preparation does not count; a canceled report does.
insert into public.interviews (user_id, repo_id, commit_sha, status)
values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', repeat('e', 40), 'canceled');
insert into public.interviews (user_id, repo_id, commit_sha, status)
values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', repeat('e', 40), 'preparing');
select pg_temp.check_eq('a canceled preparation does not use up the commit',
  (select count(*) from public.interviews where commit_sha = repeat('e', 40)), 2);
insert into public.interviews (user_id, repo_id, commit_sha, status, started_at)
values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', repeat('f', 40), 'report_canceled', now());
select pg_temp.check_raises('a canceled report still counts',
  $$insert into public.interviews (user_id, repo_id, commit_sha) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', repeat('f', 40))$$,
  'duplicate key');
update public.submissions set status = 'paused';
update public.submissions set status = 'canceled';
select pg_temp.check_eq('submissions accept paused and canceled', (select count(*) from public.submissions where status = 'canceled'), 1);
select pg_temp.check_raises('unknown submission states are refused', $$update public.submissions set status = 'stopped'$$, 'violates check constraint');
update public.events set judging_paused_at = now() where slug = 'echo-hack';
select pg_temp.check_eq('events record a judging pause', (select count(*) from public.events where judging_paused_at is not null), 1);

\echo ALL INTERVIEW CHECKS PASSED
