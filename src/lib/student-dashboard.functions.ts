// Server functions for the Student Dashboard.
//
// Every read is scoped to `context.userId` via `requireSupabaseAuth`
// and the RLS policies on each user-owned table, so students only ever
// see their own attempts, bookmarks, routines and preferences.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExamCountdown = { name: string; dateISO: string } | null;

export type ChapterActivity = {
  source: "mcq" | "qbank";
  chapterId: string;
  chapterName: string;
  subjectName: string;
  levelName: string;
  done: number;
  total: number;
  at: number; // ms epoch of latest attempt
};

export type RoutineActivity = {
  id: string;
  title: string;
  completedTasks: number;
  totalTasks: number;
  at: number;
};

export type ContinueTarget =
  | { kind: "custom-exam"; sessionId: string; title: string; at: number }
  | { kind: "mcq"; chapter: ChapterActivity }
  | { kind: "qbank"; chapter: ChapterActivity }
  | { kind: "routine"; routine: RoutineActivity };

export type ActivityItem = {
  key: string;
  kind: "mcq" | "qbank" | "routine" | "custom-exam";
  title: string;
  subtitle: string;
  at: number;
};

export type StudentDashboardData = {
  profile: { fullName: string; email: string };
  mcq: { done: number; total: number; wrong: number; lastAt: number };
  qbank: { done: number; total: number; wrong: number; lastAt: number };
  routine: { done: number; total: number; lastAt: number };
  overallPct: number;
  wrongTotal: number;
  bookmarks: number;
  today: {
    mcqs: number;
    qbanks: number;
    completedTasks: number;
    plannedTasks: number;
    routinePct: number;
  };
  chapters: ChapterActivity[];
  routines: RoutineActivity[];
  continueTargets: ContinueTarget[];
  recentActivity: ActivityItem[];
  examCountdown: ExamCountdown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tsOf(v: string | null | undefined): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

// ---------------------------------------------------------------------------
// getStudentDashboard
// ---------------------------------------------------------------------------

export const getStudentDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentDashboardData> => {
    const { supabase, userId } = context as Ctx;

    const [
      profileRes,
      prefRes,
      mcqAttemptsRes,
      qbankAttemptsRes,
      mcqTotalRes,
      qbankTotalRes,
      mcqPerChapterRes,
      qbankPerChapterRes,
      wrongRes,
      bookmarksRes,
      routinesRes,
      routineTasksRes,
      routineCompletionsRes,
      activeExamRes,
      recentExamsRes,
    ] = await Promise.all([
      supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
      supabase
        .from("student_preferences")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("mcq_attempts")
        .select("question_id,chapter_id,is_correct,created_at")
        .eq("user_id", userId),
      supabase
        .from("qbank_attempts")
        .select("question_id,chapter_id,is_correct,created_at")
        .eq("user_id", userId),
      supabase.from("mcq_questions").select("chapter_id").eq("status", "published"),
      supabase.from("qbank_questions").select("chapter_id").eq("status", "published"),
      supabase.from("mcq_questions").select("chapter_id").eq("status", "published"),
      supabase.from("qbank_questions").select("chapter_id").eq("status", "published"),
      supabase
        .from("wrong_answer_bookmarks")
        .select("source,question_id")
        .eq("user_id", userId)
        .is("cleared_at", null),
      supabase.from("bookmarks").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase
        .from("routine_assignments")
        .select(
          "routine_id, routines:routine_id(id,title,is_active,is_archived,starts_on,ends_on,routine_type)",
        )
        .eq("target_type", "user")
        .eq("target_user_id", userId),
      Promise.resolve({ data: null, error: null }), // routine_tasks fetched below after we know the ids
      supabase
        .from("routine_task_completions")
        .select("task_id,status,completed_on,created_at")
        .eq("user_id", userId),
      supabase
        .from("custom_exam_sessions")
        .select("id,title,started_at,total_questions,correct_count")
        .eq("user_id", userId)
        .is("finished_at", null)
        .order("started_at", { ascending: false })
        .limit(1),
      supabase
        .from("custom_exam_sessions")
        .select("id,title,started_at,finished_at,total_questions,correct_count,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    void mcqPerChapterRes;
    void qbankPerChapterRes;

    for (const r of [
      profileRes,
      prefRes,
      mcqAttemptsRes,
      qbankAttemptsRes,
      mcqTotalRes,
      qbankTotalRes,
      wrongRes,
      bookmarksRes,
      routinesRes,
      routineTasksRes,
      routineCompletionsRes,
      activeExamRes,
      recentExamsRes,
    ]) {
      if (r?.error) throw new Error(r.error.message);
    }

    // Profile
    const profile = {
      fullName: (profileRes.data?.full_name as string | null) ?? "",
      email: (profileRes.data?.email as string | null) ?? "",
    };

    // Exam countdown
    const prefs = (prefRes.data?.preferences ?? {}) as Record<string, unknown>;
    const rawCd = prefs.examCountdown as { name?: unknown; dateISO?: unknown } | undefined;
    const examCountdown: ExamCountdown =
      rawCd && typeof rawCd.name === "string" && typeof rawCd.dateISO === "string"
        ? { name: rawCd.name, dateISO: rawCd.dateISO }
        : null;

    // -----------------------------------------------------------------
    // Aggregate MCQ / QBank per chapter
    // -----------------------------------------------------------------
    type AttemptRow = {
      question_id: string;
      chapter_id: string | null;
      is_correct: boolean;
      created_at: string;
    };
    type QuestionRow = { chapter_id: string };

    const aggregate = (attempts: AttemptRow[], totals: QuestionRow[], source: "mcq" | "qbank") => {
      // totals per chapter (published)
      const totalPer = new Map<string, number>();
      for (const q of totals) {
        if (!q.chapter_id) continue;
        totalPer.set(q.chapter_id, (totalPer.get(q.chapter_id) ?? 0) + 1);
      }
      // distinct done question ids per chapter + last-at + wrong count
      const donePer = new Map<string, Set<string>>();
      const lastPer = new Map<string, number>();
      const seen = new Set<string>();
      let done = 0;
      let wrong = 0;
      let lastAt = 0;
      for (const a of attempts) {
        const at = tsOf(a.created_at);
        if (at > lastAt) lastAt = at;
        if (!seen.has(a.question_id)) {
          seen.add(a.question_id);
          done++;
        }
        if (a.is_correct === false) wrong++;
        if (a.chapter_id) {
          let set = donePer.get(a.chapter_id);
          if (!set) {
            set = new Set();
            donePer.set(a.chapter_id, set);
          }
          set.add(a.question_id);
          if (at > (lastPer.get(a.chapter_id) ?? 0)) lastPer.set(a.chapter_id, at);
        }
      }
      let total = 0;
      for (const v of totalPer.values()) total += v;

      const chapters: Array<
        Omit<ChapterActivity, "chapterName" | "subjectName" | "levelName"> & {
          source: "mcq" | "qbank";
        }
      > = [];
      for (const [chId, doneSet] of donePer.entries()) {
        chapters.push({
          source,
          chapterId: chId,
          done: doneSet.size,
          total: totalPer.get(chId) ?? doneSet.size,
          at: lastPer.get(chId) ?? 0,
        });
      }
      return { done, total, wrong, lastAt, chapters };
    };

    const mcqAgg = aggregate(
      (mcqAttemptsRes.data ?? []) as AttemptRow[],
      (mcqTotalRes.data ?? []) as QuestionRow[],
      "mcq",
    );
    const qbAgg = aggregate(
      (qbankAttemptsRes.data ?? []) as AttemptRow[],
      (qbankTotalRes.data ?? []) as QuestionRow[],
      "qbank",
    );

    // -----------------------------------------------------------------
    // Chapter name lookup
    // -----------------------------------------------------------------
    const chapterIds = Array.from(
      new Set([...mcqAgg.chapters, ...qbAgg.chapters].map((c) => c.chapterId).filter(Boolean)),
    );
    const chapterMap = new Map<string, { name: string; subjectName: string; levelName: string }>();
    if (chapterIds.length) {
      const { data: chRows, error: chErr } = await supabase
        .from("academic_chapters")
        .select("id,name,subject:academic_subjects(name,level:academic_levels(name))")
        .in("id", chapterIds);
      if (chErr) throw new Error(chErr.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (chRows ?? []) as any[]) {
        chapterMap.set(r.id, {
          name: r.name ?? "",
          subjectName: r.subject?.name ?? "",
          levelName: r.subject?.level?.name ?? "",
        });
      }
    }

    const enrich = (
      arr: Array<Omit<ChapterActivity, "chapterName" | "subjectName" | "levelName">>,
    ): ChapterActivity[] =>
      arr.map((c) => {
        const info = chapterMap.get(c.chapterId);
        return {
          ...c,
          chapterName: info?.name ?? "Unknown chapter",
          subjectName: info?.subjectName ?? "",
          levelName: info?.levelName ?? "",
        };
      });

    const chaptersAll: ChapterActivity[] = [
      ...enrich(mcqAgg.chapters),
      ...enrich(qbAgg.chapters),
    ].sort((a, b) => b.at - a.at);

    // -----------------------------------------------------------------
    // Wrong answers (unique-question count, respects cleared_at IS NULL)
    // -----------------------------------------------------------------
    const wrongRows = (wrongRes.data ?? []) as Array<{ source: string; question_id: string }>;
    let mcqWrong = 0;
    let qbWrong = 0;
    for (const w of wrongRows) {
      if (w.source === "mcq") mcqWrong++;
      else if (w.source === "qbank") qbWrong++;
    }

    // -----------------------------------------------------------------
    // Routines
    // -----------------------------------------------------------------
    type RoutineRow = {
      id: string;
      title: string;
      is_active: boolean;
      is_archived: boolean;
      starts_on: string | null;
      ends_on: string | null;
      routine_type: string;
    };
    type TaskRow = { id: string; routine_id: string };
    type CompRow = { task_id: string; status: string; completed_on: string; created_at: string };

    // Assigned routines (via routine_assignments join)
    const assignRows = (routinesRes.data ?? []) as Array<{
      routine_id: string;
      routines: RoutineRow | null;
    }>;
    const routines: RoutineRow[] = [];
    const seenRoutineIds = new Set<string>();
    for (const a of assignRows) {
      const r = a.routines;
      if (!r || seenRoutineIds.has(r.id)) continue;
      seenRoutineIds.add(r.id);
      routines.push(r);
    }
    // Fetch tasks for these routines
    let tasks: TaskRow[] = [];
    if (routines.length) {
      const { data: taskRows, error: taskErr } = await supabase
        .from("routine_tasks")
        .select("id,routine_id")
        .in(
          "routine_id",
          routines.map((r) => r.id),
        );
      if (taskErr) throw new Error(taskErr.message);
      tasks = (taskRows ?? []) as TaskRow[];
    }
    void routineTasksRes;
    const comps = (routineCompletionsRes.data ?? []) as CompRow[];

    const tasksByRoutine = new Map<string, string[]>();
    const routineByTask = new Map<string, string>();
    for (const t of tasks) {
      routineByTask.set(t.id, t.routine_id);
      const arr = tasksByRoutine.get(t.routine_id) ?? [];
      arr.push(t.id);
      tasksByRoutine.set(t.routine_id, arr);
    }

    const routineActivity: RoutineActivity[] = [];
    let rDoneTotal = 0;
    let rTotalTotal = 0;
    let rLastAt = 0;
    const today = todayISO();
    const completedTaskIdsToday = new Set<string>();

    for (const r of routines) {
      if (r.is_archived) continue;
      const rTasks = tasksByRoutine.get(r.id) ?? [];
      rTotalTotal += rTasks.length;
      let done = 0;
      let last = 0;
      const rTaskSet = new Set(rTasks);
      for (const c of comps) {
        if (!rTaskSet.has(c.task_id)) continue;
        if (c.status === "completed") done++;
        const at = tsOf(c.created_at);
        if (at > last) last = at;
        if (at > rLastAt) rLastAt = at;
        if (c.status === "completed" && c.completed_on === today) {
          completedTaskIdsToday.add(c.task_id);
        }
      }
      rDoneTotal += done;
      routineActivity.push({
        id: r.id,
        title: r.title,
        completedTasks: done,
        totalTasks: rTasks.length,
        at: last,
      });
    }
    routineActivity.sort((a, b) => b.at - a.at);

    // "Today" — tasks completed today from any active routine
    const plannedTasksToday = tasks.length; // conservative: total assigned tasks the user can complete
    const completedTasksToday = completedTaskIdsToday.size;
    const routinePctToday =
      plannedTasksToday > 0
        ? Math.min(100, Math.round((completedTasksToday / plannedTasksToday) * 100))
        : 0;

    let mcqsToday = 0;
    let qbanksToday = 0;
    for (const a of (mcqAttemptsRes.data ?? []) as AttemptRow[]) {
      if (a.created_at.slice(0, 10) === today) mcqsToday++;
    }
    for (const a of (qbankAttemptsRes.data ?? []) as AttemptRow[]) {
      if (a.created_at.slice(0, 10) === today) qbanksToday++;
    }

    // -----------------------------------------------------------------
    // Overall progress
    // -----------------------------------------------------------------
    const totalItems = mcqAgg.total + qbAgg.total + rTotalTotal;
    const doneItems = mcqAgg.done + qbAgg.done + rDoneTotal;
    const overallPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

    // -----------------------------------------------------------------
    // Continue targets (priority: active custom exam → mcq → qbank → routine)
    // -----------------------------------------------------------------
    const continueTargets: ContinueTarget[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeExam = ((activeExamRes.data ?? []) as any[])[0];
    if (activeExam) {
      continueTargets.push({
        kind: "custom-exam",
        sessionId: activeExam.id,
        title: activeExam.title ?? "Custom exam",
        at: tsOf(activeExam.started_at),
      });
    }
    const continueMcq =
      chaptersAll.find((c) => c.source === "mcq" && c.done < c.total) ??
      chaptersAll.find((c) => c.source === "mcq");
    if (continueMcq) continueTargets.push({ kind: "mcq", chapter: continueMcq });
    const continueQb =
      chaptersAll.find((c) => c.source === "qbank" && c.done < c.total) ??
      chaptersAll.find((c) => c.source === "qbank");
    if (continueQb) continueTargets.push({ kind: "qbank", chapter: continueQb });
    const continueRoutine =
      routineActivity.find((r) => r.at > 0 && r.completedTasks < r.totalTasks) ??
      routineActivity.find((r) => r.at > 0);
    if (continueRoutine) continueTargets.push({ kind: "routine", routine: continueRoutine });

    // -----------------------------------------------------------------
    // Recent activity (top 5 across sources)
    // -----------------------------------------------------------------
    const activityItems: ActivityItem[] = [];
    for (const c of chaptersAll) {
      if (c.at <= 0) continue;
      activityItems.push({
        key: `${c.source}-${c.chapterId}-${c.at}`,
        kind: c.source,
        title: c.chapterName,
        subtitle: `${c.subjectName || c.levelName} · ${c.done}/${c.total}`,
        at: c.at,
      });
    }
    for (const r of routineActivity) {
      if (r.at <= 0) continue;
      activityItems.push({
        key: `routine-${r.id}-${r.at}`,
        kind: "routine",
        title: r.title,
        subtitle: `${r.completedTasks}/${r.totalTasks} tasks`,
        at: r.at,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (recentExamsRes.data ?? []) as any[]) {
      const at = tsOf(e.finished_at ?? e.started_at ?? e.created_at);
      if (at <= 0) continue;
      activityItems.push({
        key: `exam-${e.id}`,
        kind: "custom-exam",
        title: e.title ?? "Custom exam",
        subtitle: e.finished_at
          ? `${e.correct_count ?? 0}/${e.total_questions ?? 0} correct`
          : "In progress",
        at,
      });
    }
    const recentActivity = activityItems.sort((a, b) => b.at - a.at).slice(0, 5);

    return {
      profile,
      mcq: { done: mcqAgg.done, total: mcqAgg.total, wrong: mcqWrong, lastAt: mcqAgg.lastAt },
      qbank: { done: qbAgg.done, total: qbAgg.total, wrong: qbWrong, lastAt: qbAgg.lastAt },
      routine: { done: rDoneTotal, total: rTotalTotal, lastAt: rLastAt },
      overallPct,
      wrongTotal: mcqWrong + qbWrong,
      bookmarks: bookmarksRes.count ?? 0,
      today: {
        mcqs: mcqsToday,
        qbanks: qbanksToday,
        completedTasks: completedTasksToday,
        plannedTasks: plannedTasksToday,
        routinePct: routinePctToday,
      },
      chapters: chaptersAll,
      routines: routineActivity,
      continueTargets,
      recentActivity,
      examCountdown,
    };
  });

// ---------------------------------------------------------------------------
// setExamCountdown — writes preferences.examCountdown for the caller
// ---------------------------------------------------------------------------

export const setExamCountdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    if (src.clear === true) return { clear: true as const };
    const name = typeof src.name === "string" ? src.name.trim().slice(0, 120) : "";
    const dateISO = typeof src.dateISO === "string" ? src.dateISO.trim() : "";
    if (!name) throw new Error("Exam name required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid date");
    return { clear: false as const, name, dateISO };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: existing, error: readErr } = await supabase
      .from("student_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const prefs = (existing?.preferences ?? {}) as Record<string, unknown>;
    if (data.clear) {
      delete prefs.examCountdown;
    } else {
      prefs.examCountdown = { name: data.name, dateISO: data.dateISO };
    }
    const { error } = await supabase
      .from("student_preferences")
      .upsert({ user_id: userId, preferences: prefs }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// updateStudentName — updates the caller's profile display name
// ---------------------------------------------------------------------------

export const updateStudentName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const fullName = typeof src.fullName === "string" ? src.fullName.trim().slice(0, 120) : "";
    return { fullName };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: data.fullName || null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
