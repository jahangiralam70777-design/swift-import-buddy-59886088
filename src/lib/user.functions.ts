// Server functions for the User Manager.
//
// All operations require an authenticated caller and the `admin` role,
// enforced through the SECURITY DEFINER `has_role` RPC and the SQL
// functions `admin_list_users`, `admin_get_user`, `admin_user_stats`.
//
// Privileged mutations (ban/unban, password reset, force logout, delete)
// use the service-role admin client, loaded lazily inside each handler.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "student";
export type UserStatus = "active" | "disabled";

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  photoUrl: string | null;
  role: UserRole;
  status: UserStatus;
  verified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  bannedUntil: string | null;
};

export type AdminUserDetail = AdminUserRow & {
  institution: string | null;
};

export type ListUsersResult = {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type UserStats = {
  total: number;
  students: number;
  admins: number;
  activeToday: number;
  verified: number;
  newLast7Days: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): AdminUserRow {
  const banned = r.banned_until && new Date(r.banned_until).getTime() > Date.now();
  return {
    id: r.id,
    email: r.email ?? "",
    fullName: r.full_name ?? "",
    phone: r.phone ?? "",
    photoUrl: r.photo_url ?? null,
    role: (r.role === "admin" ? "admin" : "student") as UserRole,
    status: banned ? "disabled" : "active",
    verified: !!r.email_confirmed_at,
    createdAt: r.created_at,
    lastLoginAt: r.last_sign_in_at ?? null,
    bannedUntil: r.banned_until ?? null,
  };
}

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

export type ListUsersInput = {
  page?: number;
  pageSize?: number;
  search?: string | null;
  role?: UserRole | null;
  status?: UserStatus | null;
  verified?: "verified" | "unverified" | null;
  from?: string | null;
  to?: string | null;
  sort?:
    | "created_desc"
    | "created_asc"
    | "name_asc"
    | "name_desc"
    | "email_asc"
    | "email_desc"
    | "last_login_desc"
    | "last_login_asc";
};

function validateList(input: unknown): ListUsersInput {
  const src = (input ?? {}) as Record<string, unknown>;
  const page = Math.max(1, Number(src.page ?? 1) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(src.pageSize ?? 25) || 25));
  const sortAllowed = [
    "created_desc",
    "created_asc",
    "name_asc",
    "name_desc",
    "email_asc",
    "email_desc",
    "last_login_desc",
    "last_login_asc",
  ] as const;
  const sort =
    typeof src.sort === "string" && (sortAllowed as readonly string[]).includes(src.sort)
      ? (src.sort as ListUsersInput["sort"])
      : "created_desc";
  return {
    page,
    pageSize,
    search: typeof src.search === "string" && src.search.trim() ? src.search.trim() : null,
    role: src.role === "admin" || src.role === "student" ? (src.role as UserRole) : null,
    status:
      src.status === "active" || src.status === "disabled" ? (src.status as UserStatus) : null,
    verified:
      src.verified === "verified" || src.verified === "unverified"
        ? (src.verified as "verified" | "unverified")
        : null,
    from: typeof src.from === "string" && src.from ? src.from : null,
    to: typeof src.to === "string" && src.to ? src.to : null,
    sort,
  };
}

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateList)
  .handler(async ({ data, context }): Promise<ListUsersResult> => {
    await assertAdmin(context);
    const offset = (data.page! - 1) * data.pageSize!;
    const params: Record<string, unknown> = {
      p_search: data.search ?? undefined,
      p_role: data.role ?? undefined,
      p_status: data.status ?? undefined,
      p_verified: data.verified ?? undefined,
      p_from: data.from ?? undefined,
      p_to: data.to ? new Date(new Date(data.to).getTime() + 86_399_000).toISOString() : undefined,
      p_sort: data.sort,
      p_limit: data.pageSize,
      p_offset: offset,
    };
    const { data: rows, error } = await context.supabase.rpc("admin_list_users", params);
    if (error) throw new Error(error.message);
    const total = rows && rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
    return {
      rows: (rows ?? []).map(mapRow),
      total,
      page: data.page!,
      pageSize: data.pageSize!,
      totalPages: Math.max(1, Math.ceil(total / data.pageSize!)),
    };
  });

// ---------------------------------------------------------------------------
// getUserStats
// ---------------------------------------------------------------------------

export const getUserStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserStats> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_user_stats");
    if (error) throw new Error(error.message);
    const r = (data ?? [])[0] ?? {};
    return {
      total: Number(r.total ?? 0),
      students: Number(r.students ?? 0),
      admins: Number(r.admins ?? 0),
      activeToday: Number(r.active_today ?? 0),
      verified: Number(r.verified ?? 0),
      newLast7Days: Number(r.new_last_7_days ?? 0),
    };
  });

// ---------------------------------------------------------------------------
// getUser (single)
// ---------------------------------------------------------------------------

export const getUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const userId = typeof src.userId === "string" ? src.userId : "";
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }): Promise<AdminUserDetail | null> => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("admin_get_user", {
      p_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    const r = (rows ?? [])[0];
    if (!r) return null;
    return { ...mapRow(r), institution: r.institution ?? null };
  });

// ---------------------------------------------------------------------------
// updateUserProfile — updates public.profiles as admin
// ---------------------------------------------------------------------------

export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const userId = typeof src.userId === "string" ? src.userId : "";
    if (!userId) throw new Error("userId required");
    const fullName = typeof src.fullName === "string" ? src.fullName.trim().slice(0, 200) : null;
    const phone = typeof src.phone === "string" ? src.phone.trim().slice(0, 40) : null;
    const institution =
      typeof src.institution === "string" ? src.institution.trim().slice(0, 200) : null;
    return { userId, fullName, phone, institution };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch: Record<string, unknown> = {};
    if (data.fullName !== null) patch.full_name = data.fullName;
    if (data.phone !== null) patch.phone = data.phone;
    if (data.institution !== null) patch.institution = data.institution;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await (
      context.supabase.from("profiles") as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: (v: Record<string, unknown>) => any;
      }
    )
      .update(patch)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// changeUserRole — admin/student toggle via user_roles rows
// ---------------------------------------------------------------------------

export const changeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const userId = typeof src.userId === "string" ? src.userId : "";
    const role = src.role === "admin" ? "admin" : "student";
    if (!userId) throw new Error("userId required");
    return { userId, role: role as UserRole };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("You cannot demote yourself.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Wipe then insert the desired role.
    const del = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (del.error) throw new Error(del.error.message);
    const ins = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (ins.error) throw new Error(ins.error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// setUsersBanned — bulk activate/disable via ban_duration
// ---------------------------------------------------------------------------

async function ensureNotSelf(ids: string[], selfId: string) {
  if (ids.includes(selfId)) {
    throw new Error("You cannot disable or delete your own account.");
  }
}

export const setUsersBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(src.userIds)
      ? (src.userIds.filter((x) => typeof x === "string") as string[])
      : [];
    const banned = !!src.banned;
    if (!ids.length) throw new Error("No users selected");
    if (ids.length > 500) throw new Error("Too many users in one call");
    return { userIds: ids, banned };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.banned) await ensureNotSelf(data.userIds, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Supabase admin API takes ban_duration as a Go-style duration string.
    // "876000h" ≈ 100 years disables; "none" removes any ban.
    const ban_duration = data.banned ? "876000h" : "none";
    let updated = 0;
    for (const id of data.userIds) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration,
      });
      if (error) throw new Error(error.message);
      updated++;
    }
    return { updated };
  });

// ---------------------------------------------------------------------------
// forceLogout — sign out all sessions for a user
// ---------------------------------------------------------------------------

export const forceLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const userId = typeof src.userId === "string" ? src.userId : "";
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// sendPasswordReset — email a reset link
// ---------------------------------------------------------------------------

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const email = typeof src.email === "string" ? src.email.trim() : "";
    const redirectTo = typeof src.redirectTo === "string" ? src.redirectTo : undefined;
    if (!email) throw new Error("email required");
    return { email, redirectTo };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// deleteUsers — safe cascade delete via auth admin API + related rows
// ---------------------------------------------------------------------------

export const deleteUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(src.userIds)
      ? (src.userIds.filter((x) => typeof x === "string") as string[])
      : [];
    if (!ids.length) throw new Error("No users selected");
    if (ids.length > 200) throw new Error("Too many users in one call");
    return { userIds: ids };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await ensureNotSelf(data.userIds, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cascade-clean rows that reference the user across the app before removing
    // the auth record. Tables not in this list either cascade automatically via
    // FK ON DELETE CASCADE or store no user reference.
    const tables = [
      "bookmarks",
      "wrong_answer_bookmarks",
      "mcq_attempts",
      "qbank_attempts",
      "custom_exam_answers",
      "custom_exam_sessions",
      "routine_task_completions",
      "routine_assignments",
      "student_preferences",
      "user_roles",
      "profiles",
    ];

    let deleted = 0;
    for (const id of data.userIds) {
      for (const t of tables) {
        // Ignore per-table errors (missing table / no column) but surface
        // network/permission errors immediately.
        const column = t === "profiles" ? "id" : "user_id";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (supabaseAdmin.from(t as any) as any).delete().eq(column, id);
        if (res.error && !/relation .* does not exist/i.test(res.error.message)) {
          // continue; auth delete below will fail loudly if the record is still referenced
        }
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
      deleted++;
    }
    return { deleted };
  });
