-- =========================================================================
-- Enums
-- =========================================================================
create type public.app_role as enum ('admin', 'student');
create type public.question_source as enum ('mcq', 'qbank');

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, phone text, institution text, photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles self select" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create trigger profiles_updated_at before update on public.profiles for each row execute function public.tg_set_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "user_roles self select" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "user_roles admin select all" on public.user_roles for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict (user_id, role) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.academic_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique, position int not null default 0,
  description text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.academic_levels (position);
grant select on public.academic_levels to authenticated;
grant all on public.academic_levels to service_role;
alter table public.academic_levels enable row level security;
create policy "academic_levels read auth" on public.academic_levels for select to authenticated using (true);
create policy "academic_levels admin write" on public.academic_levels for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger academic_levels_updated_at before update on public.academic_levels for each row execute function public.tg_set_updated_at();

create table public.academic_subjects (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.academic_levels(id) on delete cascade,
  name text not null, slug text, position int not null default 0,
  description text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.academic_subjects (level_id, position);
grant select on public.academic_subjects to authenticated;
grant all on public.academic_subjects to service_role;
alter table public.academic_subjects enable row level security;
create policy "academic_subjects read auth" on public.academic_subjects for select to authenticated using (true);
create policy "academic_subjects admin write" on public.academic_subjects for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger academic_subjects_updated_at before update on public.academic_subjects for each row execute function public.tg_set_updated_at();

create table public.academic_chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.academic_subjects(id) on delete cascade,
  name text not null, slug text, position int not null default 0,
  description text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.academic_chapters (subject_id, position);
grant select on public.academic_chapters to authenticated;
grant all on public.academic_chapters to service_role;
alter table public.academic_chapters enable row level security;
create policy "academic_chapters read auth" on public.academic_chapters for select to authenticated using (true);
create policy "academic_chapters admin write" on public.academic_chapters for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger academic_chapters_updated_at before update on public.academic_chapters for each row execute function public.tg_set_updated_at();

create table public.mcq_questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.academic_chapters(id) on delete cascade,
  position int not null default 0,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_index int not null default 0,
  explanation text,
  tags text[] not null default '{}',
  status text,
  batch_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.mcq_questions (chapter_id, position);
create index mcq_questions_chapter_status_position_idx on public.mcq_questions (chapter_id, status, position);
grant select, insert, update, delete on public.mcq_questions to authenticated;
grant all on public.mcq_questions to service_role;
alter table public.mcq_questions enable row level security;
create policy "mcq_questions read auth" on public.mcq_questions for select to authenticated using (true);
create policy "mcq_questions admin write" on public.mcq_questions for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger mcq_questions_updated_at before update on public.mcq_questions for each row execute function public.tg_set_updated_at();

create table public.qbank_questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.academic_chapters(id) on delete cascade,
  position int not null default 0,
  question text,
  prompt text,
  options jsonb not null default '[]'::jsonb,
  correct_index int not null default 0,
  answer text,
  explanation text,
  tags text[] not null default '{}',
  status text,
  batch_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.qbank_questions (chapter_id, position);
grant select, insert, update, delete on public.qbank_questions to authenticated;
grant all on public.qbank_questions to service_role;
alter table public.qbank_questions enable row level security;
create policy "qbank_questions read auth" on public.qbank_questions for select to authenticated using (true);
create policy "qbank_questions admin write" on public.qbank_questions for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger qbank_questions_updated_at before update on public.qbank_questions for each row execute function public.tg_set_updated_at();

create table public.mcq_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.mcq_questions(id) on delete cascade,
  chapter_id uuid references public.academic_chapters(id) on delete set null,
  selected_index int, is_correct boolean not null, time_spent_ms int, session_id uuid,
  created_at timestamptz not null default now(),
  constraint mcq_attempts_user_question_key unique (user_id, question_id)
);
create index on public.mcq_attempts (user_id, created_at desc);
create index mcq_attempts_user_chapter_idx on public.mcq_attempts (user_id, chapter_id);
grant select, insert, update, delete on public.mcq_attempts to authenticated;
grant all on public.mcq_attempts to service_role;
alter table public.mcq_attempts enable row level security;
create policy "mcq_attempts self all" on public.mcq_attempts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mcq_attempts admin select" on public.mcq_attempts for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create table public.qbank_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.qbank_questions(id) on delete cascade,
  chapter_id uuid references public.academic_chapters(id) on delete set null,
  answer text, selected_index int, is_correct boolean not null, time_spent_ms int, session_id uuid,
  created_at timestamptz not null default now(),
  constraint qbank_attempts_user_question_unique unique (user_id, question_id)
);
create index on public.qbank_attempts (user_id, created_at desc);
create index qbank_attempts_user_chapter_idx on public.qbank_attempts (user_id, chapter_id);
grant select, insert, update, delete on public.qbank_attempts to authenticated;
grant all on public.qbank_attempts to service_role;
alter table public.qbank_attempts enable row level security;
create policy "qbank_attempts self all" on public.qbank_attempts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "qbank_attempts admin select" on public.qbank_attempts for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source public.question_source not null,
  question_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, source, question_id)
);
create index on public.bookmarks (user_id, created_at desc);
grant select, insert, update, delete on public.bookmarks to authenticated;
grant all on public.bookmarks to service_role;
alter table public.bookmarks enable row level security;
create policy "bookmarks self all" on public.bookmarks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.wrong_answer_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source public.question_source not null,
  question_id uuid not null,
  wrong_count int not null default 1,
  last_wrong_at timestamptz not null default now(),
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source, question_id)
);
create index on public.wrong_answer_bookmarks (user_id, last_wrong_at desc);
grant select, insert, update, delete on public.wrong_answer_bookmarks to authenticated;
grant all on public.wrong_answer_bookmarks to service_role;
alter table public.wrong_answer_bookmarks enable row level security;
create policy "wrong_answer_bookmarks self all" on public.wrong_answer_bookmarks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.custom_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text, config jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score numeric,
  total_questions int not null default 0,
  correct_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.custom_exam_sessions (user_id, created_at desc);
create index custom_exam_sessions_user_active_idx on public.custom_exam_sessions (user_id, finished_at, created_at DESC);
grant select, insert, update, delete on public.custom_exam_sessions to authenticated;
grant all on public.custom_exam_sessions to service_role;
alter table public.custom_exam_sessions enable row level security;
create policy "custom_exam_sessions self all" on public.custom_exam_sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger custom_exam_sessions_updated_at before update on public.custom_exam_sessions for each row execute function public.tg_set_updated_at();

create table public.custom_exam_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.custom_exam_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source public.question_source not null,
  question_id uuid not null,
  selected_index int, answer text, is_correct boolean, time_spent_ms int,
  created_at timestamptz not null default now(),
  constraint custom_exam_answers_session_question_unique unique (session_id, question_id, source)
);
create index custom_exam_answers_session_idx on public.custom_exam_answers (session_id);
create index on public.custom_exam_answers (user_id, created_at desc);
grant select, insert, update, delete on public.custom_exam_answers to authenticated;
grant all on public.custom_exam_answers to service_role;
alter table public.custom_exam_answers enable row level security;
create policy "custom_exam_answers self all" on public.custom_exam_answers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text, config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  level text, subject text, chapter text,
  routine_type text NOT NULL DEFAULT 'daily',
  hours_per_day numeric NOT NULL DEFAULT 1,
  starts_on date, ends_on date,
  is_archived boolean NOT NULL DEFAULT false,
  accent text, target_mcqs integer, target_chapters integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.routines (user_id, created_at desc);
create index idx_routines_level_status on public.routines (level, is_archived);
create index idx_routines_created_at on public.routines (created_at DESC);
create index idx_routines_ends_on on public.routines (ends_on);
grant select, insert, update, delete on public.routines to authenticated;
grant all on public.routines to service_role;
alter table public.routines enable row level security;
create policy "routines self all" on public.routines for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "routines admin all" on public.routines for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "routines auth read" on public.routines for select to authenticated using (true);
create trigger routines_updated_at before update on public.routines for each row execute function public.tg_set_updated_at();

create table public.routine_days (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  label text, position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.routine_days (routine_id, position);
grant select, insert, update, delete on public.routine_days to authenticated;
grant all on public.routine_days to service_role;
alter table public.routine_days enable row level security;
create policy "routine_days self all" on public.routine_days for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "routine_days admin all" on public.routine_days for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "routine_days auth read" on public.routine_days for select to authenticated using (true);

create table public.routine_tasks (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  day_id uuid references public.routine_days(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, details jsonb not null default '{}'::jsonb,
  start_time time, end_time time, position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.routine_tasks (routine_id, position);
create index on public.routine_tasks (day_id, position);
grant select, insert, update, delete on public.routine_tasks to authenticated;
grant all on public.routine_tasks to service_role;
alter table public.routine_tasks enable row level security;
create policy "routine_tasks self all" on public.routine_tasks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "routine_tasks admin all" on public.routine_tasks for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "routine_tasks auth read" on public.routine_tasks for select to authenticated using (true);
create trigger routine_tasks_updated_at before update on public.routine_tasks for each row execute function public.tg_set_updated_at();

create table public.routine_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.routine_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_on date not null,
  status text not null default 'not_started',
  study_hours numeric not null default 0,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, completed_on)
);
create index on public.routine_task_completions (user_id, completed_on desc);
create index routine_task_completions_user_task_idx on public.routine_task_completions (user_id, task_id);
grant select, insert, update, delete on public.routine_task_completions to authenticated;
grant all on public.routine_task_completions to service_role;
alter table public.routine_task_completions enable row level security;
create policy "routine_task_completions self all" on public.routine_task_completions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "routine_task_completions admin select" on public.routine_task_completions for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create trigger routine_task_completions_updated_at before update on public.routine_task_completions for each row execute function public.tg_set_updated_at();

create table public.routine_assignments (
  id uuid not null default gen_random_uuid() primary key,
  routine_id uuid not null references public.routines(id) on delete cascade,
  target_type text not null check (target_type in ('level','subject','user')),
  target_value text, target_user_id uuid, created_by uuid,
  created_at timestamptz not null default now()
);
create index idx_routine_assignments_routine on public.routine_assignments (routine_id);
create index idx_routine_assignments_user on public.routine_assignments (target_user_id);
grant select, insert, update, delete on public.routine_assignments to authenticated;
grant all on public.routine_assignments to service_role;
alter table public.routine_assignments enable row level security;
create policy "routine_assignments admin all" on public.routine_assignments for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "routine_assignments auth read" on public.routine_assignments for select to authenticated using (true);

create table public.student_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.student_preferences to authenticated;
grant all on public.student_preferences to service_role;
alter table public.student_preferences enable row level security;
create policy "student_preferences self all" on public.student_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger student_preferences_updated_at before update on public.student_preferences for each row execute function public.tg_set_updated_at();

create table public.admin_settings (
  id uuid primary key default gen_random_uuid(),
  settings jsonb not null default '{}'::jsonb,
  singleton boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (singleton)
);
grant select on public.admin_settings to authenticated;
grant all on public.admin_settings to service_role;
alter table public.admin_settings enable row level security;
create policy "admin_settings read auth" on public.admin_settings for select to authenticated using (true);
create policy "admin_settings admin write" on public.admin_settings for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger admin_settings_updated_at before update on public.admin_settings for each row execute function public.tg_set_updated_at();
insert into public.admin_settings (settings) values ('{}'::jsonb) on conflict (singleton) do nothing;

create policy "profiles admin select all" on public.profiles for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "profiles admin update all" on public.profiles for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Admin RPCs
-- ============================================================
create or replace function public.admin_list_users(
  p_search text default null, p_role text default null, p_status text default null,
  p_verified text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_sort text default 'created_desc', p_limit int default 50, p_offset int default 0
) returns table (
  id uuid, email text, full_name text, phone text, photo_url text, role text,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed_at timestamptz,
  banned_until timestamptz, total_count bigint
) language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: admin role required'; end if;
  return query
  with base as (
    select u.id, u.email::text as email, coalesce(p.full_name, '') as full_name,
      coalesce(p.phone, '') as phone, p.photo_url,
      coalesce((select r.role::text from public.user_roles r where r.user_id = u.id
        order by case when r.role::text = 'admin' then 0 else 1 end limit 1), 'student') as role,
      u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until
    from auth.users u left join public.profiles p on p.id = u.id
  ), filtered as (
    select * from base b
    where (p_search is null or (b.email ilike '%' || p_search || '%' or b.full_name ilike '%' || p_search || '%' or b.phone ilike '%' || p_search || '%'))
    and (p_role is null or b.role = p_role)
    and (p_status is null or ((p_status = 'active' and (b.banned_until is null or b.banned_until <= now())) or (p_status = 'disabled' and b.banned_until is not null and b.banned_until > now())))
    and (p_verified is null or ((p_verified = 'verified' and b.email_confirmed_at is not null) or (p_verified = 'unverified' and b.email_confirmed_at is null)))
    and (p_from is null or b.created_at >= p_from) and (p_to is null or b.created_at <= p_to)
  ), counted as (select f.*, count(*) over() as total_count from filtered f)
  select c.id, c.email, c.full_name, c.phone, c.photo_url, c.role,
    c.created_at, c.last_sign_in_at, c.email_confirmed_at, c.banned_until, c.total_count
  from counted c
  order by
    case when p_sort = 'created_desc' then c.created_at end desc nulls last,
    case when p_sort = 'created_asc'  then c.created_at end asc  nulls last,
    case when p_sort = 'name_asc'     then c.full_name end asc,
    case when p_sort = 'name_desc'    then c.full_name end desc,
    case when p_sort = 'email_asc'    then c.email end asc,
    case when p_sort = 'email_desc'   then c.email end desc,
    case when p_sort = 'last_login_desc' then c.last_sign_in_at end desc nulls last,
    case when p_sort = 'last_login_asc'  then c.last_sign_in_at end asc  nulls last
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end; $$;

create or replace function public.admin_get_user(p_user_id uuid)
returns table (id uuid, email text, full_name text, phone text, photo_url text,
  institution text, role text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, banned_until timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: admin role required'; end if;
  return query
  select u.id, u.email::text, coalesce(p.full_name, ''), coalesce(p.phone, ''),
    p.photo_url, p.institution,
    coalesce((select r.role::text from public.user_roles r where r.user_id = u.id
      order by case when r.role::text = 'admin' then 0 else 1 end limit 1), 'student'),
    u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until
  from auth.users u left join public.profiles p on p.id = u.id where u.id = p_user_id;
end; $$;

create or replace function public.admin_user_stats()
returns table (total bigint, students bigint, admins bigint, active_today bigint, verified bigint, new_last_7_days bigint)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: admin role required'; end if;
  return query
  select (select count(*) from auth.users)::bigint,
    (select count(distinct user_id) from public.user_roles where role = 'student')::bigint,
    (select count(distinct user_id) from public.user_roles where role = 'admin')::bigint,
    (select count(*) from auth.users where last_sign_in_at >= date_trunc('day', now()))::bigint,
    (select count(*) from auth.users where email_confirmed_at is not null)::bigint,
    (select count(*) from auth.users where created_at >= now() - interval '7 days')::bigint;
end; $$;

revoke all on function public.admin_list_users(text,text,text,text,timestamptz,timestamptz,text,int,int) from public, anon;
revoke all on function public.admin_get_user(uuid) from public, anon;
revoke all on function public.admin_user_stats() from public, anon;
grant execute on function public.admin_list_users(text,text,text,text,timestamptz,timestamptz,text,int,int) to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_user_stats() to authenticated;

-- ============================================================
-- Practice taxonomy RPCs
-- ============================================================
create or replace function public.mcq_practice_taxonomy()
returns table(
  level_id uuid, level_name text, level_slug text, level_description text, level_position int,
  subject_id uuid, subject_name text, subject_slug text, subject_description text, subject_position int,
  chapter_id uuid, chapter_name text, chapter_slug text, chapter_description text, chapter_position int,
  total_mcqs bigint, done bigint, correct bigint, wrong bigint,
  time_spent_ms bigint, bookmarks bigint,
  last_practiced_at timestamptz
) language sql stable security invoker set search_path = public as $$
  select
    l.id, l.name, l.slug, l.description, l.position,
    s.id, s.name, s.slug, s.description, s.position,
    c.id, c.name, c.slug, c.description, c.position,
    coalesce(q.total, 0), coalesce(a.done, 0), coalesce(a.correct, 0), coalesce(a.wrong, 0),
    coalesce(a.time_spent_ms, 0), coalesce(b.bookmarks, 0), a.last_practiced_at
  from public.academic_levels l
  join public.academic_subjects s on s.level_id = l.id
  join public.academic_chapters c on c.subject_id = s.id
  left join lateral (select count(*)::bigint as total from public.mcq_questions mq
    where mq.chapter_id = c.id and mq.status = 'published') q on true
  left join lateral (select count(*)::bigint as done,
    count(*) filter (where ma.is_correct)::bigint as correct,
    count(*) filter (where not ma.is_correct)::bigint as wrong,
    coalesce(sum(ma.time_spent_ms), 0)::bigint as time_spent_ms,
    max(ma.created_at) as last_practiced_at
    from public.mcq_attempts ma
    where ma.user_id = auth.uid() and ma.chapter_id = c.id) a on true
  left join lateral (select count(*)::bigint as bookmarks
    from public.bookmarks bm join public.mcq_questions mq2 on mq2.id = bm.question_id
    where bm.user_id = auth.uid() and bm.source = 'mcq' and mq2.chapter_id = c.id) b on true
  order by l.position, s.position, c.position;
$$;
revoke all on function public.mcq_practice_taxonomy() from public;
grant execute on function public.mcq_practice_taxonomy() to authenticated;

create or replace function public.qbank_practice_taxonomy()
returns table(
  level_id uuid, level_name text, level_slug text, level_description text, level_position int,
  subject_id uuid, subject_name text, subject_slug text, subject_description text, subject_position int,
  chapter_id uuid, chapter_name text, chapter_slug text, chapter_description text, chapter_position int,
  total_mcqs bigint, done bigint, correct bigint, wrong bigint,
  time_spent_ms bigint, bookmarks bigint,
  last_practiced_at timestamptz
) language sql stable security invoker set search_path = public as $$
  select
    l.id, l.name, l.slug, l.description, l.position,
    s.id, s.name, s.slug, s.description, s.position,
    c.id, c.name, c.slug, c.description, c.position,
    coalesce(q.total, 0), coalesce(a.done, 0), coalesce(a.correct, 0), coalesce(a.wrong, 0),
    coalesce(a.time_spent_ms, 0), coalesce(b.bookmarks, 0), a.last_practiced_at
  from public.academic_levels l
  join public.academic_subjects s on s.level_id = l.id
  join public.academic_chapters c on c.subject_id = s.id
  left join lateral (select count(*)::bigint as total from public.qbank_questions qq
    where qq.chapter_id = c.id and qq.status = 'published') q on true
  left join lateral (select count(*)::bigint as done,
    count(*) filter (where qa.is_correct)::bigint as correct,
    count(*) filter (where not qa.is_correct)::bigint as wrong,
    coalesce(sum(qa.time_spent_ms), 0)::bigint as time_spent_ms,
    max(qa.created_at) as last_practiced_at
    from public.qbank_attempts qa
    where qa.user_id = auth.uid() and qa.chapter_id = c.id) a on true
  left join lateral (select count(*)::bigint as bookmarks
    from public.bookmarks bm join public.qbank_questions qq2 on qq2.id = bm.question_id
    where bm.user_id = auth.uid() and bm.source = 'qbank' and qq2.chapter_id = c.id) b on true
  order by l.position, s.position, c.position;
$$;
revoke all on function public.qbank_practice_taxonomy() from public;
grant execute on function public.qbank_practice_taxonomy() to authenticated;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;