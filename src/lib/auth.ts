// Client-side auth session store and helpers.
//
// - Subscribes to `supabase.auth.onAuthStateChange` once
// - Caches the signed-in user's role so route gates can read it synchronously
// - Provides sign-in / sign-up / sign-out helpers that clean up query cache
//
// Server-side auth is enforced by RLS on every table and by
// `requireSupabaseAuth` on protected server functions. The client store
// exists solely to decide which panel to show; it is never trusted for
// data access.

import type { QueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export type AppRole = "admin" | "student";

export type AuthSnapshot = {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  status: "loading" | "signedIn" | "signedOut";
};

type Listener = () => void;

let snapshot: AuthSnapshot = {
  user: null,
  session: null,
  role: null,
  status: "loading",
};

const listeners = new Set<Listener>();
let initialized = false;
let roleFetchToken = 0;

function emit() {
  for (const l of listeners) l();
}

function setSnapshot(next: AuthSnapshot) {
  snapshot = next;
  emit();
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function fetchRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) {
    console.error("[auth] failed to fetch role", error);
    return null;
  }
  const roles = (data ?? []).map((r) => r.role as AppRole);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("student")) return "student";
  return null;
}

async function refreshFromSession(session: Session | null) {
  if (!session?.user) {
    setSnapshot({ user: null, session: null, role: null, status: "signedOut" });
    return;
  }
  const user = session.user;
  const token = ++roleFetchToken;
  // Wait for role before marking signed-in so route gates can trust `role`.
  const role = await fetchRole(user.id);
  if (token !== roleFetchToken) return; // superseded
  setSnapshot({ user, session, role, status: "signedIn" });
}

/**
 * Initializes the auth store. Safe to call multiple times.
 * Must be called from a browser context (root component effect).
 */
export function initAuth() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  supabase.auth
    .getSession()
    .then(({ data }) => refreshFromSession(data.session))
    .catch((err) => {
      console.error("[auth] getSession failed", err);
      setSnapshot({ user: null, session: null, role: null, status: "signedOut" });
    });

  supabase.auth.onAuthStateChange((event, session) => {
    if (
      event !== "SIGNED_IN" &&
      event !== "SIGNED_OUT" &&
      event !== "USER_UPDATED" &&
      event !== "TOKEN_REFRESHED" &&
      event !== "INITIAL_SESSION"
    ) {
      return;
    }
    void refreshFromSession(session);
  });
}

/**
 * Awaits a definitive signed-in / signed-out state (no longer "loading").
 * Used by route beforeLoad gates on the client.
 */
export async function ensureAuthReady(): Promise<AuthSnapshot> {
  if (snapshot.status !== "loading") return snapshot;
  initAuth();
  return new Promise((resolve) => {
    const unsubscribe = subscribeAuth(() => {
      if (snapshot.status !== "loading") {
        unsubscribe();
        resolve(snapshot);
      }
    });
    // Safety timeout — in case Supabase never responds.
    setTimeout(() => {
      unsubscribe();
      resolve(snapshot);
    }, 5000);
  });
}

/** Where a user with the given role should land after signing in. */
export function homeForRole(role: AppRole | null): string {
  if (role === "admin") return "/admin";
  return "/student";
}

// ---------------------------------------------------------------------------
// Sign in / up / out
// ---------------------------------------------------------------------------

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  await refreshFromSession(data.session);
  return data;
}

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}) {
  const emailRedirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
  const { data, error } = await supabase.auth.signUp({
    email: params.email.trim(),
    password: params.password,
    options: {
      emailRedirectTo,
      data: {
        full_name: params.fullName.trim(),
        phone: params.phone?.trim() || null,
      },
    },
  });
  if (error) throw error;
  if (data.session) {
    await refreshFromSession(data.session);
  }
  return data;
}

export async function signInWithGoogle() {
  if (typeof window === "undefined") throw new Error("Google sign-in requires a browser.");
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
  if (result.error) throw result.error;
  if (result.redirected) return { redirected: true as const };
  const { data } = await supabase.auth.getSession();
  await refreshFromSession(data.session);
  return { redirected: false as const };
}

export async function sendPasswordReset(email: string) {
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Ordered sign-out: cancel queries, clear cache, sign out, invalidate router.
 */
export async function signOut(opts: { queryClient: QueryClient; onDone?: () => void }) {
  await opts.queryClient.cancelQueries();
  opts.queryClient.clear();
  await supabase.auth.signOut();
  setSnapshot({ user: null, session: null, role: null, status: "signedOut" });
  opts.onDone?.();
}
