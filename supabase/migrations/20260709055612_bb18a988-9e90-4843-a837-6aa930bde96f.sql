
-- Extend mcq_questions and qbank_questions with fields the UI needs.

-- Status enum
DO $$ BEGIN
  CREATE TYPE public.question_status AS ENUM ('draft','review','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MCQ additions
ALTER TABLE public.mcq_questions
  ADD COLUMN IF NOT EXISTS status public.question_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_id text;

-- QBank additions (parallel)
ALTER TABLE public.qbank_questions
  ADD COLUMN IF NOT EXISTS status public.question_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_id text;

-- Indexes for pagination / filtering / duplicate detection.
CREATE INDEX IF NOT EXISTS mcq_questions_chapter_position_idx
  ON public.mcq_questions (chapter_id, position);
CREATE INDEX IF NOT EXISTS mcq_questions_status_idx
  ON public.mcq_questions (status);
CREATE INDEX IF NOT EXISTS mcq_questions_batch_idx
  ON public.mcq_questions (batch_id);
CREATE INDEX IF NOT EXISTS mcq_questions_created_at_idx
  ON public.mcq_questions (created_at DESC);
-- Case-insensitive functional index for duplicate detection & search
CREATE INDEX IF NOT EXISTS mcq_questions_question_lower_idx
  ON public.mcq_questions (chapter_id, lower(question));

CREATE INDEX IF NOT EXISTS qbank_questions_chapter_position_idx
  ON public.qbank_questions (chapter_id, position);
CREATE INDEX IF NOT EXISTS qbank_questions_status_idx
  ON public.qbank_questions (status);
CREATE INDEX IF NOT EXISTS qbank_questions_batch_idx
  ON public.qbank_questions (batch_id);
CREATE INDEX IF NOT EXISTS qbank_questions_created_at_idx
  ON public.qbank_questions (created_at DESC);
CREATE INDEX IF NOT EXISTS qbank_questions_prompt_lower_idx
  ON public.qbank_questions (chapter_id, lower(prompt));

-- has_role is already SECURITY DEFINER — reuse it in policies.
-- The tables already have RLS enabled with basic policies from Phase 1.
-- We add admin-write / admin-read policies explicitly so the manager can operate.

-- Drop existing MCQ policies to redefine cleanly (idempotent).
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='mcq_questions'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.mcq_questions', p.policyname); END LOOP;
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='qbank_questions'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.qbank_questions', p.policyname); END LOOP;
END $$;

-- MCQ policies
CREATE POLICY "mcq_admin_all" ON public.mcq_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mcq_student_read_published" ON public.mcq_questions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'student')
    AND status = 'published'
  );

-- QBank policies
CREATE POLICY "qbank_admin_all" ON public.qbank_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "qbank_student_read_published" ON public.qbank_questions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'student')
    AND status = 'published'
  );
