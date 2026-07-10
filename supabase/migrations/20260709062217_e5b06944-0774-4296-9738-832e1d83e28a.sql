
-- =========================================================================
-- Enums
-- =========================================================================
create type public.app_role as enum ('admin', 'student');
create type public.question_source as enum ('mcq', 'qbank');

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- profiles
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

-- user_roles + has_role
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
  insert into public.user_roles (user_id, role) values (new.id, 'student')
  on conflict (user_id, role) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- academic tree
create table public.academic_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique, position int not null default 0,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.academic_chapters (subject_id, position);
grant select on public.academic_chapters to authenticated;
grant all on public.academic_chapters to service_role;
alter table public.academic_chapters enable row level security;
create policy "academic_chapters read auth" on public.academic_chapters for select to authenticated using (true);
create policy "academic_chapters admin write" on public.academic_chapters for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger academic_chapters_updated_at before update on public.academic_chapters for each row execute function public.tg_set_updated_at();

-- Status enum
CREATE TYPE public.question_status AS ENUM ('draft','review','published','archived');

-- mcq_questions
create table public.mcq_questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.academic_chapters(id) on delete cascade,
  position int not null default 0,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_index int not null default 0,
  explanation text,
  tags text[] not null default '{}',
  status public.question_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  batch_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX mcq_questions_chapter_position_idx ON public.mcq_questions (chapter_id, position);
CREATE INDEX mcq_questions_status_idx ON public.mcq_questions (status);
CREATE INDEX mcq_questions_batch_idx ON public.mcq_questions (batch_id);
CREATE INDEX mcq_questions_created_at_idx ON public.mcq_questions (created_at DESC);
CREATE INDEX mcq_questions_question_lower_idx ON public.mcq_questions (chapter_id, lower(question));
grant select on public.mcq_questions to authenticated;
grant all on public.mcq_questions to service_role;
alter table public.mcq_questions enable row level security;
CREATE POLICY "mcq_admin_all" ON public.mcq_questions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "mcq_student_read_published" ON public.mcq_questions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'student') AND status = 'published');
create trigger mcq_questions_updated_at before update on public.mcq_questions for each row execute function public.tg_set_updated_at();

-- qbank_questions (MCQ-style, mirrors mcq_questions)
create table public.qbank_questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.academic_chapters(id) on delete cascade,
  position int not null default 0,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_index int not null default 0,
  explanation text,
  tags text[] not null default '{}',
  status public.question_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  batch_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX qbank_questions_chapter_position_idx ON public.qbank_questions (chapter_id, position);
CREATE INDEX qbank_questions_status_idx ON public.qbank_questions (status);
CREATE INDEX qbank_questions_batch_idx ON public.qbank_questions (batch_id);
CREATE INDEX qbank_questions_created_at_idx ON public.qbank_questions (created_at DESC);
CREATE INDEX qbank_questions_question_lower_idx ON public.qbank_questions (chapter_id, lower(question));
grant select on public.qbank_questions to authenticated;
grant all on public.qbank_questions to service_role;
alter table public.qbank_questions enable row level security;
CREATE POLICY "qbank_admin_all" ON public.qbank_questions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "qbank_student_read_published" ON public.qbank_questions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'student') AND status = 'published');
create trigger qbank_questions_updated_at before update on public.qbank_questions for each row execute function public.tg_set_updated_at();

-- mcq_attempts
create table public.mcq_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.mcq_questions(id) on delete cascade,
  chapter_id uuid references public.academic_chapters(id) on delete set null,
  selected_index int, is_correct boolean not null, time_spent_ms int,
  session_id uuid, created_at timestamptz not null default now()
);
create index on public.mcq_attempts (user_id, created_at desc);
create index on public.mcq_attempts (user_id, question_id);
create index on public.mcq_attempts (user_id, chapter_id);
grant select, insert, update, delete on public.mcq_attempts to authenticated;
grant all on public.mcq_attempts to service_role;
alter table public.mcq_attempts enable row level security;
create policy "mcq_attempts self all" on public.mcq_attempts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "mcq_attempts admin select" on public.mcq_attempts for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- qbank_attempts
create table public.qbank_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.qbank_questions(id) on delete cascade,
  chapter_id uuid references public.academic_chapters(id) on delete set null,
  answer text, is_correct boolean not null, time_spent_ms int,
  session_id uuid, created_at timestamptz not null default now()
);
create index on public.qbank_attempts (user_id, created_at desc);
create index on public.qbank_attempts (user_id, question_id);
create index on public.qbank_attempts (user_id, chapter_id);
grant select, insert, update, delete on public.qbank_attempts to authenticated;
grant all on public.qbank_attempts to service_role;
alter table public.qbank_attempts enable row level security;
create policy "qbank_attempts self all" on public.qbank_attempts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "qbank_attempts admin select" on public.qbank_attempts for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- bookmarks
create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source public.question_source not null,
  question_id uuid not null, note text,
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
  question_id uuid not null, wrong_count int not null default 1,
  last_wrong_at timestamptz not null default now(),
  cleared_at timestamptz, created_at timestamptz not null default now(),
  unique (user_id, source, question_id)
);
create index on public.wrong_answer_bookmarks (user_id, last_wrong_at desc);
grant select, insert, update, delete on public.wrong_answer_bookmarks to authenticated;
grant all on public.wrong_answer_bookmarks to service_role;
alter table public.wrong_answer_bookmarks enable row level security;
create policy "wrong_answer_bookmarks self all" on public.wrong_answer_bookmarks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- custom_exam_sessions + answers
create table public.custom_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text, config jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(), finished_at timestamptz,
  score numeric, total_questions int not null default 0, correct_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.custom_exam_sessions (user_id, created_at desc);
grant select, insert, update, delete on public.custom_exam_sessions to authenticated;
grant all on public.custom_exam_sessions to service_role;
alter table public.custom_exam_sessions enable row level security;
create policy "custom_exam_sessions self all" on public.custom_exam_sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger custom_exam_sessions_updated_at before update on public.custom_exam_sessions for each row execute function public.tg_set_updated_at();

create table public.custom_exam_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.custom_exam_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source public.question_source not null, question_id uuid not null,
  selected_index int, answer text, is_correct boolean, time_spent_ms int,
  created_at timestamptz not null default now()
);
create index on public.custom_exam_answers (session_id);
create index on public.custom_exam_answers (user_id, created_at desc);
grant select, insert, update, delete on public.custom_exam_answers to authenticated;
grant all on public.custom_exam_answers to service_role;
alter table public.custom_exam_answers enable row level security;
create policy "custom_exam_answers self all" on public.custom_exam_answers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- routines
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text, config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.routines (user_id, created_at desc);
grant select, insert, update, delete on public.routines to authenticated;
grant all on public.routines to service_role;
alter table public.routines enable row level security;
create policy "routines self all" on public.routines for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
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
create trigger routine_tasks_updated_at before update on public.routine_tasks for each row execute function public.tg_set_updated_at();

create table public.routine_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.routine_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_on date not null, status text not null default 'done', note text,
  created_at timestamptz not null default now(),
  unique (task_id, completed_on)
);
create index on public.routine_task_completions (user_id, completed_on desc);
grant select, insert, update, delete on public.routine_task_completions to authenticated;
grant all on public.routine_task_completions to service_role;
alter table public.routine_task_completions enable row level security;
create policy "routine_task_completions self all" on public.routine_task_completions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

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

revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;
