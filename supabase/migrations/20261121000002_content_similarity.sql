-- Content similarity (winnowing fingerprints, engine/fingerprint.ts). No model call.
--   file_fingerprints     fingerprints of one file content, by git blob sha: shared by every repo and commit with it
--   analysis_files        which files each analysed commit had (path → blob), to know which fingerprints to compare
--   shared_code           new similarity signal: a pair shares a large part of its code, or one long block
--   assignment_similarity_matches   the matching fragments of course assignment pairs (events use similarity_matches)
--   starter_repo_url      code the organizer gives everyone; it never counts as a copy
-- Only adds tables and columns, so code that does not know them keeps working.

create table public.file_fingerprints (
  blob_sha text primary key check (blob_sha ~ '^[0-9a-f]{40}$'),
  hashes bigint[] not null,
  -- First and last line of each fingerprint's k-gram, in the same order as hashes.
  starts integer[] not null,
  ends integer[] not null,
  token_count integer not null,
  created_at timestamptz not null default now(),
  check (cardinality(hashes) = cardinality(starts) and cardinality(hashes) = cardinality(ends))
);

create table public.analysis_files (
  analysis_id uuid not null references public.repo_analyses (id) on delete cascade,
  path text not null,
  blob_sha text not null check (blob_sha ~ '^[0-9a-f]{40}$'),
  primary key (analysis_id, path)
);
create index analysis_files_blob_idx on public.analysis_files (blob_sha);

alter table public.similarity_flags drop constraint if exists similarity_flags_signal_check;
alter table public.similarity_flags add constraint similarity_flags_signal_check
  check (signal in ('same_repo', 'same_fork_parent', 'identical_files', 'embedding', 'shared_code'));
alter table public.assignment_similarity_flags drop constraint if exists assignment_similarity_flags_signal_check;
alter table public.assignment_similarity_flags add constraint assignment_similarity_flags_signal_check
  check (signal in ('same_repo', 'same_fork_parent', 'identical_files', 'embedding', 'shared_code'));

create table public.assignment_similarity_matches (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.assignment_similarity_flags (id) on delete cascade,
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
create index assignment_similarity_matches_flag_idx on public.assignment_similarity_matches (flag_id);

alter table public.events add column starter_repo_url text check (starter_repo_url is null or starter_repo_url ~ '^https://github\.com/[^/]+/[^/]+/?$');
alter table public.course_assignments add column starter_repo_url text check (starter_repo_url is null or starter_repo_url ~ '^https://github\.com/[^/]+/[^/]+/?$');

-- Only the API reads and writes these.
alter table public.file_fingerprints enable row level security;
alter table public.analysis_files enable row level security;
alter table public.assignment_similarity_matches enable row level security;
revoke all on public.file_fingerprints, public.analysis_files, public.assignment_similarity_matches from anon, authenticated;
