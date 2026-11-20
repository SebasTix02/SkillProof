-- Course assignments, groups and submissions (20261120000001). Runs after 02_screens.sql: Echo has the course
-- "Algorithms" (Cy is a student) with the individual assignment "Sorting lab". Di is a judge in Echo.
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
-- Ed and Flo are students too; Di helps as a TA.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'ed@student.dev', '{"display_name":"Ed","account_type":"student"}'),
  ('00000000-0000-0000-0000-00000000000f', 'flo@student.dev', '{"display_name":"Flo","account_type":"student"}');
insert into public.course_members (course_id, user_id, organization_id, role)
select c.id, u.id, c.organization_id, u.role
from public.courses c, (values
  ('00000000-0000-0000-0000-00000000000e'::uuid, 'student'),
  ('00000000-0000-0000-0000-00000000000f'::uuid, 'student'),
  ('00000000-0000-0000-0000-00000000000d'::uuid, 'ta')) as u(id, role)
where c.id = '40000000-0000-0000-0000-000000000001';

-- Group assignments: "Team project" (2 to 3) and "Pair lab" (exactly 2).
insert into public.course_assignments (id, organization_id, course_id, title, opens_at, due_at, rubric_json, status, mode, group_min, group_max)
select v.id, c.organization_id, c.id, v.title, now() - interval '1 day', now() + interval '7 days', '[]', 'open', 'group', v.gmin, v.gmax
from public.courses c, (values
  ('50000000-0000-0000-0000-000000000002'::uuid, 'Team project', 2, 3),
  ('50000000-0000-0000-0000-000000000003'::uuid, 'Pair lab', 2, 2)) as v(id, title, gmin, gmax)
where c.id = '40000000-0000-0000-0000-000000000001';

-- Courses are not events any more.
select pg_temp.check_raises('events are hackathons only',
  $$insert into public.events (organization_id, kind, name, slug, starts_at, submission_deadline, visibility, rubric_json) select id, 'assignment', 'Lab', 'lab-x', now(), now() + interval '1 day', 'public', '[]' from public.organizations where name = 'Echo Engineers'$$,
  'events_kind_check');
select pg_temp.check_raises('events have no course', 'select course_id from public.events', 'does not exist');
select pg_temp.check_raises('a group assignment needs its size',
  $$insert into public.course_assignments (organization_id, course_id, title, opens_at, due_at, rubric_json, mode) select organization_id, id, 'Bad group', now(), now() + interval '1 day', '[]', 'group' from public.courses where id = '40000000-0000-0000-0000-000000000001'$$,
  'violates check constraint');

-- Individual: only students on the roster submit, within the limits.
select pg_temp.check_eq('a roster student submits an individual assignment',
  (select versions_used from public.submit_assignment_version('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','v1',null)), 1);
select pg_temp.check_eq('a second version counts on the same submission',
  (select versions_used from public.submit_assignment_version('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','v2',null)), 2);
select pg_temp.check_raises('someone off the roster cannot submit',
  $$select * from public.submit_assignment_version('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','',null)$$,
  'not_on_roster');
select pg_temp.check_raises('a TA does not submit',
  $$select * from public.submit_assignment_version('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d','10000000-0000-0000-0000-000000000001','',null)$$,
  'not_on_roster');
update public.course_assignments set max_submissions = 2 where id = '50000000-0000-0000-0000-000000000001';
select pg_temp.check_raises('the version limit holds',
  $$select * from public.submit_assignment_version('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','v3',null)$$,
  'submission_limit_reached');
update public.course_assignments set due_at = now() - interval '1 minute', opens_at = now() - interval '2 days' where id = '50000000-0000-0000-0000-000000000003';
select pg_temp.check_raises('nothing after the due date',
  $$select * from public.submit_assignment_version('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','',null)$$,
  'assignment_closed');
update public.course_assignments set due_at = now() + interval '7 days' where id = '50000000-0000-0000-0000-000000000003';

-- Groups: students invite classmates from the roster.
select pg_temp.check_eq('a student creates a group',
  (select count(*) from public.create_assignment_group('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','Cy and friends')), 1);
select pg_temp.check_raises('only one group per student and assignment',
  $$select public.create_assignment_group('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','Again')$$,
  'already_in_group');
select pg_temp.check_raises('groups exist only in group assignments',
  $$select public.create_assignment_group('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','No')$$,
  'not_a_group_assignment');
select pg_temp.check_raises('a group of one is too small to submit',
  $$select * from public.submit_assignment_version('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','',null)$$,
  'group_too_small');
select pg_temp.check_raises('a student without a group cannot submit',
  $$select * from public.submit_assignment_version('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000f','10000000-0000-0000-0000-000000000001','',null)$$,
  'no_group');
select public.invite_to_group((select id from public.assignment_groups where name = 'Cy and friends'), '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000e');
select pg_temp.check_raises('only roster students can be invited',
  $$select public.invite_to_group((select id from public.assignment_groups where name = 'Cy and friends'), '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b')$$,
  'not_on_roster');
select pg_temp.check_raises('only members invite',
  $$select public.invite_to_group((select id from public.assignment_groups where name = 'Cy and friends'), '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000f')$$,
  'not_in_group');
select public.respond_to_group_invite((select id from public.assignment_groups where name = 'Cy and friends'), '00000000-0000-0000-0000-00000000000e', true);
select pg_temp.check_eq('an accepted invitation joins the group',
  (select count(*) from public.assignment_group_members where status = 'accepted' and group_id = (select id from public.assignment_groups where name = 'Cy and friends')), 2);
select pg_temp.check_eq('any member submits for the group',
  (select versions_used from public.submit_assignment_version('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000e','10000000-0000-0000-0000-000000000001','team v1',null)), 1);
select pg_temp.check_eq('the group submission is one, for the group',
  (select count(*) from public.assignment_submissions where assignment_id = '50000000-0000-0000-0000-000000000002' and group_id is not null and student_id is null), 1);
select pg_temp.check_raises('a submitted group is closed to students',
  $$select public.invite_to_group((select id from public.assignment_groups where name = 'Cy and friends'), '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000f')$$,
  'groups_closed');
select public.staff_place_in_group((select id from public.assignment_groups where name = 'Cy and friends'), '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000a');
select pg_temp.check_eq('staff can still place a student', (select count(*) from public.assignment_group_members where status = 'accepted' and assignment_id = '50000000-0000-0000-0000-000000000002'), 3);

-- Size: a pair takes two.
select public.create_assignment_group('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000e','Pair');
select public.invite_to_group((select id from public.assignment_groups where name = 'Pair'), '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000c');
select public.invite_to_group((select id from public.assignment_groups where name = 'Pair'), '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f');
select public.respond_to_group_invite((select id from public.assignment_groups where name = 'Pair'), '00000000-0000-0000-0000-00000000000c', true);
select pg_temp.check_raises('a full group refuses one more',
  $$select public.respond_to_group_invite((select id from public.assignment_groups where name = 'Pair'), '00000000-0000-0000-0000-00000000000f', true)$$,
  'group_full');
select public.respond_to_group_invite((select id from public.assignment_groups where name = 'Pair'), '00000000-0000-0000-0000-00000000000f', false);
select pg_temp.check_raises('a declined invitation cannot be accepted later',
  $$select public.respond_to_group_invite((select id from public.assignment_groups where name = 'Pair'), '00000000-0000-0000-0000-00000000000f', true)$$,
  'no_invitation');

-- Scores wait for publishing.
insert into public.assignment_scores (submission_id, organization_id, criterion_key, ai_score)
select id, organization_id, 'quality', 8 from public.assignment_submissions where assignment_id = '50000000-0000-0000-0000-000000000001';

set role authenticated;
select pg_temp.check_raises('the browser cannot call the group functions',
  $$select public.create_assignment_group('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000f','Hack')$$,
  'permission denied');
select pg_temp.check_raises('the browser cannot submit directly',
  $$select * from public.submit_assignment_version('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','',null)$$,
  'permission denied');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000c'); -- Cy
select pg_temp.check_eq('a student sees the assignments of his course', (select count(*) from public.course_assignments), 3);
select pg_temp.check_eq('he sees his own and his groups'' submissions', (select count(*) from public.assignment_submissions), 2);
select pg_temp.check_eq('scores stay hidden until published', (select count(*) from public.assignment_scores), 0);
select pg_temp.check_raises('the browser writes nothing', $$update public.assignment_submissions set status = 'scored'$$, 'permission denied');

select pg_temp.act_as('00000000-0000-0000-0000-00000000000e'); -- Ed, in Cy's group
select pg_temp.check_eq('a group member sees the group submission only', (select count(*) from public.assignment_submissions), 1);
select pg_temp.check_eq('and its versions', (select count(*) from public.assignment_submission_versions), 1);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b'); -- Bob, other tenant
select pg_temp.check_eq('another organization sees no assignments', (select count(*) from public.course_assignments), 0);
select pg_temp.check_eq('nor groups', (select count(*) from public.assignment_groups), 0);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a'); -- Ana, owner
select pg_temp.check_eq('staff see every submission', (select count(*) from public.assignment_submissions), 2);
select pg_temp.check_eq('and every group', (select count(*) from public.assignment_groups), 2);

reset role;
update public.course_assignments set status = 'published' where id = '50000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check_eq('published scores reach the student', (select count(*) from public.assignment_scores), 1);

set role anon;
select pg_temp.act_as(null);
select pg_temp.check_raises('anon cannot read assignments', 'select count(*) from public.course_assignments', 'permission denied');
reset role;
\echo ALL COURSE ASSIGNMENT CHECKS PASSED
