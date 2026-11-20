-- Courses are their own product, apart from events.
--
-- A course (courses + course_members, from 20261117000004) has assignments. An assignment is open only to the students
-- on the course roster; there is no visibility, access code, allowlist or "join". It is individual or group:
--   individual  one submission per student
--   group       students form groups (they invite classmates from the roster; staff can move or assign people) and the
--               group submits once; groups close at group_lock_at (default: the due date) or at their first submission.
-- Submissions, versions, scores and feedback have their own tables. The judging and voice engines are shared with
-- events: the repository analysis cache (repo_analyses, file_summaries) is common, and interviews and integrity
-- decisions point at either an event submission or an assignment submission.
--
-- Events lose what 20261117000004 and 20261119000001 had added for courses (events.course_id, kind = 'assignment',
-- visibility = 'course', the roster triggers and the course_assignments view); any course event that exists is moved
-- here with its submissions, versions, scores, feedback, interviews and decisions.
--
-- 20261119000001_course_assignments (assignments stored as events) is already applied in production and stays as it
-- was; this migration starts from that state.

-- ---------------------------------------------------------------------------
-- Undo the first model (20261119000001): assignments as events
-- ---------------------------------------------------------------------------

drop view if exists public.course_assignments;
drop trigger if exists course_members_sync on public.course_members;
drop trigger if exists events_seed_assignment_roster on public.events;
drop trigger if exists event_allowlist_not_for_assignments on public.event_allowlist;
drop trigger if exists event_participants_by_roster on public.event_participants;
drop function if exists public.sync_course_roster();
drop function if exists public.seed_assignment_roster();
drop function if exists public.reject_assignment_allowlist();
drop function if exists public.reject_assignment_join();
alter table public.events drop constraint if exists events_assignment_shape;
drop index if exists public.events_kind_idx;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  -- What students should learn: given to the grader and the interviewer.
  learning_goals text not null default '' check (char_length(learning_goals) <= 2000),
  opens_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'judging', 'review', 'published')),
  mode text not null default 'individual' check (mode in ('individual', 'group')),
  group_min integer,
  group_max integer,
  -- Groups can no longer change after this moment; null = the due date.
  group_lock_at timestamptz,
  -- null = unlimited
  max_submissions integer check (max_submissions is null or max_submissions >= 1),
  interviews_enabled boolean not null default false,
  rubric_json jsonb not null,
  judging_paused_at timestamptz,
  judging_paused_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at > opens_at),
  check (
    (mode = 'individual' and group_min is null and group_max is null)
    or (mode = 'group' and group_min is not null and group_max is not null
        and group_min between 1 and 20 and group_max between group_min and 20)
  ),
  check (group_lock_at is null or mode = 'group')
);
create index course_assignments_course_idx on public.course_assignments (course_id);
create index course_assignments_org_idx on public.course_assignments (organization_id);
create index course_assignments_due_idx on public.course_assignments (due_at) where status = 'open';

create table public.assignment_groups (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.course_assignments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  -- Set at the first submission; after that only staff can change who is in the group.
  locked_at timestamptz,
  created_at timestamptz not null default now()
);
create index assignment_groups_assignment_idx on public.assignment_groups (assignment_id);

create table public.assignment_group_members (
  group_id uuid not null references public.assignment_groups (id) on delete cascade,
  assignment_id uuid not null references public.course_assignments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  invited_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
-- One accepted group per student and assignment.
create unique index assignment_group_one_per_student on public.assignment_group_members (assignment_id, user_id)
  where status = 'accepted';
create index assignment_group_members_user_idx on public.assignment_group_members (user_id);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.course_assignments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Exactly one: the student (individual) or the group (group).
  student_id uuid references public.profiles (id) on delete cascade,
  group_id uuid references public.assignment_groups (id) on delete cascade,
  -- Who uploaded the current version.
  submitted_by uuid references public.profiles (id) on delete set null,
  current_version_id uuid,
  versions_used integer not null default 0,
  locked_commit_sha text check (locked_commit_sha is null or locked_commit_sha ~ '^[0-9a-f]{40}$'),
  locked_at timestamptz,
  analysis_id uuid references public.repo_analyses (id) on delete set null,
  status text not null default 'submitted'
    check (status in ('submitted', 'queued', 'analyzing', 'scored', 'error', 'paused', 'canceled')),
  error text,
  activity_json jsonb not null default '[]'::jsonb,
  models_used text[] not null default '{}',
  judge_attempts integer not null default 0,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(student_id, group_id) = 1),
  unique (assignment_id, student_id),
  unique (assignment_id, group_id)
);
create index assignment_submissions_org_idx on public.assignment_submissions (organization_id);
create index assignment_submissions_queue_idx on public.assignment_submissions (status, next_attempt_at);

create table public.assignment_submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assignment_submissions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version_no integer not null,
  repo_id uuid not null references public.repos (id),
  description text not null default '',
  video_url text,
  submitted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (submission_id, version_no)
);
alter table public.assignment_submissions
  add constraint assignment_submissions_current_version_fk
  foreign key (current_version_id) references public.assignment_submission_versions (id) on delete set null;

create table public.assignment_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assignment_submissions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  criterion_key text not null,
  ai_score integer check (ai_score between 1 and 10),
  justification text not null default '',
  evidence_json jsonb not null default '[]',
  override_score integer check (override_score between 1 and 10),
  overridden_by uuid references public.profiles (id) on delete set null,
  overridden_at timestamptz,
  unique (submission_id, criterion_key)
);

create table public.assignment_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.assignment_submissions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  strengths_json jsonb not null default '[]',
  improvements_json jsonb not null default '[]',
  -- Formative feedback for courses: what to study next.
  next_steps_json jsonb not null default '[]'
);

-- In a group assignment everyone gets the group grade; staff may set a different total for one student.
create table public.assignment_grade_adjustments (
  assignment_id uuid not null references public.course_assignments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  adjusted_total numeric(4, 2) not null check (adjusted_total between 0 and 10),
  note text not null default '' check (char_length(note) <= 2000),
  adjusted_by uuid references public.profiles (id) on delete set null,
  adjusted_at timestamptz not null default now(),
  primary key (assignment_id, user_id)
);

create table public.assignment_similarity_flags (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.course_assignments (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  submission_a uuid not null references public.assignment_submissions (id) on delete cascade,
  submission_b uuid not null references public.assignment_submissions (id) on delete cascade,
  signal text not null check (signal in ('same_repo', 'same_fork_parent', 'identical_files', 'embedding')),
  score real not null,
  explanation text not null default '',
  created_at timestamptz not null default now(),
  check (submission_a < submission_b),
  unique (assignment_id, submission_a, submission_b, signal)
);

-- Shared engines: interviews and integrity decisions point at an event submission or an assignment submission.
alter table public.interviews
  add column assignment_submission_id uuid references public.assignment_submissions (id) on delete set null,
  add constraint interviews_one_target check (submission_id is null or assignment_submission_id is null);
create index interviews_assignment_submission_idx on public.interviews (assignment_submission_id);

alter table public.integrity_decisions
  alter column event_id drop not null,
  add column assignment_id uuid references public.course_assignments (id) on delete cascade,
  add column assignment_submission_id uuid references public.assignment_submissions (id) on delete cascade,
  add column assignment_flag_id uuid references public.assignment_similarity_flags (id) on delete cascade;
alter table public.integrity_decisions drop constraint if exists integrity_decisions_check;
alter table public.integrity_decisions add constraint integrity_decisions_scope check (
  (event_id is not null and assignment_id is null and assignment_submission_id is null and assignment_flag_id is null
    and (flag_id is not null or submission_id is not null))
  or (assignment_id is not null and event_id is null and flag_id is null and submission_id is null
    and (assignment_flag_id is not null or assignment_submission_id is not null))
);
create index integrity_decisions_assignment_idx on public.integrity_decisions (assignment_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Move course events that already exist, then take courses out of events
-- ---------------------------------------------------------------------------

insert into public.course_assignments (
  id, organization_id, course_id, title, instructions, opens_at, due_at, status, mode, max_submissions,
  interviews_enabled, rubric_json, judging_paused_at, judging_paused_by, closed_at, published_at, created_by, created_at
)
select e.id, e.organization_id, e.course_id, e.name, e.description, e.starts_at, e.submission_deadline, e.status,
  'individual', e.max_submissions, e.interviews_enabled, e.rubric_json, e.judging_paused_at, e.judging_paused_by,
  e.closed_at, e.published_at, e.created_by, e.created_at
from public.events e where e.course_id is not null;

insert into public.assignment_submissions (
  id, assignment_id, organization_id, student_id, submitted_by, versions_used, locked_commit_sha, locked_at, analysis_id,
  status, error, activity_json, models_used, judge_attempts, next_attempt_at, created_at, updated_at
)
select s.id, s.event_id, s.organization_id, s.submitted_by, s.submitted_by, s.versions_used, s.locked_commit_sha,
  s.locked_at, s.analysis_id, s.status, s.error, s.activity_json, s.models_used, s.judge_attempts, s.next_attempt_at,
  s.created_at, s.updated_at
from public.submissions s join public.events e on e.id = s.event_id where e.course_id is not null;

insert into public.assignment_submission_versions (id, submission_id, organization_id, version_no, repo_id, description, video_url, submitted_by, created_at)
select v.id, v.submission_id, v.organization_id, v.version_no, v.repo_id, v.description, v.video_url, s.submitted_by, v.created_at
from public.submission_versions v
join public.submissions s on s.id = v.submission_id
join public.events e on e.id = s.event_id
where e.course_id is not null;

update public.assignment_submissions a set current_version_id = s.current_version_id
from public.submissions s where s.id = a.id;

insert into public.assignment_scores (id, submission_id, organization_id, criterion_key, ai_score, justification, evidence_json, override_score, overridden_by, overridden_at)
select sc.id, sc.submission_id, sc.organization_id, sc.criterion_key, sc.ai_score, sc.justification, sc.evidence_json,
  sc.override_score, sc.overridden_by, sc.overridden_at
from public.scores sc where sc.submission_id in (select id from public.assignment_submissions);

insert into public.assignment_feedback (id, submission_id, organization_id, strengths_json, improvements_json)
select f.id, f.submission_id, f.organization_id, f.strengths_json, f.improvements_json
from public.feedback f where f.submission_id in (select id from public.assignment_submissions);

update public.interviews set assignment_submission_id = submission_id, submission_id = null
where submission_id in (select id from public.assignment_submissions);

-- Verdicts on one submission move with it; verdicts on a similarity pair of a course event go with the pair.
update public.integrity_decisions
set assignment_id = event_id, assignment_submission_id = submission_id, event_id = null, submission_id = null
where flag_id is null and event_id in (select id from public.course_assignments);
delete from public.integrity_decisions where flag_id is not null and event_id in (select id from public.course_assignments);

delete from public.events where course_id is not null;
update public.events set kind = 'hackathon' where kind <> 'hackathon';
-- Course access was the roster; whatever is left (should be nothing) goes back to invite-only.
update public.events set visibility = 'invite' where visibility = 'course';
delete from public.event_participants where joined_via = 'course';

alter table public.events drop column course_id;
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind = 'hackathon');
alter table public.events drop constraint if exists events_visibility_check;
alter table public.events add constraint events_visibility_check check (visibility in ('public', 'code', 'invite'));
alter table public.event_participants drop constraint if exists event_participants_joined_via_check;
alter table public.event_participants
  add constraint event_participants_joined_via_check check (joined_via in ('public', 'code', 'invite'));

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

/** The role the current user (or p_user) has on a course roster, or null. */
create function public.course_role(p_course uuid, p_user uuid default null)
returns text
language sql stable security definer set search_path = ''
as $$
  select cm.role from public.course_members cm
  where cm.course_id = p_course and cm.user_id = coalesce(p_user, (select auth.uid()));
$$;

-- A group member must be a student on the roster of the assignment's course. assignment_id and organization_id are
-- copied from the group, so they always agree.
create function public.check_group_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  a public.course_assignments;
begin
  select ca.* into a from public.course_assignments ca
  join public.assignment_groups g on g.assignment_id = ca.id
  where g.id = new.group_id;
  if a.id is null then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  if a.mode <> 'group' then raise exception 'not_a_group_assignment' using errcode = 'P0001'; end if;
  new.assignment_id := a.id;
  new.organization_id := a.organization_id;
  if public.course_role(a.course_id, new.user_id) is distinct from 'student' then
    raise exception 'not_on_roster' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger assignment_group_members_check before insert or update on public.assignment_group_members
  for each row execute function public.check_group_member();

-- A group never has more accepted members than the assignment allows.
create function public.check_group_size()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cap integer;
  n integer;
begin
  if new.status <> 'accepted' then return null; end if;
  select ca.group_max into cap from public.course_assignments ca where ca.id = new.assignment_id;
  select count(*) into n from public.assignment_group_members m where m.group_id = new.group_id and m.status = 'accepted';
  if n > cap then raise exception 'group_full' using errcode = 'P0001'; end if;
  return null;
end;
$$;
create trigger assignment_group_members_size after insert or update on public.assignment_group_members
  for each row execute function public.check_group_size();

/** True when groups of this assignment can no longer change (by students). */
create function public.groups_closed(a public.course_assignments, g public.assignment_groups)
returns boolean
language sql stable set search_path = ''
as $$
  select g.locked_at is not null or now() >= coalesce(a.group_lock_at, a.due_at) or a.status not in ('draft', 'open');
$$;

-- A student creates a group and is its first accepted member.
create function public.create_assignment_group(p_assignment uuid, p_user uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  a public.course_assignments;
  gid uuid;
begin
  select * into a from public.course_assignments where id = p_assignment;
  if a.id is null or a.status = 'draft' then raise exception 'assignment_not_found' using errcode = 'P0001'; end if;
  if a.mode <> 'group' then raise exception 'not_a_group_assignment' using errcode = 'P0001'; end if;
  if now() >= coalesce(a.group_lock_at, a.due_at) or a.status <> 'open' then raise exception 'groups_closed' using errcode = 'P0001'; end if;
  if public.course_role(a.course_id, p_user) is distinct from 'student' then raise exception 'not_on_roster' using errcode = 'P0001'; end if;
  if exists (select 1 from public.assignment_group_members where assignment_id = a.id and user_id = p_user and status = 'accepted') then
    raise exception 'already_in_group' using errcode = 'P0001';
  end if;
  insert into public.assignment_groups (assignment_id, organization_id, name, created_by)
  values (a.id, a.organization_id, p_name, p_user) returning id into gid;
  insert into public.assignment_group_members (group_id, assignment_id, organization_id, user_id, status, invited_by, responded_at)
  values (gid, a.id, a.organization_id, p_user, 'accepted', p_user, now());
  return gid;
end;
$$;

-- An accepted member invites a classmate who has no group yet.
create function public.invite_to_group(p_group uuid, p_by uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.assignment_groups;
  a public.course_assignments;
begin
  select * into g from public.assignment_groups where id = p_group for update;
  if g.id is null then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  select * into a from public.course_assignments where id = g.assignment_id;
  if public.groups_closed(a, g) then raise exception 'groups_closed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.assignment_group_members where group_id = g.id and user_id = p_by and status = 'accepted') then
    raise exception 'not_in_group' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.assignment_group_members where assignment_id = a.id and user_id = p_user and status = 'accepted') then
    raise exception 'already_in_group' using errcode = 'P0001';
  end if;
  insert into public.assignment_group_members (group_id, assignment_id, organization_id, user_id, status, invited_by)
  values (g.id, a.id, a.organization_id, p_user, 'invited', p_by)
  on conflict (group_id, user_id) do update set status = 'invited', invited_by = p_by, responded_at = null;
end;
$$;

-- The invited student accepts (atomically: the group row is locked while the size is checked) or declines.
create function public.respond_to_group_invite(p_group uuid, p_user uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.assignment_groups;
  a public.course_assignments;
begin
  select * into g from public.assignment_groups where id = p_group for update;
  if g.id is null then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  select * into a from public.course_assignments where id = g.assignment_id;
  if not exists (select 1 from public.assignment_group_members where group_id = g.id and user_id = p_user and status = 'invited') then
    raise exception 'no_invitation' using errcode = 'P0001';
  end if;
  if p_accept then
    if public.groups_closed(a, g) then raise exception 'groups_closed' using errcode = 'P0001'; end if;
    if exists (select 1 from public.assignment_group_members where assignment_id = a.id and user_id = p_user and status = 'accepted') then
      raise exception 'already_in_group' using errcode = 'P0001';
    end if;
  end if;
  update public.assignment_group_members
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where group_id = g.id and user_id = p_user;
end;
$$;

-- A student leaves a group that is still open; an empty group is removed.
create function public.leave_group(p_group uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.assignment_groups;
  a public.course_assignments;
begin
  select * into g from public.assignment_groups where id = p_group for update;
  if g.id is null then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  select * into a from public.course_assignments where id = g.assignment_id;
  if public.groups_closed(a, g) then raise exception 'groups_closed' using errcode = 'P0001'; end if;
  delete from public.assignment_group_members where group_id = g.id and user_id = p_user;
  if not exists (select 1 from public.assignment_group_members where group_id = g.id and status = 'accepted') then
    delete from public.assignment_groups where id = g.id;
  end if;
end;
$$;

-- Staff place a student in a group at any time (after the lock too): their other accepted membership in the
-- assignment ends. The size limit still applies.
create function public.staff_place_in_group(p_group uuid, p_user uuid, p_by uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.assignment_groups;
begin
  select * into g from public.assignment_groups where id = p_group for update;
  if g.id is null then raise exception 'group_not_found' using errcode = 'P0001'; end if;
  delete from public.assignment_group_members where assignment_id = g.assignment_id and user_id = p_user and group_id <> g.id;
  insert into public.assignment_group_members (group_id, assignment_id, organization_id, user_id, status, invited_by, responded_at)
  values (g.id, g.assignment_id, g.organization_id, p_user, 'accepted', p_by, now())
  on conflict (group_id, user_id) do update set status = 'accepted', invited_by = p_by, responded_at = now();
end;
$$;

-- One new version of a submission, atomically: roster, group, dates and version limit are checked under a row lock.
create function public.submit_assignment_version(
  p_assignment uuid,
  p_user uuid,
  p_repo uuid,
  p_description text,
  p_video_url text
)
returns table (submission_id uuid, version_id uuid, version_no integer, versions_used integer)
language plpgsql security definer set search_path = ''
as $$
declare
  a public.course_assignments;
  gid uuid;
  sub public.assignment_submissions;
  vid uuid;
  members integer;
begin
  select * into a from public.course_assignments where id = p_assignment;
  if a.id is null or a.status = 'draft' then raise exception 'assignment_not_found' using errcode = 'P0001'; end if;
  if public.course_role(a.course_id, p_user) is distinct from 'student' then raise exception 'not_on_roster' using errcode = 'P0001'; end if;
  if a.status <> 'open' or now() >= a.due_at then raise exception 'assignment_closed' using errcode = 'P0001'; end if;
  if now() < a.opens_at then raise exception 'assignment_not_started' using errcode = 'P0001'; end if;

  if a.mode = 'group' then
    select m.group_id into gid from public.assignment_group_members m
    where m.assignment_id = a.id and m.user_id = p_user and m.status = 'accepted';
    if gid is null then raise exception 'no_group' using errcode = 'P0001'; end if;
    perform 1 from public.assignment_groups where id = gid for update;
    select count(*) into members from public.assignment_group_members where group_id = gid and status = 'accepted';
    if members < a.group_min then raise exception 'group_too_small' using errcode = 'P0001'; end if;
    insert into public.assignment_submissions (assignment_id, organization_id, group_id, submitted_by)
    values (a.id, a.organization_id, gid, p_user) on conflict (assignment_id, group_id) do nothing;
    select * into sub from public.assignment_submissions where assignment_id = a.id and group_id = gid for update;
    update public.assignment_groups set locked_at = coalesce(locked_at, now()) where id = gid;
  else
    insert into public.assignment_submissions (assignment_id, organization_id, student_id, submitted_by)
    values (a.id, a.organization_id, p_user, p_user) on conflict (assignment_id, student_id) do nothing;
    select * into sub from public.assignment_submissions where assignment_id = a.id and student_id = p_user for update;
  end if;

  if a.max_submissions is not null and sub.versions_used >= a.max_submissions then
    raise exception 'submission_limit_reached' using errcode = 'P0001';
  end if;

  insert into public.assignment_submission_versions (submission_id, organization_id, version_no, repo_id, description, video_url, submitted_by)
  values (sub.id, a.organization_id, sub.versions_used + 1, p_repo, coalesce(p_description, ''), p_video_url, p_user)
  returning id into vid;
  update public.assignment_submissions
  set current_version_id = vid, versions_used = sub.versions_used + 1, submitted_by = p_user, status = 'submitted',
      error = null, updated_at = now()
  where id = sub.id;

  return query select sub.id, vid, sub.versions_used + 1, sub.versions_used + 1;
end;
$$;

-- These take the acting user as a parameter: only the API (service role) may call them.
revoke execute on function public.create_assignment_group(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.invite_to_group(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.respond_to_group_invite(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.leave_group(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.staff_place_in_group(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.submit_assignment_version(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.check_group_member() from public, anon, authenticated;
revoke execute on function public.check_group_size() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: staff of the organization see everything; students see their course, their group and
-- their own work; scores and feedback reach them only once the assignment is published. The browser writes nothing.
-- ---------------------------------------------------------------------------

/** The current user's submission: their own, or their accepted group's. */
create function public.is_my_assignment_submission(sub uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignment_submissions s
    where s.id = sub and (
      s.student_id = (select auth.uid())
      or exists (select 1 from public.assignment_group_members m where m.group_id = s.group_id and m.user_id = (select auth.uid()) and m.status = 'accepted')
    )
  );
$$;

create function public.assignment_results_visible(sub uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_my_assignment_submission(sub) and exists (
    select 1 from public.assignment_submissions s join public.course_assignments a on a.id = s.assignment_id
    where s.id = sub and a.status = 'published'
  );
$$;

create function public.is_group_member(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.assignment_group_members m where m.group_id = p_group and m.user_id = (select auth.uid()) and m.status <> 'declined');
$$;

alter table public.course_assignments enable row level security;
alter table public.assignment_groups enable row level security;
alter table public.assignment_group_members enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.assignment_submission_versions enable row level security;
alter table public.assignment_scores enable row level security;
alter table public.assignment_feedback enable row level security;
alter table public.assignment_grade_adjustments enable row level security;
alter table public.assignment_similarity_flags enable row level security;

revoke insert, update, delete, truncate on public.course_assignments, public.assignment_groups,
  public.assignment_group_members, public.assignment_submissions, public.assignment_submission_versions,
  public.assignment_scores, public.assignment_feedback, public.assignment_grade_adjustments,
  public.assignment_similarity_flags from anon, authenticated;
revoke select on public.course_assignments, public.assignment_groups, public.assignment_group_members,
  public.assignment_submissions, public.assignment_submission_versions, public.assignment_scores,
  public.assignment_feedback, public.assignment_grade_adjustments, public.assignment_similarity_flags from anon;
grant select on public.course_assignments, public.assignment_groups, public.assignment_group_members,
  public.assignment_submissions, public.assignment_submission_versions, public.assignment_scores,
  public.assignment_feedback, public.assignment_grade_adjustments, public.assignment_similarity_flags to authenticated;

create policy course_assignments_select on public.course_assignments for select to authenticated
  using (public.is_org_member(organization_id) or (status <> 'draft' and public.course_role(course_id) = 'student'));

create policy assignment_groups_select on public.assignment_groups for select to authenticated
  using (public.is_org_member(organization_id) or public.is_group_member(id));

create policy assignment_group_members_select on public.assignment_group_members for select to authenticated
  using (public.is_org_member(organization_id) or user_id = (select auth.uid()) or public.is_group_member(group_id));

create policy assignment_submissions_select on public.assignment_submissions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_my_assignment_submission(id));

create policy assignment_submission_versions_select on public.assignment_submission_versions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_my_assignment_submission(submission_id));

create policy assignment_scores_select on public.assignment_scores for select to authenticated
  using (public.is_org_member(organization_id) or public.assignment_results_visible(submission_id));

create policy assignment_feedback_select on public.assignment_feedback for select to authenticated
  using (public.is_org_member(organization_id) or public.assignment_results_visible(submission_id));

create policy assignment_grade_adjustments_select on public.assignment_grade_adjustments for select to authenticated
  using (
    public.is_org_member(organization_id)
    or (user_id = (select auth.uid()) and exists (select 1 from public.course_assignments a where a.id = assignment_id and a.status = 'published'))
  );

create policy assignment_similarity_flags_select on public.assignment_similarity_flags for select to authenticated
  using (public.is_org_member(organization_id));

-- The integrity verdicts policy (20261117000004) is by organization and covers both scopes.
