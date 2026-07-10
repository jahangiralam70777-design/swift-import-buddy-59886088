-- =============================================================================
-- Academic Manager — schema additions required for real, DB-backed counts.
-- =============================================================================
--
-- Apply this SQL to your Supabase project (SQL editor or migration tool).
-- The application code is already defensive: quizzes / mock_tests counts
-- return 0 until these tables exist, and chapter status falls back to 'draft'
-- if the column is missing — never fabricated values.
--
-- Once applied:
--   * academic_chapters gains a real `status` column (draft | published).
--   * quizzes and mock_tests tables become the single source of truth for
--     their respective counts.
-- =============================================================================

-- 1) Chapter status ----------------------------------------------------------
alter table public.academic_chapters
  add column if not exists status text not null default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'academic_chapters_status_check'
  ) then
    alter table public.academic_chapters
      add constraint academic_chapters_status_check
      check (status in ('draft','published'));
  end if;
end $$;

create index if not exists academic_chapters_status_idx
  on public.academic_chapters (status);

-- 2) Quizzes -----------------------------------------------------------------
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.academic_chapters(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quizzes_chapter_status_idx on public.quizzes (chapter_id, status);

grant select, insert, update, delete on public.quizzes to authenticated;
grant all on public.quizzes to service_role;

alter table public.quizzes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'quizzes read auth' and tablename = 'quizzes') then
    create policy "quizzes read auth" on public.quizzes for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'quizzes admin write' and tablename = 'quizzes') then
    create policy "quizzes admin write" on public.quizzes for all to authenticated
      using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

drop trigger if exists quizzes_updated_at on public.quizzes;
create trigger quizzes_updated_at before update on public.quizzes
  for each row execute function public.tg_set_updated_at();

-- 3) Mock tests --------------------------------------------------------------
create table if not exists public.mock_tests (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.academic_chapters(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mock_tests_chapter_status_idx on public.mock_tests (chapter_id, status);

grant select, insert, update, delete on public.mock_tests to authenticated;
grant all on public.mock_tests to service_role;

alter table public.mock_tests enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'mock_tests read auth' and tablename = 'mock_tests') then
    create policy "mock_tests read auth" on public.mock_tests for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'mock_tests admin write' and tablename = 'mock_tests') then
    create policy "mock_tests admin write" on public.mock_tests for all to authenticated
      using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

drop trigger if exists mock_tests_updated_at on public.mock_tests;
create trigger mock_tests_updated_at before update on public.mock_tests
  for each row execute function public.tg_set_updated_at();
