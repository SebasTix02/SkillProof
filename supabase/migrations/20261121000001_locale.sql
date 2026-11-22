-- Language: English or Spanish.
--   profiles.locale              the person's language (interface, errors, their own interviews). New accounts take
--                                the browser's language, sent as signup metadata (raw_user_meta_data.locale).
--   interviews.locale            fixed when the interview is created: questions, interviewer and report.
--   events.language,
--   course_assignments.language  what the organizer chose for the judge's feedback and for interviews about its
--                                submissions.
-- Only adds columns with defaults, so code that does not know them keeps working.

alter table public.profiles
  add column locale text not null default 'en' check (locale in ('en', 'es'));
alter table public.interviews
  add column locale text not null default 'en' check (locale in ('en', 'es'));
alter table public.events
  add column language text not null default 'en' check (language in ('en', 'es'));
alter table public.course_assignments
  add column language text not null default 'en' check (language in ('en', 'es'));

-- Runs after on_auth_user_created (triggers fire in name order), once the profile exists.
create function public.set_signup_locale()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'locale' in ('en', 'es') then
    update public.profiles set locale = new.raw_user_meta_data ->> 'locale' where id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.set_signup_locale() from public, anon, authenticated;

create trigger on_auth_user_locale
  after insert on auth.users
  for each row execute function public.set_signup_locale();
