// Server functions powering the Student Bookmarks (Study Later) module.
// Reuses the existing `bookmarks` table (source of truth for MCQ + Qbank
// bookmarks). All queries scoped to the caller via RLS (auth.uid()).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BookmarkSourceKind = "mcq" | "qbank";

export type BookmarkOption = { key: string; text: string };

export type BookmarkRow = {
  id: string;
  source: BookmarkSourceKind;
  sourceLabel: "MCQ Practice" | "Question Bank";
  questionId: string;
  levelId: string;
  levelName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  qIndex: number; // 0-based position
  qNumber: number; // 1-based
  question: string;
  options: BookmarkOption[];
  answer: string; // key of correct option
  explanation: string;
  addedAt: number;
  lastAttemptAt: number | null;
};

function indexToLetter(i: number): string {
  return String.fromCharCode(65 + Math.max(0, Math.min(25, i)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOptions(raw: any): BookmarkOption[] {
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

export const getMyBookmarks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BookmarkRow[]> => {
    const { supabase, userId } = context;

    const { data: bmRows, error: bmErr } = await supabase
      .from("bookmarks")
      .select("id, source, question_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (bmErr) throw new Error(bmErr.message);
    if (!bmRows || bmRows.length === 0) return [];

    const mcqIds = bmRows.filter((r) => r.source === "mcq").map((r) => r.question_id);
    const qbankIds = bmRows.filter((r) => r.source === "qbank").map((r) => r.question_id);

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
      qbankById.set(q.id, { ...q, question: q.question ?? q.prompt ?? "" });
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

    // Last attempt time per (source, question_id)
    type AttRow = { question_id: string; created_at: string };
    const [mcqAtt, qbankAtt] = await Promise.all([
      mcqIds.length
        ? supabase
            .from("mcq_attempts")
            .select("question_id, created_at")
            .eq("user_id", userId)
            .in("question_id", mcqIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as AttRow[], error: null }),
      qbankIds.length
        ? supabase
            .from("qbank_attempts")
            .select("question_id, created_at")
            .eq("user_id", userId)
            .in("question_id", qbankIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as AttRow[], error: null }),
    ]);
    if (mcqAtt.error) throw new Error(mcqAtt.error.message);
    if (qbankAtt.error) throw new Error(qbankAtt.error.message);
    const lastAttempt = new Map<string, number>();
    for (const a of (mcqAtt.data ?? []) as AttRow[]) {
      const key = `mcq::${a.question_id}`;
      const t = new Date(a.created_at).getTime();
      if (!lastAttempt.has(key)) lastAttempt.set(key, t);
    }
    for (const a of (qbankAtt.data ?? []) as AttRow[]) {
      const key = `qbank::${a.question_id}`;
      const t = new Date(a.created_at).getTime();
      if (!lastAttempt.has(key)) lastAttempt.set(key, t);
    }

    const out: BookmarkRow[] = [];
    for (const b of bmRows) {
      const src = b.source as BookmarkSourceKind;
      const q = src === "mcq" ? mcqById.get(b.question_id) : qbankById.get(b.question_id);
      if (!q) continue;
      const meta = chapMeta.get(q.chapter_id);
      if (!meta) continue;
      const options = normalizeOptions(q.options);
      const correctIndex = Number.isInteger(q.correct_index)
        ? Math.max(0, Math.min(Math.max(0, options.length - 1), q.correct_index))
        : 0;
      out.push({
        id: b.id,
        source: src,
        sourceLabel: src === "mcq" ? "MCQ Practice" : "Question Bank",
        questionId: b.question_id,
        levelId: meta.levelId,
        levelName: meta.levelName,
        subjectId: meta.subjectId,
        subjectName: meta.subjectName,
        chapterId: q.chapter_id,
        chapterName: meta.chapterName,
        qIndex: q.position,
        qNumber: q.position + 1,
        question: q.question ?? "",
        options,
        answer: options[correctIndex]?.key ?? indexToLetter(correctIndex),
        explanation: q.explanation ?? "",
        addedAt: new Date(b.created_at).getTime(),
        lastAttemptAt: lastAttempt.get(`${src}::${b.question_id}`) ?? null,
      });
    }
    return out;
  });

export const removeBookmarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(src.ids)
      ? (src.ids.filter((v) => typeof v === "string") as string[])
      : [];
    if (ids.length === 0) throw new Error("ids required");
    return { ids };
  })
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    const { supabase, userId } = context;
    const { error, count } = await supabase
      .from("bookmarks")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });
