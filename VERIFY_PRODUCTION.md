# Production Verification

Run these checks after deployment and record pass/fail results.

## Public/auth routes

- `/` renders the CL Aspire home page.
- `/login` signs in users and redirects by role.
- `/signup` creates student users when signup is enabled.
- `/forgot-password` starts reset flow.
- `/reset-password` completes reset flow.
- `/admin/login` signs in admin users.

## Admin routes

- `/admin` shows the live Admin Overview dashboard with workspace stats.
- `/admin/academic-manager` loads academic tree data and can create, edit, reorder, and delete levels, subjects, and chapters.
- `/admin/mcq-manager` loads academic filters, lists MCQs, and supports create, edit, import, status change, move, and delete.
- `/admin/qns-bank-manager` loads academic filters, lists question bank records, and supports create, edit, import, status change, move, and delete.
- `/admin/routine-manager` lists routines and supports create, update, duplicate, archive, delete, and student progress views.
- `/admin/user-manager` lists users, filters users, updates profile fields, changes roles, sends password resets, disables/enables accounts, forces logout, and deletes users.
- `/admin/settings` loads and saves admin settings and system stats.

## Student routes

- `/student` loads dashboard data without `has_role` permission errors.
- `/student/mcq-practice` loads taxonomy and starts a practice session.
- `/student/qns-bank-practice` loads taxonomy and starts a practice session.
- `/student/custom-exam` generates a custom exam and opens the session route.
- `/student/routine-tracker` loads assigned routines and completion state.
- `/student/progress-tracker` loads and saves progress checkpoints.
- `/student/bookmarks` loads and removes bookmarks.
- `/student/wrong-answers` loads wrong-answer bookmarks.
- `/student/settings` loads and saves profile/preferences.

## Backend verification SQL

```sql
select
  p.oid::regprocedure::text as signature,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.proacl::text as acl,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'has_role';
```

Expected result:

- Signature: `has_role(uuid,app_role)`
- `security_definer = true`
- Definition includes `SET search_path TO 'public'`
- ACL grants execute to `authenticated`

## Browser checks

- No route renders `Dashboard is under development`.
- No console errors for broken imports, duplicate routes, or server function auth.
- Admin CRUD mutations return success responses and update visible data after cache invalidation.