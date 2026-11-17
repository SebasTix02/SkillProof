-- Model health for choosing the steadiest Gemini model first.
--
--   level              failures in a row; the next pause is 3, 10 or 30 minutes
--   recent_failures    failures and successes since window_started_at (a 15-minute window), to rank models
--   recent_successes
--   window_started_at
--
-- A model is skipped while unavailable_until is in the future. When it passes, one call is let through to test it.

alter table public.ai_model_health
  add column level integer not null default 0,
  add column recent_failures integer not null default 0,
  add column recent_successes integer not null default 0,
  add column window_started_at timestamptz not null default now();
