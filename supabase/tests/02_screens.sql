-- Checks the tables behind the organizer suite, judge workspace, integrity review and course mode.
-- Runs after 01_rls.sql, on the same data: Ana owns Echo, Bob owns Rival, Cy is a student, Di becomes a judge.
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

reset role;
-- Di judges in Echo. A second judge, Bob's account, has nothing to do with Echo.
insert into public.user_roles (user_id, role_id, organization_id)
select '00000000-0000-0000-0000-00000000000d', r.id, o.id from public.roles r, public.organizations o
where r.key = 'judge' and o.name = 'Echo Engineers';

insert into public.org_invitations (organization_id, email, role_key, token_hash)
select id, 'new.judge@echo.dev', 'judge', 'hash-1' from public.organizations where name = 'Echo Engineers';
insert into public.audit_log (organization_id, action, subject_type)
select id, 'score.override', 'score' from public.organizations where name = 'Echo Engineers';

insert into public.judge_assignments (submission_id, judge_id, event_id, organization_id)
select s.id, '00000000-0000-0000-0000-00000000000d', s.event_id, s.organization_id from public.submissions s;
insert into public.judge_reviews (submission_id, judge_id, organization_id, status)
select s.id, '00000000-0000-0000-0000-00000000000d', s.organization_id, 'submitted' from public.submissions s;
insert into public.judge_reviews (submission_id, judge_id, organization_id)
select s.id, '00000000-0000-0000-0000-00000000000a', s.organization_id from public.submissions s;

insert into public.integrity_decisions (organization_id, event_id, submission_id, verdict)
select s.organization_id, s.event_id, s.id, 'live_defense' from public.submissions s;

insert into public.courses (id, organization_id, name, code)
select '40000000-0000-0000-0000-000000000001', id, 'Algorithms', 'CS-201' from public.organizations where name = 'Echo Engineers';
insert into public.course_members (course_id, user_id, organization_id, role)
select '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', organization_id, 'student'
from public.courses where id = '40000000-0000-0000-0000-000000000001';
-- A course assignment: its own table, not an event (20261120000001).
insert into public.course_assignments (id, organization_id, course_id, title, opens_at, due_at, rubric_json, status)
select '50000000-0000-0000-0000-000000000001', organization_id, id, 'Sorting lab',
  now() - interval '1 day', now() + interval '7 days', '[]', 'open'
from public.courses where id = '40000000-0000-0000-0000-000000000001';

select pg_temp.check_eq('auditor role exists with audit.read', (
  select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
  where r.key = 'auditor' and p.key = 'audit.read'), 1);
select pg_temp.check_raises('integrity verdicts are a closed list',
  $$insert into public.integrity_decisions (organization_id, event_id, submission_id, verdict) select organization_id, event_id, id, 'guilty' from public.submissions$$,
  'violates check constraint');
select pg_temp.check_raises('invitations need a known role',
  $$insert into public.org_invitations (organization_id, email, role_key, token_hash) select id, 'x@y.z', 'platform_admin', 'h' from public.organizations limit 1$$,
  'violates check constraint');

set role authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a'); -- Ana, owner of Echo
select pg_temp.check_eq('owner sees her invitations', (select count(*) from public.org_invitations), 1);
select pg_temp.check_raises('invitation token hash is not selectable', 'select token_hash from public.org_invitations', 'permission denied');
select pg_temp.check_eq('owner reads the audit trail', (select count(*) from public.audit_log), 1);
select pg_temp.check_eq('owner sees every judge review', (select count(*) from public.judge_reviews), 2);
select pg_temp.check_eq('owner sees integrity decisions', (select count(*) from public.integrity_decisions), 1);
select pg_temp.check_eq('owner sees her course and roster', (select count(*) from public.course_members), 1);
select pg_temp.check_eq('owner sees the course assignment', (select count(*) from public.course_assignments), 1);
select pg_temp.check_raises('browser cannot write reviews', $$update public.judge_reviews set note = 'x'$$, 'permission denied');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000d'); -- Di, judge in Echo
select pg_temp.check_eq('judge sees only her own assignment', (select count(*) from public.judge_assignments), 1);
select pg_temp.check_eq('judge sees only her own review', (select count(*) from public.judge_reviews), 1);
select pg_temp.check_eq('judge cannot read invitations', (select count(*) from public.org_invitations), 0);
select pg_temp.check_eq('judge cannot read the audit trail', (select count(*) from public.audit_log), 0);
select pg_temp.check_eq('judge has submission.review', (select public.has_permission('submission.review', (select id from public.organizations where name = 'Echo Engineers')))::int, 1);
select pg_temp.check_eq('judge cannot record integrity decisions', (select public.has_permission('integrity.decide', (select id from public.organizations where name = 'Echo Engineers')))::int, 0);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b'); -- Bob, owner of Rival
select pg_temp.check_eq('other tenant sees no invitations', (select count(*) from public.org_invitations), 0);
select pg_temp.check_eq('other tenant sees no audit entries', (select count(*) from public.audit_log), 0);
select pg_temp.check_eq('other tenant sees no reviews', (select count(*) from public.judge_reviews), 0);
select pg_temp.check_eq('other tenant sees no decisions', (select count(*) from public.integrity_decisions), 0);
select pg_temp.check_eq('other tenant sees no courses', (select count(*) from public.courses), 0);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c'); -- Cy, enrolled student
select pg_temp.check_eq('student sees the course he is enrolled in', (select count(*) from public.courses), 1);
select pg_temp.check_eq('student sees his own enrolment', (select count(*) from public.course_members), 1);
select pg_temp.check_eq('student does not see integrity decisions', (select count(*) from public.integrity_decisions), 0);
select pg_temp.check_eq('student does not see judge reviews', (select count(*) from public.judge_reviews), 0);

select pg_temp.check_raises('answer coverage is not selectable', 'select answers_json from public.interview_reports', 'permission denied');
select pg_temp.check_raises('focus events are not exposed through reports', 'select focus_events_json from public.interview_reports', 'does not exist');

set role anon;
select pg_temp.act_as(null);
select pg_temp.check_eq('anon still reads public report scores', (select count(*) from (select ownership_score from public.interview_reports) r), 1);
select pg_temp.check_raises('anon cannot read courses', 'select count(*) from public.courses', 'permission denied');
reset role;
\echo ALL SCREEN CHECKS PASSED
