-- ============================================================================
-- CL Aspire Production Schema
-- Generated from audited live schema and repository migrations.
-- Run on a clean database after the platform auth schemas are available.
-- No sample data is included.
-- ============================================================================

--
-- PostgreSQL database dump
--

\restrict wL1HvaJ3FZgzQdlSwsWaUczKnMqRGBFK7J6qzFnTcDPP6HbhxFhnb4RD6phK7dt

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET escape_string_warning = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'student'
);


--
-- Name: question_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.question_source AS ENUM (
    'mcq',
    'qbank'
);


--
-- Name: admin_get_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_get_user(p_user_id uuid) RETURNS TABLE(id uuid, email text, full_name text, phone text, photo_url text, institution text, role text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_confirmed_at timestamp with time zone, banned_until timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: admin role required'; end if;
  return query
  select u.id, u.email::text, coalesce(p.full_name, ''), coalesce(p.phone, ''),
    p.photo_url, p.institution,
    coalesce((select r.role::text from public.user_roles r where r.user_id = u.id
      order by case when r.role::text = 'admin' then 0 else 1 end limit 1), 'student'),
    u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until
  from auth.users u left join public.profiles p on p.id = u.id where u.id = p_user_id;
end; $$;


--
-- Name: admin_list_users(text, text, text, text, timestamp with time zone, timestamp with time zone, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_users(p_search text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_verified text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sort text DEFAULT 'created_desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, email text, full_name text, phone text, photo_url text, role text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_confirmed_at timestamp with time zone, banned_until timestamp with time zone, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: admin role required'; end if;
  return query
  with base as (
    select u.id, u.email::text as email, coalesce(p.full_name, '') as full_name,
      coalesce(p.phone, '') as phone, p.photo_url,
      coalesce((select r.role::text from public.user_roles r where r.user_id = u.id
        order by case when r.role::text = 'admin' then 0 else 1 end limit 1), 'student') as role,
      u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until
    from auth.users u left join public.profiles p on p.id = u.id
  ), filtered as (
    select * from base b
    where (p_search is null or (b.email ilike '%' || p_search || '%' or b.full_name ilike '%' || p_search || '%' or b.phone ilike '%' || p_search || '%'))
    and (p_role is null or b.role = p_role)
    and (p_status is null or ((p_status = 'active' and (b.banned_until is null or b.banned_until <= now())) or (p_status = 'disabled' and b.banned_until is not null and b.banned_until > now())))
    and (p_verified is null or ((p_verified = 'verified' and b.email_confirmed_at is not null) or (p_verified = 'unverified' and b.email_confirmed_at is null)))
    and (p_from is null or b.created_at >= p_from) and (p_to is null or b.created_at <= p_to)
  ), counted as (select f.*, count(*) over() as total_count from filtered f)
  select c.id, c.email, c.full_name, c.phone, c.photo_url, c.role,
    c.created_at, c.last_sign_in_at, c.email_confirmed_at, c.banned_until, c.total_count
  from counted c
  order by
    case when p_sort = 'created_desc' then c.created_at end desc nulls last,
    case when p_sort = 'created_asc'  then c.created_at end asc  nulls last,
    case when p_sort = 'name_asc'     then c.full_name end asc,
    case when p_sort = 'name_desc'    then c.full_name end desc,
    case when p_sort = 'email_asc'    then c.email end asc,
    case when p_sort = 'email_desc'   then c.email end desc,
    case when p_sort = 'last_login_desc' then c.last_sign_in_at end desc nulls last,
    case when p_sort = 'last_login_asc'  then c.last_sign_in_at end asc  nulls last
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end; $$;


--
-- Name: admin_user_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_user_stats() RETURNS TABLE(total bigint, students bigint, admins bigint, active_today bigint, verified bigint, new_last_7_days bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: admin role required'; end if;
  return query
  select (select count(*) from auth.users)::bigint,
    (select count(distinct user_id) from public.user_roles where role = 'student')::bigint,
    (select count(distinct user_id) from public.user_roles where role = 'admin')::bigint,
    (select count(*) from auth.users where last_sign_in_at >= date_trunc('day', now()))::bigint,
    (select count(*) from auth.users where email_confirmed_at is not null)::bigint,
    (select count(*) from auth.users where created_at >= now() - interval '7 days')::bigint;
end; $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict (user_id, role) do nothing;
  return new;
end;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;


--
-- Name: mcq_practice_taxonomy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mcq_practice_taxonomy() RETURNS TABLE(level_id uuid, level_name text, level_slug text, level_description text, level_position integer, subject_id uuid, subject_name text, subject_slug text, subject_description text, subject_position integer, chapter_id uuid, chapter_name text, chapter_slug text, chapter_description text, chapter_position integer, total_mcqs bigint, done bigint, correct bigint, wrong bigint, time_spent_ms bigint, bookmarks bigint, last_practiced_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    l.id, l.name, l.slug, l.description, l.position,
    s.id, s.name, s.slug, s.description, s.position,
    c.id, c.name, c.slug, c.description, c.position,
    coalesce(q.total, 0), coalesce(a.done, 0), coalesce(a.correct, 0), coalesce(a.wrong, 0),
    coalesce(a.time_spent_ms, 0), coalesce(b.bookmarks, 0), a.last_practiced_at
  from public.academic_levels l
  join public.academic_subjects s on s.level_id = l.id
  join public.academic_chapters c on c.subject_id = s.id
  left join lateral (select count(*)::bigint as total from public.mcq_questions mq
    where mq.chapter_id = c.id and mq.status = 'published') q on true
  left join lateral (select count(*)::bigint as done,
    count(*) filter (where ma.is_correct)::bigint as correct,
    count(*) filter (where not ma.is_correct)::bigint as wrong,
    coalesce(sum(ma.time_spent_ms), 0)::bigint as time_spent_ms,
    max(ma.created_at) as last_practiced_at
    from public.mcq_attempts ma
    where ma.user_id = auth.uid() and ma.chapter_id = c.id) a on true
  left join lateral (select count(*)::bigint as bookmarks
    from public.bookmarks bm join public.mcq_questions mq2 on mq2.id = bm.question_id
    where bm.user_id = auth.uid() and bm.source = 'mcq' and mq2.chapter_id = c.id) b on true
  order by l.position, s.position, c.position;
$$;


--
-- Name: qbank_practice_taxonomy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qbank_practice_taxonomy() RETURNS TABLE(level_id uuid, level_name text, level_slug text, level_description text, level_position integer, subject_id uuid, subject_name text, subject_slug text, subject_description text, subject_position integer, chapter_id uuid, chapter_name text, chapter_slug text, chapter_description text, chapter_position integer, total_mcqs bigint, done bigint, correct bigint, wrong bigint, time_spent_ms bigint, bookmarks bigint, last_practiced_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    l.id, l.name, l.slug, l.description, l.position,
    s.id, s.name, s.slug, s.description, s.position,
    c.id, c.name, c.slug, c.description, c.position,
    coalesce(q.total, 0), coalesce(a.done, 0), coalesce(a.correct, 0), coalesce(a.wrong, 0),
    coalesce(a.time_spent_ms, 0), coalesce(b.bookmarks, 0), a.last_practiced_at
  from public.academic_levels l
  join public.academic_subjects s on s.level_id = l.id
  join public.academic_chapters c on c.subject_id = s.id
  left join lateral (select count(*)::bigint as total from public.qbank_questions qq
    where qq.chapter_id = c.id and qq.status = 'published') q on true
  left join lateral (select count(*)::bigint as done,
    count(*) filter (where qa.is_correct)::bigint as correct,
    count(*) filter (where not qa.is_correct)::bigint as wrong,
    coalesce(sum(qa.time_spent_ms), 0)::bigint as time_spent_ms,
    max(qa.created_at) as last_practiced_at
    from public.qbank_attempts qa
    where qa.user_id = auth.uid() and qa.chapter_id = c.id) a on true
  left join lateral (select count(*)::bigint as bookmarks
    from public.bookmarks bm join public.qbank_questions qq2 on qq2.id = bm.question_id
    where bm.user_id = auth.uid() and bm.source = 'qbank' and qq2.chapter_id = c.id) b on true
  order by l.position, s.position, c.position;
$$;


--
-- Name: tg_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin new.updated_at = now(); return new; end;
$$;




--
-- Name: academic_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_chapters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    name text NOT NULL,
    slug text,
    "position" integer DEFAULT 0 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: academic_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    "position" integer DEFAULT 0 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: academic_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_id uuid NOT NULL,
    name text NOT NULL,
    slug text,
    "position" integer DEFAULT 0 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    singleton boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source public.question_source NOT NULL,
    question_id uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: custom_exam_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_exam_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    source public.question_source NOT NULL,
    question_id uuid NOT NULL,
    selected_index integer,
    answer text,
    is_correct boolean,
    time_spent_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: custom_exam_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_exam_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    score numeric,
    total_questions integer DEFAULT 0 NOT NULL,
    correct_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mcq_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcq_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    question_id uuid NOT NULL,
    chapter_id uuid,
    selected_index integer,
    is_correct boolean NOT NULL,
    time_spent_ms integer,
    session_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mcq_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcq_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    question text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    correct_index integer DEFAULT 0 NOT NULL,
    explanation text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text,
    batch_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    phone text,
    institution text,
    photo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qbank_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qbank_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    question_id uuid NOT NULL,
    chapter_id uuid,
    answer text,
    selected_index integer,
    is_correct boolean NOT NULL,
    time_spent_ms integer,
    session_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qbank_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qbank_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chapter_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    question text,
    prompt text,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    correct_index integer DEFAULT 0 NOT NULL,
    answer text,
    explanation text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text,
    batch_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: routine_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routine_id uuid NOT NULL,
    target_type text NOT NULL,
    target_value text,
    target_user_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routine_assignments_target_type_check CHECK ((target_type = ANY (ARRAY['level'::text, 'subject'::text, 'user'::text])))
);


--
-- Name: routine_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routine_id uuid NOT NULL,
    user_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    label text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routine_days_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: routine_task_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_task_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    completed_on date NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    study_hours numeric DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: routine_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routine_id uuid NOT NULL,
    day_id uuid,
    user_id uuid NOT NULL,
    title text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    level text,
    subject text,
    chapter text,
    routine_type text DEFAULT 'daily'::text NOT NULL,
    hours_per_day numeric DEFAULT 1 NOT NULL,
    starts_on date,
    ends_on date,
    is_archived boolean DEFAULT false NOT NULL,
    accent text,
    target_mcqs integer,
    target_chapters integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: student_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_preferences (
    user_id uuid NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wrong_answer_bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wrong_answer_bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source public.question_source NOT NULL,
    question_id uuid NOT NULL,
    wrong_count integer DEFAULT 1 NOT NULL,
    last_wrong_at timestamp with time zone DEFAULT now() NOT NULL,
    cleared_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: academic_chapters academic_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_chapters
    ADD CONSTRAINT academic_chapters_pkey PRIMARY KEY (id);


--
-- Name: academic_levels academic_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_levels
    ADD CONSTRAINT academic_levels_pkey PRIMARY KEY (id);


--
-- Name: academic_levels academic_levels_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_levels
    ADD CONSTRAINT academic_levels_slug_key UNIQUE (slug);


--
-- Name: academic_subjects academic_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_subjects
    ADD CONSTRAINT academic_subjects_pkey PRIMARY KEY (id);


--
-- Name: admin_settings admin_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings
    ADD CONSTRAINT admin_settings_pkey PRIMARY KEY (id);


--
-- Name: admin_settings admin_settings_singleton_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings
    ADD CONSTRAINT admin_settings_singleton_key UNIQUE (singleton);


--
-- Name: bookmarks bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);


--
-- Name: bookmarks bookmarks_user_id_source_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_user_id_source_question_id_key UNIQUE (user_id, source, question_id);


--
-- Name: custom_exam_answers custom_exam_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_exam_answers
    ADD CONSTRAINT custom_exam_answers_pkey PRIMARY KEY (id);


--
-- Name: custom_exam_answers custom_exam_answers_session_question_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_exam_answers
    ADD CONSTRAINT custom_exam_answers_session_question_unique UNIQUE (session_id, question_id, source);


--
-- Name: custom_exam_sessions custom_exam_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_exam_sessions
    ADD CONSTRAINT custom_exam_sessions_pkey PRIMARY KEY (id);


--
-- Name: mcq_attempts mcq_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcq_attempts
    ADD CONSTRAINT mcq_attempts_pkey PRIMARY KEY (id);


--
-- Name: mcq_attempts mcq_attempts_user_question_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcq_attempts
    ADD CONSTRAINT mcq_attempts_user_question_key UNIQUE (user_id, question_id);


--
-- Name: mcq_questions mcq_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcq_questions
    ADD CONSTRAINT mcq_questions_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: qbank_attempts qbank_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qbank_attempts
    ADD CONSTRAINT qbank_attempts_pkey PRIMARY KEY (id);


--
-- Name: qbank_attempts qbank_attempts_user_question_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qbank_attempts
    ADD CONSTRAINT qbank_attempts_user_question_unique UNIQUE (user_id, question_id);


--
-- Name: qbank_questions qbank_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qbank_questions
    ADD CONSTRAINT qbank_questions_pkey PRIMARY KEY (id);


--
-- Name: routine_assignments routine_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_assignments
    ADD CONSTRAINT routine_assignments_pkey PRIMARY KEY (id);


--
-- Name: routine_days routine_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_days
    ADD CONSTRAINT routine_days_pkey PRIMARY KEY (id);


--
-- Name: routine_task_completions routine_task_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_task_completions
    ADD CONSTRAINT routine_task_completions_pkey PRIMARY KEY (id);


--
-- Name: routine_task_completions routine_task_completions_task_id_completed_on_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_task_completions
    ADD CONSTRAINT routine_task_completions_task_id_completed_on_key UNIQUE (task_id, completed_on);


--
-- Name: routine_tasks routine_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_tasks
    ADD CONSTRAINT routine_tasks_pkey PRIMARY KEY (id);


--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);


--
-- Name: student_preferences student_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_preferences
    ADD CONSTRAINT student_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: wrong_answer_bookmarks wrong_answer_bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wrong_answer_bookmarks
    ADD CONSTRAINT wrong_answer_bookmarks_pkey PRIMARY KEY (id);


--
-- Name: wrong_answer_bookmarks wrong_answer_bookmarks_user_id_source_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wrong_answer_bookmarks
    ADD CONSTRAINT wrong_answer_bookmarks_user_id_source_question_id_key UNIQUE (user_id, source, question_id);


--
-- Name: academic_chapters_subject_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academic_chapters_subject_id_position_idx ON public.academic_chapters USING btree (subject_id, "position");


--
-- Name: academic_levels_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academic_levels_position_idx ON public.academic_levels USING btree ("position");


--
-- Name: academic_subjects_level_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academic_subjects_level_id_position_idx ON public.academic_subjects USING btree (level_id, "position");


--
-- Name: bookmarks_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookmarks_user_id_created_at_idx ON public.bookmarks USING btree (user_id, created_at DESC);


--
-- Name: custom_exam_answers_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_exam_answers_session_idx ON public.custom_exam_answers USING btree (session_id);


--
-- Name: custom_exam_answers_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_exam_answers_user_id_created_at_idx ON public.custom_exam_answers USING btree (user_id, created_at DESC);


--
-- Name: custom_exam_sessions_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_exam_sessions_user_active_idx ON public.custom_exam_sessions USING btree (user_id, finished_at, created_at DESC);


--
-- Name: custom_exam_sessions_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_exam_sessions_user_id_created_at_idx ON public.custom_exam_sessions USING btree (user_id, created_at DESC);


--
-- Name: idx_routine_assignments_routine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routine_assignments_routine ON public.routine_assignments USING btree (routine_id);


--
-- Name: idx_routine_assignments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routine_assignments_user ON public.routine_assignments USING btree (target_user_id);


--
-- Name: idx_routines_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routines_created_at ON public.routines USING btree (created_at DESC);


--
-- Name: idx_routines_ends_on; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routines_ends_on ON public.routines USING btree (ends_on);


--
-- Name: idx_routines_level_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routines_level_status ON public.routines USING btree (level, is_archived);


--
-- Name: mcq_attempts_user_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcq_attempts_user_chapter_idx ON public.mcq_attempts USING btree (user_id, chapter_id);


--
-- Name: mcq_attempts_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcq_attempts_user_id_created_at_idx ON public.mcq_attempts USING btree (user_id, created_at DESC);


--
-- Name: mcq_questions_chapter_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcq_questions_chapter_id_position_idx ON public.mcq_questions USING btree (chapter_id, "position");


--
-- Name: mcq_questions_chapter_status_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mcq_questions_chapter_status_position_idx ON public.mcq_questions USING btree (chapter_id, status, "position");


--
-- Name: qbank_attempts_user_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qbank_attempts_user_chapter_idx ON public.qbank_attempts USING btree (user_id, chapter_id);


--
-- Name: qbank_attempts_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qbank_attempts_user_id_created_at_idx ON public.qbank_attempts USING btree (user_id, created_at DESC);


--
-- Name: qbank_questions_chapter_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qbank_questions_chapter_id_position_idx ON public.qbank_questions USING btree (chapter_id, "position");


--
-- Name: routine_days_routine_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routine_days_routine_id_position_idx ON public.routine_days USING btree (routine_id, "position");


--
-- Name: routine_task_completions_user_id_completed_on_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routine_task_completions_user_id_completed_on_idx ON public.routine_task_completions USING btree (user_id, completed_on DESC);


--
-- Name: routine_task_completions_user_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routine_task_completions_user_task_idx ON public.routine_task_completions USING btree (user_id, task_id);


--
-- Name: routine_tasks_day_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routine_tasks_day_id_position_idx ON public.routine_tasks USING btree (day_id, "position");


--
-- Name: routine_tasks_routine_id_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routine_tasks_routine_id_position_idx ON public.routine_tasks USING btree (routine_id, "position");


--
-- Name: routines_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routines_user_id_created_at_idx ON public.routines USING btree (user_id, created_at DESC);


--
-- Name: wrong_answer_bookmarks_user_id_last_wrong_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wrong_answer_bookmarks_user_id_last_wrong_at_idx ON public.wrong_answer_bookmarks USING btree (user_id, last_wrong_at DESC);


--
-- Name: academic_chapters academic_chapters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER academic_chapters_updated_at BEFORE UPDATE ON public.academic_chapters FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: academic_levels academic_levels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER academic_levels_updated_at BEFORE UPDATE ON public.academic_levels FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: academic_subjects academic_subjects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER academic_subjects_updated_at BEFORE UPDATE ON public.academic_subjects FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: admin_settings admin_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER admin_settings_updated_at BEFORE UPDATE ON public.admin_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: custom_exam_sessions custom_exam_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER custom_exam_sessions_updated_at BEFORE UPDATE ON public.custom_exam_sessions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: mcq_questions mcq_questions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mcq_questions_updated_at BEFORE UPDATE ON public.mcq_questions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: qbank_questions qbank_questions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER qbank_questions_updated_at BEFORE UPDATE ON public.qbank_questions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: routine_task_completions routine_task_completions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER routine_task_completions_updated_at BEFORE UPDATE ON public.routine_task_completions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: routine_tasks routine_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER routine_tasks_updated_at BEFORE UPDATE ON public.routine_tasks FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: routines routines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER routines_updated_at BEFORE UPDATE ON public.routines FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: student_preferences student_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER student_preferences_updated_at BEFORE UPDATE ON public.student_preferences FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: academic_chapters academic_chapters_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_chapters
    ADD CONSTRAINT academic_chapters_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.academic_subjects(id) ON DELETE CASCADE;


--
-- Name: academic_subjects academic_subjects_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_subjects
    ADD CONSTRAINT academic_subjects_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.academic_levels(id) ON DELETE CASCADE;


--
-- Name: bookmarks bookmarks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookmarks
    ADD CONSTRAINT bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: custom_exam_answers custom_exam_answers_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_exam_answers
    ADD CONSTRAINT custom_exam_answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.custom_exam_sessions(id) ON DELETE CASCADE;


--
-- Name: custom_exam_answers custom_exam_answers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_exam_answers
    ADD CONSTRAINT custom_exam_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: custom_exam_sessions custom_exam_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_exam_sessions
    ADD CONSTRAINT custom_exam_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mcq_attempts mcq_attempts_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcq_attempts
    ADD CONSTRAINT mcq_attempts_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.academic_chapters(id) ON DELETE SET NULL;


--
-- Name: mcq_attempts mcq_attempts_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcq_attempts
    ADD CONSTRAINT mcq_attempts_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.mcq_questions(id) ON DELETE CASCADE;


--
-- Name: mcq_attempts mcq_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcq_attempts
    ADD CONSTRAINT mcq_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mcq_questions mcq_questions_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcq_questions
    ADD CONSTRAINT mcq_questions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.academic_chapters(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: qbank_attempts qbank_attempts_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qbank_attempts
    ADD CONSTRAINT qbank_attempts_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.academic_chapters(id) ON DELETE SET NULL;


--
-- Name: qbank_attempts qbank_attempts_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qbank_attempts
    ADD CONSTRAINT qbank_attempts_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.qbank_questions(id) ON DELETE CASCADE;


--
-- Name: qbank_attempts qbank_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qbank_attempts
    ADD CONSTRAINT qbank_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: qbank_questions qbank_questions_chapter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qbank_questions
    ADD CONSTRAINT qbank_questions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.academic_chapters(id) ON DELETE CASCADE;


--
-- Name: routine_assignments routine_assignments_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_assignments
    ADD CONSTRAINT routine_assignments_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;


--
-- Name: routine_days routine_days_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_days
    ADD CONSTRAINT routine_days_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;


--
-- Name: routine_days routine_days_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_days
    ADD CONSTRAINT routine_days_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: routine_task_completions routine_task_completions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_task_completions
    ADD CONSTRAINT routine_task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.routine_tasks(id) ON DELETE CASCADE;


--
-- Name: routine_task_completions routine_task_completions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_task_completions
    ADD CONSTRAINT routine_task_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: routine_tasks routine_tasks_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_tasks
    ADD CONSTRAINT routine_tasks_day_id_fkey FOREIGN KEY (day_id) REFERENCES public.routine_days(id) ON DELETE CASCADE;


--
-- Name: routine_tasks routine_tasks_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_tasks
    ADD CONSTRAINT routine_tasks_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;


--
-- Name: routine_tasks routine_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_tasks
    ADD CONSTRAINT routine_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: routines routines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: student_preferences student_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_preferences
    ADD CONSTRAINT student_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wrong_answer_bookmarks wrong_answer_bookmarks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wrong_answer_bookmarks
    ADD CONSTRAINT wrong_answer_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: academic_chapters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.academic_chapters ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_chapters academic_chapters admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "academic_chapters admin write" ON public.academic_chapters TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: academic_chapters academic_chapters read auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "academic_chapters read auth" ON public.academic_chapters FOR SELECT TO authenticated USING (true);


--
-- Name: academic_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.academic_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_levels academic_levels admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "academic_levels admin write" ON public.academic_levels TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: academic_levels academic_levels read auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "academic_levels read auth" ON public.academic_levels FOR SELECT TO authenticated USING (true);


--
-- Name: academic_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.academic_subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_subjects academic_subjects admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "academic_subjects admin write" ON public.academic_subjects TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: academic_subjects academic_subjects read auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "academic_subjects read auth" ON public.academic_subjects FOR SELECT TO authenticated USING (true);


--
-- Name: admin_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_settings admin_settings admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_settings admin write" ON public.admin_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_settings admin_settings read auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_settings read auth" ON public.admin_settings FOR SELECT TO authenticated USING (true);


--
-- Name: bookmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: bookmarks bookmarks self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bookmarks self all" ON public.bookmarks TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: custom_exam_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_exam_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_exam_answers custom_exam_answers self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "custom_exam_answers self all" ON public.custom_exam_answers TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: custom_exam_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_exam_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_exam_sessions custom_exam_sessions self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "custom_exam_sessions self all" ON public.custom_exam_sessions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: mcq_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcq_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: mcq_attempts mcq_attempts admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mcq_attempts admin select" ON public.mcq_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mcq_attempts mcq_attempts self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mcq_attempts self all" ON public.mcq_attempts TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: mcq_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mcq_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: mcq_questions mcq_questions admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mcq_questions admin write" ON public.mcq_questions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mcq_questions mcq_questions read auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mcq_questions read auth" ON public.mcq_questions FOR SELECT TO authenticated USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles admin select all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles admin select all" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles profiles admin update all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles admin update all" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles profiles self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: profiles profiles self select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles self select" ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: profiles profiles self update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: qbank_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qbank_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: qbank_attempts qbank_attempts admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qbank_attempts admin select" ON public.qbank_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: qbank_attempts qbank_attempts self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qbank_attempts self all" ON public.qbank_attempts TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: qbank_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qbank_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: qbank_questions qbank_questions admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qbank_questions admin write" ON public.qbank_questions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: qbank_questions qbank_questions read auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "qbank_questions read auth" ON public.qbank_questions FOR SELECT TO authenticated USING (true);


--
-- Name: routine_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routine_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: routine_assignments routine_assignments admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_assignments admin all" ON public.routine_assignments TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: routine_assignments routine_assignments auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_assignments auth read" ON public.routine_assignments FOR SELECT TO authenticated USING (true);


--
-- Name: routine_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routine_days ENABLE ROW LEVEL SECURITY;

--
-- Name: routine_days routine_days admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_days admin all" ON public.routine_days TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: routine_days routine_days auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_days auth read" ON public.routine_days FOR SELECT TO authenticated USING (true);


--
-- Name: routine_days routine_days self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_days self all" ON public.routine_days TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: routine_task_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routine_task_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: routine_task_completions routine_task_completions admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_task_completions admin select" ON public.routine_task_completions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: routine_task_completions routine_task_completions self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_task_completions self all" ON public.routine_task_completions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: routine_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routine_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: routine_tasks routine_tasks admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_tasks admin all" ON public.routine_tasks TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: routine_tasks routine_tasks auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_tasks auth read" ON public.routine_tasks FOR SELECT TO authenticated USING (true);


--
-- Name: routine_tasks routine_tasks self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routine_tasks self all" ON public.routine_tasks TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: routines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

--
-- Name: routines routines admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routines admin all" ON public.routines TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: routines routines auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routines auth read" ON public.routines FOR SELECT TO authenticated USING (true);


--
-- Name: routines routines self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "routines self all" ON public.routines TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: student_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: student_preferences student_preferences self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "student_preferences self all" ON public.student_preferences TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles admin select all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_roles admin select all" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles user_roles self select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_roles self select" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: wrong_answer_bookmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wrong_answer_bookmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: wrong_answer_bookmarks wrong_answer_bookmarks self all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wrong_answer_bookmarks self all" ON public.wrong_answer_bookmarks TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION admin_get_user(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_get_user(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_get_user(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_get_user(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION admin_list_users(p_search text, p_role text, p_status text, p_verified text, p_from timestamp with time zone, p_to timestamp with time zone, p_sort text, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_list_users(p_search text, p_role text, p_status text, p_verified text, p_from timestamp with time zone, p_to timestamp with time zone, p_sort text, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_users(p_search text, p_role text, p_status text, p_verified text, p_from timestamp with time zone, p_to timestamp with time zone, p_sort text, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_users(p_search text, p_role text, p_status text, p_verified text, p_from timestamp with time zone, p_to timestamp with time zone, p_sort text, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION admin_user_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_user_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_user_stats() TO authenticated;
GRANT ALL ON FUNCTION public.admin_user_stats() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;


--
-- Name: FUNCTION mcq_practice_taxonomy(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mcq_practice_taxonomy() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mcq_practice_taxonomy() TO anon;
GRANT ALL ON FUNCTION public.mcq_practice_taxonomy() TO authenticated;
GRANT ALL ON FUNCTION public.mcq_practice_taxonomy() TO service_role;


--
-- Name: FUNCTION qbank_practice_taxonomy(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.qbank_practice_taxonomy() FROM PUBLIC;
GRANT ALL ON FUNCTION public.qbank_practice_taxonomy() TO anon;
GRANT ALL ON FUNCTION public.qbank_practice_taxonomy() TO authenticated;
GRANT ALL ON FUNCTION public.qbank_practice_taxonomy() TO service_role;


--
-- Name: FUNCTION tg_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.tg_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.tg_set_updated_at() TO service_role;


--
-- Name: TABLE academic_chapters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.academic_chapters TO anon;
GRANT ALL ON TABLE public.academic_chapters TO authenticated;
GRANT ALL ON TABLE public.academic_chapters TO service_role;


--
-- Name: TABLE academic_levels; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.academic_levels TO anon;
GRANT ALL ON TABLE public.academic_levels TO authenticated;
GRANT ALL ON TABLE public.academic_levels TO service_role;


--
-- Name: TABLE academic_subjects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.academic_subjects TO anon;
GRANT ALL ON TABLE public.academic_subjects TO authenticated;
GRANT ALL ON TABLE public.academic_subjects TO service_role;


--
-- Name: TABLE admin_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_settings TO anon;
GRANT ALL ON TABLE public.admin_settings TO authenticated;
GRANT ALL ON TABLE public.admin_settings TO service_role;


--
-- Name: TABLE bookmarks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bookmarks TO anon;
GRANT ALL ON TABLE public.bookmarks TO authenticated;
GRANT ALL ON TABLE public.bookmarks TO service_role;


--
-- Name: TABLE custom_exam_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.custom_exam_answers TO anon;
GRANT ALL ON TABLE public.custom_exam_answers TO authenticated;
GRANT ALL ON TABLE public.custom_exam_answers TO service_role;


--
-- Name: TABLE custom_exam_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.custom_exam_sessions TO anon;
GRANT ALL ON TABLE public.custom_exam_sessions TO authenticated;
GRANT ALL ON TABLE public.custom_exam_sessions TO service_role;


--
-- Name: TABLE mcq_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mcq_attempts TO anon;
GRANT ALL ON TABLE public.mcq_attempts TO authenticated;
GRANT ALL ON TABLE public.mcq_attempts TO service_role;


--
-- Name: TABLE mcq_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mcq_questions TO anon;
GRANT ALL ON TABLE public.mcq_questions TO authenticated;
GRANT ALL ON TABLE public.mcq_questions TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE qbank_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qbank_attempts TO anon;
GRANT ALL ON TABLE public.qbank_attempts TO authenticated;
GRANT ALL ON TABLE public.qbank_attempts TO service_role;


--
-- Name: TABLE qbank_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qbank_questions TO anon;
GRANT ALL ON TABLE public.qbank_questions TO authenticated;
GRANT ALL ON TABLE public.qbank_questions TO service_role;


--
-- Name: TABLE routine_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routine_assignments TO anon;
GRANT ALL ON TABLE public.routine_assignments TO authenticated;
GRANT ALL ON TABLE public.routine_assignments TO service_role;


--
-- Name: TABLE routine_days; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routine_days TO anon;
GRANT ALL ON TABLE public.routine_days TO authenticated;
GRANT ALL ON TABLE public.routine_days TO service_role;


--
-- Name: TABLE routine_task_completions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routine_task_completions TO anon;
GRANT ALL ON TABLE public.routine_task_completions TO authenticated;
GRANT ALL ON TABLE public.routine_task_completions TO service_role;


--
-- Name: TABLE routine_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routine_tasks TO anon;
GRANT ALL ON TABLE public.routine_tasks TO authenticated;
GRANT ALL ON TABLE public.routine_tasks TO service_role;


--
-- Name: TABLE routines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routines TO anon;
GRANT ALL ON TABLE public.routines TO authenticated;
GRANT ALL ON TABLE public.routines TO service_role;


--
-- Name: TABLE student_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_preferences TO anon;
GRANT ALL ON TABLE public.student_preferences TO authenticated;
GRANT ALL ON TABLE public.student_preferences TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE wrong_answer_bookmarks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wrong_answer_bookmarks TO anon;
GRANT ALL ON TABLE public.wrong_answer_bookmarks TO authenticated;
GRANT ALL ON TABLE public.wrong_answer_bookmarks TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

\unrestrict wL1HvaJ3FZgzQdlSwsWaUczKnMqRGBFK7J6qzFnTcDPP6HbhxFhnb4RD6phK7dt


-- ============================================================================
-- Required function permissions / hardening
-- ============================================================================
-- has_role is intentionally SECURITY DEFINER with a locked search_path so RLS
-- policies and authenticated server functions can check roles without recursive
-- user_roles policy failures.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, text, text, timestamp with time zone, timestamp with time zone, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, text, text, timestamp with time zone, timestamp with time zone, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.mcq_practice_taxonomy() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qbank_practice_taxonomy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcq_practice_taxonomy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.qbank_practice_taxonomy() TO authenticated;
