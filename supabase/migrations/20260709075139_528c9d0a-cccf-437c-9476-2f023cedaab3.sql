
DROP FUNCTION IF EXISTS public.mcq_practice_taxonomy();

CREATE FUNCTION public.mcq_practice_taxonomy()
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
    COALESCE(q.total, 0) AS total_mcqs,
    COALESCE(a.done, 0) AS done,
    COALESCE(a.correct, 0) AS correct,
    COALESCE(a.wrong, 0) AS wrong,
    COALESCE(a.time_spent_ms, 0) AS time_spent_ms,
    COALESCE(b.bookmarks, 0) AS bookmarks,
    a.last_practiced_at
  FROM public.academic_levels l
  JOIN public.academic_subjects s ON s.level_id = l.id
  JOIN public.academic_chapters c ON c.subject_id = s.id
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS total
    FROM public.mcq_questions mq
    WHERE mq.chapter_id = c.id AND mq.status = 'published'
  ) q ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::bigint AS done,
      count(*) FILTER (WHERE ma.is_correct)::bigint AS correct,
      count(*) FILTER (WHERE NOT ma.is_correct)::bigint AS wrong,
      COALESCE(sum(ma.time_spent_ms), 0)::bigint AS time_spent_ms,
      max(ma.created_at) AS last_practiced_at
    FROM public.mcq_attempts ma
    WHERE ma.user_id = auth.uid() AND ma.chapter_id = c.id
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS bookmarks
    FROM public.bookmarks bm
    JOIN public.mcq_questions mq2 ON mq2.id = bm.question_id
    WHERE bm.user_id = auth.uid()
      AND bm.source = 'mcq'
      AND mq2.chapter_id = c.id
  ) b ON true
  ORDER BY l.position, s.position, c.position;
$$;

REVOKE ALL ON FUNCTION public.mcq_practice_taxonomy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcq_practice_taxonomy() TO authenticated;
