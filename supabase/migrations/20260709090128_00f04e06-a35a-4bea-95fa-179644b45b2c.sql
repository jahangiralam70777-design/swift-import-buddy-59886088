-- Ensure idempotent upsert of custom exam answers per (session, question, source)
ALTER TABLE public.custom_exam_answers
  ADD CONSTRAINT custom_exam_answers_session_question_unique
  UNIQUE (session_id, question_id, source);

-- Helpful indexes for lookups
CREATE INDEX IF NOT EXISTS custom_exam_answers_session_idx
  ON public.custom_exam_answers (session_id);
CREATE INDEX IF NOT EXISTS custom_exam_sessions_user_active_idx
  ON public.custom_exam_sessions (user_id, finished_at, created_at DESC);