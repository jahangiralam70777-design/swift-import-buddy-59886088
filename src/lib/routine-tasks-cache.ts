// Tiny module-level cache of routine → tasks so that pure helpers like
// tasksForRoutine() and the Update dialog can look up the real DB tasks
// without threading a Map through every component prop.
//
// Populated by useMyRoutines() on load. This is *not* a data store — it's
// a memoized read-through cache tied to the current session. React Query is
// still the source of truth for freshness.

export type CachedTask = {
  id: string;
  title: string;
  hours: number;
};

const cache = new Map<string, CachedTask[]>();

export function setRoutineTasksCache(routineId: string, tasks: CachedTask[]) {
  cache.set(routineId, tasks);
}

export function getRoutineTasksFromCache(routineId: string): CachedTask[] {
  return cache.get(routineId) ?? [];
}

export function getTaskRoutineId(taskId: string): string | null {
  for (const [routineId, tasks] of cache.entries()) {
    if (tasks.some((t) => t.id === taskId)) return routineId;
  }
  return null;
}
