-- Voice interview: exam-mode signals and answer coverage.
--
--   interviews.focus_events_json        times the candidate left full screen, switched tab or window during the
--                                       interview: [{ type, at_ms, duration_ms }]. A signal for reviewers, not a verdict.
--   interview_reports.answers_json      per question, which expected points the candidate covered and missed:
--                                       [{ question_id, covered: text[], missed: text[] }]. Shown only once completed.

alter table public.interviews
  add column focus_events_json jsonb not null default '[]';

alter table public.interview_reports
  add column answers_json jsonb not null default '[]';

-- Reports of public profiles are readable without signing in. The answer coverage quotes the answer key, so it
-- stays out of direct reads: the API returns it only to the candidate and the event's organizers.
revoke select on public.interview_reports from anon, authenticated;
grant select (id, interview_id, skills_json, ownership_score, confidence, summary, created_at)
  on public.interview_reports to anon, authenticated;
