-- Data behind the organizer suite, judge workspace, similarity forensics, course mode and account settings.
--
-- Write model as before: the browser reads through RLS, every write goes through the API (service role).
-- Every tenant table carries organization_id.

-- ---------------------------------------------------------------------------
-- Roles and permissions
-- ---------------------------------------------------------------------------

insert into public.roles (key, scope, name, description) values
  ('auditor', 'organization', 'Auditor', 'Reads the audit trail and usage, and records integrity decisions');

insert into public.permissions (key, description) values
  ('org.view_usage', 'See AI usage, seats and plan of the organization'),
  ('audit.read', 'Read the audit trail of the organization'),
  ('integrity.decide', 'Record decisions on similarity flags and academic integrity'),
  ('submission.review', 'Score assigned submissions as a judge'),
  ('course.manage', 'Create courses and manage their rosters');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (values
  ('org_owner', 'org.view_usage'), ('org_owner', 'audit.read'), ('org_owner', 'integrity.decide'),
  ('org_owner', 'submission.review'), ('org_owner', 'course.manage'),
  ('organizer', 'org.view_usage'), ('organizer', 'integrity.decide'), ('organizer', 'submission.review'),
  ('organizer', 'course.manage'),
  ('judge', 'submission.review'),
  ('auditor', 'org.view_usage'), ('auditor', 'audit.read'), ('auditor', 'integrity.decide')
) as v(role_key, perm_key)
join public.roles r on r.key = v.role_key
join public.permissions p on p.key = v.perm_key;

-- ---------------------------------------------------------------------------
-- Organization settings, seats and invitations
-- ---------------------------------------------------------------------------

alter table public.organizations
  -- Members allowed by the plan. Billing itself is not built: this is the number the settings page shows.
  add column seat_limit integer not null default 10 check (seat_limit between 1 and 10000),
  -- Policies shown under "Security enclave": { "require_oral_defense": bool, "retention_days": int, ... }
  add column settings_json jsonb not null default '{}';

create table public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%@%'),
  role_key text not null check (role_key in ('org_owner', 'organizer', 'judge', 'auditor')),
  -- sha256 of the token sent by email. The token itself is never stored.
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);
create index org_invitations_org_idx on public.org_invitations (organization_id);
create unique index org_invitations_open_idx on public.org_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

-- Who did what, for the audit trail export: score overrides, freezes, publishing, member changes, decisions.
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) between 3 and 60),
  subject_type text not null,
  subject_id uuid,
  detail_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Judge workspace
-- ---------------------------------------------------------------------------

create table public.judge_assignments (
  submission_id uuid not null references public.submissions (id) on delete cascade,
  judge_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (submission_id, judge_id)
);
create index judge_assignments_judge_idx on public.judge_assignments (judge_id, event_id);

-- A judge's own scores for one submission, kept apart from the AI scores and the final override.
create table public.judge_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  judge_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- [{ "criterion_key": text, "score": 1-10, "note": text }]
  scores_json jsonb not null default '[]',
  note text not null default '' check (char_length(note) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  updated_at timestamptz not null default now(),
  unique (submission_id, judge_id)
);
create index judge_reviews_org_idx on public.judge_reviews (organization_id);

-- ---------------------------------------------------------------------------
-- Similarity forensics and integrity decisions
-- ---------------------------------------------------------------------------

-- Matching code between the two submissions of a flag. Filled by a future file comparison step.
create table public.similarity_matches (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.similarity_flags (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  path_a text not null,
  start_a integer not null check (start_a > 0),
  end_a integer not null check (end_a >= start_a),
  path_b text not null,
  start_b integer not null check (start_b > 0),
  end_b integer not null check (end_b >= start_b),
  score numeric(4, 3) not null check (score between 0 and 1),
  created_at timestamptz not null default now()
);
create index similarity_matches_flag_idx on public.similarity_matches (flag_id);

-- A reviewer's determination on a similarity flag (the pair) or on one submission (course mode). Kept as history.
create table public.integrity_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  flag_id uuid references public.similarity_flags (id) on delete cascade,
  submission_id uuid references public.submissions (id) on delete cascade,
  verdict text not null check (verdict in (
    -- on a pair
    'direct_plagiarism', 'collusion', 'starter_template', 'independent_invention',
    -- on one submission
    'clear', 'live_defense', 'code_of_conduct'
  )),
  note text not null default '' check (char_length(note) <= 4000),
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (flag_id is not null or submission_id is not null)
);
create index integrity_decisions_event_idx on public.integrity_decisions (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Teacher and course mode: an assignment is an event with kind = 'assignment' and a course
-- ---------------------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  code text not null default '' check (char_length(code) <= 40),
  term text not null default '' check (char_length(term) <= 40),
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index courses_org_idx on public.courses (organization_id);

create table public.course_members (
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role text not null default 'student' check (role in ('instructor', 'ta', 'student')),
  section text not null default '' check (char_length(section) <= 40),
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);
create index course_members_user_idx on public.course_members (user_id);

alter table public.events add column course_id uuid references public.courses (id) on delete set null;
create index events_course_idx on public.events (course_id);
-- events has column-level select for browsers (the access code hash is hidden): add the new column.
grant select (course_id) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Account settings
-- ---------------------------------------------------------------------------

alter table public.public_profiles
  -- When false, the public profile shows skills and scores without the candidate's transcript quotes.
  add column show_quotes boolean not null default true;

alter table public.profiles
  -- Email when results of an event the user joined are published (sending is not built yet).
  add column notify_results boolean not null default true;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.org_invitations enable row level security;
alter table public.audit_log enable row level security;
alter table public.judge_assignments enable row level security;
alter table public.judge_reviews enable row level security;
alter table public.similarity_matches enable row level security;
alter table public.integrity_decisions enable row level security;
alter table public.courses enable row level security;
alter table public.course_members enable row level security;

revoke insert, update, delete, truncate on public.org_invitations, public.audit_log, public.judge_assignments,
  public.judge_reviews, public.similarity_matches, public.integrity_decisions, public.courses, public.course_members
  from anon, authenticated;
revoke select on public.org_invitations, public.audit_log, public.judge_assignments, public.judge_reviews,
  public.similarity_matches, public.integrity_decisions, public.courses, public.course_members from anon;
-- The token hash is never readable from the browser.
revoke select on public.org_invitations from authenticated;
grant select (id, organization_id, email, role_key, invited_by, created_at, expires_at, accepted_at, revoked_at)
  on public.org_invitations to authenticated;

create policy org_invitations_select on public.org_invitations for select to authenticated
  using (public.has_permission('org.manage_members', organization_id));

create policy audit_log_select on public.audit_log for select to authenticated
  using (public.has_permission('audit.read', organization_id));

-- A judge sees their own assignments and reviews; organizers see all of the organization's.
create policy judge_assignments_select on public.judge_assignments for select to authenticated
  using (judge_id = (select auth.uid()) or public.has_permission('event.manage', organization_id));

create policy judge_reviews_select on public.judge_reviews for select to authenticated
  using (judge_id = (select auth.uid()) or public.has_permission('event.manage', organization_id));

create policy similarity_matches_select on public.similarity_matches for select to authenticated
  using (public.is_org_member(organization_id));

create policy integrity_decisions_select on public.integrity_decisions for select to authenticated
  using (public.has_permission('integrity.decide', organization_id) or public.has_permission('event.manage', organization_id));

create policy courses_select on public.courses for select to authenticated
  using (
    public.is_org_member(organization_id)
    or exists (select 1 from public.course_members cm where cm.course_id = id and cm.user_id = (select auth.uid()))
  );

create policy course_members_select on public.course_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member(organization_id));

-- Course rosters are added by email. Emails live in auth.users, which only the API may look up.
create function public.user_ids_by_email(emails text[])
returns table (email text, user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select lower(u.email)::text, u.id from auth.users u where lower(u.email) = any (select lower(e) from unnest(emails) e);
$$;
revoke execute on function public.user_ids_by_email(text[]) from public, anon, authenticated;
grant execute on function public.user_ids_by_email(text[]) to service_role;
