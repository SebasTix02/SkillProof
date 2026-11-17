-- What the AI did while judging a submission or preparing and evaluating an interview,
-- and which Gemini models produced the result (the first entry is the main model, later ones are backups).
alter table public.submissions
  add column activity_json jsonb not null default '[]'::jsonb,
  add column models_used text[] not null default '{}';

alter table public.interviews
  add column activity_json jsonb not null default '[]'::jsonb,
  add column models_used text[] not null default '{}';
