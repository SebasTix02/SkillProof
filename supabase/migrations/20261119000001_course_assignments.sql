-- Course assignments are not events.
--
-- An assignment belongs to one course and is only for the students on that course's roster: it has no public link,
-- access code or allowlist, and nobody "joins" it. It is stored in public.events, because the judging engine
-- (commit freeze, analysis, scoring, feedback, similarity, interviews, judge reviews, pause/cancel, audit) is keyed on
-- events.id in every table; a second table would need an "event or assignment" column in all of them. What makes it a
-- different thing is enforced here:
--   * kind = 'assignment' if and only if it has a course, and then visibility = 'course' (no access code, no allowlist);
--   * its participants are exactly the course's students, kept in sync by triggers (adding a student to the roster
--     gives access to every assignment of the course; removing them takes it away);
--   * nobody can be added to its allowlist;
--   * public.course_assignments is the view of assignments with their own names (title, instructions, opens_at, due_at).
-- The API exposes assignments only under /api/courses/:id/assignments, and event lists leave them out.

-- 1. Data already in place: an "assignment" without a course becomes a hackathon; a course event becomes an assignment.
update public.events set kind = 'hackathon' where kind = 'assignment' and course_id is null;
update public.events set kind = 'assignment' where course_id is not null;

alter table public.events drop constraint if exists events_visibility_check;
alter table public.events add constraint events_visibility_check check (visibility in ('public', 'code', 'invite', 'course'));
update public.events set visibility = 'course', access_code_hash = null where kind = 'assignment';
delete from public.event_allowlist a using public.events e where a.event_id = e.id and e.kind = 'assignment';

-- An assignment cannot outlive its course (courses are archived, not deleted, in the app).
alter table public.events drop constraint if exists events_course_id_fkey;
alter table public.events
  add constraint events_course_id_fkey foreign key (course_id) references public.courses (id) on delete cascade;

alter table public.events add constraint events_assignment_shape check (
  (kind = 'assignment') = (course_id is not null)
  and (kind = 'assignment') = (visibility = 'course')
);

-- 2. Participants of an assignment = the students of its course.
alter table public.event_participants drop constraint if exists event_participants_joined_via_check;
alter table public.event_participants
  add constraint event_participants_joined_via_check check (joined_via in ('public', 'code', 'invite', 'course'));

delete from public.event_participants ep
using public.events e
where ep.event_id = e.id and e.kind = 'assignment'
  and not exists (
    select 1 from public.course_members cm where cm.course_id = e.course_id and cm.user_id = ep.user_id and cm.role = 'student'
  );
insert into public.event_participants (event_id, organization_id, user_id, joined_via)
select e.id, e.organization_id, cm.user_id, 'course'
from public.events e join public.course_members cm on cm.course_id = e.course_id and cm.role = 'student'
where e.kind = 'assignment'
on conflict (event_id, user_id) do nothing;

-- A roster change gives or takes access to every assignment of the course.
create function public.sync_course_roster()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    delete from public.event_participants ep
    using public.events e
    where ep.event_id = e.id and e.course_id = old.course_id and ep.user_id = old.user_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.role = 'student' then
    insert into public.event_participants (event_id, organization_id, user_id, joined_via)
    select e.id, e.organization_id, new.user_id, 'course'
    from public.events e where e.course_id = new.course_id
    on conflict (event_id, user_id) do nothing;
  end if;
  return null;
end;
$$;
create trigger course_members_sync after insert or update or delete on public.course_members
  for each row execute function public.sync_course_roster();

-- A new assignment starts with the whole roster.
create function public.seed_assignment_roster()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'assignment' then
    insert into public.event_participants (event_id, organization_id, user_id, joined_via)
    select new.id, new.organization_id, cm.user_id, 'course'
    from public.course_members cm where cm.course_id = new.course_id and cm.role = 'student'
    on conflict (event_id, user_id) do nothing;
  end if;
  return null;
end;
$$;
create trigger events_seed_assignment_roster after insert on public.events
  for each row execute function public.seed_assignment_roster();

-- 3. No allowlist and no other way in.
create function public.reject_assignment_allowlist()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.events e where e.id = new.event_id and e.kind = 'assignment') then
    raise exception 'assignment_access_is_the_roster' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger event_allowlist_not_for_assignments before insert or update on public.event_allowlist
  for each row execute function public.reject_assignment_allowlist();

create function public.reject_assignment_join()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.joined_via <> 'course' and exists (select 1 from public.events e where e.id = new.event_id and e.kind = 'assignment') then
    raise exception 'assignment_access_is_the_roster' using errcode = 'P0001';
  end if;
  if new.joined_via = 'course' and exists (select 1 from public.events e where e.id = new.event_id and e.kind <> 'assignment') then
    raise exception 'course_access_is_for_assignments' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger event_participants_by_roster before insert or update on public.event_participants
  for each row execute function public.reject_assignment_join();

-- 4. The assignment, with its own names. Reads go through the events policies (security invoker).
create view public.course_assignments with (security_invoker = true) as
select
  id, organization_id, course_id, name as title, description as instructions, slug,
  starts_at as opens_at, submission_deadline as due_at, interviews_enabled, max_submissions, rubric_json,
  status, closed_at, published_at, created_at
from public.events
where kind = 'assignment';
revoke all on public.course_assignments from anon;
grant select on public.course_assignments to authenticated;

create index events_kind_idx on public.events (organization_id, kind);
