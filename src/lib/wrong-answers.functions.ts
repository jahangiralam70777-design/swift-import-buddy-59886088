// Server functions powering the Student Wrong Answers module.
// Reuses the existing `wrong_answer_bookmarks` and `bookmarks` tables.
// All queries scoped to the caller via RLS (`auth.uid()`).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WrongAnswerSource = "mcq" | "qbank";

export type WrongAnswerOption = { key: string; text: string };

export type WrongAnswerRow = {
  id: string; // wrong_answer_bookmarks.id
  source: WrongAnswerSource;
  questionId: string;
  levelId: string;
  levelName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  questionIndex: number; // question.position (0-based)
  question: string;
  options: WrongAnswerOption[];
  correctIndex: number;
  correctKey: string;
  explanation: string;
  wrongCount: number;
  lastWrongAt: number; // epoch ms
  clearedAt: number | null;
  bookmarked: boolean;
  selectedIndex: number | null; // last attempt's selection
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indexToLetter(i: number): string {
  return String.fromCharCode(65 + Math.max(0, Math.min(25, i)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOptions(raw: any): WrongAnswerOption[] {
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
// getMyWrongAnswers — full list, server-joined with question + taxonomy.
// ---------------------------------------------------------------------------

export const getMyWrongAnswers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WrongAnswerRow[]> => {
    const { supabase, userId } = context;

    const { data: wrongRows, error: wrongErr } = await supabase
      .from("wrong_answer_bookmarks")
      .select("id, source, question_id, wrong_count, last_wrong_at, cleared_at")
      .eq("user_id", userId)
      .order("last_wrong_at", { ascending: false });
    if (wrongErr) throw new Error(wrongErr.message);
    if (!wrongRows || wrongRows.length === 0) return [];

    const mcqIds = wrongRows.filter((r) => r.source === "mcq").map((r) => r.question_id);
    const qbankIds = wrongRows.filter((r) => r.source === "qbank").map((r) => r.question_id);

    type QRow = {
      id: string;
      chapter_id: string;
      position: number;
      question: string | null;
      options: unknown;
      correct_index: number;
      explanation: string | null;
    };

    const [mcqQ, qbankQ] = await Promise.all([
      mcqIds.length
        ? supabase
            .from("mcq_questions")
            .select("id, chapter_id, position, question, options, correct_index, explanation")
            .in("id", mcqIds)
        : Promise.resolve({ data: [] as QRow[], error: null }),
      qbankIds.length
        ? supabase
            .from("qbank_questions")
            .select(
              "id, chapter_id, position, question, prompt, options, correct_index, explanation",
            )
            .in("id", qbankIds)
        : Promise.resolve({ data: [] as (QRow & { prompt: string | null })[], error: null }),
    ]);
    if (mcqQ.error) throw new Error(mcqQ.error.message);
    if (qbankQ.error) throw new Error(qbankQ.error.message);

    const mcqById = new Map<string, QRow>();
    for (const q of (mcqQ.data ?? []) as QRow[]) mcqById.set(q.id, q);
    const qbankById = new Map<string, QRow>();
    for (const q of (qbankQ.data ?? []) as (QRow & { prompt: string | null })[]) {
      qbankById.set(q.id, {
        ...q,
        question: q.question ?? q.prompt ?? "",
      });
    }

    const chapterIdSet = new Set<string>();
    mcqById.forEach((q) => chapterIdSet.add(q.chapter_id));
    qbankById.forEach((q) => chapterIdSet.add(q.chapter_id));

    const chapterIds = Array.from(chapterIdSet);
    const { data: chapterRows, error: chapErr } = chapterIds.length
      ? await supabase
          .from("academic_chapters")
          .select(
            "id, name, subject_id, academic_subjects!inner(id, name, level_id, academic_levels!inner(id, name))",
          )
          .in("id", chapterIds)
      : { data: [] as unknown[], error: null };
    if (chapErr) throw new Error(chapErr.message);

    type ChapMeta = {
      chapterName: string;
      subjectId: string;
      subjectName: string;
      levelId: string;
      levelName: string;
    };
    const chapMeta = new Map<string, ChapMeta>();
    for (const c of (chapterRows ?? []) as Array<{
      id: string;
      name: string;
      subject_id: string;
      academic_subjects: {
        id: string;
        name: string;
        level_id: string;
        academic_levels: { id: string; name: string };
      };
    }>) {
      chapMeta.set(c.id, {
        chapterName: c.name,
        subjectId: c.academic_subjects.id,
        subjectName: c.academic_subjects.name,
        levelId: c.academic_subjects.academic_levels.id,
        levelName: c.academic_subjects.academic_levels.name,
      });
    }

    // Bookmarks lookup
    const allQids = wrongRows.map((r) => r.question_id);
    const { data: bmRows, error: bmErr } = allQids.length
      ? await supabase
          .from("bookmarks")
          .select("question_id, source")
          .eq("user_id", userId)
          .in("question_id", allQids)
      : { data: [] as { question_id: string; source: string }[], error: null };
    if (bmErr) throw new Error(bmErr.message);
    const bookmarkSet = new Set<string>();
    for (const b of bmRows ?? []) bookmarkSet.add(`${b.source}::${b.question_id}`);

    // Latest attempt selected_index per question
    type AttRow = { question_id: string; selected_index: number | null };
    const [mcqAtt, qbankAtt] = await Promise.all([
      mcqIds.length
        ? supabase
            .from("mcq_attempts")
            .select("question_id, selected_index")
            .eq("user_id", userId)
            .in("question_id", mcqIds)
        : Promise.resolve({ data: [] as AttRow[], error: null }),
      qbankIds.length
        ? supabase
            .from("qbank_attempts")
            .select("question_id, selected_index")
            .eq("user_id", userId)
            .in("question_id", qbankIds)
        : Promise.resolve({ data: [] as AttRow[], error: null }),
    ]);
    if (mcqAtt.error) throw new Error(mcqAtt.error.message);
    if (qbankAtt.error) throw new Error(qbankAtt.error.message);
    const selMap = new Map<string, number | null>();
    for (const a of (mcqAtt.data ?? []) as AttRow[])
      selMap.set(`mcq::${a.question_id}`, a.selected_index);
    for (const a of (qbankAtt.data ?? []) as AttRow[])
      selMap.set(`qbank::${a.question_id}`, a.selected_index);

    // Build rows
    const out: WrongAnswerRow[] = [];
    for (const w of wrongRows) {
      const src = w.source as WrongAnswerSource;
      const q = src === "mcq" ? mcqById.get(w.question_id) : qbankById.get(w.question_id);
      if (!q) continue;
      const meta = chapMeta.get(q.chapter_id);
      if (!meta) continue;
      const options = normalizeOptions(q.options);
      const correctIndex = Number.isInteger(q.correct_index)
        ? Math.max(0, Math.min(options.length - 1, q.correct_index))
        : 0;
      out.push({
        id: w.id,
        source: src,
        questionId: w.question_id,
        levelId: meta.levelId,
        levelName: meta.levelName,
        subjectId: meta.subjectId,
        subjectName: meta.subjectName,
        chapterId: q.chapter_id,
        chapterName: meta.chapterName,
        questionIndex: q.position,
        question: q.question ?? "",
        options,
        correctIndex,
        correctKey: options[correctIndex]?.key ?? indexToLetter(correctIndex),
        explanation: q.explanation ?? "",
        wrongCount: w.wrong_count ?? 1,
        lastWrongAt: new Date(w.last_wrong_at).getTime(),
        clearedAt: w.cleared_at ? new Date(w.cleared_at).getTime() : null,
        bookmarked: bookmarkSet.has(`${src}::${w.question_id}`),
        selectedIndex: selMap.get(`${src}::${w.question_id}`) ?? null,
      });
    }
    return out;
  });

// ---------------------------------------------------------------------------
// setWrongCleared — bulk clear/restore (marks cleared_at)
// ---------------------------------------------------------------------------

export const setWrongCleared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(src.ids)
      ? (src.ids.filter((v) => typeof v === "string") as string[])
      : [];
    const cleared = !!src.cleared;
    if (ids.length === 0) throw new Error("ids required");
    return { ids, cleared };
  })
  .handler(async ({ data, context }): Promise<{ updated: number }> => {
    const { supabase, userId } = context;
    const { error, count } = await supabase
      .from("wrong_answer_bookmarks")
      .update({ cleared_at: data.cleared ? new Date().toISOString() : null }, { count: "exact" })
      .eq("user_id", userId)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { updated: count ?? 0 };
  });

// ---------------------------------------------------------------------------
// toggleWrongBookmark — reuses the shared bookmarks table
// ---------------------------------------------------------------------------

export const toggleWrongBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const questionId = typeof src.questionId === "string" ? src.questionId : "";
    const source = src.source === "mcq" || src.source === "qbank" ? src.source : "";
    if (!questionId || !source) throw new Error("questionId and source required");
    return { questionId, source: source as WrongAnswerSource };
  })
  .handler(async ({ data, context }): Promise<{ bookmarked: boolean }> => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("source", data.source)
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
      source: data.source,
      question_id: data.questionId,
    });
    if (error) throw new Error(error.message);
    return { bookmarked: true };
  });

// ---------------------------------------------------------------------------
// submitWrongRetry — score retry server-side; auto-clear on correct.
// Does NOT touch mcq_attempts/qbank_attempts (owned by their own modules).
// ---------------------------------------------------------------------------

export const submitWrongRetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const id = typeof src.id === "string" ? src.id : "";
    const selectedIndex = Number.isInteger(src.selectedIndex) ? (src.selectedIndex as number) : -1;
    if (!id) throw new Error("id required");
    if (selectedIndex < 0) throw new Error("selectedIndex required");
    return { id, selectedIndex };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ isCorrect: boolean; correctIndex: number; cleared: boolean }> => {
      const { supabase, userId } = context;

      const { data: row, error: rErr } = await supabase
        .from("wrong_answer_bookmarks")
        .select("id, source, question_id, cleared_at")
        .eq("id", data.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (rErr) throw new Error(rErr.message);
      if (!row) throw new Error("Wrong answer record not found");

      let correctIndex = 0;
      let optionCount = 0;
      if (row.source === "mcq") {
        const { data: q, error } = await supabase
          .from("mcq_questions")
          .select("correct_index, options")
          .eq("id", row.question_id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!q) throw new Error("Question not found");
        optionCount = Array.isArray(q.options) ? q.options.length : 0;
        correctIndex = Number.isInteger(q.correct_index)
          ? Math.max(0, Math.min(Math.max(0, optionCount - 1), q.correct_index))
          : 0;
      } else {
        const { data: q, error } = await supabase
          .from("qbank_questions")
          .select("correct_index, options")
          .eq("id", row.question_id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!q) throw new Error("Question not found");
        optionCount = Array.isArray(q.options) ? q.options.length : 0;
        correctIndex = Number.isInteger(q.correct_index)
          ? Math.max(0, Math.min(Math.max(0, optionCount - 1), q.correct_index))
          : 0;
      }

      const isCorrect = data.selectedIndex === correctIndex;
      let cleared = row.cleared_at !== null;
      if (isCorrect && !cleared) {
        const { error } = await supabase
          .from("wrong_answer_bookmarks")
          .update({ cleared_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("user_id", userId);
        if (error) throw new Error(error.message);
        cleared = true;
      }
      return { isCorrect, correctIndex, cleared };
    },
  );
