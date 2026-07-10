
CREATE INDEX IF NOT EXISTS mcq_questions_created_by_idx ON public.mcq_questions(created_by);
CREATE INDEX IF NOT EXISTS qbank_questions_created_by_idx ON public.qbank_questions(created_by);
CREATE INDEX IF NOT EXISTS mcq_attempts_chapter_id_idx ON public.mcq_attempts(chapter_id);
CREATE INDEX IF NOT EXISTS mcq_attempts_question_id_idx ON public.mcq_attempts(question_id);
CREATE INDEX IF NOT EXISTS qbank_attempts_chapter_id_idx ON public.qbank_attempts(chapter_id);
CREATE INDEX IF NOT EXISTS qbank_attempts_question_id_idx ON public.qbank_attempts(question_id);
CREATE INDEX IF NOT EXISTS routine_days_user_id_idx ON public.routine_days(user_id);
CREATE INDEX IF NOT EXISTS routine_tasks_user_id_idx ON public.routine_tasks(user_id);

CREATE INDEX IF NOT EXISTS mcq_questions_chapter_status_created_idx
  ON public.mcq_questions(chapter_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS qbank_questions_chapter_status_created_idx
  ON public.qbank_questions(chapter_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS routines_archived_starts_on_idx
  ON public.routines(is_archived, starts_on DESC);

CREATE INDEX IF NOT EXISTS user_roles_user_role_idx ON public.user_roles(user_id, role);

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, text, text, timestamptz, timestamptz, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, text, text, timestamptz, timestamptz, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

ANALYZE public.mcq_questions;
ANALYZE public.qbank_questions;
ANALYZE public.routines;
ANALYZE public.routine_tasks;
ANALYZE public.routine_days;
ANALYZE public.routine_task_completions;
ANALYZE public.profiles;
ANALYZE public.user_roles;
