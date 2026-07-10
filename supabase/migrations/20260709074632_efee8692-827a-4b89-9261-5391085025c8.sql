
-- Deduplicate any existing (user_id, question_id) pairs, keeping the latest attempt.
DELETE FROM public.mcq_attempts a
USING public.mcq_attempts b
WHERE a.user_id = b.user_id
  AND a.question_id = b.question_id
  AND a.created_at < b.created_at;

-- Enforce one attempt row per user+question so we can upsert on every answer.
ALTER TABLE public.mcq_attempts
  ADD CONSTRAINT mcq_attempts_user_question_key UNIQUE (user_id, question_id);

-- Speed up chapter-scoped progress queries.
CREATE INDEX IF NOT EXISTS mcq_attempts_user_chapter_idx
  ON public.mcq_attempts (user_id, chapter_id);

-- Speed up "questions of a chapter, ordered by position" for practice sessions.
CREATE INDEX IF NOT EXISTS mcq_questions_chapter_status_position_idx
  ON public.mcq_questions (chapter_id, status, position);
