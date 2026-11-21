-- Language (20261121000001). Runs after 04_course_assignments.sql on the same data.
\set ON_ERROR_STOP on
create function pg_temp.check_eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.check_raises(label text, stmt text, want text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlerrm like '%' || want || '%' then raise notice 'ok   %', label; return; end if;
    raise exception 'FAIL %: raised "%", want "%"', label, sqlerrm, want;
  end;
  raise exception 'FAIL %: did not raise', label;
end $$;

select pg_temp.check_eq('existing people default to English', (select count(*) from public.profiles where locale <> 'en'), 0);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e5', 'eva@student.dev', '{"display_name":"Eva","account_type":"student","locale":"es"}'),
  ('00000000-0000-0000-0000-0000000000e6', 'gus@student.dev', '{"display_name":"Gus","account_type":"student","locale":"fr"}');
select pg_temp.check_eq('a new account takes the language sent at sign-up', (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000e5' and locale = 'es'), 1);
select pg_temp.check_eq('an unknown language falls back to English', (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000e6' and locale = 'en'), 1);
select pg_temp.check_raises('only English or Spanish', $$update public.profiles set locale = 'de'$$, 'violates check constraint');
select pg_temp.check_raises('events take English or Spanish', $$update public.events set language = 'pt'$$, 'violates check constraint');
select pg_temp.check_eq('assignments default to English', (select count(*) from public.course_assignments where language = 'en'), (select count(*) from public.course_assignments));
select pg_temp.check_raises('the browser cannot run the sign-up trigger function', $$set role authenticated; select public.set_signup_locale()$$, 'permission denied');
reset role;
\echo ALL LOCALE CHECKS PASSED
