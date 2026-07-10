# Deployment Checklist

Use this checklist before every production deployment.

## Source and build

- Confirm the deployed commit contains `src/routes/_authenticated.admin.index.tsx` with the live admin dashboard implementation, not placeholder copy.
- Confirm these admin route files exist and are included in the router build:
  - `/_authenticated/admin/`
  - `/_authenticated/admin/academic-manager`
  - `/_authenticated/admin/mcq-manager`
  - `/_authenticated/admin/qns-bank-manager`
  - `/_authenticated/admin/routine-manager`
  - `/_authenticated/admin/user-manager`
  - `/_authenticated/admin/settings`
- Confirm `src/start.ts` registers `functionMiddleware: [attachSupabaseAuth]` so authenticated server functions receive the bearer token.
- Confirm Render uses:
  - Build command: `bun install && bun run build:render`
  - Start command: `node .output/server/index.mjs`
- Confirm `BUILD_TARGET=render` is set by `build:render` and `vite.config.ts` switches Nitro to `node-server`.

## Required environment variables

- `NODE_ENV=production`
- `NODE_VERSION=20`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY`

## Database

- Run the single `PRODUCTION_SCHEMA.sql` only on a fresh database.
- Confirm no separate SQL file is required for schema, grants, RLS, functions, triggers, or indexes.
- Confirm `public.has_role(uuid, public.app_role)` exists.
- Confirm `has_role` is `SECURITY DEFINER` and `SET search_path = public`.
- Confirm `authenticated` can execute `has_role`.
- Confirm all public tables have explicit grants and RLS policies.

## Post-deploy smoke test

- Sign in as an admin.
- Open `/admin` and verify the live stats dashboard appears.
- Open each manager page and perform a read operation.
- Create, edit, and delete a test academic level/subject/chapter.
- Open the student dashboard and confirm no `permission denied for function has_role` error appears.