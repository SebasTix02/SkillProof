-- Lighter and steadier AI judging.
--
--   submissions.judge_attempts   automatic attempts made after Gemini was overloaded (reset by "Judge again")
--   submissions.next_attempt_at  when a queued submission may be judged again; null means as soon as there is room
--   file_summaries               one-sentence summaries of source files, keyed by the git blob sha of the content,
--                                so the same file is never summarised twice, across commits and repositories
--   ai_model_health              models that were overloaded recently, so every server instance goes straight to a
--                                backup for a few minutes instead of waiting on a busy model again

alter table public.submissions
  add column judge_attempts integer not null default 0,
  add column next_attempt_at timestamptz;

create index submissions_queue_idx on public.submissions (status, next_attempt_at);

create table public.file_summaries (
  blob_sha text primary key check (blob_sha ~ '^[0-9a-f]{40}$'),
  summary text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table public.ai_model_health (
  model text primary key,
  unavailable_until timestamptz not null,
  reason text not null default '',
  updated_at timestamptz not null default now()
);

-- API only: no policies, and no access for browser roles.
alter table public.file_summaries enable row level security;
alter table public.ai_model_health enable row level security;
revoke all on public.file_summaries, public.ai_model_health from anon, authenticated;
