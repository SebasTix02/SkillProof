-- Course assignments: access is the course roster, nothing else. Runs after 02_screens.sql: Echo has the course
-- "Algorithms" (Cy is a student) with the assignment "Sorting lab".
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
-- A second course in Echo, without Cy, with its own assignment.
insert into public.courses (id, organization_id, name)
select '40000000-0000-0000-0000-000000000002', id, 'Databases' from public.organizations where name = 'Echo Engineers';
insert into public.events (id, organization_id, kind, course_id, name, slug, starts_at, submission_deadline, visibility, rubric_json, status)
select '50000000-0000-0000-0000-000000000002', organization_id, 'assignment', id, 'SQL lab', 'sql-lab',
  now() - interval '1 day', now() + interval '7 days', 'course', '[]', 'open'
from public.courses where id = '40000000-0000-0000-0000-000000000002';

select pg_temp.check_eq('roster student is a participant of the assignment',
  (select count(*) from public.event_participants where event_id = '50000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000c' and joined_via = 'course'), 1);
select pg_temp.check_eq('student of another course is not', (select count(*) from public.event_participants where event_id = '50000000-0000-0000-0000-000000000002'), 0);

select pg_temp.check_raises('an assignment needs a course',
  $$insert into public.events (organization_id, kind, name, slug, starts_at, submission_deadline, visibility, rubric_json) select id, 'assignment', 'Lost', 'lost-a', now(), now() + interval '1 day', 'course', '[]' from public.organizations where name = 'Echo Engineers'$$,
  'events_assignment_shape');
select pg_temp.check_raises('an assignment cannot be public',
  $$insert into public.events (organization_id, kind, course_id, name, slug, starts_at, submission_deadline, visibility, rubric_json) select organization_id, 'assignment', id, 'Open', 'open-a', now(), now() + interval '1 day', 'public', '[]' from public.courses where id = '40000000-0000-0000-0000-000000000001'$$,
  'events_assignment_shape');
select pg_temp.check_raises('a hackathon cannot use course access',
  $$insert into public.events (organization_id, name, slug, starts_at, submission_deadline, visibility, rubric_json) select id, 'Hack', 'hack-c', now(), now() + interval '1 day', 'course', '[]' from public.organizations where name = 'Echo Engineers'$$,
  'events_assignment_shape');
select pg_temp.check_raises('nobody is allowlisted into an assignment',
  $$insert into public.event_allowlist (event_id, organization_id, email) select id, organization_id, 'x@y.z' from public.events where slug = 'sql-lab'$$,
  'assignment_access_is_the_roster');
select pg_temp.check_raises('nobody joins an assignment by code',
  $$insert into public.event_participants (event_id, organization_id, user_id, joined_via) select id, organization_id, '00000000-0000-0000-0000-00000000000c', 'code' from public.events where slug = 'sql-lab'$$,
  'assignment_access_is_the_roster');
select pg_temp.check_raises('a student off the roster cannot submit',
  $$select * from public.submit_version('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','T','10000000-0000-0000-0000-000000000001','',null,null)$$,
  'not_a_participant');
select pg_temp.check_eq('a roster student can submit',
  (select count(*) from public.submit_version('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','Cy','10000000-0000-0000-0000-000000000001','v1',null,null)), 1);

-- Roster changes follow through.
insert into public.course_members (course_id, user_id, organization_id, role)
select id, '00000000-0000-0000-0000-00000000000c', organization_id, 'student' from public.courses where id = '40000000-0000-0000-0000-000000000002';
select pg_temp.check_eq('adding a student opens the course assignments', (select count(*) from public.event_participants where event_id = '50000000-0000-0000-0000-000000000002'), 1);
update public.course_members set role = 'ta' where course_id = '40000000-0000-0000-0000-000000000002';
select pg_temp.check_eq('a TA is not a participant', (select count(*) from public.event_participants where event_id = '50000000-0000-0000-0000-000000000002'), 0);
update public.course_members set role = 'student' where course_id = '40000000-0000-0000-0000-000000000002';
delete from public.course_members where course_id = '40000000-0000-0000-0000-000000000002';
select pg_temp.check_eq('removing a student closes them', (select count(*) from public.event_participants where event_id = '50000000-0000-0000-0000-000000000002'), 0);

set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c'); -- Cy, student of Algorithms only
select pg_temp.check_eq('student sees the assignment of his course', (select count(*) from public.course_assignments), 1);
select pg_temp.check_eq('and not the one of another course', (select count(*) from public.events where slug = 'sql-lab'), 0);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a'); -- Ana, owner of Echo
select pg_temp.check_eq('owner sees every assignment of her organization', (select count(*) from public.course_assignments), 2);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b'); -- Bob, other tenant
select pg_temp.check_eq('other tenant sees no assignments', (select count(*) from public.course_assignments), 0);

set role anon;
select pg_temp.act_as(null);
select pg_temp.check_raises('anon cannot read assignments', 'select count(*) from public.course_assignments', 'permission denied');
reset role;
\echo ALL COURSE ASSIGNMENT CHECKS PASSED
