-- Pause, resume and cancel for the AI jobs.
--
-- Judging, per submission:  queued/analyzing -> paused -> queued, or -> canceled ("Judge again" restarts it).
-- Judging, a whole event:   events.judging_paused_at set while the organizer has paused it; nothing is dispatched.
-- Interviews:               preparing -> canceled (does not count for the one-per-commit rule),
--                           evaluating -> report_paused -> evaluating, or -> report_canceled ("Write the report").
-- Jobs check these states at checkpoints (before each step and each Gemini call) and stop there.

alter table public.submissions drop constraint submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('submitted', 'queued', 'analyzing', 'scored', 'error', 'paused', 'canceled'));

alter table public.interviews drop constraint interviews_status_check;
alter table public.interviews add constraint interviews_status_check
  check (status in ('preparing', 'ready', 'in_progress', 'evaluating', 'completed', 'error', 'canceled', 'report_paused', 'report_canceled'));

alter table public.events
  add column judging_paused_at timestamptz,
  add column judging_paused_by uuid references public.profiles (id) on delete set null;

-- A canceled preparation never showed questions, so like an error before starting it does not count.
drop index public.interviews_one_per_commit;
create unique index interviews_one_per_commit on public.interviews (user_id, repo_id, commit_sha)
  where commit_sha is not null and (status not in ('error', 'canceled') or started_at is not null);

-- Browsers may read the pause state of events they can see.
grant select (judging_paused_at) on public.events to authenticated;
