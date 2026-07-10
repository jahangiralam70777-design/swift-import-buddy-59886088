// Server functions for the Student Progress Tracker.
//
// Reads the full published academic tree (levels → subjects → chapters),
// per-chapter published MCQ totals, this student's distinct answered MCQ
// count per chapter (auto-detects the "MCQ Practice" checkpoint), and
// this student's manual checkpoints stored in
// `student_preferences.preferences.progressCheckpoints`.
//
// All reads/writes are scoped to `auth.uid()` via RLS.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ManualCheckpoint = "cls" | "slide" | "easy";

export type ChapterCheckpointsDTO = {
  cls: boolean;
  slide: boolean;
  easy: boolean;
  mcq: boolean; // derived: mcqDone >= mcqTotal && mcqTotal > 0
  mcqAuto: boolean; // true if `mcq` was auto-derived (as opposed to no data)
  mcqDone: number;
  mcqTotal: number;
  updatedAt: number; // epoch ms of latest manual update
};

export type TrackerChapter = {
  id: string;
  name: string;
  code: string;
  position: number;
  checkpoints: ChapterCheckpointsDTO;
};

export type TrackerSubject = {
  id: string;
  name: string;
  code: string;
  position: number;
  chapters: TrackerChapter[];
};

export type TrackerLevel = {
  id: string;
  name: string;
  code: string;
  position: number;
  subjects: TrackerSubject[];
};

export type ProgressTrackerData = {
  levels: TrackerLevel[];
};

// ---------------------------------------------------------------------------
// getMyProgressTracker
// ---------------------------------------------------------------------------

export const getMyProgressTracker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProgressTrackerData> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as { supabase: any; userId: string };

    const [levelsRes, subjectsRes, chaptersRes, mcqTotalsRes, mcqAttemptsRes, prefsRes] =
      await Promise.all([
        supabase.from("academic_levels").select("id,name,slug,position").order("position"),
        supabase
          .from("academic_subjects")
          .select("id,name,slug,position,level_id")
          .order("position"),
        supabase
          .from("academic_chapters")
          .select("id,name,slug,position,subject_id")
          .order("position"),
        supabase.from("mcq_questions").select("chapter_id").eq("status", "published"),
        supabase.from("mcq_attempts").select("question_id,chapter_id").eq("user_id", userId),
        supabase
          .from("student_preferences")
          .select("preferences")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

    for (const r of [levelsRes, subjectsRes, chaptersRes, mcqTotalsRes, mcqAttemptsRes, prefsRes]) {
      if (r?.error) throw new Error(r.error.message);
    }

    // Totals per chapter (published MCQs)
    const totalPer = new Map<string, number>();
    for (const q of (mcqTotalsRes.data ?? []) as Array<{ chapter_id: string | null }>) {
      if (!q.chapter_id) continue;
      totalPer.set(q.chapter_id, (totalPer.get(q.chapter_id) ?? 0) + 1);
    }
    // Distinct answered per chapter
    const donePer = new Map<string, Set<string>>();
    for (const a of (mcqAttemptsRes.data ?? []) as Array<{
      question_id: string;
      chapter_id: string | null;
    }>) {
      if (!a.chapter_id) continue;
      let set = donePer.get(a.chapter_id);
      if (!set) {
        set = new Set();
        donePer.set(a.chapter_id, set);
      }
      set.add(a.question_id);
    }

    // Manual checkpoints
    const prefs = (prefsRes.data?.preferences ?? {}) as Record<string, unknown>;
    const cpMap =
      (prefs.progressCheckpoints as
        | Record<string, { cls?: boolean; slide?: boolean; easy?: boolean; updatedAt?: number }>
        | undefined) ?? {};

    // Build tree
    const chaptersBySubject = new Map<string, TrackerChapter[]>();
    for (const c of (chaptersRes.data ?? []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      position: number;
      subject_id: string;
    }>) {
      const total = totalPer.get(c.id) ?? 0;
      const done = donePer.get(c.id)?.size ?? 0;
      const manual = cpMap[c.id] ?? {};
      const mcqAuto = total > 0 && done >= total;
      const chapter: TrackerChapter = {
        id: c.id,
        name: c.name,
        code: c.slug ?? "",
        position: c.position,
        checkpoints: {
          cls: !!manual.cls,
          slide: !!manual.slide,
          easy: !!manual.easy,
          mcq: mcqAuto,
          mcqAuto,
          mcqDone: done,
          mcqTotal: total,
          updatedAt: Number(manual.updatedAt ?? 0),
        },
      };
      const arr = chaptersBySubject.get(c.subject_id) ?? [];
      arr.push(chapter);
      chaptersBySubject.set(c.subject_id, arr);
    }

    const subjectsByLevel = new Map<string, TrackerSubject[]>();
    for (const s of (subjectsRes.data ?? []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      position: number;
      level_id: string;
    }>) {
      const arr = subjectsByLevel.get(s.level_id) ?? [];
      arr.push({
        id: s.id,
        name: s.name,
        code: s.slug ?? "",
        position: s.position,
        chapters: chaptersBySubject.get(s.id) ?? [],
      });
      subjectsByLevel.set(s.level_id, arr);
    }

    const levels: TrackerLevel[] = (
      (levelsRes.data ?? []) as Array<{
        id: string;
        name: string;
        slug: string | null;
        position: number;
      }>
    ).map((l) => ({
      id: l.id,
      name: l.name,
      code: l.slug ?? "",
      position: l.position,
      subjects: subjectsByLevel.get(l.id) ?? [],
    }));

    return { levels };
  });

// ---------------------------------------------------------------------------
// setMyProgressCheckpoint
// ---------------------------------------------------------------------------

type SetInput = { chapterId: string; key: ManualCheckpoint; value: boolean };

function validSet(input: unknown): SetInput {
  const s = (input ?? {}) as Record<string, unknown>;
  const chapterId = typeof s.chapterId === "string" ? s.chapterId : "";
  const key = s.key;
  if (!chapterId) throw new Error("chapterId required");
  if (key !== "cls" && key !== "slide" && key !== "easy") {
    throw new Error("Invalid checkpoint key");
  }
  return { chapterId, key, value: !!s.value };
}

export const setMyProgressCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validSet)
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: existing, error: readErr } = await supabase
      .from("student_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const prefs = (existing?.preferences ?? {}) as Record<string, unknown>;
    const cpMap =
      (prefs.progressCheckpoints as
        | Record<string, { cls?: boolean; slide?: boolean; easy?: boolean; updatedAt?: number }>
        | undefined) ?? {};
    const cur = cpMap[data.chapterId] ?? {};
    const nextEntry = {
      cls: !!cur.cls,
      slide: !!cur.slide,
      easy: !!cur.easy,
      [data.key]: data.value,
      updatedAt: Date.now(),
    };
    const nextPrefs = {
      ...prefs,
      progressCheckpoints: { ...cpMap, [data.chapterId]: nextEntry },
    };

    const { error: upErr } = await supabase
      .from("student_preferences")
      .upsert({ user_id: userId, preferences: nextPrefs }, { onConflict: "user_id" });
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const };
  });
