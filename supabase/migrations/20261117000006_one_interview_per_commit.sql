-- One voice interview per candidate, repository and commit.
--
-- Once a candidate has seen an interview's answer key, a second interview on the same code would be answered from
-- it. So an interview that started (or finished) blocks another one on the same commit. One that failed before it
-- started (status 'error' and never started) does not count and can be retried.

alter table public.interviews
  add column commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$');

-- Existing interviews: the commit of their analysis, or the frozen commit of their submission.
update public.interviews i
set commit_sha = coalesce(
  (select a.commit_sha from public.repo_analyses a where a.id = i.analysis_id),
  (select s.locked_commit_sha from public.submissions s where s.id = i.submission_id)
);

-- Interviews taken before this rule may already repeat a commit. Keep the newest one counted.
with ranked as (
  select id, row_number() over (partition by user_id, repo_id, commit_sha order by created_at desc) as n
  from public.interviews
  where commit_sha is not null and (status <> 'error' or started_at is not null)
)
update public.interviews i set commit_sha = null from ranked r where r.id = i.id and r.n > 1;

create unique index interviews_one_per_commit on public.interviews (user_id, repo_id, commit_sha)
  where commit_sha is not null and (status <> 'error' or started_at is not null);
