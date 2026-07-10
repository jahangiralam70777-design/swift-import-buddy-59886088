// Server functions for the Student Routine Tracker.
//
// Reads: only routines assigned to the current user (via routine_assignments
// with target_user_id = auth.uid()). Writes: only the current user's own
// routine_task_completions rows. Enforced by RLS in both directions.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types shared with the client
// ---------------------------------------------------------------------------

export type TrackerRoutineType = "daily" | "weekly" | "monthly" | "custom";
export type TrackerTaskStatus = "not_started" | "in_progress" | "completed";

export type TrackerTask = {
  id: string;
  routineId: string;
  dayId: string | null;
  title: string;
  hours: number; // best-effort estimate derived from routine hours / task count
  position: number;
};

export type TrackerRoutine = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  subject: string | null;
  chapter: string | null;
  type: TrackerRoutineType;
  hoursPerDay: number;
  startDate: string;
  endDate: string;
  status: "active" | "inactive";
  accent: string;
  createdAt: string;
  tasks: TrackerTask[];
};

export type TrackerCompletion = {
  id: string;
  taskId: string;
  routineId: string;
  completedOn: string; // yyyy-mm-dd
  status: TrackerTaskStatus;
  studyHours: number;
  completedAt: string | null;
  note: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCENTS = [
  "oklch(0.68 0.19 30)",
  "oklch(0.72 0.17 150)",
  "oklch(0.7 0.18 260)",
  "oklch(0.75 0.15 90)",
  "oklch(0.68 0.19 330)",
  "oklch(0.72 0.16 210)",
];

const TYPES: TrackerRoutineType[] = ["daily", "weekly", "monthly", "custom"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normStatus(s: unknown): TrackerTaskStatus {
  if (s === "completed" || s === "done") return "completed";
  if (s === "in_progress") return "in_progress";
  return "not_started";
}

// ---------------------------------------------------------------------------
// getMyAssignedRoutines
// ---------------------------------------------------------------------------

export const getMyAssignedRoutines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrackerRoutine[]> => {
    const { supabase, userId } = context;

    // Which routines am I assigned to?
    const { data: assignRows, error: aErr } = await supabase
      .from("routine_assignments")
      .select("routine_id")
      .eq("target_type", "user")
      .eq("target_user_id", userId);
    if (aErr) throw new Error(aErr.message);
    const routineIds = Array.from(
      new Set(
        (assignRows ?? []).map((r) => (r as { routine_id: string }).routine_id).filter(Boolean),
      ),
    );
    if (!routineIds.length) return [];

    const [{ data: routines, error: rErr }, { data: tasks, error: tErr }] = await Promise.all([
      supabase
        .from("routines")
        .select(
          "id,title,description,level,subject,chapter,routine_type,hours_per_day,starts_on,ends_on,is_active,is_archived,accent,created_at",
        )
        .in("id", routineIds)
        .eq("is_archived", false),
      supabase
        .from("routine_tasks")
        .select("id,routine_id,day_id,title,position")
        .in("routine_id", routineIds)
        .order("position", { ascending: true }),
    ]);
    if (rErr) throw new Error(rErr.message);
    if (tErr) throw new Error(tErr.message);

    const tasksByRoutine = new Map<string, TrackerTask[]>();
    for (const t of tasks ?? []) {
      const row = t as {
        id: string;
        routine_id: string;
        day_id: string | null;
        title: string;
        position: number;
      };
      const arr = tasksByRoutine.get(row.routine_id) ?? [];
      arr.push({
        id: row.id,
        routineId: row.routine_id,
        dayId: row.day_id,
        title: row.title,
        hours: 0,
        position: row.position,
      });
      tasksByRoutine.set(row.routine_id, arr);
    }

    const out: TrackerRoutine[] = [];
    for (const r of routines ?? []) {
      const row = r as {
        id: string;
        title: string;
        description: string | null;
        level: string | null;
        subject: string | null;
        chapter: string | null;
        routine_type: string | null;
        hours_per_day: number | string | null;
        starts_on: string | null;
        ends_on: string | null;
        is_active: boolean;
        accent: string | null;
        created_at: string;
      };
      const type = TYPES.includes(row.routine_type as TrackerRoutineType)
        ? (row.routine_type as TrackerRoutineType)
        : "daily";
      const hoursPerDay = Math.max(0.25, Number(row.hours_per_day ?? 1) || 1);
      const routineTasks = tasksByRoutine.get(row.id) ?? [];
      const perTask =
        routineTasks.length > 0
          ? Math.max(0.1, Math.round((hoursPerDay / routineTasks.length) * 10) / 10)
          : 0;
      for (const t of routineTasks) t.hours = perTask;

      out.push({
        id: row.id,
        title: row.title,
        description: row.description,
        level: row.level ?? "—",
        subject: row.subject,
        chapter: row.chapter,
        type,
        hoursPerDay,
        startDate: row.starts_on ?? row.created_at.slice(0, 10),
        endDate: row.ends_on ?? row.starts_on ?? today(),
        status: row.is_active ? "active" : "inactive",
        accent: row.accent ?? ACCENTS[out.length % ACCENTS.length],
        createdAt: row.created_at,
        tasks: routineTasks,
      });
    }
    // Preserve assignment order but push inactive to the bottom
    out.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return out;
  });

// ---------------------------------------------------------------------------
// getMyCompletions
// ---------------------------------------------------------------------------

function validRange(input: unknown): { from: string; to: string } {
  const s = (input ?? {}) as Record<string, unknown>;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const to = typeof s.to === "string" && iso.test(s.to) ? s.to : `${y}-${m}-${d}`;
  let from: string;
  if (typeof s.from === "string" && iso.test(s.from)) {
    from = s.from;
  } else {
    const past = new Date(today);
    past.setDate(past.getDate() - 400);
    from = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;
  }
  return { from, to };
}

export const getMyCompletions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validRange)
  .handler(async ({ data, context }): Promise<TrackerCompletion[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("routine_task_completions")
      .select("id,task_id,completed_on,status,study_hours,completed_at,note")
      .eq("user_id", userId)
      .gte("completed_on", data.from)
      .lte("completed_on", data.to);
    if (error) throw new Error(error.message);
    const taskIds = Array.from(
      new Set((rows ?? []).map((r) => (r as { task_id: string }).task_id)),
    );
    const routineByTask = new Map<string, string>();
    if (taskIds.length) {
      const { data: taskRows } = await supabase
        .from("routine_tasks")
        .select("id,routine_id")
        .in("id", taskIds);
      for (const t of taskRows ?? []) {
        routineByTask.set((t as { id: string }).id, (t as { routine_id: string }).routine_id);
      }
    }
    return (rows ?? []).map((r) => {
      const row = r as {
        id: string;
        task_id: string;
        completed_on: string;
        status: string;
        study_hours: number | string | null;
        completed_at: string | null;
        note: string | null;
      };
      return {
        id: row.id,
        taskId: row.task_id,
        routineId: routineByTask.get(row.task_id) ?? "",
        completedOn: row.completed_on,
        status: normStatus(row.status),
        studyHours: Number(row.study_hours ?? 0) || 0,
        completedAt: row.completed_at,
        note: row.note,
      };
    });
  });

// ---------------------------------------------------------------------------
// upsertMyCompletion
// ---------------------------------------------------------------------------

type UpsertInput = {
  taskId: string;
  date: string;
  status: TrackerTaskStatus;
  studyHours?: number;
  note?: string | null;
};

function validUpsert(input: unknown): UpsertInput {
  const s = (input ?? {}) as Record<string, unknown>;
  const taskId = typeof s.taskId === "string" ? s.taskId : "";
  if (!taskId) throw new Error("taskId required");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const date =
    typeof s.date === "string" && iso.test(s.date) ? s.date : new Date().toISOString().slice(0, 10);
  const status = normStatus(s.status);
  const studyHours =
    typeof s.studyHours === "number" && Number.isFinite(s.studyHours) && s.studyHours >= 0
      ? Math.min(24, s.studyHours)
      : undefined;
  const note =
    typeof s.note === "string" ? s.note.slice(0, 1000) : s.note === null ? null : undefined;
  return { taskId, date, status, studyHours, note: note ?? undefined };
}

export const upsertMyCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validUpsert)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Guard: only allow completions for tasks belonging to routines the user
    // is assigned to. Prevents students from writing to arbitrary tasks even
    // if RLS on routine_tasks currently allows reads.
    const { data: task, error: tErr } = await supabase
      .from("routine_tasks")
      .select("id,routine_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!task) throw new Error("Unknown task");
    const routineId = (task as { routine_id: string }).routine_id;
    const { data: assigned, error: aErr } = await supabase
      .from("routine_assignments")
      .select("id")
      .eq("routine_id", routineId)
      .eq("target_type", "user")
      .eq("target_user_id", userId)
      .limit(1);
    if (aErr) throw new Error(aErr.message);
    if (!assigned || !assigned.length) throw new Error("Not assigned to this routine");

    const payload: {
      task_id: string;
      user_id: string;
      completed_on: string;
      status: TrackerTaskStatus;
      study_hours?: number;
      completed_at: string | null;
      note?: string | null;
    } = {
      task_id: data.taskId,
      user_id: userId,
      completed_on: data.date,
      status: data.status,
      completed_at: data.status === "completed" ? new Date().toISOString() : null,
    };
    if (data.studyHours !== undefined) payload.study_hours = data.studyHours;
    if (data.note !== undefined) payload.note = data.note;

    const { data: row, error } = await supabase
      .from("routine_task_completions")
      .upsert(payload, { onConflict: "task_id,completed_on" })
      .select("id,task_id,completed_on,status,study_hours,completed_at,note")
      .single();
    if (error) throw new Error(error.message);
    const r = row as {
      id: string;
      task_id: string;
      completed_on: string;
      status: string;
      study_hours: number | string | null;
      completed_at: string | null;
      note: string | null;
    };
    return {
      id: r.id,
      taskId: r.task_id,
      routineId,
      completedOn: r.completed_on,
      status: normStatus(r.status),
      studyHours: Number(r.study_hours ?? 0) || 0,
      completedAt: r.completed_at,
      note: r.note,
    } satisfies TrackerCompletion;
  });
