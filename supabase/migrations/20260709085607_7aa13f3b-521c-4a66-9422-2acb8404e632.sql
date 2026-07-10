
ALTER TABLE public.qbank_attempts ADD COLUMN IF NOT EXISTS selected_index int;

-- Remove duplicate (user, question) rows before unique constraint.
DELETE FROM public.qbank_attempts a
USING public.qbank_attempts b
WHERE a.user_id = b.user_id
  AND a.question_id = b.question_id
  AND a.created_at < b.created_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qbank_attempts_user_question_unique'
  ) THEN
    ALTER TABLE public.qbank_attempts
      ADD CONSTRAINT qbank_attempts_user_question_unique UNIQUE (user_id, question_id);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.qbank_practice_taxonomy();

CREATE FUNCTION public.qbank_practice_taxonomy()
RETURNS TABLE(
  level_id uuid, level_name text, level_slug text, level_description text, level_position int,
  subject_id uuid, subject_name text, subject_slug text, subject_description text, subject_position int,
  chapter_id uuid, chapter_name text, chapter_slug text, chapter_description text, chapter_position int,
  total_mcqs bigint,
  done bigint,
  correct bigint,
  wrong bigint,
  time_spent_ms bigint,
  bookmarks bigint,
  last_practiced_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.id, l.name, l.slug, l.description, l.position,
    s.id, s.name, s.slug, s.description, s.position,
    c.id, c.name, c.slug, c.description, c.position,
    COALESCE(q.total, 0),
    COALESCE(a.done, 0),
    COALESCE(a.correct, 0),
    COALESCE(a.wrong, 0),
    COALESCE(a.time_spent_ms, 0),
    COALESCE(b.bookmarks, 0),
    a.last_practiced_at
  FROM public.academic_levels l
  JOIN public.academic_subjects s ON s.level_id = l.id
  JOIN public.academic_chapters c ON c.subject_id = s.id
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS total
    FROM public.qbank_questions qq
    WHERE qq.chapter_id = c.id AND qq.status = 'published'
  ) q ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::bigint AS done,
      count(*) FILTER (WHERE qa.is_correct)::bigint AS correct,
      count(*) FILTER (WHERE NOT qa.is_correct)::bigint AS wrong,
      COALESCE(sum(qa.time_spent_ms), 0)::bigint AS time_spent_ms,
      max(qa.created_at) AS last_practiced_at
    FROM public.qbank_attempts qa
    WHERE qa.user_id = auth.uid() AND qa.chapter_id = c.id
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS bookmarks
    FROM public.bookmarks bm
    JOIN public.qbank_questions qq2 ON qq2.id = bm.question_id
    WHERE bm.user_id = auth.uid()
      AND bm.source = 'qbank'
      AND qq2.chapter_id = c.id
  ) b ON true
  ORDER BY l.position, s.position, c.position;
$$;

REVOKE ALL ON FUNCTION public.qbank_practice_taxonomy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qbank_practice_taxonomy() TO authenticated;
