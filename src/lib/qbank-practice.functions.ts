// Server functions powering the Student Question Bank Practice module.
// All calls are guarded by requireSupabaseAuth and every write is scoped
// to the current auth.uid() through RLS.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PracticeChapter = {
  id: string;
  name: string;
  code: string;
  description: string;
  total: number;
  done: number;
  correct: number;
  wrong: number;
  timeSpentMs: number;
  bookmarks: number;
  lastPracticedAt: number; // epoch ms; 0 if never practiced
};

export type PracticeSubject = {
  id: string;
  name: string;
  code: string;
  description: string;
  chapters: PracticeChapter[];
};

export type PracticeLevel = {
  id: string;
  name: string;
  code: string;
  description: string;
  subjects: PracticeSubject[];
};

export type PracticeTaxonomy = { levels: PracticeLevel[] };

export type SessionOption = { key: string; text: string };

export type SessionQuestion = {
  id: string;
  position: number;
  question: string;
  options: SessionOption[];
  correctIndex: number;
  answerKey: string;
  explanation: string;
};

export type SessionAttempt = {
  questionId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  createdAt: number;
};

export type ChapterSession = {
  chapter: {
    id: string;
    name: string;
    code: string;
    description: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    levelId: string;
    levelName: string;
    levelCode: string;
  };
  questions: SessionQuestion[];
  attempts: SessionAttempt[];
  bookmarkedQuestionIds: string[];
  lastIndex: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indexToLetter(i: number): string {
  return String.fromCharCode(65 + Math.max(0, Math.min(25, i)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOptions(raw: any): SessionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o, i) => {
      if (typeof o === "string") return { key: indexToLetter(i), text: o };
      if (o && typeof o === "object") {
        const key = typeof o.key === "string" && o.key ? o.key : indexToLetter(i);
        const text = typeof o.text === "string" ? o.text : String(o.text ?? "");
        return { key, text };
      }
      return { key: indexToLetter(i), text: String(o ?? "") };
    })
    .slice(0, 26);
}

// ---------------------------------------------------------------------------
// getQbankTaxonomy — full Level → Subject → Chapter tree with per-chapter
// totals and the caller's own progress counters, in one round-trip.
// ---------------------------------------------------------------------------

export const getQbankTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PracticeTaxonomy> => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("qbank_practice_taxonomy");
    if (error) throw new Error(error.message);

    const levelMap = new Map<string, PracticeLevel>();
    const subjectMap = new Map<string, PracticeSubject>();

    for (const r of (data ?? []) as Array<{
      level_id: string;
      level_name: string;
      level_slug: string | null;
      level_description: string | null;
      subject_id: string;
      subject_name: string;
      subject_slug: string | null;
      subject_description: string | null;
      chapter_id: string;
      chapter_name: string;
      chapter_slug: string | null;
      chapter_description: string | null;
      total_mcqs: number | string;
      done: number | string;
      correct: number | string;
      wrong: number | string;
      time_spent_ms: number | string;
      bookmarks: number | string;
      last_practiced_at: string | null;
    }>) {
      let lvl = levelMap.get(r.level_id);
      if (!lvl) {
        lvl = {
          id: r.level_id,
          name: r.level_name,
          code: r.level_slug ?? "",
          description: r.level_description ?? "",
          subjects: [],
        };
        levelMap.set(r.level_id, lvl);
      }
      let sub = subjectMap.get(r.subject_id);
      if (!sub) {
        sub = {
          id: r.subject_id,
          name: r.subject_name,
          code: r.subject_slug ?? "",
          description: r.subject_description ?? "",
          chapters: [],
        };
        subjectMap.set(r.subject_id, sub);
        lvl.subjects.push(sub);
      }
      sub.chapters.push({
        id: r.chapter_id,
        name: r.chapter_name,
        code: r.chapter_slug ?? "",
        description: r.chapter_description ?? "",
        total: Number(r.total_mcqs) || 0,
        done: Number(r.done) || 0,
        correct: Number(r.correct) || 0,
        wrong: Number(r.wrong) || 0,
        timeSpentMs: Number(r.time_spent_ms) || 0,
        bookmarks: Number(r.bookmarks) || 0,
        lastPracticedAt: r.last_practiced_at ? new Date(r.last_practiced_at).getTime() : 0,
      });
    }

    return { levels: Array.from(levelMap.values()) };
  });

// ---------------------------------------------------------------------------
// getQbankChapterSession — questions + user attempts + bookmarks for one chapter
// ---------------------------------------------------------------------------

export const getQbankChapterSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const chapterId = typeof src.chapterId === "string" ? src.chapterId : "";
    if (!chapterId) throw new Error("chapterId required");
    return { chapterId };
  })
  .handler(async ({ data, context }): Promise<ChapterSession | null> => {
    const { supabase, userId } = context;

    // Chapter → subject → level metadata.
    const { data: chapterRow, error: chapErr } = await supabase
      .from("academic_chapters")
      .select(
        "id, name, slug, description, subject_id, academic_subjects!inner(id, name, slug, level_id, academic_levels!inner(id, name, slug))",
      )
      .eq("id", data.chapterId)
      .maybeSingle();
    if (chapErr) throw new Error(chapErr.message);
    if (!chapterRow) return null;
    const subj = chapterRow.academic_subjects;
    const lvl = subj.academic_levels;

    // Published questions, in stored order.
    const { data: qRows, error: qErr } = await supabase
      .from("qbank_questions")
      .select("id, position, question, options, correct_index, explanation")
      .eq("chapter_id", data.chapterId)
      .eq("status", "published")
      .order("position", { ascending: true });
    if (qErr) throw new Error(qErr.message);

    const questions: SessionQuestion[] = (qRows ?? []).map((r) => {
      const options = normalizeOptions(r.options);
      const correctIndex = Number.isInteger(r.correct_index)
        ? Math.max(0, Math.min(options.length - 1, r.correct_index))
        : 0;
      return {
        id: r.id,
        position: r.position,
        question: r.question ?? "",
        options,
        correctIndex,
        answerKey: options[correctIndex]?.key ?? indexToLetter(correctIndex),
        explanation: r.explanation ?? "",
      };
    });

    // User attempts for these questions (RLS restricts to auth.uid()).
    const questionIds = questions.map((q) => q.id);
    let attempts: SessionAttempt[] = [];
    if (questionIds.length > 0) {
      const { data: aRows, error: aErr } = await supabase
        .from("qbank_attempts")
        .select("question_id, selected_index, is_correct, created_at")
        .eq("user_id", userId)
        .in("question_id", questionIds);
      if (aErr) throw new Error(aErr.message);
      attempts = (aRows ?? []).map((r) => ({
        questionId: r.question_id,
        selectedIndex: r.selected_index,
        isCorrect: !!r.is_correct,
        createdAt: new Date(r.created_at).getTime(),
      }));
    }

    // Bookmarks (mcq scope) for questions in this chapter.
    let bookmarkedQuestionIds: string[] = [];
    if (questionIds.length > 0) {
      const { data: bRows, error: bErr } = await supabase
        .from("bookmarks")
        .select("question_id")
        .eq("user_id", userId)
        .eq("source", "qbank")
        .in("question_id", questionIds);
      if (bErr) throw new Error(bErr.message);
      bookmarkedQuestionIds = (bRows ?? []).map((r) => r.question_id);
    }

    // lastIndex = position of first unanswered question, capped to last index.
    const answeredIds = new Set(attempts.map((a) => a.questionId));
    let lastIndex = 0;
    for (let i = 0; i < questions.length; i++) {
      if (!answeredIds.has(questions[i].id)) {
        lastIndex = i;
        break;
      }
      lastIndex = i;
    }

    return {
      chapter: {
        id: chapterRow.id,
        name: chapterRow.name,
        code: chapterRow.slug ?? "",
        description: chapterRow.description ?? "",
        subjectId: subj.id,
        subjectName: subj.name,
        subjectCode: subj.slug ?? "",
        levelId: lvl.id,
        levelName: lvl.name,
        levelCode: lvl.slug ?? "",
      },
      questions,
      attempts,
      bookmarkedQuestionIds,
      lastIndex,
    };
  });

// ---------------------------------------------------------------------------
// submitQbankAnswer — upsert attempt + track wrong answer + return outcome
// ---------------------------------------------------------------------------

export const submitQbankAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const questionId = typeof src.questionId === "string" ? src.questionId : "";
    const selectedIndex = Number.isInteger(src.selectedIndex) ? (src.selectedIndex as number) : -1;
    const timeSpentMs =
      typeof src.timeSpentMs === "number" && src.timeSpentMs >= 0 ? Math.floor(src.timeSpentMs) : 0;
    if (!questionId) throw new Error("questionId required");
    if (selectedIndex < 0) throw new Error("selectedIndex required");
    return { questionId, selectedIndex, timeSpentMs };
  })
  .handler(async ({ data, context }): Promise<{ isCorrect: boolean; correctIndex: number }> => {
    const { supabase, userId } = context;

    // Fetch canonical question to score server-side (never trust client).
    const { data: q, error: qErr } = await supabase
      .from("qbank_questions")
      .select("id, chapter_id, correct_index, options, status")
      .eq("id", data.questionId)
      .maybeSingle();
    if (qErr) throw new Error(qErr.message);
    if (!q) throw new Error("Question not found");
    if (q.status !== "published") throw new Error("Question not available");

    const options = normalizeOptions(q.options);
    const correctIndex = Number.isInteger(q.correct_index)
      ? Math.max(0, Math.min(options.length - 1, q.correct_index))
      : 0;
    const isCorrect = data.selectedIndex === correctIndex;

    // Upsert attempt (one row per user+question — updates on repeat submit).
    const { error: aErr } = await supabase.from("qbank_attempts").upsert(
      {
        user_id: userId,
        question_id: data.questionId,
        chapter_id: q.chapter_id,
        selected_index: data.selectedIndex,
        is_correct: isCorrect,
        time_spent_ms: data.timeSpentMs,
      },
      { onConflict: "user_id,question_id" },
    );
    if (aErr) throw new Error(aErr.message);

    // Wrong-answer bookkeeping — bump counter or resurrect a cleared row.
    if (!isCorrect) {
      const { data: existing, error: exErr } = await supabase
        .from("wrong_answer_bookmarks")
        .select("id, wrong_count, cleared_at")
        .eq("user_id", userId)
        .eq("source", "qbank")
        .eq("question_id", data.questionId)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      const nowIso = new Date().toISOString();
      if (existing) {
        const { error: uErr } = await supabase
          .from("wrong_answer_bookmarks")
          .update({
            wrong_count: (existing.wrong_count ?? 0) + 1,
            last_wrong_at: nowIso,
            cleared_at: null,
          })
          .eq("id", existing.id);
        if (uErr) throw new Error(uErr.message);
      } else {
        const { error: iErr } = await supabase.from("wrong_answer_bookmarks").insert({
          user_id: userId,
          source: "qbank",
          question_id: data.questionId,
          wrong_count: 1,
          last_wrong_at: nowIso,
        });
        if (iErr) throw new Error(iErr.message);
      }
    }

    return { isCorrect, correctIndex };
  });

// ---------------------------------------------------------------------------
// toggleQbankBookmark
// ---------------------------------------------------------------------------

export const toggleQbankBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const questionId = typeof src.questionId === "string" ? src.questionId : "";
    if (!questionId) throw new Error("questionId required");
    return { questionId };
  })
  .handler(async ({ data, context }): Promise<{ bookmarked: boolean }> => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "qbank")
      .eq("question_id", data.questionId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);

    if (existing) {
      const { error } = await supabase.from("bookmarks").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { bookmarked: false };
    }
    const { error } = await supabase.from("bookmarks").insert({
      user_id: userId,
      source: "qbank",
      question_id: data.questionId,
    });
    if (error) throw new Error(error.message);
    return { bookmarked: true };
  });

// ---------------------------------------------------------------------------
// restartChapterQbankSession — wipe user's attempts for a chapter so the
// next session starts from scratch. Only touches the caller's own rows.
// ---------------------------------------------------------------------------

export const restartChapterQbankSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const chapterId = typeof src.chapterId === "string" ? src.chapterId : "";
    if (!chapterId) throw new Error("chapterId required");
    return { chapterId };
  })
  .handler(async ({ data, context }): Promise<{ cleared: number }> => {
    const { supabase, userId } = context;
    const { error, count } = await supabase
      .from("qbank_attempts")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("chapter_id", data.chapterId);
    if (error) throw new Error(error.message);
    return { cleared: count ?? 0 };
  });
