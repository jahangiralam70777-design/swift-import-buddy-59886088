import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureAuthReady } from "@/lib/auth";

/**
 * Pathless layout that gates every route under it on an authenticated
 * Supabase session. Because Supabase stores the session in `localStorage`,
 * the check must run on the client — we disable SSR here so the gate has
 * access to `window`.
 *
 * Role gates (student vs admin) live one level deeper on
 * `_authenticated.student.tsx` and `_authenticated.admin.tsx`.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const snap = await ensureAuthReady();
    if (snap.status !== "signedIn") {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { auth: snap };
  },
  component: () => <Outlet />,
});
