# Deployment Audit Report

## Scope

This audit checked the project source, route wiring, admin CRUD wiring, authenticated server-function setup, current backend function permissions, migration artifacts, and the consolidated production schema file.

## Findings

### 1. Production source mismatch symptom

The current repository source no longer contains the admin dashboard placeholder. The live admin dashboard route is `src/routes/_authenticated.admin.index.tsx` and renders the implemented overview/stats UI.

**Conclusion:** if production still shows `Dashboard is under development`, production is serving an older build artifact or older commit, not the current route source.

### 2. Admin route wiring

Verified admin routes are present and point to implemented pages:

- `src/routes/_authenticated.admin.index.tsx`
- `src/routes/_authenticated.admin.academic-manager.tsx`
- `src/routes/_authenticated.admin.mcq-manager.tsx`
- `src/routes/_authenticated.admin.qns-bank-manager.tsx`
- `src/routes/_authenticated.admin.routine-manager.tsx`
- `src/routes/_authenticated.admin.user-manager.tsx`
- `src/routes/_authenticated.admin.settings.tsx`

No route import to an old placeholder component was found.

### 3. Admin CRUD server functions

Verified admin pages call the expected server-function modules with `useServerFn` and React Query mutations/queries:

- Academic Manager → `getAcademicTree`, `syncAcademicTree`
- MCQ Manager → `listMcqs`, `createMcq`, `updateMcq`, `deleteMcqs`, `changeMcqStatus`, `moveMcqs`, `bulkImportMcqs`
- Qns Bank Manager → `listQuestionBankQuestions`, `createQuestionBankQuestion`, `updateQuestionBankQuestion`, `deleteQuestionBankQuestions`, `changeQuestionBankStatus`, `moveQuestionBankQuestions`, `bulkImportQuestionBankQuestions`
- Routine Manager → `listRoutines`, `createRoutine`, `updateRoutine`, `deleteRoutines`, `archiveRoutines`, `duplicateRoutine`, `listRoutineStudents`
- User Manager → user listing, stats, role/profile/status/password/logout/delete functions
- Settings → settings read/write and system stats functions

### 4. Authenticated server functions

Verified `src/start.ts` includes `functionMiddleware: [attachSupabaseAuth]`, so server functions using `requireSupabaseAuth` receive the authenticated bearer token.

### 5. `has_role` permission issue

The live backend currently has:

- Function: `public.has_role(uuid, app_role)`
- Owner: `postgres`
- `SECURITY DEFINER`: enabled
- Safe search path: `public`
- Execute permission for `authenticated`: present

The required grant is included in the regenerated schema:

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
```

### 6. Consolidated schema inconsistency

The previous `PRODUCTION_SCHEMA.sql` was not a clean, exact reconstruction of the final schema. It had drift from later migrations and live schema state.

**Fixed:** `PRODUCTION_SCHEMA.sql` has been regenerated as one complete production schema from the audited live schema, with final hardening grants appended for `has_role`, admin RPCs, and taxonomy RPCs.

### 7. Local storage dependency check

Feature-critical admin CRUD and student progress paths use server functions/backend data. Remaining `localStorage` usage is limited to UI preferences or legacy helper files not used as the production persistence source for admin CRUD.

## Files changed

- Regenerated `PRODUCTION_SCHEMA.sql`
- Added `DEPLOY_CHECKLIST.md`
- Added `VERIFY_PRODUCTION.md`
- Added `DEPLOY_REPORT.md`

## Status

Project-side inconsistencies found during this audit were fixed. Production should not be called verified until the checks in `VERIFY_PRODUCTION.md` are run against the deployed site after deployment.