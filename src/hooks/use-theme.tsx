// Global theme store.
//
// One source of truth for the app's theme. All pages consume `useTheme()`
// and every mutation flows through the same store, so toggling in one place
// updates every mounted component and every open tab.
//
// - Storage key: `cla:theme:v1` (shared with `src/lib/student-settings.ts`)
// - Values: "light" | "dark" | "system"
// - `resolved` collapses "system" to the concrete "light" | "dark" in effect
// - The pre-hydration <script> in `src/routes/__root.tsx` applies the class
//   before React mounts to avoid a light/dark flash on first paint.

import { useSyncExternalStore, useCallback } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "cla:theme:v1";

type Listener = () => void;

const listeners = new Set<Listener>();
let currentTheme: Theme = "system";
let currentResolved: ResolvedTheme = "light";
let initialized = false;

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "system";
}

function computeResolved(theme: Theme): ResolvedTheme {
  if (theme === "system") return prefersDark() ? "dark" : "light";
  return theme;
}

function applyToDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function emit() {
  for (const l of listeners) l();
}

function setInternal(next: Theme, persist: boolean) {
  currentTheme = next;
  currentResolved = computeResolved(next);
  applyToDom(currentResolved);
  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }
  emit();
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  currentTheme = readStoredTheme();
  currentResolved = computeResolved(currentTheme);
  applyToDom(currentResolved);

  // Cross-tab sync
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    const next = readStoredTheme();
    if (next === currentTheme) return;
    setInternal(next, false);
  });

  // System preference changes while on "system"
  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (currentTheme !== "system") return;
      currentResolved = computeResolved("system");
      applyToDom(currentResolved);
      emit();
    };
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
  }
}

// Eagerly initialize on module load in the browser.
init();

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getThemeSnapshot = () => currentTheme;
const getResolvedSnapshot = () => currentResolved;
const getServerSnapshot = () => "light" as ResolvedTheme;

/** Imperative setter usable outside React (e.g. settings persistence). */
export function setThemeGlobal(next: Theme) {
  setInternal(next, true);
}

/** Imperative getter usable outside React. */
export function getTheme(): Theme {
  return currentTheme;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, () => "system" as Theme);
  const resolved = useSyncExternalStore(subscribe, getResolvedSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => setInternal(next, true), []);
  const toggle = useCallback(() => {
    // Toggle collapses to the concrete resolved value so "system" behaves
    // predictably from a one-click switch.
    setInternal(currentResolved === "dark" ? "light" : "dark", true);
  }, []);

  return { theme, resolved, setTheme, toggle };
}
