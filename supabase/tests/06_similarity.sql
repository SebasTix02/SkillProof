-- Content similarity (20261121000002). Runs after 05_locale.sql on the same data.
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

insert into public.file_fingerprints (blob_sha, hashes, starts, ends, token_count)
values (repeat('a', 40), '{1,2,3}', '{1,2,3}', '{4,5,6}', 80);
select pg_temp.check_eq('fingerprints are stored by blob sha', (select cardinality(hashes) from public.file_fingerprints where blob_sha = repeat('a', 40)), 3);
select pg_temp.check_raises('hashes, starts and ends have the same length',
  $$insert into public.file_fingerprints (blob_sha, hashes, starts, ends, token_count) values (repeat('b', 40), '{1,2}', '{1}', '{1,2}', 10)$$, 'violates check constraint');
select pg_temp.check_raises('a blob sha is 40 hex characters',
  $$insert into public.file_fingerprints (blob_sha, hashes, starts, ends, token_count) values ('nope', '{}', '{}', '{}', 0)$$, 'violates check constraint');

select pg_temp.check_eq('shared_code is a similarity signal for events',
  (select count(*) from pg_constraint where conname = 'similarity_flags_signal_check' and pg_get_constraintdef(oid) like '%shared_code%'), 1);
select pg_temp.check_eq('and for course assignments',
  (select count(*) from pg_constraint where conname = 'assignment_similarity_flags_signal_check' and pg_get_constraintdef(oid) like '%shared_code%'), 1);

select pg_temp.check_raises('starter code must be a GitHub repository',
  $$update public.events set starter_repo_url = 'https://gitlab.com/a/b'$$, 'violates check constraint');
update public.course_assignments set starter_repo_url = 'https://github.com/teacher/lab-template' where title = 'Team project';
select pg_temp.check_eq('an assignment can name its starter code', (select count(*) from public.course_assignments where starter_repo_url is not null), 1);

set role authenticated;
select pg_temp.check_raises('the browser cannot read fingerprints', 'select count(*) from public.file_fingerprints', 'permission denied');
select pg_temp.check_raises('nor the files of an analysis', 'select count(*) from public.analysis_files', 'permission denied');
select pg_temp.check_raises('nor the fragments of assignment pairs', 'select count(*) from public.assignment_similarity_matches', 'permission denied');
reset role;
\echo ALL SIMILARITY CHECKS PASSED
