// Shared routine types + hooks used by the Student Routine Tracker.
//
// SHARED_ROUTINES is gone — all data comes from Supabase. `useMyRoutines()`
// fetches the current user's assigned routines and populates the module-level
// task cache so `tasksForRoutine()` returns real DB tasks to the existing
// analytics panels without touching their signatures.

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAssignedRoutines, type TrackerRoutine } from "@/lib/routine-tracker.functions";
import { getRoutineTasksFromCache, setRoutineTasksCache } from "@/lib/routine-tasks-cache";

export type SharedRoutineStatus = "active" | "inactive";
export type SharedRoutineType = "daily" | "weekly" | "monthly" | "custom";

export type SharedRoutine = {
  id: string;
  title: string;
  description?: string;
  level: string;
  subject?: string;
  chapter?: string;
  type: SharedRoutineType;
  hoursPerDay: number;
  startDate: string;
  endDate: string;
  status: SharedRoutineStatus;
  assigned: number;
  completion: number;
  createdAt: string;
  accent: string;
};

export type RoutineTask = {
  id: string;
  title: string;
  hours: number;
};

function toShared(r: TrackerRoutine): SharedRoutine {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    level: r.level,
    subject: r.subject ?? undefined,
    chapter: r.chapter ?? undefined,
    type: r.type,
    hoursPerDay: r.hoursPerDay,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    assigned: 0,
    completion: 0,
    createdAt: r.createdAt,
    accent: r.accent,
  };
}

const ROUTINES_KEY = ["routine-tracker", "my-routines"] as const;

export function useMyRoutines() {
  const fetchRoutines = useServerFn(getMyAssignedRoutines);
  const query = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => fetchRoutines(),
    staleTime: 60_000,
  });

  const data = useMemo(() => query.data ?? [], [query.data]);

  // Populate the task cache so tasksForRoutine() below returns real DB tasks.
  useEffect(() => {
    for (const r of data) {
      setRoutineTasksCache(
        r.id,
        r.tasks.map((t) => ({ id: t.id, title: t.title, hours: t.hours })),
      );
    }
  }, [data]);

  const routines = useMemo(() => data.map(toShared), [data]);

  return {
    routines,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
  };
}

export function tasksForRoutine(r: SharedRoutine): RoutineTask[] {
  return getRoutineTasksFromCache(r.id);
}
