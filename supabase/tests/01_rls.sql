-- Checks tenant isolation, sign-up, submission limits and result visibility.
\set ON_ERROR_STOP on
create function pg_temp.act_as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
$$;
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@echo.dev', '{"display_name":"Ana","account_type":"organizer","organization_name":"Echo Engineers"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@rival.dev', '{"display_name":"Bob","account_type":"organizer","organization_name":"Rival Org"}'),
  ('00000000-0000-0000-0000-00000000000c', 'cy@student.dev', '{"display_name":"Cy","account_type":"student"}'),
  ('00000000-0000-0000-0000-00000000000d', 'di@student.dev', '{"display_name":"Di","account_type":"platform_admin"}');

select pg_temp.check_eq('profiles created', (select count(*) from public.profiles), 4);
select pg_temp.check_eq('organizations only for organizers', (select count(*) from public.organizations), 2);
select pg_temp.check_eq('everyone is a student', (select count(*) from public.user_roles ur join public.roles r on r.id = ur.role_id where r.key = 'student'), 4);
select pg_temp.check_eq('nobody becomes platform_admin at sign-up', (select count(*) from public.user_roles ur join public.roles r on r.id = ur.role_id where r.key = 'platform_admin'), 0);

insert into public.repos (id, owner, name, url) values ('10000000-0000-0000-0000-000000000001', 'cy', 'app', 'https://github.com/cy/app');
insert into public.events (id, organization_id, name, slug, starts_at, submission_deadline, visibility, access_code_hash, max_submissions, rubric_json, status)
select '20000000-0000-0000-0000-000000000001', o.id, 'Echo Hack', 'echo-hack', now() - interval '1 hour', now() + interval '1 day', 'code', 'hash', 2, '[]', 'open'
from public.organizations o where o.name = 'Echo Engineers';
insert into public.events (id, organization_id, name, slug, starts_at, submission_deadline, visibility, rubric_json, status)
select '20000000-0000-0000-0000-000000000002', o.id, 'Rival Draft', 'rival-draft', now(), now() + interval '1 day', 'public', '[]', 'draft'
from public.organizations o where o.name = 'Rival Org';

-- submit_version: participant, limit, deadline
select pg_temp.check_raises('non participant cannot submit',
  $$select * from public.submit_version('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','T','10000000-0000-0000-0000-000000000001','',null,null)$$, 'not_a_participant');
insert into public.event_participants (event_id, organization_id, user_id, joined_via)
select e.id, e.organization_id, '00000000-0000-0000-0000-00000000000c', 'code' from public.events e where e.slug = 'echo-hack';
select * from public.submit_version('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Team Cy','10000000-0000-0000-0000-000000000001','v1',null,null);
select * from public.submit_version('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Team Cy','10000000-0000-0000-0000-000000000001','v2',null,null);
select pg_temp.check_raises('limit of 2 submissions is enforced',
  $$select * from public.submit_version('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Team Cy','10000000-0000-0000-0000-000000000001','v3',null,null)$$, 'submission_limit_reached');
select pg_temp.check_eq('one submission row, two versions', (select versions_used from public.submissions), 2);
select pg_temp.check_eq('latest version is current', (select v.version_no from public.submissions s join public.submission_versions v on v.id = s.current_version_id), 2);
update public.events set max_submissions = null where slug = 'echo-hack';
select * from public.submit_version('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Team Cy','10000000-0000-0000-0000-000000000001','v3',null,null);
select pg_temp.check_eq('unlimited allows more', (select versions_used from public.submissions), 3);
update public.events set submission_deadline = now() - interval '1 minute', starts_at = now() - interval '2 hours' where slug = 'echo-hack';
select pg_temp.check_raises('nothing is accepted after the deadline',
  $$select * from public.submit_version('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Team Cy','10000000-0000-0000-0000-000000000001','late',null,null)$$, 'event_closed');

insert into public.scores (submission_id, organization_id, criterion_key, ai_score)
select s.id, s.organization_id, 'innovation', 7 from public.submissions s;
insert into public.interviews (id, user_id, repo_id) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001');
insert into public.interview_plans (interview_id, plan_json) values ('30000000-0000-0000-0000-000000000001', '{}');
insert into public.interview_reports (interview_id, skills_json, ownership_score, confidence, summary) values ('30000000-0000-0000-0000-000000000001', '[]', 80, 'high', 's');

-- RLS, seen as each user
set role authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a'); -- Ana, owner of Echo
select pg_temp.check_eq('owner sees only her organization', (select count(*) from public.organizations), 1);
select pg_temp.check_eq('owner sees her event, not the rival draft', (select count(*) from public.events), 1);
select pg_temp.check_eq('owner sees submissions of her event', (select count(*) from public.submissions), 1);
select pg_temp.check_eq('owner sees scores before publishing', (select count(*) from public.scores), 1);
select pg_temp.check_eq('owner has event.create in her org', (select public.has_permission('event.create', (select id from public.organizations)))::int, 1);
select pg_temp.check_raises('access code hash is not selectable', 'select access_code_hash from public.events', 'permission denied');
select pg_temp.check_raises('browser cannot insert events', $$insert into public.events (organization_id, name, slug, starts_at, submission_deadline, visibility, rubric_json) select id, 'Hack', 'hack', now(), now() + interval '1 day', 'public', '[]' from public.organizations$$, 'permission denied');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b'); -- Bob, owner of Rival
select pg_temp.check_eq('other tenant sees none of the submissions', (select count(*) from public.submissions), 0);
select pg_temp.check_eq('other tenant sees none of the scores', (select count(*) from public.scores), 0);
select pg_temp.check_eq('other tenant sees only his own event', (select count(*) from public.events where slug = 'echo-hack'), 0);
select pg_temp.check_eq('no event.create in someone else''s org', (select public.has_permission('event.create', (select organization_id from public.event_participants limit 1)))::int, 0);
select pg_temp.check_eq('other tenant cannot read a personal interview', (select count(*) from public.interviews), 0);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c'); -- Cy, participant
select pg_temp.check_eq('participant sees the code event he joined', (select count(*) from public.events), 1);
select pg_temp.check_eq('participant sees his submission', (select count(*) from public.submissions), 1);
select pg_temp.check_eq('participant sees his versions', (select count(*) from public.submission_versions), 3);
select pg_temp.check_eq('scores are hidden until published', (select count(*) from public.scores), 0);
select pg_temp.check_eq('student has no event.create', (select public.has_permission('event.create', (select organization_id from public.submissions)))::int, 0);
select pg_temp.check_eq('student can take interviews', (select public.has_permission('interview.take'))::int, 1);
select pg_temp.check_eq('question plan is never readable', (select count(*) from public.interview_plans), 0);
select pg_temp.check_eq('analyses are API only', (select count(*) from public.repo_analyses), 0);
select pg_temp.check_raises('cannot grant himself a role', $$insert into public.user_roles (user_id, role_id) select '00000000-0000-0000-0000-00000000000c', id from public.roles where key = 'platform_admin'$$, 'permission denied');
select pg_temp.check_raises('cannot call submit_version directly', $$select * from public.submit_version('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','T','10000000-0000-0000-0000-000000000001','',null,null)$$, 'permission denied');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000d'); -- Di, unrelated student
select pg_temp.check_eq('outsider does not see a code event', (select count(*) from public.events), 0);
select pg_temp.check_eq('outsider does not see a private report', (select count(*) from public.interview_reports), 0);

reset role;
update public.events set status = 'published' where slug = 'echo-hack';
update public.public_profiles set is_public = true where user_id = '00000000-0000-0000-0000-00000000000c';
set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check_eq('scores appear once published', (select count(*) from public.scores), 1);
set role anon;
select pg_temp.act_as(null);
select pg_temp.check_eq('anyone can read the report of a public profile', (select count(*) from public.interview_reports), 1);
select pg_temp.check_eq('anon sees public profiles only', (select count(*) from public.public_profiles), 1);
select pg_temp.check_raises('anon cannot read submissions', 'select count(*) from public.submissions', 'permission denied');
reset role;
\echo ALL DATABASE CHECKS PASSED
