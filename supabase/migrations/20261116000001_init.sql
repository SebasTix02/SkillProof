-- SkillProof: multi-tenant schema, roles and permissions, row level security.
--
-- Tenancy model
--   * organizations are the tenants. Every tenant-owned row carries organization_id.
--   * students are global users: they join events of many organizations and own
--     their interviews and public profile.
--   * repos and repo_analyses are a shared cache of public GitHub data.
--
-- Write model
--   The browser only reads through RLS. Every write to tenant data goes through the
--   API (service role), because the rules that matter (deadlines, submission limits,
--   access codes) cannot be expressed as row policies.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  github_login text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  plan text not null default 'free' check (plan in ('free', 'event', 'campus')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  scope text not null check (scope in ('global', 'organization')),
  name text not null,
  description text not null default ''
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null default ''
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  -- null for global roles (student, platform_admin)
  organization_id uuid references public.organizations (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  unique nulls not distinct (user_id, role_id, organization_id)
);
create index user_roles_user_idx on public.user_roles (user_id);
create index user_roles_org_idx on public.user_roles (organization_id);

create table public.public_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  is_public boolean not null default false,
  headline text not null default '' check (char_length(headline) <= 160)
);

-- ---------------------------------------------------------------------------
-- Shared cache of public repository data
-- ---------------------------------------------------------------------------

create table public.repos (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  name text not null,
  url text not null,
  default_branch text,
  is_fork boolean not null default false,
  fork_parent text,
  created_at timestamptz not null default now()
);
create unique index repos_owner_name_idx on public.repos (lower(owner), lower(name));

create table public.repo_analyses (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos (id) on delete cascade,
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  model text not null,
  map_json jsonb not null,
  -- text of each interview hook, so an interview never needs the repo again
  hooks_json jsonb not null default '[]',
  commit_profile_json jsonb,
  file_count integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  unique (repo_id, commit_sha)
);

-- ---------------------------------------------------------------------------
-- Events (tenant)
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'hackathon' check (kind in ('hackathon', 'assignment')),
  name text not null check (char_length(name) between 3 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  description text not null default '',
  starts_at timestamptz not null,
  submission_deadline timestamptz not null,
  visibility text not null check (visibility in ('public', 'code', 'invite')),
  access_code_hash text,
  interviews_enabled boolean not null default false,
  -- null = unlimited
  max_submissions integer check (max_submissions is null or max_submissions >= 1),
  rubric_json jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'judging', 'review', 'published')),
  closed_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (submission_deadline > starts_at),
  check (visibility <> 'code' or access_code_hash is not null)
);
create index events_org_idx on public.events (organization_id);
create index events_due_idx on public.events (submission_deadline) where status = 'open';

create table public.event_allowlist (
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  added_by uuid references public.profiles (id) on delete set null,
  claimed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, email)
);
create index event_allowlist_org_idx on public.event_allowlist (organization_id);

create table public.event_participants (
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_via text not null check (joined_via in ('public', 'code', 'invite')),
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_participants_user_idx on public.event_participants (user_id);
create index event_participants_org_idx on public.event_participants (organization_id);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  team_name text not null check (char_length(team_name) between 1 and 80),
  current_version_id uuid,
  versions_used integer not null default 0,
  -- HEAD of the default branch at the moment the event closed; judging only sees this
  locked_commit_sha text check (locked_commit_sha is null or locked_commit_sha ~ '^[0-9a-f]{40}$'),
  locked_at timestamptz,
  analysis_id uuid references public.repo_analyses (id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'queued', 'analyzing', 'scored', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, submitted_by)
);
create index submissions_org_idx on public.submissions (organization_id);
create index submissions_event_idx on public.submissions (event_id);

create table public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version_no integer not null,
  repo_id uuid not null references public.repos (id),
  description text not null default '',
  video_url text,
  slides_url text,
  created_at timestamptz not null default now(),
  unique (submission_id, version_no)
);
create index submission_versions_org_idx on public.submission_versions (organization_id);

alter table public.submissions
  add constraint submissions_current_version_fk
  foreign key (current_version_id) references public.submission_versions (id) on delete set null;

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
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
create index scores_org_idx on public.scores (organization_id);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  strengths_json jsonb not null default '[]',
  improvements_json jsonb not null default '[]'
);
create index feedback_org_idx on public.feedback (organization_id);

create table public.similarity_flags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  submission_a uuid not null references public.submissions (id) on delete cascade,
  submission_b uuid not null references public.submissions (id) on delete cascade,
  signal text not null check (signal in ('same_repo', 'same_fork_parent', 'identical_files', 'embedding')),
  score real not null,
  explanation text not null default '',
  created_at timestamptz not null default now(),
  check (submission_a < submission_b),
  unique (event_id, submission_a, submission_b, signal)
);
create index similarity_flags_org_idx on public.similarity_flags (organization_id);

create table public.usage_log (
  id bigint generated always as identity primary key,
  -- null when the usage belongs to a personal interview
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index usage_log_org_idx on public.usage_log (organization_id, created_at);

-- ---------------------------------------------------------------------------
-- Interviews (owned by the user)
-- ---------------------------------------------------------------------------

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  repo_id uuid not null references public.repos (id),
  analysis_id uuid references public.repo_analyses (id) on delete set null,
  -- both null for a personal interview
  submission_id uuid references public.submissions (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  transcript_json jsonb,
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'in_progress', 'evaluating', 'completed', 'error')),
  error text,
  started_at timestamptz,
  duration_s integer,
  created_at timestamptz not null default now()
);
create index interviews_user_idx on public.interviews (user_id);
create index interviews_submission_idx on public.interviews (submission_id);

-- The question plan holds the expected answers, so it is never readable from the browser.
create table public.interview_plans (
  interview_id uuid primary key references public.interviews (id) on delete cascade,
  plan_json jsonb not null
);

create table public.interview_reports (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.interviews (id) on delete cascade,
  skills_json jsonb not null,
  ownership_score integer not null check (ownership_score between 0 and 100),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  summary text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Permission helpers (used by the policies below and by the API)
-- ---------------------------------------------------------------------------

create function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.organization_id = org
  );
$$;

-- True when the current user holds `perm` globally, or inside organization `org`.
create function public.has_permission(perm text, org uuid default null)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    left join public.role_permissions rp on rp.role_id = r.id
    left join public.permissions p on p.id = rp.permission_id
    where ur.user_id = (select auth.uid())
      and (
        (r.key = 'platform_admin' and ur.organization_id is null)
        or (
          p.key = perm
          and (
            (r.scope = 'global' and ur.organization_id is null)
            or (r.scope = 'organization' and org is not null and ur.organization_id = org)
          )
        )
      )
  );
$$;

create function public.is_event_participant(ev uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.event_participants ep
    where ep.event_id = ev and ep.user_id = (select auth.uid())
  );
$$;

create function public.owns_submission(sub uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.submissions s
    where s.id = sub and s.submitted_by = (select auth.uid())
  );
$$;

create function public.submission_results_visible(sub uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.submissions s
    join public.events e on e.id = s.event_id
    where s.id = sub and s.submitted_by = (select auth.uid()) and e.status = 'published'
  );
$$;

create function public.report_visible(p_interview uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.interviews i
    where i.id = p_interview
      and (
        i.user_id = (select auth.uid())
        or (i.organization_id is not null and public.is_org_member(i.organization_id))
        or exists (select 1 from public.public_profiles pp where pp.user_id = i.user_id and pp.is_public)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Sign-up: profile, global student role, and an organization for organizers
-- ---------------------------------------------------------------------------

create function public.slugify(value text)
returns text
language sql immutable set search_path = ''
as $$
  select coalesce(
    nullif(left(trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g')), 40), ''),
    'user'
  );
$$;

create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := left(coalesce(nullif(trim(meta ->> 'display_name'), ''), split_part(new.email, '@', 1), 'User'), 80);
  v_suffix text := left(replace(new.id::text, '-', ''), 6);
  v_org uuid;
begin
  insert into public.profiles (id, display_name) values (new.id, v_name);

  insert into public.public_profiles (user_id, slug)
  values (new.id, public.slugify(v_name) || '-' || v_suffix);

  insert into public.user_roles (user_id, role_id)
  select new.id, r.id from public.roles r where r.key = 'student';

  -- Only these two account types exist at sign-up. platform_admin is never granted here.
  if meta ->> 'account_type' = 'organizer' then
    insert into public.organizations (name, slug, created_by)
    values (
      left(coalesce(nullif(trim(meta ->> 'organization_name'), ''), v_name || '''s organization'), 120),
      public.slugify(coalesce(nullif(trim(meta ->> 'organization_name'), ''), v_name)) || '-' || v_suffix,
      new.id
    )
    returning id into v_org;

    insert into public.user_roles (user_id, role_id, organization_id)
    select new.id, r.id, v_org from public.roles r where r.key = 'org_owner';
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Submitting a version: one transaction, so the limit and the deadline cannot be raced
-- ---------------------------------------------------------------------------

create function public.submit_version(
  p_event uuid,
  p_user uuid,
  p_team_name text,
  p_repo uuid,
  p_description text,
  p_video_url text,
  p_slides_url text
)
returns table (submission_id uuid, version_id uuid, version_no integer, versions_used integer)
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events%rowtype;
  sub public.submissions%rowtype;
  v_version uuid;
begin
  select * into ev from public.events e where e.id = p_event for share;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if ev.status <> 'open' or now() >= ev.submission_deadline then
    raise exception 'event_closed' using errcode = 'P0001';
  end if;
  if now() < ev.starts_at then raise exception 'event_not_started' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.event_participants ep where ep.event_id = p_event and ep.user_id = p_user) then
    raise exception 'not_a_participant' using errcode = 'P0001';
  end if;

  insert into public.submissions (event_id, organization_id, submitted_by, team_name)
  values (p_event, ev.organization_id, p_user, p_team_name)
  on conflict (event_id, submitted_by) do nothing;

  select * into sub from public.submissions s
  where s.event_id = p_event and s.submitted_by = p_user for update;

  if ev.max_submissions is not null and sub.versions_used >= ev.max_submissions then
    raise exception 'submission_limit_reached' using errcode = 'P0001';
  end if;

  insert into public.submission_versions (submission_id, organization_id, version_no, repo_id, description, video_url, slides_url)
  values (sub.id, ev.organization_id, sub.versions_used + 1, p_repo, coalesce(p_description, ''), p_video_url, p_slides_url)
  returning id into v_version;

  update public.submissions s
  set team_name = p_team_name, current_version_id = v_version, versions_used = sub.versions_used + 1,
      status = 'submitted', error = null, updated_at = now()
  where s.id = sub.id;

  return query select sub.id, v_version, sub.versions_used + 1, sub.versions_used + 1;
end;
$$;

revoke execute on function public.submit_version(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.submit_version(uuid, uuid, text, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.public_profiles enable row level security;
alter table public.repos enable row level security;
alter table public.repo_analyses enable row level security;
alter table public.events enable row level security;
alter table public.event_allowlist enable row level security;
alter table public.event_participants enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_versions enable row level security;
alter table public.scores enable row level security;
alter table public.feedback enable row level security;
alter table public.similarity_flags enable row level security;
alter table public.usage_log enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_plans enable row level security;
alter table public.interview_reports enable row level security;

-- The browser never writes tenant data directly.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke select on all tables in schema public from anon;

-- Identity
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update (display_name, github_login, avatar_url) on public.profiles to authenticated;

create policy organizations_select_member on public.organizations for select to authenticated
  using (public.is_org_member(id));

create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

create policy user_roles_select_own on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('org.manage_members', organization_id));

grant select on public.public_profiles to anon;
create policy public_profiles_select on public.public_profiles for select to anon, authenticated
  using (is_public or user_id = (select auth.uid()));
create policy public_profiles_update_own on public.public_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update (is_public, headline) on public.public_profiles to authenticated;

-- Shared cache: repo identity is readable, analyses stay behind the API
create policy repos_select on public.repos for select to authenticated using (true);

-- Events: the hash of the access code is never selectable from the browser
revoke select on public.events from authenticated;
grant select (
  id, organization_id, kind, name, slug, description, starts_at, submission_deadline, visibility,
  interviews_enabled, max_submissions, rubric_json, status, closed_at, published_at, created_at
) on public.events to authenticated;

create policy events_select on public.events for select to authenticated
  using (
    public.is_org_member(organization_id)
    or (status <> 'draft' and (visibility = 'public' or public.is_event_participant(id)))
  );

create policy event_allowlist_select on public.event_allowlist for select to authenticated
  using (public.has_permission('event.manage', organization_id));

create policy event_participants_select on public.event_participants for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member(organization_id));

create policy submissions_select on public.submissions for select to authenticated
  using (submitted_by = (select auth.uid()) or public.is_org_member(organization_id));

create policy submission_versions_select on public.submission_versions for select to authenticated
  using (public.owns_submission(submission_id) or public.is_org_member(organization_id));

-- Scores and feedback reach the author only once the organizer publishes
create policy scores_select on public.scores for select to authenticated
  using (public.is_org_member(organization_id) or public.submission_results_visible(submission_id));

create policy feedback_select on public.feedback for select to authenticated
  using (public.is_org_member(organization_id) or public.submission_results_visible(submission_id));

create policy similarity_flags_select on public.similarity_flags for select to authenticated
  using (public.is_org_member(organization_id));

create policy usage_log_select on public.usage_log for select to authenticated
  using (organization_id is not null and public.is_org_member(organization_id));

-- Interviews
create policy interviews_select on public.interviews for select to authenticated
  using (
    user_id = (select auth.uid())
    or (organization_id is not null and public.is_org_member(organization_id))
  );

grant select on public.interview_reports to anon;
create policy interview_reports_select on public.interview_reports for select to anon, authenticated
  using (public.report_visible(interview_id));

-- interview_plans and repo_analyses have no policies on purpose: API only.

-- ---------------------------------------------------------------------------
-- Seed: roles and permissions
-- ---------------------------------------------------------------------------

insert into public.roles (key, scope, name, description) values
  ('student', 'global', 'Student', 'Joins events, submits projects and takes interviews'),
  ('platform_admin', 'global', 'Platform admin', 'SkillProof staff. Assigned by hand in the database only'),
  ('org_owner', 'organization', 'Owner', 'Owns the organization and manages its members'),
  ('organizer', 'organization', 'Organizer', 'Creates and runs events'),
  ('judge', 'organization', 'Judge', 'Reviews submissions and overrides scores');

insert into public.permissions (key, description) values
  ('interview.take', 'Take a voice interview'),
  ('profile.publish', 'Publish a verified profile'),
  ('event.join', 'Join an event'),
  ('submission.create', 'Submit a project to an event'),
  ('score.override', 'Override an AI score'),
  ('event.create', 'Create an event'),
  ('event.manage', 'Edit, close and review an event'),
  ('results.publish', 'Publish the results of an event'),
  ('org.manage_members', 'Invite and remove organization members');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (values
  ('student', 'interview.take'), ('student', 'profile.publish'), ('student', 'event.join'), ('student', 'submission.create'),
  ('judge', 'score.override'),
  ('organizer', 'score.override'), ('organizer', 'event.create'), ('organizer', 'event.manage'), ('organizer', 'results.publish'),
  ('org_owner', 'score.override'), ('org_owner', 'event.create'), ('org_owner', 'event.manage'), ('org_owner', 'results.publish'),
  ('org_owner', 'org.manage_members')
) as m (role_key, perm_key)
join public.roles r on r.key = m.role_key
join public.permissions p on p.key = m.perm_key;
