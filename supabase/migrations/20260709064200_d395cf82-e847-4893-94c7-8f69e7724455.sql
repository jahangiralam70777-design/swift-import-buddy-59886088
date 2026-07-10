-- Admin user management RPCs. Read from auth.users + public.profiles + public.user_roles.
-- SECURITY DEFINER + explicit has_role() guard so only admins can call them.

create or replace function public.admin_list_users(
  p_search text default null,
  p_role text default null,
  p_status text default null,
  p_verified text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort text default 'created_desc',
  p_limit int default 50,
  p_offset int default 0
) returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  photo_url text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  return query
  with base as (
    select
      u.id,
      u.email::text as email,
      coalesce(p.full_name, '') as full_name,
      coalesce(p.phone, '') as phone,
      p.photo_url,
      coalesce(
        (select r.role::text from public.user_roles r where r.user_id = u.id
          order by case when r.role::text = 'admin' then 0 else 1 end limit 1),
        'student'
      ) as role,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      u.banned_until
    from auth.users u
    left join public.profiles p on p.id = u.id
  ),
  filtered as (
    select * from base b
    where (p_search is null or (
      b.email ilike '%' || p_search || '%'
      or b.full_name ilike '%' || p_search || '%'
      or b.phone ilike '%' || p_search || '%'
    ))
    and (p_role is null or b.role = p_role)
    and (p_status is null or (
      (p_status = 'active' and (b.banned_until is null or b.banned_until <= now()))
      or (p_status = 'disabled' and b.banned_until is not null and b.banned_until > now())
    ))
    and (p_verified is null or (
      (p_verified = 'verified' and b.email_confirmed_at is not null)
      or (p_verified = 'unverified' and b.email_confirmed_at is null)
    ))
    and (p_from is null or b.created_at >= p_from)
    and (p_to is null or b.created_at <= p_to)
  ),
  counted as (
    select f.*, count(*) over() as total_count from filtered f
  )
  select
    c.id, c.email, c.full_name, c.phone, c.photo_url, c.role,
    c.created_at, c.last_sign_in_at, c.email_confirmed_at, c.banned_until,
    c.total_count
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
end;
$$;

create or replace function public.admin_get_user(p_user_id uuid)
returns table (
  id uuid, email text, full_name text, phone text, photo_url text,
  institution text, role text,
  created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, banned_until timestamptz
)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;
  return query
  select
    u.id, u.email::text, coalesce(p.full_name, ''), coalesce(p.phone, ''),
    p.photo_url, p.institution,
    coalesce(
      (select r.role::text from public.user_roles r where r.user_id = u.id
        order by case when r.role::text = 'admin' then 0 else 1 end limit 1),
      'student'
    ),
    u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
end;
$$;

create or replace function public.admin_user_stats()
returns table (
  total bigint, students bigint, admins bigint,
  active_today bigint, verified bigint, new_last_7_days bigint
)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;
  return query
  select
    (select count(*) from auth.users)::bigint,
    (select count(distinct user_id) from public.user_roles where role = 'student')::bigint,
    (select count(distinct user_id) from public.user_roles where role = 'admin')::bigint,
    (select count(*) from auth.users where last_sign_in_at >= date_trunc('day', now()))::bigint,
    (select count(*) from auth.users where email_confirmed_at is not null)::bigint,
    (select count(*) from auth.users where created_at >= now() - interval '7 days')::bigint;
end;
$$;

grant execute on function public.admin_list_users(text,text,text,text,timestamptz,timestamptz,text,int,int) to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_user_stats() to authenticated;