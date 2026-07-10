// Server functions for the Routine Manager.
//
// Reads: any authenticated user (RLS allows SELECT to authenticated).
// Writes: admin role required, enforced via has_role().
//
// Extended metadata (level/subject/chapter/type/dates/etc.) lives on the
// routines table columns added in the routine-manager migration.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoutineType = "daily" | "weekly" | "monthly" | "custom";
export type RoutineStatus = "active" | "inactive";

export type RoutineRow = {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  subject: string | null;
  chapter: string | null;
  type: RoutineType;
  hoursPerDay: number;
  startDate: string; // yyyy-mm-dd
  endDate: string;
  status: RoutineStatus;
  isArchived: boolean;
  accent: string;
  targetMcqs: number | null;
  targetChapters: number | null;
  assigned: number;
  completion: number;
  createdAt: string;
  updatedAt: string;
};

export type RoutineListResult = {
  rows: RoutineRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RoutineStats = {
  total: number;
  active: number;
  upcoming: number;
  completed: number;
  archived: number;
  studentsAssigned: number;
  studentsFollowing: number;
  avgCompletion: number;
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

const ACCENTS = [
  "oklch(0.68 0.19 30)",
  "oklch(0.66 0.16 165)",
  "oklch(0.62 0.18 265)",
  "oklch(0.72 0.16 60)",
  "oklch(0.66 0.19 320)",
  "oklch(0.6 0.14 210)",
];

const TYPES: RoutineType[] = ["daily", "weekly", "monthly", "custom"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeAssignedAndCompletion(supabase: any, routineIds: string[]) {
  const assigned = new Map<string, number>();
  const completion = new Map<string, number>();
  if (!routineIds.length) return { assigned, completion };

  // followers = distinct user_id in routine_task_completions per routine
  // completion % = avg over followers of completed tasks / total tasks
  const [{ data: tasks }, { data: comps }] = await Promise.all([
    supabase.from("routine_tasks").select("id,routine_id").in("routine_id", routineIds),
    supabase
      .from("routine_task_completions")
      .select("task_id,user_id,status")
      .in(
        "task_id",
        // subselect via a first pass — do a range query instead
        // We fetch tasks first; then use their ids to fetch completions.
        // But `.in` requires a list — we'll do the second query separately.
        [] as string[],
      ),
  ]);

  const tasksByRoutine = new Map<string, string[]>();
  const routineByTask = new Map<string, string>();
  for (const t of tasks ?? []) {
    routineByTask.set(t.id, t.routine_id);
    const arr = tasksByRoutine.get(t.routine_id) ?? [];
    arr.push(t.id);
    tasksByRoutine.set(t.routine_id, arr);
  }

  const allTaskIds = Array.from(routineByTask.keys());
  let completions: Array<{ task_id: string; user_id: string; status: string }> = [];
  if (allTaskIds.length) {
    const { data: c2 } = await supabase
      .from("routine_task_completions")
      .select("task_id,user_id,status")
      .in("task_id", allTaskIds);
    completions = (c2 ?? []) as typeof completions;
  }
  void comps;

  // group by routine → user → count completed & total
  const perRoutine = new Map<string, Map<string, { completed: number; total: number }>>();
  for (const rid of routineIds) perRoutine.set(rid, new Map());

  for (const c of completions) {
    const rid = routineByTask.get(c.task_id);
    if (!rid) continue;
    const userMap = perRoutine.get(rid)!;
    const totalTasks = tasksByRoutine.get(rid)?.length ?? 0;
    const cur = userMap.get(c.user_id) ?? { completed: 0, total: totalTasks };
    cur.total = totalTasks;
    if (c.status === "completed") cur.completed += 1;
    userMap.set(c.user_id, cur);
  }

  for (const rid of routineIds) {
    const userMap = perRoutine.get(rid)!;
    assigned.set(rid, userMap.size);
    if (userMap.size === 0) {
      completion.set(rid, 0);
    } else {
      let sum = 0;
      for (const v of userMap.values()) {
        sum += v.total ? (v.completed / v.total) * 100 : 0;
      }
      completion.set(rid, Math.round(sum / userMap.size));
    }
  }

  return { assigned, completion };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any, assigned: number, completion: number): RoutineRow {
  const type = TYPES.includes(r.routine_type) ? (r.routine_type as RoutineType) : "daily";
  const status: RoutineStatus = r.is_active ? "active" : "inactive";
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    level: r.level ?? null,
    subject: r.subject ?? null,
    chapter: r.chapter ?? null,
    type,
    hoursPerDay: Number(r.hours_per_day ?? 1),
    startDate: r.starts_on ?? r.created_at?.slice(0, 10) ?? today(),
    endDate: r.ends_on ?? r.starts_on ?? today(),
    status,
    isArchived: !!r.is_archived,
    accent: r.accent ?? ACCENTS[0],
    targetMcqs: r.target_mcqs ?? null,
    targetChapters: r.target_chapters ?? null,
    assigned,
    completion,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// listRoutines
// ---------------------------------------------------------------------------

export type ListRoutinesInput = {
  page?: number;
  pageSize?: number;
  level?: string | null;
  status?: "active" | "inactive" | "archived" | "upcoming" | "completed" | null;
  type?: RoutineType | null;
  search?: string | null;
  sort?: "newest" | "oldest" | "title" | "updated" | "endDate";
};

function validateList(input: unknown): ListRoutinesInput {
  const s = (input ?? {}) as Record<string, unknown>;
  const page = Math.max(1, Number(s.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(s.pageSize ?? 20) || 20));
  const sort =
    typeof s.sort === "string" &&
    ["newest", "oldest", "title", "updated", "endDate"].includes(s.sort)
      ? (s.sort as ListRoutinesInput["sort"])
      : "newest";
  return {
    page,
    pageSize,
    level: typeof s.level === "string" && s.level ? s.level : null,
    status:
      typeof s.status === "string" &&
      ["active", "inactive", "archived", "upcoming", "completed"].includes(s.status)
        ? (s.status as ListRoutinesInput["status"])
        : null,
    type:
      typeof s.type === "string" && TYPES.includes(s.type as RoutineType)
        ? (s.type as RoutineType)
        : null,
    search: typeof s.search === "string" && s.search.trim() ? s.search.trim() : null,
    sort,
  };
}

export const listRoutines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateList)
  .handler(async ({ data, context }): Promise<RoutineListResult> => {
    await assertAdmin(context);
    const { supabase } = context;
    const now = today();

    let q = supabase.from("routines").select("*", { count: "exact" });
    if (data.level) q = q.eq("level", data.level);
    if (data.type) q = q.eq("routine_type", data.type);
    if (data.status === "archived") q = q.eq("is_archived", true);
    else if (data.status === "active")
      q = q
        .eq("is_archived", false)
        .eq("is_active", true)
        .lte("starts_on", now)
        .gte("ends_on", now);
    else if (data.status === "inactive") q = q.eq("is_archived", false).eq("is_active", false);
    else if (data.status === "upcoming") q = q.eq("is_archived", false).gt("starts_on", now);
    else if (data.status === "completed") q = q.eq("is_archived", false).lt("ends_on", now);
    else q = q.eq("is_archived", false);

    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(
        `title.ilike.%${s}%,description.ilike.%${s}%,level.ilike.%${s}%,subject.ilike.%${s}%,chapter.ilike.%${s}%`,
      );
    }

    switch (data.sort) {
      case "newest":
        q = q.order("created_at", { ascending: false });
        break;
      case "oldest":
        q = q.order("created_at", { ascending: true });
        break;
      case "title":
        q = q.order("title", { ascending: true });
        break;
      case "updated":
        q = q.order("updated_at", { ascending: false });
        break;
      case "endDate":
        q = q.order("ends_on", { ascending: true, nullsFirst: false });
        break;
    }

    const from = (data.page! - 1) * data.pageSize!;
    q = q.range(from, from + data.pageSize! - 1);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    const { assigned, completion } = await computeAssignedAndCompletion(supabase, ids);
    const mapped = (rows ?? []).map((r) =>
      mapRow(r, assigned.get(r.id) ?? 0, completion.get(r.id) ?? 0),
    );

    return {
      rows: mapped,
      total: count ?? 0,
      page: data.page!,
      pageSize: data.pageSize!,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / data.pageSize!)),
    };
  });

// ---------------------------------------------------------------------------
// getRoutineStats
// ---------------------------------------------------------------------------

export const getRoutineStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }): Promise<RoutineStats> => {
    await assertAdmin(context);
    const { supabase } = context;
    const now = today();

    const [{ data: all, error: e1 }, { data: assignments }, { data: comps }] = await Promise.all([
      supabase.from("routines").select("id,is_archived,is_active,starts_on,ends_on"),
      supabase.from("routine_assignments").select("target_user_id"),
      supabase.from("routine_task_completions").select("user_id"),
    ]);
    if (e1) throw new Error(e1.message);

    const rows = all ?? [];
    const archived = rows.filter((r: { is_archived: boolean }) => r.is_archived).length;
    const nonArchived = rows.filter((r: { is_archived: boolean }) => !r.is_archived);

    const active = nonArchived.filter(
      (r: { is_active: boolean; starts_on: string | null; ends_on: string | null }) =>
        r.is_active && (!r.starts_on || r.starts_on <= now) && (!r.ends_on || r.ends_on >= now),
    ).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upcoming = nonArchived.filter((r: any) => r.starts_on && r.starts_on > now).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completed = nonArchived.filter((r: any) => r.ends_on && r.ends_on < now).length;

    const followers = new Set<string>();
    for (const c of comps ?? []) followers.add((c as { user_id: string }).user_id);
    const assignedUsers = new Set<string>();
    for (const a of assignments ?? []) {
      const uid = (a as { target_user_id: string | null }).target_user_id;
      if (uid) assignedUsers.add(uid);
    }

    // avg completion across all non-archived routines
    const ids = nonArchived.map((r: { id: string }) => r.id);
    const { completion } = await computeAssignedAndCompletion(supabase, ids);
    let sum = 0;
    let n = 0;
    for (const v of completion.values()) {
      sum += v;
      n++;
    }
    const avgCompletion = n ? Math.round(sum / n) : 0;

    return {
      total: rows.length,
      active,
      upcoming,
      completed,
      archived,
      studentsAssigned: assignedUsers.size,
      studentsFollowing: followers.size,
      avgCompletion,
    };
  });

// ---------------------------------------------------------------------------
// createRoutine / updateRoutine
// ---------------------------------------------------------------------------

type UpsertInput = {
  title: string;
  description: string | null;
  level: string | null;
  subject: string | null;
  chapter: string | null;
  type: RoutineType;
  hoursPerDay: number;
  startDate: string;
  endDate: string;
  status: RoutineStatus;
  targetMcqs: number | null;
  targetChapters: number | null;
  accent: string;
};

function validateUpsert(input: unknown): UpsertInput {
  const s = (input ?? {}) as Record<string, unknown>;
  const title = typeof s.title === "string" ? s.title.trim() : "";
  if (!title) throw new Error("Title required");
  if (title.length > 200) throw new Error("Title too long");
  const type =
    typeof s.type === "string" && TYPES.includes(s.type as RoutineType)
      ? (s.type as RoutineType)
      : "daily";
  const hoursPerDay = Math.max(0.25, Math.min(24, Number(s.hoursPerDay ?? 1) || 1));
  const startDate =
    typeof s.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.startDate)
      ? s.startDate
      : today();
  const endDate =
    typeof s.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.endDate) ? s.endDate : startDate;
  if (endDate < startDate) throw new Error("End date before start date");
  const status: RoutineStatus = s.status === "inactive" ? "inactive" : "active";
  const num = (v: unknown) =>
    typeof v === "number" && v >= 0 && Number.isFinite(v) ? Math.floor(v) : null;
  return {
    title,
    description:
      typeof s.description === "string" && s.description.trim() ? s.description.trim() : null,
    level: typeof s.level === "string" && s.level ? s.level : null,
    subject: typeof s.subject === "string" && s.subject ? s.subject : null,
    chapter: typeof s.chapter === "string" && s.chapter ? s.chapter : null,
    type,
    hoursPerDay,
    startDate,
    endDate,
    status,
    targetMcqs: num(s.targetMcqs),
    targetChapters: num(s.targetChapters),
    accent: typeof s.accent === "string" && s.accent ? s.accent : ACCENTS[0],
  };
}

function rowFromInput(data: UpsertInput, userId: string) {
  return {
    user_id: userId,
    title: data.title,
    description: data.description,
    level: data.level,
    subject: data.subject,
    chapter: data.chapter,
    routine_type: data.type,
    hours_per_day: data.hoursPerDay,
    starts_on: data.startDate,
    ends_on: data.endDate,
    is_active: data.status === "active",
    is_archived: false,
    accent: data.accent,
    target_mcqs: data.targetMcqs,
    target_chapters: data.targetChapters,
    config: {},
  };
}

export const createRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateUpsert)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("routines")
      .insert(rowFromInput(data, context.userId))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    const id = typeof s.id === "string" ? s.id : "";
    if (!id) throw new Error("id required");
    return { id, ...validateUpsert(s) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const row = rowFromInput(data, context.userId);
    // Do not overwrite user_id on update
    const { user_id: _u, ...patch } = row;
    void _u;
    const { error } = await context.supabase.from("routines").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// deleteRoutines (bulk), archiveRoutines (bulk toggle), duplicateRoutine
// ---------------------------------------------------------------------------

function validateIds(input: unknown) {
  const s = (input ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(s.ids) ? s.ids.filter((x) => typeof x === "string") : [];
  if (!ids.length) throw new Error("No ids");
  if (ids.length > 500) throw new Error("Too many ids");
  return { ids: ids as string[] };
}

export const deleteRoutines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateIds)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("routines").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: data.ids.length };
  });

export const archiveRoutines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    const { ids } = validateIds(input);
    const archived = !!s.archived;
    return { ids, archived };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("routines")
      .update({ is_archived: data.archived })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// listRoutineStudents — flat list of (routine, student) with real progress
// across all non-archived routines. Powers the admin progress table.
// ---------------------------------------------------------------------------

export type RoutineStudentRow = {
  id: string; // routineId::userId
  userId: string;
  name: string;
  email: string;
  routineId: string;
  routineTitle: string;
  routineAccent: string;
  level: string | null;
  subject: string | null;
  completed: number;
  total: number;
  progress: number;
  todayCompleted: number;
  todayTotal: number;
  lastActivity: string | null;
  status: "on-track" | "behind" | "completed";
};

export const listRoutineStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }): Promise<RoutineStudentRow[]> => {
    await assertAdmin(context);
    const { supabase } = context;
    const now = today();

    const { data: routines } = await supabase
      .from("routines")
      .select("id,title,accent,level,subject,starts_on,ends_on,is_archived")
      .eq("is_archived", false);
    const rows = (routines ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => (!r.starts_on || r.starts_on <= now) && (!r.ends_on || r.ends_on >= now),
    );
    if (!rows.length) return [];
    const routineIds = rows.map((r: { id: string }) => r.id);

    const { data: tasks } = await supabase
      .from("routine_tasks")
      .select("id,routine_id")
      .in("routine_id", routineIds);
    const routineByTask = new Map<string, string>();
    const totalByRoutine = new Map<string, number>();
    for (const t of tasks ?? []) {
      routineByTask.set(t.id, t.routine_id);
      totalByRoutine.set(t.routine_id, (totalByRoutine.get(t.routine_id) ?? 0) + 1);
    }
    const taskIds = Array.from(routineByTask.keys());
    if (!taskIds.length) return [];

    const { data: comps } = await supabase
      .from("routine_task_completions")
      .select("task_id,user_id,status,completed_on")
      .in("task_id", taskIds);

    // key = routineId::userId
    const agg = new Map<
      string,
      {
        routineId: string;
        userId: string;
        completed: number;
        last: string | null;
        todayCompleted: number;
      }
    >();
    for (const c of (comps ?? []) as {
      task_id: string;
      user_id: string;
      status: string;
      completed_on: string;
    }[]) {
      const rid = routineByTask.get(c.task_id);
      if (!rid) continue;
      const key = `${rid}::${c.user_id}`;
      const cur = agg.get(key) ?? {
        routineId: rid,
        userId: c.user_id,
        completed: 0,
        last: null,
        todayCompleted: 0,
      };
      if (c.status === "completed") {
        cur.completed += 1;
        if (c.completed_on === now) cur.todayCompleted += 1;
      }
      if (!cur.last || c.completed_on > cur.last) cur.last = c.completed_on;
      agg.set(key, cur);
    }

    const userIds = Array.from(new Set(Array.from(agg.values()).map((v) => v.userId)));
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id,full_name,email").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const profMap = new Map<string, { name: string; email: string }>();
    for (const p of profs ?? [])
      profMap.set(p.id, { name: p.full_name ?? p.email ?? "Unknown", email: p.email ?? "" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routineMap = new Map<string, any>();
    for (const r of rows) routineMap.set(r.id, r);

    const out: RoutineStudentRow[] = [];
    for (const v of agg.values()) {
      const r = routineMap.get(v.routineId);
      const total = totalByRoutine.get(v.routineId) ?? 0;
      const progress = total ? Math.round((v.completed / total) * 100) : 0;
      const status: RoutineStudentRow["status"] =
        progress >= 100 ? "completed" : progress >= 60 ? "on-track" : "behind";
      const prof = profMap.get(v.userId);
      out.push({
        id: `${v.routineId}::${v.userId}`,
        userId: v.userId,
        name: prof?.name ?? "Unknown",
        email: prof?.email ?? "",
        routineId: v.routineId,
        routineTitle: r?.title ?? "Untitled",
        routineAccent: r?.accent ?? ACCENTS[0],
        level: r?.level ?? null,
        subject: r?.subject ?? null,
        completed: v.completed,
        total,
        progress,
        todayCompleted: v.todayCompleted,
        todayTotal: total,
        lastActivity: v.last,
        status,
      });
    }
    return out;
  });

export const duplicateRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    const id = typeof s.id === "string" ? s.id : "";
    if (!id) throw new Error("id required");
    return { id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: src, error } = await context.supabase
      .from("routines")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { id: _drop, created_at: _c, updated_at: _u, ...rest } = src;
    const { data: created, error: e2 } = await context.supabase
      .from("routines")
      .insert({
        ...rest,
        user_id: context.userId,
        title: `${src.title} (Copy)`,
        is_archived: false,
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    return { id: created.id as string };
  });

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const setRoutineAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    const routineId = typeof s.routineId === "string" ? s.routineId : "";
    if (!routineId) throw new Error("routineId required");
    const levels = Array.isArray(s.levels)
      ? (s.levels.filter((v) => typeof v === "string") as string[])
      : [];
    const subjects = Array.isArray(s.subjects)
      ? (s.subjects.filter((v) => typeof v === "string") as string[])
      : [];
    const userIds = Array.isArray(s.userIds)
      ? (s.userIds.filter((v) => typeof v === "string") as string[])
      : [];
    return { routineId, levels, subjects, userIds };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const { error: dErr } = await supabase
      .from("routine_assignments")
      .delete()
      .eq("routine_id", data.routineId);
    if (dErr) throw new Error(dErr.message);
    const rows = [
      ...data.levels.map((v) => ({
        routine_id: data.routineId,
        target_type: "level",
        target_value: v,
        target_user_id: null,
        created_by: userId,
      })),
      ...data.subjects.map((v) => ({
        routine_id: data.routineId,
        target_type: "subject",
        target_value: v,
        target_user_id: null,
        created_by: userId,
      })),
      ...data.userIds.map((u) => ({
        routine_id: data.routineId,
        target_type: "user",
        target_value: null,
        target_user_id: u,
        created_by: userId,
      })),
    ];
    if (rows.length) {
      const { error } = await supabase.from("routine_assignments").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const, count: rows.length };
  });

export const getRoutineAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    const routineId = typeof s.routineId === "string" ? s.routineId : "";
    if (!routineId) throw new Error("routineId required");
    return { routineId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("routine_assignments")
      .select("target_type,target_value,target_user_id")
      .eq("routine_id", data.routineId);
    if (error) throw new Error(error.message);
    const levels: string[] = [];
    const subjects: string[] = [];
    const userIds: string[] = [];
    for (const r of rows ?? []) {
      if (r.target_type === "level" && r.target_value) levels.push(r.target_value);
      else if (r.target_type === "subject" && r.target_value) subjects.push(r.target_value);
      else if (r.target_type === "user" && r.target_user_id) userIds.push(r.target_user_id);
    }
    return { levels, subjects, userIds };
  });

// ---------------------------------------------------------------------------
// getRoutineProgress — per-student progress for a single routine
// ---------------------------------------------------------------------------

export type RoutineProgressStudent = {
  userId: string;
  name: string;
  email: string;
  completed: number;
  total: number;
  progress: number; // 0..100
  lastActivity: string | null;
};

export const getRoutineProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const s = (input ?? {}) as Record<string, unknown>;
    const routineId = typeof s.routineId === "string" ? s.routineId : "";
    if (!routineId) throw new Error("routineId required");
    return { routineId };
  })
  .handler(async ({ data, context }): Promise<RoutineProgressStudent[]> => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: tasks } = await supabase
      .from("routine_tasks")
      .select("id")
      .eq("routine_id", data.routineId);
    const total = (tasks ?? []).length;
    const taskIds = (tasks ?? []).map((t: { id: string }) => t.id);
    if (!taskIds.length) return [];
    const { data: comps } = await supabase
      .from("routine_task_completions")
      .select("user_id,status,completed_on")
      .in("task_id", taskIds);
    const byUser = new Map<string, { completed: number; last: string | null }>();
    for (const c of (comps ?? []) as { user_id: string; status: string; completed_on: string }[]) {
      const cur = byUser.get(c.user_id) ?? { completed: 0, last: null };
      if (c.status === "completed") cur.completed += 1;
      if (!cur.last || c.completed_on > cur.last) cur.last = c.completed_on;
      byUser.set(c.user_id, cur);
    }
    const ids = Array.from(byUser.keys());
    if (!ids.length) return [];
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", ids);
    const profMap = new Map<string, { full_name: string; email: string }>();
    for (const p of profs ?? [])
      profMap.set(p.id, { full_name: p.full_name ?? "", email: p.email ?? "" });
    return ids.map((uid) => {
      const v = byUser.get(uid)!;
      const p = profMap.get(uid);
      return {
        userId: uid,
        name: p?.full_name || p?.email || "Unknown",
        email: p?.email ?? "",
        completed: v.completed,
        total,
        progress: total ? Math.round((v.completed / total) * 100) : 0,
        lastActivity: v.last,
      };
    });
  });
