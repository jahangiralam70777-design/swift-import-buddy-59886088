// Pure helpers that derive "how well is the student following the routine"
// from the existing progress store. No new persistence — reads the same
// ProgressMap that the tracker already uses.

import type { ProgressMap, RoutineProgress } from "@/lib/routine-progress";
import { emptyDailyLog, todayISO } from "@/lib/routine-progress";
import type { SharedRoutine } from "@/lib/routines-shared";

export type ScheduleStatus =
  | "completed_today"
  | "ahead"
  | "on_track"
  | "behind"
  | "missed_today"
  | "upcoming";

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  completed_today: "Completed Today",
  ahead: "Ahead of Schedule",
  on_track: "On Track",
  behind: "Behind Schedule",
  missed_today: "Missed Today",
  upcoming: "Not Started Yet",
};

export const STATUS_TONE: Record<ScheduleStatus, string> = {
  completed_today: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  ahead: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30",
  on_track: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  behind: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
  missed_today: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30",
  upcoming: "text-muted-foreground bg-muted/60 border-border",
};

export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function daysBetweenInclusive(a: Date, b: Date) {
  const ms = 86400000;
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.max(0, Math.round((B - A) / ms) + 1);
}

export type RoutineStatusInfo = {
  status: ScheduleStatus;
  expectedH: number;
  actualH: number;
  ratio: number; // actual / expected
  todayHours: number;
  todayTarget: number;
  todayPct: number;
  daysElapsed: number;
  totalDays: number;
};

export function computeRoutineStatus(
  routine: SharedRoutine,
  progress: RoutineProgress,
): RoutineStatusInfo {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseISO(routine.startDate);
  const end = parseISO(routine.endDate);
  const totalDays = daysBetweenInclusive(start, end);
  const daysElapsed = today < start ? 0 : daysBetweenInclusive(start, today > end ? end : today);

  const target = routine.hoursPerDay || 0;
  const expectedH = daysElapsed * target;

  // Sum daily hours within [start, min(today, end)]
  let actualH = 0;
  for (const [iso, log] of Object.entries(progress.dailyLogs)) {
    const d = parseISO(iso);
    if (d >= start && d <= today && d <= end) actualH += log.hours || 0;
  }

  const todayLog = progress.dailyLogs[todayISO()] ?? emptyDailyLog();
  const todayHours = todayLog.hours || 0;
  const todayTarget = target;
  const todayPct = todayTarget ? Math.min(100, Math.round((todayHours / todayTarget) * 100)) : 0;

  const ratio = expectedH > 0 ? actualH / expectedH : 0;

  let status: ScheduleStatus;
  if (today < start) status = "upcoming";
  else if (todayPct >= 100) status = "completed_today";
  else if (ratio >= 1.1) status = "ahead";
  else if (ratio >= 0.85) status = "on_track";
  else if (todayHours === 0 && daysElapsed >= 1) status = "missed_today";
  else status = "behind";

  return {
    status,
    expectedH,
    actualH,
    ratio,
    todayHours,
    todayTarget,
    todayPct,
    daysElapsed,
    totalDays,
  };
}

// Aggregate across all routines to give one dashboard-level verdict.
export function computeOverallStatus(routines: SharedRoutine[], progressMap: ProgressMap) {
  let expected = 0;
  let actual = 0;
  let todayHours = 0;
  let todayTarget = 0;
  const perRoutine = routines.map((r) => {
    const info = computeRoutineStatus(
      r,
      progressMap[r.id] ?? { taskStatuses: {}, dailyLogs: {}, lastStudyDate: null, streak: 0 },
    );
    expected += info.expectedH;
    actual += info.actualH;
    todayHours += info.todayHours;
    todayTarget += info.todayTarget;
    return { routine: r, info };
  });

  const ratio = expected > 0 ? actual / expected : 0;
  const todayPct = todayTarget ? Math.min(100, Math.round((todayHours / todayTarget) * 100)) : 0;

  let status: ScheduleStatus;
  if (todayTarget > 0 && todayPct >= 100) status = "completed_today";
  else if (ratio >= 1.1) status = "ahead";
  else if (ratio >= 0.85) status = "on_track";
  else if (todayHours === 0 && expected > 0) status = "missed_today";
  else if (expected === 0) status = "upcoming";
  else status = "behind";

  return { status, ratio, expected, actual, todayHours, todayTarget, todayPct, perRoutine };
}

/* ------------------------------------------------------------------ */
/* Achievement badges                                                  */
/* ------------------------------------------------------------------ */

export type Badge = {
  id: string;
  label: string;
  description: string;
  earned: boolean;
  progress: number; // 0..1
  tone: string; // gradient classes
  icon: "flame" | "trophy" | "sparkles" | "crown" | "medal";
};

// Sum today's hours across all routines for a given date.
function totalHoursOn(progressMap: ProgressMap, iso: string) {
  let h = 0;
  for (const p of Object.values(progressMap)) {
    h += p.dailyLogs[iso]?.hours ?? 0;
  }
  return h;
}

function totalTarget(routines: SharedRoutine[], iso: string) {
  const d = parseISO(iso);
  let t = 0;
  for (const r of routines) {
    const s = parseISO(r.startDate);
    const e = parseISO(r.endDate);
    if (d >= s && d <= e) t += r.hoursPerDay || 0;
  }
  return t;
}

export function computeBadges(routines: SharedRoutine[], progressMap: ProgressMap): Badge[] {
  const bestStreak = Math.max(0, ...Object.values(progressMap).map((p) => p.streak || 0));

  // Perfect Week / Month: every day in the past N (that's within any routine range) met its target.
  function perfectWindow(days: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let counted = 0;
    let met = 0;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = toISO(d);
      const target = totalTarget(routines, iso);
      if (target <= 0) continue;
      counted += 1;
      const actual = totalHoursOn(progressMap, iso);
      if (actual >= target) met += 1;
    }
    return { earned: counted > 0 && met === counted, progress: counted ? met / counted : 0 };
  }

  const week = perfectWindow(7);
  const month = perfectWindow(30);

  return [
    {
      id: "streak-7",
      label: "7-Day Streak",
      description: "Study every day for a week",
      earned: bestStreak >= 7,
      progress: Math.min(1, bestStreak / 7),
      tone: "from-amber-400 to-orange-500",
      icon: "flame",
    },
    {
      id: "streak-15",
      label: "15-Day Streak",
      description: "Two weeks of consistency",
      earned: bestStreak >= 15,
      progress: Math.min(1, bestStreak / 15),
      tone: "from-orange-500 to-rose-500",
      icon: "flame",
    },
    {
      id: "streak-30",
      label: "30-Day Streak",
      description: "A full month unbroken",
      earned: bestStreak >= 30,
      progress: Math.min(1, bestStreak / 30),
      tone: "from-fuchsia-500 to-purple-600",
      icon: "medal",
    },
    {
      id: "perfect-week",
      label: "Perfect Week",
      description: "Hit every daily goal for 7 days",
      earned: week.earned,
      progress: week.progress,
      tone: "from-emerald-400 to-teal-500",
      icon: "sparkles",
    },
    {
      id: "perfect-month",
      label: "Perfect Month",
      description: "Hit every daily goal for 30 days",
      earned: month.earned,
      progress: month.progress,
      tone: "from-indigo-500 to-fuchsia-500",
      icon: "crown",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Calendar day status                                                 */
/* ------------------------------------------------------------------ */

export type DayStatus = "completed" | "partial" | "missed" | "future" | "outside";

export type DayCell = {
  date: Date;
  iso: string;
  status: DayStatus;
  hours: number;
  target: number;
  pct: number;
};

export function buildCalendarDays(
  routines: SharedRoutine[],
  progressMap: ProgressMap,
  monthDate: Date,
): DayCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Pad to full weeks starting Sunday
  const startPad = first.getDay();
  const endPad = 6 - last.getDay();
  const cells: DayCell[] = [];

  for (let i = -startPad; i < last.getDate() + endPad; i++) {
    const d = new Date(year, month, 1 + i);
    const iso = toISO(d);
    const target = totalTarget(routines, iso);
    const hours = totalHoursOn(progressMap, iso);
    const pct = target > 0 ? Math.min(100, Math.round((hours / target) * 100)) : 0;

    let status: DayStatus;
    if (target === 0) status = "outside";
    else if (d > today) status = "future";
    else if (pct >= 100) status = "completed";
    else if (hours > 0) status = "partial";
    else status = "missed";

    cells.push({ date: d, iso, status, hours, target, pct });
  }
  return cells;
}
