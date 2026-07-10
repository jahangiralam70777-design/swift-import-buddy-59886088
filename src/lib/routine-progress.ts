// Real-data hook powering the Student Routine Tracker.
//
// Fetches routine_task_completions for the current user and exposes the same
// `{ map, get, hydrated, setTaskStatus, updateDailyLog }` shape the tracker
// UI used to consume from the old localStorage-backed hook. Everything is
// derived from Supabase — no localStorage, no mock data.

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyCompletions,
  upsertMyCompletion,
  type TrackerCompletion,
  type TrackerTaskStatus,
} from "@/lib/routine-tracker.functions";
import { getRoutineTasksFromCache, getTaskRoutineId } from "@/lib/routine-tasks-cache";

export type TaskStatus = TrackerTaskStatus;

export type DailyLog = {
  hours: number;
  mcqs: number;
  chapters: number;
  notes: string;
};

export type RoutineProgress = {
  taskStatuses: Record<string, TaskStatus>;
  dailyLogs: Record<string, DailyLog>;
  lastStudyDate: string | null;
  streak: number;
};

export type ProgressMap = Record<string, RoutineProgress>;

const COMPLETIONS_KEY = ["routine-tracker", "completions"] as const;

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyEntry(): RoutineProgress {
  return { taskStatuses: {}, dailyLogs: {}, lastStudyDate: null, streak: 0 };
}

export function emptyDailyLog(): DailyLog {
  return { hours: 0, mcqs: 0, chapters: 0, notes: "" };
}

function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildProgressMap(completions: TrackerCompletion[]): ProgressMap {
  const map: ProgressMap = {};
  const activeDatesByRoutine = new Map<string, Set<string>>();

  for (const c of completions) {
    if (!c.routineId) continue;
    const entry = (map[c.routineId] ??= emptyEntry());

    // taskStatuses reflect the most recent status per task (with a small bias
    // toward "completed" — if the task was ever completed on a later date it
    // stays completed for the lifetime aggregate).
    const prev = entry.taskStatuses[c.taskId];
    if (!prev || prev !== "completed") {
      entry.taskStatuses[c.taskId] = c.status;
    }

    // Merge daily log per date. hours = sum of per-task study_hours.
    const day = (entry.dailyLogs[c.completedOn] ??= emptyDailyLog());
    day.hours = Math.round((day.hours + (c.studyHours || 0)) * 100) / 100;

    // Track dates that had any active work for streak/lastStudy calculations.
    if (c.status === "completed" || c.status === "in_progress" || c.studyHours > 0) {
      const set = activeDatesByRoutine.get(c.routineId) ?? new Set<string>();
      set.add(c.completedOn);
      activeDatesByRoutine.set(c.routineId, set);
    }
  }

  // Streak: consecutive days back from today with any activity for that routine.
  const today = todayISO();
  for (const [routineId, dates] of activeDatesByRoutine.entries()) {
    const entry = map[routineId]!;
    let cursor = today;
    let streak = 0;
    // Allow the streak to still count if the student hasn't logged today yet.
    if (!dates.has(cursor)) cursor = addDaysISO(cursor, -1);
    while (dates.has(cursor)) {
      streak += 1;
      cursor = addDaysISO(cursor, -1);
    }
    entry.streak = streak;
    entry.lastStudyDate = Array.from(dates).sort().pop() ?? null;
  }

  return map;
}

export function useRoutineProgress() {
  const queryClient = useQueryClient();
  const fetchCompletions = useServerFn(getMyCompletions);
  const upsert = useServerFn(upsertMyCompletion);

  const query = useQuery({
    queryKey: COMPLETIONS_KEY,
    queryFn: () => fetchCompletions({ data: {} }),
    staleTime: 30_000,
  });

  const completions = useMemo(() => query.data ?? [], [query.data]);
  const map = useMemo(() => buildProgressMap(completions), [completions]);
  const hydrated = !query.isLoading;

  const get = useCallback(
    (routineId: string): RoutineProgress => map[routineId] ?? emptyEntry(),
    [map],
  );

  const mutation = useMutation({
    mutationFn: (input: {
      taskId: string;
      date: string;
      status: TaskStatus;
      studyHours?: number;
      note?: string | null;
    }) => upsert({ data: input }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: COMPLETIONS_KEY });
      const prev = queryClient.getQueryData<TrackerCompletion[]>(COMPLETIONS_KEY) ?? [];
      const routineId = getTaskRoutineId(input.taskId) ?? "";
      const idx = prev.findIndex((c) => c.taskId === input.taskId && c.completedOn === input.date);
      const optimistic: TrackerCompletion = {
        id: idx >= 0 ? prev[idx].id : `optimistic-${input.taskId}-${input.date}`,
        taskId: input.taskId,
        routineId: idx >= 0 && prev[idx].routineId ? prev[idx].routineId : routineId,
        completedOn: input.date,
        status: input.status,
        studyHours: input.studyHours ?? (idx >= 0 ? prev[idx].studyHours : 0),
        completedAt: input.status === "completed" ? new Date().toISOString() : null,
        note: idx >= 0 ? prev[idx].note : null,
      };
      const next = idx >= 0 ? [...prev] : [...prev, optimistic];
      if (idx >= 0) next[idx] = optimistic;
      queryClient.setQueryData<TrackerCompletion[]>(COMPLETIONS_KEY, next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(COMPLETIONS_KEY, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: COMPLETIONS_KEY });
    },
  });

  const setTaskStatus = useCallback(
    (_routineId: string, taskId: string, status: TaskStatus) => {
      mutation.mutate({ taskId, date: todayISO(), status });
    },
    [mutation],
  );

  const updateDailyLog = useCallback(
    (routineId: string, patch: Partial<DailyLog>) => {
      // "Daily log hours" model over real data: distribute the logged hours
      // evenly across the routine's tasks so today's summed study_hours match
      // the value the student typed. mcqs/chapters/notes are UX-only fields
      // in the existing UI; we persist notes via completion.note on the first
      // task of the day if provided, and ignore counters that have no home
      // in the current schema.
      const today = todayISO();
      const existingByRoutine = query.data ?? [];
      const routineTaskIds = Array.from(
        new Set(existingByRoutine.filter((c) => c.routineId === routineId).map((c) => c.taskId)),
      );
      // If we don't have completions for this routine yet, fall back to using
      // the task cache populated by useMyRoutines(). Import lazily to keep
      // this hook file self-contained on the SSR side.
      const cachedTaskIds =
        routineTaskIds.length > 0 ? routineTaskIds : getRoutineTaskIds(routineId);
      if (!cachedTaskIds.length) return;

      const hours = typeof patch.hours === "number" ? patch.hours : undefined;
      const notes = typeof patch.notes === "string" ? patch.notes : undefined;
      const perTaskHours =
        hours !== undefined ? Math.round((hours / cachedTaskIds.length) * 100) / 100 : undefined;

      cachedTaskIds.forEach((taskId, i) => {
        const status: TaskStatus =
          get(routineId).taskStatuses[taskId] === "completed"
            ? "completed"
            : perTaskHours && perTaskHours > 0
              ? "in_progress"
              : "not_started";
        mutation.mutate({
          taskId,
          date: today,
          status,
          studyHours: perTaskHours,
          // Only attach the note to the first task to avoid duplication.
          ...(i === 0 && notes !== undefined ? { note: notes } : {}),
        } as Parameters<typeof mutation.mutate>[0]);
      });
    },
    [get, mutation, query.data],
  );

  return { map, get, hydrated, setTaskStatus, updateDailyLog };
}

function getRoutineTaskIds(routineId: string): string[] {
  return getRoutineTasksFromCache(routineId).map((t) => t.id);
}
