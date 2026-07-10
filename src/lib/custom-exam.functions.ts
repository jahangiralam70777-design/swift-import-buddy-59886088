// Server functions powering the Student Custom Exam module.
// All calls are guarded by requireSupabaseAuth. Every read/write is scoped
// to auth.uid() via RLS on custom_exam_sessions, custom_exam_answers,
// mcq_attempts, bookmarks and wrong_answer_bookmarks.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExamSource = "mcq" | "qbank";

export type TaxonomyChapter = {
  id: string;
  name: string;
  subjectId: string;
  subjectName: string;
  levelId: string;
  levelName: string;
  mcqCount: number;
  qbankCount: number;
};

export type TaxonomySubject = {
  id: string;
  name: string;
  chapters: TaxonomyChapter[];
};

export type TaxonomyLevel = {
  id: string;
  name: string;
  subjects: TaxonomySubject[];
};

export type CustomExamTaxonomy = { levels: TaxonomyLevel[] };

export type ExamOption = { key: string; text: string };

export type ExamQuestion = {
  uid: string;
  src: ExamSource;
  questionId: string;
  chapterId: string;
  chapterName: string;
  subjectName: string;
  levelName: string;
  question: string;
  options: ExamOption[];
  answer: string; // key letter
  correctIndex: number;
  explanation: string;
};

export type ExamConfig = {
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  sources: ExamSource[];
  levelName: string;
  subjectNames: string[];
  chapterRefs: {
    src: ExamSource;
    chapterId: string;
    chapterName: string;
    subjectName: string;
    levelName: string;
  }[];
  questions: ExamQuestion[];
};

export type ExamAnswer = {
  questionUid: string;
  questionId: string;
  source: ExamSource;
  selectedIndex: number | null;
  isCorrect: boolean;
  createdAt: number;
};

export type ExamSession = {
  id: string;
  title: string;
  config: ExamConfig;
  startedAt: number;
  finishedAt: number | null;
  score: number | null;
  totalQuestions: number;
  correctCount: number;
  answers: ExamAnswer[];
  bookmarkedUids: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indexToLetter(i: number): string {
  return String.fromCharCode(65 + Math.max(0, Math.min(25, i)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOptions(raw: any): ExamOption[] {
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

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// getCustomExamTaxonomy — Level → Subject → Chapter with counts per source.
// ---------------------------------------------------------------------------

export const getCustomExamTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomExamTaxonomy> => {
    const { supabase } = context;

    // Full academic taxonomy tree.
    const { data: levels, error: lErr } = await supabase
      .from("academic_levels")
      .select(
        "id, name, position, academic_subjects(id, name, position, academic_chapters(id, name, position))",
      )
      .order("position", { ascending: true });
    if (lErr) throw new Error(lErr.message);

    // Per-chapter counts of published questions in each bank.
    const [{ data: mcqRows, error: mErr }, { data: qbRows, error: qErr }] = await Promise.all([
      supabase.from("mcq_questions").select("chapter_id").eq("status", "published"),
      supabase.from("qbank_questions").select("chapter_id").eq("status", "published"),
    ]);
    if (mErr) throw new Error(mErr.message);
    if (qErr) throw new Error(qErr.message);

    const mcqByChap = new Map<string, number>();
    for (const r of mcqRows ?? [])
      mcqByChap.set(r.chapter_id, (mcqByChap.get(r.chapter_id) ?? 0) + 1);
    const qbByChap = new Map<string, number>();
    for (const r of qbRows ?? []) qbByChap.set(r.chapter_id, (qbByChap.get(r.chapter_id) ?? 0) + 1);

    const out: TaxonomyLevel[] = [];
    for (const l of levels ?? []) {
      const subjects: TaxonomySubject[] = [];
      const subs = [...(l.academic_subjects ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
      );
      for (const s of subs) {
        const chaps = [...(s.academic_chapters ?? [])].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0),
        );
        const chapters: TaxonomyChapter[] = chaps.map((c) => ({
          id: c.id,
          name: c.name,
          subjectId: s.id,
          subjectName: s.name,
          levelId: l.id,
          levelName: l.name,
          mcqCount: mcqByChap.get(c.id) ?? 0,
          qbankCount: qbByChap.get(c.id) ?? 0,
        }));
        subjects.push({ id: s.id, name: s.name, chapters });
      }
      out.push({ id: l.id, name: l.name, subjects });
    }
    return { levels: out };
  });

// ---------------------------------------------------------------------------
// generateCustomExam — build a session with a snapshot of sampled questions.
// ---------------------------------------------------------------------------

type GenInput = {
  title: string;
  sources: ExamSource[];
  chapterIds: string[];
  numQuestions: number;
  durationMinutes: number;
  levelName: string;
  subjectNames: string[];
};

export const generateCustomExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): GenInput => {
    const src = (input ?? {}) as Record<string, unknown>;
    const title = typeof src.title === "string" ? src.title.slice(0, 200) : "";
    const rawSources = Array.isArray(src.sources) ? src.sources : [];
    const sources = rawSources.filter((s): s is ExamSource => s === "mcq" || s === "qbank");
    const chapterIds = (Array.isArray(src.chapterIds) ? src.chapterIds : []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    const numQuestions =
      typeof src.numQuestions === "number" && src.numQuestions > 0
        ? Math.floor(src.numQuestions)
        : 0;
    const durationMinutes =
      typeof src.durationMinutes === "number" && src.durationMinutes > 0
        ? Math.min(480, Math.floor(src.durationMinutes))
        : 0;
    const levelName = typeof src.levelName === "string" ? src.levelName : "";
    const subjectNames = (Array.isArray(src.subjectNames) ? src.subjectNames : []).filter(
      (s): s is string => typeof s === "string",
    );
    if (!sources.length) throw new Error("Select at least one source");
    if (!chapterIds.length) throw new Error("Select at least one chapter");
    if (numQuestions <= 0) throw new Error("Number of questions must be > 0");
    if (durationMinutes <= 0) throw new Error("Duration must be > 0");
    return {
      title,
      sources,
      chapterIds,
      numQuestions,
      durationMinutes,
      levelName,
      subjectNames,
    };
  })
  .handler(async ({ data, context }): Promise<{ sessionId: string }> => {
    const { supabase, userId } = context;

    // Fetch chapter metadata for names/subject/level.
    const { data: chapterRows, error: chErr } = await supabase
      .from("academic_chapters")
      .select(
        "id, name, subject_id, academic_subjects!inner(id, name, level_id, academic_levels!inner(id, name))",
      )
      .in("id", data.chapterIds);
    if (chErr) throw new Error(chErr.message);
    const chapterMeta = new Map<
      string,
      {
        id: string;
        name: string;
        subjectId: string;
        subjectName: string;
        levelId: string;
        levelName: string;
      }
    >();
    for (const r of chapterRows ?? []) {
      const s = r.academic_subjects;
      const l = s.academic_levels;
      chapterMeta.set(r.id, {
        id: r.id,
        name: r.name,
        subjectId: s.id,
        subjectName: s.name,
        levelId: l.id,
        levelName: l.name,
      });
    }

    type SourceRow = {
      id: string;
      chapter_id: string;
      position: number;
      question: string | null;
      options: unknown;
      correct_index: number;
      explanation: string | null;
    };

    const pools: {
      src: ExamSource;
      rows: SourceRow[];
    }[] = [];

    if (data.sources.includes("mcq")) {
      const { data: rows, error } = await supabase
        .from("mcq_questions")
        .select("id, chapter_id, position, question, options, correct_index, explanation")
        .in("chapter_id", data.chapterIds)
        .eq("status", "published")
        .order("position", { ascending: true });
      if (error) throw new Error(error.message);
      pools.push({ src: "mcq", rows: (rows ?? []) as SourceRow[] });
    }
    if (data.sources.includes("qbank")) {
      const { data: rows, error } = await supabase
        .from("qbank_questions")
        .select("id, chapter_id, position, question, prompt, options, correct_index, explanation")
        .in("chapter_id", data.chapterIds)
        .eq("status", "published")
        .order("position", { ascending: true });
      if (error) throw new Error(error.message);
      pools.push({
        src: "qbank",
        rows: (rows ?? []).map((r) => ({
          id: r.id,
          chapter_id: r.chapter_id,
          position: r.position,
          question: r.question ?? r.prompt ?? "",
          options: r.options,
          correct_index: r.correct_index,
          explanation: r.explanation,
        })) as SourceRow[],
      });
    }

    // Fair-mix sampling: shuffle each pool independently, then draw
    // in proportion to available counts until we hit numQuestions.
    const shuffled = pools.map((p) => ({
      src: p.src,
      rows: shuffleInPlace([...p.rows]),
    }));
    const total = shuffled.reduce((n, p) => n + p.rows.length, 0);
    const target = Math.min(data.numQuestions, total);
    if (target === 0) throw new Error("No questions available for the selected filters");

    const takeCounts = shuffled.map((p) =>
      total === 0 ? 0 : Math.floor((p.rows.length / total) * target),
    );
    let taken = takeCounts.reduce((n, x) => n + x, 0);
    // Distribute remainder to non-empty pools.
    while (taken < target) {
      for (let i = 0; i < shuffled.length && taken < target; i++) {
        if (takeCounts[i] < shuffled[i].rows.length) {
          takeCounts[i]++;
          taken++;
        }
      }
    }

    const selected: ExamQuestion[] = [];
    shuffled.forEach((p, i) => {
      const slice = p.rows.slice(0, takeCounts[i]);
      for (const r of slice) {
        const meta = chapterMeta.get(r.chapter_id);
        if (!meta) continue;
        const options = normalizeOptions(r.options);
        const correctIndex = Number.isInteger(r.correct_index)
          ? Math.max(0, Math.min(options.length - 1, r.correct_index))
          : 0;
        selected.push({
          uid: `${p.src}:${r.id}`,
          src: p.src,
          questionId: r.id,
          chapterId: r.chapter_id,
          chapterName: meta.name,
          subjectName: meta.subjectName,
          levelName: meta.levelName,
          question: r.question ?? "",
          options,
          answer: options[correctIndex]?.key ?? indexToLetter(correctIndex),
          correctIndex,
          explanation: r.explanation ?? "",
        });
      }
    });
    // Shuffle overall order after mixing.
    shuffleInPlace(selected);

    const chapterRefs = Array.from(chapterMeta.values()).flatMap((m) =>
      data.sources.map((s) => ({
        src: s,
        chapterId: m.id,
        chapterName: m.name,
        subjectName: m.subjectName,
        levelName: m.levelName,
      })),
    );

    const config: ExamConfig = {
      id: "", // filled below with session id
      name: data.title || defaultExamName(data.levelName, data.subjectNames),
      createdAt: Date.now(),
      durationMs: data.durationMinutes * 60_000,
      sources: data.sources,
      levelName: data.levelName,
      subjectNames: data.subjectNames,
      chapterRefs,
      questions: selected,
    };

    const { data: session, error: sErr } = await supabase
      .from("custom_exam_sessions")
      .insert({
        user_id: userId,
        title: config.name,
        config: JSON.parse(JSON.stringify(config)),
        started_at: new Date().toISOString(),
        total_questions: selected.length,
        correct_count: 0,
      })
      .select("id")
      .single();
    if (sErr) throw new Error(sErr.message);

    // Write the id back into config for convenience on read.
    config.id = session.id;
    const { error: uErr } = await supabase
      .from("custom_exam_sessions")
      .update({ config: JSON.parse(JSON.stringify(config)) })
      .eq("id", session.id);
    if (uErr) throw new Error(uErr.message);

    return { sessionId: session.id };
  });

function defaultExamName(level: string, subjects: string[]): string {
  if (!level) return "Custom Exam";
  const subj =
    subjects.length === 0
      ? ""
      : subjects.length <= 2
        ? ` — ${subjects.join(" & ")}`
        : ` — ${subjects.length} subjects`;
  return `${level}${subj} Custom Exam`;
}

// ---------------------------------------------------------------------------
// getCustomExamSession — load config + user's answers + bookmarks.
// ---------------------------------------------------------------------------

export const getCustomExamSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const sessionId = typeof src.sessionId === "string" ? src.sessionId : "";
    if (!sessionId) throw new Error("sessionId required");
    return { sessionId };
  })
  .handler(async ({ data, context }): Promise<ExamSession | null> => {
    const { supabase, userId } = context;
    const { data: s, error } = await supabase
      .from("custom_exam_sessions")
      .select("id, title, config, started_at, finished_at, score, total_questions, correct_count")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s) return null;

    const config = s.config as unknown as ExamConfig;

    const { data: ansRows, error: aErr } = await supabase
      .from("custom_exam_answers")
      .select("question_id, source, selected_index, is_correct, created_at")
      .eq("session_id", s.id)
      .eq("user_id", userId);
    if (aErr) throw new Error(aErr.message);

    const answers: ExamAnswer[] = (ansRows ?? []).map((r) => ({
      questionUid: `${r.source}:${r.question_id}`,
      questionId: r.question_id,
      source: r.source as ExamSource,
      selectedIndex: r.selected_index,
      isCorrect: !!r.is_correct,
      createdAt: new Date(r.created_at).getTime(),
    }));

    // Bookmarks across both banks for questions in this exam.
    const mcqIds = config.questions.filter((q) => q.src === "mcq").map((q) => q.questionId);
    const qbIds = config.questions.filter((q) => q.src === "qbank").map((q) => q.questionId);
    const bookmarkedUids: string[] = [];
    if (mcqIds.length > 0) {
      const { data: rows } = await supabase
        .from("bookmarks")
        .select("question_id")
        .eq("user_id", userId)
        .eq("source", "mcq")
        .in("question_id", mcqIds);
      for (const r of rows ?? []) bookmarkedUids.push(`mcq:${r.question_id}`);
    }
    if (qbIds.length > 0) {
      const { data: rows } = await supabase
        .from("bookmarks")
        .select("question_id")
        .eq("user_id", userId)
        .eq("source", "qbank")
        .in("question_id", qbIds);
      for (const r of rows ?? []) bookmarkedUids.push(`qbank:${r.question_id}`);
    }

    return {
      id: s.id,
      title: s.title ?? config.name,
      config,
      startedAt: new Date(s.started_at).getTime(),
      finishedAt: s.finished_at ? new Date(s.finished_at).getTime() : null,
      score: s.score === null ? null : Number(s.score),
      totalQuestions: s.total_questions ?? config.questions.length,
      correctCount: s.correct_count ?? 0,
      answers,
      bookmarkedUids,
    };
  });

// ---------------------------------------------------------------------------
// submitCustomExamAnswer — upsert answer row; track wrong answer bookmarks.
// ---------------------------------------------------------------------------

export const submitCustomExamAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const sessionId = typeof src.sessionId === "string" ? src.sessionId : "";
    const questionId = typeof src.questionId === "string" ? src.questionId : "";
    const sourceRaw = src.source;
    const source: ExamSource | null =
      sourceRaw === "mcq" || sourceRaw === "qbank" ? sourceRaw : null;
    const selectedIndex = Number.isInteger(src.selectedIndex) ? (src.selectedIndex as number) : -1;
    if (!sessionId) throw new Error("sessionId required");
    if (!questionId) throw new Error("questionId required");
    if (!source) throw new Error("source required");
    if (selectedIndex < 0) throw new Error("selectedIndex required");
    return { sessionId, questionId, source, selectedIndex };
  })
  .handler(async ({ data, context }): Promise<{ isCorrect: boolean; correctIndex: number }> => {
    const { supabase, userId } = context;

    // Verify the session belongs to the user and is not finished.
    const { data: s, error: sErr } = await supabase
      .from("custom_exam_sessions")
      .select("id, finished_at, config")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!s) throw new Error("Session not found");
    if (s.finished_at) throw new Error("Exam already submitted");

    // Score from the snapshot stored in config (authoritative for this session).
    const config = s.config as unknown as ExamConfig;
    const q = config.questions.find(
      (x) => x.questionId === data.questionId && x.src === data.source,
    );
    if (!q) throw new Error("Question not part of this exam");
    const isCorrect = data.selectedIndex === q.correctIndex;
    const answerKey = q.options[data.selectedIndex]?.key ?? indexToLetter(data.selectedIndex);

    const { error: aErr } = await supabase.from("custom_exam_answers").upsert(
      {
        session_id: data.sessionId,
        user_id: userId,
        source: data.source,
        question_id: data.questionId,
        selected_index: data.selectedIndex,
        answer: answerKey,
        is_correct: isCorrect,
      },
      { onConflict: "session_id,question_id,source" },
    );
    if (aErr) throw new Error(aErr.message);

    if (!isCorrect) {
      const { data: existing, error: exErr } = await supabase
        .from("wrong_answer_bookmarks")
        .select("id, wrong_count")
        .eq("user_id", userId)
        .eq("source", data.source)
        .eq("question_id", data.questionId)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      const nowIso = new Date().toISOString();
      if (existing) {
        const { error } = await supabase
          .from("wrong_answer_bookmarks")
          .update({
            wrong_count: (existing.wrong_count ?? 0) + 1,
            last_wrong_at: nowIso,
            cleared_at: null,
          })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("wrong_answer_bookmarks").insert({
          user_id: userId,
          source: data.source,
          question_id: data.questionId,
          wrong_count: 1,
          last_wrong_at: nowIso,
        });
        if (error) throw new Error(error.message);
      }
    }

    return { isCorrect, correctIndex: q.correctIndex };
  });

// ---------------------------------------------------------------------------
// toggleCustomExamBookmark — insert/delete bookmark for a specific source.
// ---------------------------------------------------------------------------

export const toggleCustomExamBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const questionId = typeof src.questionId === "string" ? src.questionId : "";
    const sourceRaw = src.source;
    const source: ExamSource | null =
      sourceRaw === "mcq" || sourceRaw === "qbank" ? sourceRaw : null;
    if (!questionId) throw new Error("questionId required");
    if (!source) throw new Error("source required");
    return { questionId, source };
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
// finishCustomExam — lock the session and compute final score.
// ---------------------------------------------------------------------------

export const finishCustomExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const sessionId = typeof src.sessionId === "string" ? src.sessionId : "";
    if (!sessionId) throw new Error("sessionId required");
    return { sessionId };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      totalQuestions: number;
      correct: number;
      wrong: number;
      answered: number;
      score: number;
    }> => {
      const { supabase, userId } = context;
      const { data: s, error: sErr } = await supabase
        .from("custom_exam_sessions")
        .select("id, config, finished_at, total_questions")
        .eq("id", data.sessionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);
      if (!s) throw new Error("Session not found");

      const { data: rows, error: aErr } = await supabase
        .from("custom_exam_answers")
        .select("is_correct")
        .eq("session_id", data.sessionId)
        .eq("user_id", userId);
      if (aErr) throw new Error(aErr.message);
      const answered = rows?.length ?? 0;
      const correct = (rows ?? []).filter((r) => r.is_correct).length;
      const wrong = answered - correct;
      const total = s.total_questions ?? (s.config as ExamConfig).questions.length;
      const score = total === 0 ? 0 : Math.round((correct / total) * 10000) / 100;

      if (!s.finished_at) {
        const { error: uErr } = await supabase
          .from("custom_exam_sessions")
          .update({
            finished_at: new Date().toISOString(),
            score,
            correct_count: correct,
          })
          .eq("id", data.sessionId);
        if (uErr) throw new Error(uErr.message);
      }

      return { totalQuestions: total, correct, wrong, answered, score };
    },
  );

// ---------------------------------------------------------------------------
// getActiveCustomExam — most recent unfinished exam for this user.
// ---------------------------------------------------------------------------

export const getActiveCustomExam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ sessionId: string } | null> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("custom_exam_sessions")
      .select("id")
      .eq("user_id", userId)
      .is("finished_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { sessionId: data.id } : null;
  });
