import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("admin_settings")
      .select("settings, updated_at")
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      settings: (data?.settings ?? {}) as Json,
      updatedAt: (data?.updated_at as string | undefined) ?? null,
    };
  });

export const saveAdminSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { settings: Json }) => {
    if (!data || typeof data.settings !== "object" || data.settings === null) {
      throw new Error("Invalid settings payload");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { error } = await context.supabase
      .from("admin_settings")
      .upsert({ singleton: true, settings: data.settings as never }, { onConflict: "singleton" });
    if (error) throw new Error(error.message);
    return { ok: true, savedAt: new Date().toISOString() };
  });

export const getSystemStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const tables = [
      "mcq_questions",
      "qbank_questions",
      "routines",
      "profiles",
      "academic_levels",
      "academic_subjects",
      "academic_chapters",
      "bookmarks",
      "mcq_attempts",
      "qbank_attempts",
    ] as const;

    const counts: Record<string, number> = {};
    await Promise.all(
      tables.map(async (t) => {
        const { count } = await context.supabase
          .from(t)
          .select("*", { count: "exact", head: true });
        counts[t] = count ?? 0;
      }),
    );

    const { data: settingsRow } = await context.supabase
      .from("admin_settings")
      .select("updated_at")
      .eq("singleton", true)
      .maybeSingle();

    return {
      counts,
      settingsUpdatedAt: (settingsRow?.updated_at as string | undefined) ?? null,
      environment: process.env.NODE_ENV === "production" ? "Production" : "Preview",
      appVersion: "CL Aspire · 1.5.0",
      runtime: "TanStack Start · React 19",
      generatedAt: new Date().toISOString(),
    };
  });
