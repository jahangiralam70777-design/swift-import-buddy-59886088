// React binding for the shared auth store in `src/lib/auth.ts`.
//
// The store subscribes to Supabase's `onAuthStateChange` once at app boot
// (from the root route). Components use `useAuth()` to read `{user, role,
// status}` and re-render only when those change.

import { useSyncExternalStore } from "react";
import { getAuthSnapshot, initAuth, subscribeAuth, type AuthSnapshot } from "@/lib/auth";

const serverSnapshot: AuthSnapshot = {
  user: null,
  session: null,
  role: null,
  status: "loading",
};

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, () => serverSnapshot);
}

export { initAuth };
