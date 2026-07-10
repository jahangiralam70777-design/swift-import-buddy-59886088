# Render Deployment Guide

## 1. Database (fresh production)

Run **`PRODUCTION_SCHEMA.sql`** once against your production Supabase / Postgres
database. It is idempotent-safe on an empty DB and contains:

- All enums (`app_role`, `question_source`)
- All 20 tables (profiles, user_roles, academic_*, mcq_*, qbank_*, bookmarks,
  wrong_answer_bookmarks, routines, routine_*, custom_exam_*, student_preferences,
  admin_settings)
- All foreign keys, unique constraints, defaults
- All indexes (composite indexes for hot query paths)
- `updated_at` triggers on every table with an `updated_at` column
- `handle_new_user` trigger on `auth.users` (auto-creates profile + student role)
- RLS enabled on every table + all policies (owner-scoped + admin overrides)
- SECURITY DEFINER RPCs: `has_role`, `admin_list_users`, `admin_get_user`,
  `admin_user_stats`, `mcq_practice_taxonomy`, `qbank_practice_taxonomy`
- All GRANTs to `authenticated` / `service_role`
- Single config row in `admin_settings` (empty JSON — required singleton)

**No sample data. No seed data. No demo accounts.** The DB starts empty.

Create the first admin manually after signup:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<uuid-of-first-signed-up-user>', 'admin');
```

## 2. Render service

Deploy as a **Node Web Service** using the included `render.yaml` (Blueprint),
or configure manually:

| Setting | Value |
|---|---|
| Runtime | Node 20 |
| Build Command | `bun install && bun run build:render` |
| Start Command | `node .output/server/index.mjs` |
| Health Check Path | `/` |

## 3. Required environment variables

Set these in Render → Environment (all marked `sync: false` in `render.yaml`):

**Client-visible (Vite):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

**Server-only:**
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY` (only if using Lovable AI Gateway features)

**Standard:**
- `NODE_ENV=production`
- `NODE_VERSION=20`

## 4. Supabase Auth configuration

In the Supabase Auth dashboard:

- **Site URL** → your Render URL (e.g. `https://exam-prep-app.onrender.com`)
- **Additional Redirect URLs** → add the same URL + `/auth/callback`
- **Google provider** → enabled with your OAuth credentials
- **Email confirmation** → enabled (recommended for production)

## 5. Production checklist

- [ ] `PRODUCTION_SCHEMA.sql` executed on empty production DB
- [ ] First admin user promoted via `INSERT INTO user_roles`
- [ ] All environment variables set in Render
- [ ] Supabase Site URL + redirect URLs point at Render domain
- [ ] Google OAuth client has Render domain in authorized origins
- [ ] Custom domain configured (optional) + HTTPS verified
- [ ] Build passes: `bun run build:render`
- [ ] Server starts: `node .output/server/index.mjs`
- [ ] Refresh on deep route (e.g. `/student/mcq-practice`) returns 200
- [ ] Sign-up flow creates profile row + student role automatically
- [ ] Admin panel gated behind admin role

## 6. Build & start commands

```bash
# Production build (Node/Render target)
bun run build:render

# Production start
node .output/server/index.mjs
# or
bun run start
```

Local dev is unchanged: `bun run dev`.
