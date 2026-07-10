
-- Extend routines with admin-shared metadata + assignments.

ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS chapter text,
  ADD COLUMN IF NOT EXISTS routine_type text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS hours_per_day numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS starts_on date,
  ADD COLUMN IF NOT EXISTS ends_on date,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accent text,
  ADD COLUMN IF NOT EXISTS target_mcqs integer,
  ADD COLUMN IF NOT EXISTS target_chapters integer;

CREATE INDEX IF NOT EXISTS idx_routines_level_status ON public.routines (level, is_archived);
CREATE INDEX IF NOT EXISTS idx_routines_created_at ON public.routines (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routines_ends_on ON public.routines (ends_on);

-- Admin write + everyone read (existing self policy stays for legacy per-user rows)
DROP POLICY IF EXISTS "routines admin all" ON public.routines;
CREATE POLICY "routines admin all" ON public.routines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "routines auth read" ON public.routines;
CREATE POLICY "routines auth read" ON public.routines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "routine_days admin all" ON public.routine_days;
CREATE POLICY "routine_days admin all" ON public.routine_days
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "routine_days auth read" ON public.routine_days;
CREATE POLICY "routine_days auth read" ON public.routine_days
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "routine_tasks admin all" ON public.routine_tasks;
CREATE POLICY "routine_tasks admin all" ON public.routine_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "routine_tasks auth read" ON public.routine_tasks;
CREATE POLICY "routine_tasks auth read" ON public.routine_tasks
  FOR SELECT TO authenticated USING (true);

-- Assignments table
CREATE TABLE IF NOT EXISTS public.routine_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('level','subject','user')),
  target_value text,
  target_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routine_assignments_routine ON public.routine_assignments (routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_assignments_user ON public.routine_assignments (target_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routine_assignments TO authenticated;
GRANT ALL ON public.routine_assignments TO service_role;

ALTER TABLE public.routine_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routine_assignments admin all" ON public.routine_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "routine_assignments auth read" ON public.routine_assignments
  FOR SELECT TO authenticated USING (true);
