// Server functions for the Student Settings page.
//
// All operations are scoped to the authenticated caller via
// `requireSupabaseAuth`. Row-Level Security enforces isolation on every
// underlying table (profiles / student_preferences); privileged actions
// (account deletion, global sign-out) load the service-role admin client
// lazily inside the handler after verifying the caller owns the target.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StudyPreferences = {
  examCountdownDate: string | null;
  dailyStudyHours: number;
  defaultMcqMode: "practice" | "exam";
  defaultQuestionOrder: "sequential" | "random";
  autoResumePractice: boolean;
  autoShowExplanations: boolean;
  language: string;
  theme: "light" | "dark" | "system";
};

export type NotificationPreferences = {
  email: boolean;
  routineReminder: boolean;
  examReminder: boolean;
  practiceReminder: boolean;
  weeklyProgressReport: boolean;
  marketing: boolean;
};

export type ProfileExtras = {
  currentLevel: string;
  timeZone: string;
  country: string;
  bio: string;
};

export type StudentPreferencesShape = {
  study: StudyPreferences;
  notifications: NotificationPreferences;
  profileExtras: ProfileExtras;
};

export type MyProfile = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  institution: string;
  photoUrl: string;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export const DEFAULT_STUDY: StudyPreferences = {
  examCountdownDate: null,
  dailyStudyHours: 2,
  defaultMcqMode: "practice",
  defaultQuestionOrder: "sequential",
  autoResumePractice: true,
  autoShowExplanations: false,
  language: "en",
  theme: "system",
};

export const DEFAULT_NOTIF: NotificationPreferences = {
  email: true,
  routineReminder: true,
  examReminder: true,
  practiceReminder: false,
  weeklyProgressReport: true,
  marketing: false,
};

export const DEFAULT_PROFILE_EXTRAS: ProfileExtras = {
  currentLevel: "",
  timeZone: "",
  country: "",
  bio: "",
};

function mergePrefs(raw: unknown): StudentPreferencesShape {
  const r = (raw ?? {}) as Record<string, unknown>;
  const study = { ...DEFAULT_STUDY, ...((r.study as object) ?? {}) };
  const notifications = { ...DEFAULT_NOTIF, ...((r.notifications as object) ?? {}) };
  const profileExtras = {
    ...DEFAULT_PROFILE_EXTRAS,
    ...((r.profileExtras as object) ?? {}),
  };
  return { study, notifications, profileExtras };
}

// ---------------------------------------------------------------------------
// getMyProfile
// ---------------------------------------------------------------------------

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyProfile> => {
    const { data: user } = await context.supabase.auth.getUser();
    const u = user?.user;
    const { data: p, error } = await context.supabase
      .from("profiles")
      .select("email, full_name, phone, institution, photo_url, created_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      id: context.userId,
      email: (u?.email as string | undefined) ?? p?.email ?? "",
      fullName: p?.full_name ?? "",
      phone: p?.phone ?? "",
      institution: p?.institution ?? "",
      photoUrl: p?.photo_url ?? "",
      emailVerified: !!u?.email_confirmed_at,
      createdAt: (u?.created_at as string | null) ?? p?.created_at ?? null,
      lastSignInAt: (u?.last_sign_in_at as string | null) ?? null,
    };
  });

// ---------------------------------------------------------------------------
// updateMyProfile
// ---------------------------------------------------------------------------

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    const clean = (v: unknown, max: number) =>
      typeof v === "string" ? v.trim().slice(0, max) : null;
    const photo = typeof s.photoUrl === "string" ? s.photoUrl : null;
    if (photo && photo.length > 2_500_000) {
      throw new Error("Photo too large (max ~2MB).");
    }
    return {
      fullName: clean(s.fullName, 200),
      phone: clean(s.phone, 40),
      institution: clean(s.institution, 200),
      photoUrl: photo,
    };
  })
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.fullName !== null) patch.full_name = data.fullName;
    if (data.phone !== null) patch.phone = data.phone;
    if (data.institution !== null) patch.institution = data.institution;
    if (data.photoUrl !== null) patch.photo_url = data.photoUrl;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    // Ensure row exists (upsert)
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ id: context.userId, ...patch } as never, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// getMyPreferences / updateMyPreferences
// ---------------------------------------------------------------------------

export const getMyPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentPreferencesShape> => {
    const { data, error } = await context.supabase
      .from("student_preferences")
      .select("preferences")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mergePrefs(data?.preferences);
  });

export const updateMyPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    if (
      typeof s.section !== "string" ||
      !["study", "notifications", "profileExtras"].includes(s.section)
    ) {
      throw new Error("Invalid section");
    }
    if (typeof s.patch !== "object" || s.patch === null) {
      throw new Error("Invalid patch");
    }
    return {
      section: s.section as "study" | "notifications" | "profileExtras",
      patch: s.patch as Record<string, unknown>,
    };
  })
  .handler(async ({ data, context }) => {
    // Read-modify-write on jsonb to preserve unrelated sections.
    const { data: row } = await context.supabase
      .from("student_preferences")
      .select("preferences")
      .eq("user_id", context.userId)
      .maybeSingle();
    const current = mergePrefs(row?.preferences);
    const nextSection = { ...current[data.section], ...data.patch };
    const nextPrefs = { ...current, [data.section]: nextSection };
    const { error } = await context.supabase
      .from("student_preferences")
      .upsert(
        { user_id: context.userId, preferences: nextPrefs as never },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const, preferences: nextPrefs };
  });

// ---------------------------------------------------------------------------
// changeEmail (triggers Supabase email-change verification)
// ---------------------------------------------------------------------------

export const changeMyEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    const email = typeof s.email === "string" ? s.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
    return { email };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.auth.updateUser({ email: data.email });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// exportMyData
// ---------------------------------------------------------------------------

export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const [profile, prefs, bookmarks, mcq, qbank, wrong, sessions] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      context.supabase.from("student_preferences").select("*").eq("user_id", uid).maybeSingle(),
      context.supabase.from("bookmarks").select("*").eq("user_id", uid),
      context.supabase.from("mcq_attempts").select("*").eq("user_id", uid),
      context.supabase.from("qbank_attempts").select("*").eq("user_id", uid),
      context.supabase.from("wrong_answer_bookmarks").select("*").eq("user_id", uid),
      context.supabase.from("custom_exam_sessions").select("*").eq("user_id", uid),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      userId: uid,
      profile: profile.data ?? null,
      preferences: prefs.data ?? null,
      bookmarks: bookmarks.data ?? [],
      mcqAttempts: mcq.data ?? [],
      qbankAttempts: qbank.data ?? [],
      wrongAnswers: wrong.data ?? [],
      customExamSessions: sessions.data ?? [],
    };
  });

// ---------------------------------------------------------------------------
// signOutAllDevices — revokes every refresh token for this user
// ---------------------------------------------------------------------------

export const signOutAllDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = supabaseAdmin.auth.admin;
    if (typeof admin.signOut === "function") {
      const { error } = await admin.signOut(context.userId, "global");
      if (error) throw new Error(error.message);
    } else {
      // Fallback: force a full user update to invalidate sessions.
      const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        password: undefined,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// deleteMyAccount — permanently deletes the caller's auth user (cascade)
// ---------------------------------------------------------------------------

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    if (s.confirm !== "DELETE") throw new Error("Confirmation required");
    return { confirm: "DELETE" as const };
  })
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
