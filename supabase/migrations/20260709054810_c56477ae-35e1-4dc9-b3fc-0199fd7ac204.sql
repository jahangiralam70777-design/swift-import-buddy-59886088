
ALTER TABLE public.academic_levels ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.academic_subjects ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.academic_chapters ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
