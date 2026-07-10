// Server functions for the MCQ Manager.
//
// All operations require an authenticated caller. Writes (create/update/
// delete/bulkImport/move/status) additionally require the `admin` role,
// enforced through the SECURITY DEFINER `has_role` RPC.
//
// The list endpoint joins `academic_chapters → academic_subjects →
// academic_levels` so the client can render level/subject/chapter names
// without a second round-trip.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type McqQuestionRow = Database["public"]["Tables"]["mcq_questions"]["Row"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type McqStatus = "draft" | "review" | "published" | "archived";

export type McqOption = { key: string; text: string };

export type McqRow = {
  id: string;
  question: string;
  options: McqOption[];
  answer: string;
  correctIndex: number;
  explanation: string;
  status: McqStatus;
  position: number;
  chapterId: string;
  chapterName: string;
  subjectId: string;
  subjectName: string;
  levelId: string;
  levelName: string;
  createdBy: string | null;
  createdByName: string;
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type McqListResult = {
  rows: McqRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  batches: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseCtx = { supabase: any; userId: string };

async function assertAdmin(context: SupabaseCtx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

function indexToLetter(i: number): string {
  return String.fromCharCode(65 + Math.max(0, Math.min(25, i)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOptions(raw: any): McqOption[] {
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

async function loadAcademicIndex(supabase: SupabaseCtx["supabase"]) {
  const [levelsRes, subjectsRes, chaptersRes] = await Promise.all([
    supabase.from("academic_levels").select("id,name"),
    supabase.from("academic_subjects").select("id,name,level_id"),
    supabase.from("academic_chapters").select("id,name,subject_id"),
  ]);
  if (levelsRes.error) throw new Error(levelsRes.error.message);
  if (subjectsRes.error) throw new Error(subjectsRes.error.message);
  if (chaptersRes.error) throw new Error(chaptersRes.error.message);

  const levels = new Map<string, { id: string; name: string }>();
  for (const l of levelsRes.data ?? []) levels.set(l.id, { id: l.id, name: l.name });

  const subjects = new Map<
    string,
    { id: string; name: string; levelId: string; levelName: string }
  >();
  for (const s of subjectsRes.data ?? []) {
    const lvl = levels.get(s.level_id);
    subjects.set(s.id, {
      id: s.id,
      name: s.name,
      levelId: s.level_id,
      levelName: lvl?.name ?? "",
    });
  }

  const chapters = new Map<
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
  for (const c of chaptersRes.data ?? []) {
    const sub = subjects.get(c.subject_id);
    chapters.set(c.id, {
      id: c.id,
      name: c.name,
      subjectId: c.subject_id,
      subjectName: sub?.name ?? "",
      levelId: sub?.levelId ?? "",
      levelName: sub?.levelName ?? "",
    });
  }

  return { levels, subjects, chapters };
}

async function fetchCreatorNames(
  supabase: SupabaseCtx["supabase"],
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;
  const { data } = await supabase.from("profiles").select("id,full_name,email").in("id", unique);
  for (const p of data ?? []) {
    map.set(p.id, p.full_name || p.email || "Unknown");
  }
  return map;
}

function mapRow(
  r: McqQuestionRow,
  chapters: Awaited<ReturnType<typeof loadAcademicIndex>>["chapters"],
  creators: Map<string, string>,
): McqRow {
  const options = normalizeOptions(r.options);
  const correctIndex = Number.isInteger(r.correct_index) ? r.correct_index : 0;
  const answerKey = options[correctIndex]?.key ?? indexToLetter(correctIndex);
  const chapter = chapters.get(r.chapter_id);
  return {
    id: r.id,
    question: r.question,
    options,
    answer: answerKey,
    correctIndex,
    explanation: r.explanation ?? "",
    status: (r.status ?? "draft") as McqStatus,
    position: r.position,
    chapterId: r.chapter_id,
    chapterName: chapter?.name ?? "",
    subjectId: chapter?.subjectId ?? "",
    subjectName: chapter?.subjectName ?? "",
    levelId: chapter?.levelId ?? "",
    levelName: chapter?.levelName ?? "",
    createdBy: r.created_by ?? null,
    createdByName: r.created_by ? (creators.get(r.created_by) ?? "Unknown") : "System",
    batchId: r.batch_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// listMcqs — server-side filter / sort / paginate
// ---------------------------------------------------------------------------

export type ListMcqsInput = {
  page?: number;
  pageSize?: number;
  levelId?: string | null;
  subjectId?: string | null;
  chapterId?: string | null;
  status?: McqStatus | null;
  batchId?: string | null;
  search?: string | null;
  sort?: "newest" | "oldest" | "updated" | "position" | "question" | "chapter";
  createdWithinDays?: number | null;
};

function validateListInput(input: unknown): ListMcqsInput {
  const src = (input ?? {}) as Record<string, unknown>;
  const page = Math.max(1, Number(src.page ?? 1) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(src.pageSize ?? 100) || 100));
  const sort =
    typeof src.sort === "string" &&
    ["newest", "oldest", "updated", "position", "question", "chapter"].includes(src.sort)
      ? (src.sort as ListMcqsInput["sort"])
      : "newest";
  return {
    page,
    pageSize,
    levelId: typeof src.levelId === "string" && src.levelId ? src.levelId : null,
    subjectId: typeof src.subjectId === "string" && src.subjectId ? src.subjectId : null,
    chapterId: typeof src.chapterId === "string" && src.chapterId ? src.chapterId : null,
    status:
      typeof src.status === "string" &&
      ["draft", "review", "published", "archived"].includes(src.status)
        ? (src.status as McqStatus)
        : null,
    batchId: typeof src.batchId === "string" && src.batchId ? src.batchId : null,
    search: typeof src.search === "string" && src.search.trim() ? src.search.trim() : null,
    sort,
    createdWithinDays:
      typeof src.createdWithinDays === "number" && src.createdWithinDays > 0
        ? src.createdWithinDays
        : null,
  };
}

export const listMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateListInput)
  .handler(async ({ data, context }): Promise<McqListResult> => {
    await assertAdmin(context);
    const { supabase } = context;

    const idx = await loadAcademicIndex(supabase);

    // Narrow chapter set by level / subject filter (so we can filter server-side).
    let chapterIds: string[] | null = null;
    if (data.chapterId) {
      chapterIds = [data.chapterId];
    } else if (data.subjectId) {
      chapterIds = Array.from(idx.chapters.values())
        .filter((c) => c.subjectId === data.subjectId)
        .map((c) => c.id);
      if (!chapterIds.length) {
        return emptyListResult(data, await fetchBatches(supabase));
      }
    } else if (data.levelId) {
      chapterIds = Array.from(idx.chapters.values())
        .filter((c) => c.levelId === data.levelId)
        .map((c) => c.id);
      if (!chapterIds.length) {
        return emptyListResult(data, await fetchBatches(supabase));
      }
    }

    let q = supabase.from("mcq_questions").select("*", { count: "exact" });
    if (chapterIds) q = q.in("chapter_id", chapterIds);
    if (data.status) q = q.eq("status", data.status);
    if (data.batchId) q = q.eq("batch_id", data.batchId);
    if (data.createdWithinDays) {
      const cutoff = new Date(Date.now() - data.createdWithinDays * 24 * 3600 * 1000).toISOString();
      q = q.gte("created_at", cutoff);
    }
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(`question.ilike.%${s}%,explanation.ilike.%${s}%`);
    }

    switch (data.sort) {
      case "newest":
        q = q.order("created_at", { ascending: false });
        break;
      case "oldest":
        q = q.order("created_at", { ascending: true });
        break;
      case "updated":
        q = q.order("updated_at", { ascending: false });
        break;
      case "position":
        q = q.order("chapter_id").order("position");
        break;
      case "question":
        q = q.order("question", { ascending: true });
        break;
      case "chapter":
        q = q.order("chapter_id").order("position");
        break;
    }

    const from = (data.page! - 1) * data.pageSize!;
    const to = from + data.pageSize! - 1;
    q = q.range(from, to);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const creators = await fetchCreatorNames(
      supabase,
      (rows ?? [])
        .map((r: { created_by: string | null }) => r.created_by)
        .filter((v: string | null): v is string => !!v),
    );
    const mapped = (rows ?? []).map((r) => mapRow(r, idx.chapters, creators));

    return {
      rows: mapped,
      total: count ?? 0,
      page: data.page!,
      pageSize: data.pageSize!,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / data.pageSize!)),
      batches: await fetchBatches(supabase),
    };
  });

async function fetchBatches(supabase: SupabaseCtx["supabase"]): Promise<string[]> {
  const { data } = await supabase
    .from("mcq_questions")
    .select("batch_id")
    .not("batch_id", "is", null)
    .order("batch_id");
  const set = new Set<string>();
  for (const r of data ?? []) if (r.batch_id) set.add(r.batch_id);
  return Array.from(set);
}

function emptyListResult(input: ListMcqsInput, batches: string[]): McqListResult {
  return {
    rows: [],
    total: 0,
    page: input.page!,
    pageSize: input.pageSize!,
    totalPages: 1,
    batches,
  };
}

// ---------------------------------------------------------------------------
// createMcq / updateMcq
// ---------------------------------------------------------------------------

type UpsertInput = {
  chapterId: string;
  question: string;
  options: McqOption[];
  correctIndex: number;
  explanation: string;
  status: McqStatus;
};

function validateUpsert(input: unknown): UpsertInput {
  const src = (input ?? {}) as Record<string, unknown>;
  const chapterId = typeof src.chapterId === "string" ? src.chapterId : "";
  const question = typeof src.question === "string" ? src.question.trim() : "";
  const explanation = typeof src.explanation === "string" ? src.explanation.trim() : "";
  const correctIndex = Number.isInteger(src.correctIndex) ? (src.correctIndex as number) : -1;
  const status =
    typeof src.status === "string" &&
    ["draft", "review", "published", "archived"].includes(src.status)
      ? (src.status as McqStatus)
      : "draft";
  const rawOptions = Array.isArray(src.options) ? src.options : [];
  const options = normalizeOptions(rawOptions).filter((o) => o.text.trim().length > 0);

  if (!chapterId) throw new Error("chapterId required");
  if (!question) throw new Error("Question text required");
  if (options.length < 2) throw new Error("At least 2 options required");
  if (options.length > 26) throw new Error("Too many options (max 26)");
  if (correctIndex < 0 || correctIndex >= options.length)
    throw new Error("Correct answer index out of range");
  if (question.length > 4000) throw new Error("Question too long");
  if (explanation.length > 8000) throw new Error("Explanation too long");

  return { chapterId, question, options, correctIndex, explanation, status };
}

async function nextPosition(supabase: SupabaseCtx["supabase"], chapterId: string): Promise<number> {
  const { data } = await supabase
    .from("mcq_questions")
    .select("position")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

export const createMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateUpsert)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const position = await nextPosition(context.supabase, data.chapterId);
    const { data: row, error } = await context.supabase
      .from("mcq_questions")
      .insert({
        chapter_id: data.chapterId,
        question: data.question,
        options: data.options,
        correct_index: data.correctIndex,
        explanation: data.explanation || null,
        status: data.status,
        position,
        created_by: context.userId,
        tags: [],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const id = typeof src.id === "string" ? src.id : "";
    if (!id) throw new Error("id required");
    return { id, ...validateUpsert(src) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("mcq_questions")
      .update({
        chapter_id: data.chapterId,
        question: data.question,
        options: data.options,
        correct_index: data.correctIndex,
        explanation: data.explanation || null,
        status: data.status,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// deleteMcqs (single or bulk)
// ---------------------------------------------------------------------------

export const deleteMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(src.ids) ? src.ids.filter((x) => typeof x === "string") : [];
    if (!ids.length) throw new Error("No ids");
    if (ids.length > 5000) throw new Error("Too many ids in one call");
    return { ids: ids as string[] };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("mcq_questions").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: data.ids.length };
  });

// ---------------------------------------------------------------------------
// changeMcqStatus (bulk)
// ---------------------------------------------------------------------------

export const changeMcqStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(src.ids) ? src.ids.filter((x) => typeof x === "string") : [];
    const status = typeof src.status === "string" ? src.status : "";
    if (!ids.length) throw new Error("No ids");
    if (!["draft", "review", "published", "archived"].includes(status))
      throw new Error("Invalid status");
    return { ids: ids as string[], status: status as McqStatus };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("mcq_questions")
      .update({ status: data.status })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { updated: data.ids.length };
  });

// ---------------------------------------------------------------------------
// moveMcqs — reassign chapter (bulk). Appends to end of target chapter.
// ---------------------------------------------------------------------------

export const moveMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(src.ids) ? src.ids.filter((x) => typeof x === "string") : [];
    const chapterId = typeof src.chapterId === "string" ? src.chapterId : "";
    if (!ids.length) throw new Error("No ids");
    if (!chapterId) throw new Error("chapterId required");
    return { ids: ids as string[], chapterId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let position = await nextPosition(context.supabase, data.chapterId);
    // Update one at a time to keep incrementing positions unique.
    for (const id of data.ids) {
      const { error } = await context.supabase
        .from("mcq_questions")
        .update({ chapter_id: data.chapterId, position })
        .eq("id", id);
      if (error) throw new Error(error.message);
      position += 1;
    }
    return { moved: data.ids.length };
  });

// ---------------------------------------------------------------------------
// bulkImportMcqs — chunked insert with duplicate detection.
//
// Duplicate detection is scoped to the target chapter and compares the
// lowercased trimmed question text. Duplicates are skipped (not inserted).
// The response reports which incoming rows were skipped so the client can
// surface them to the admin.
// ---------------------------------------------------------------------------

type BulkImportInputRow = {
  question: string;
  options: McqOption[];
  correctIndex: number;
  explanation: string;
};

type BulkImportInput = {
  chapterId: string;
  status: McqStatus;
  batchId?: string | null;
  rows: BulkImportInputRow[];
};

function validateBulkImport(input: unknown): BulkImportInput {
  const src = (input ?? {}) as Record<string, unknown>;
  const chapterId = typeof src.chapterId === "string" ? src.chapterId : "";
  const status =
    typeof src.status === "string" &&
    ["draft", "review", "published", "archived"].includes(src.status)
      ? (src.status as McqStatus)
      : "draft";
  const batchId = typeof src.batchId === "string" && src.batchId ? src.batchId : null;
  if (!chapterId) throw new Error("chapterId required");

  const rawRows = Array.isArray(src.rows) ? src.rows : [];
  if (!rawRows.length) throw new Error("No rows to import");
  if (rawRows.length > 10000) throw new Error("Too many rows in one call (max 10000)");

  const rows: BulkImportInputRow[] = rawRows.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    const question = typeof r.question === "string" ? r.question.trim() : "";
    const explanation = typeof r.explanation === "string" ? r.explanation.trim() : "";
    const options = normalizeOptions(r.options).filter((o) => o.text.trim().length > 0);
    const correctIndex = Number.isInteger(r.correctIndex) ? (r.correctIndex as number) : -1;
    if (!question) throw new Error(`Row ${i + 1}: question required`);
    if (options.length < 2) throw new Error(`Row ${i + 1}: at least 2 options required`);
    if (correctIndex < 0 || correctIndex >= options.length)
      throw new Error(`Row ${i + 1}: invalid correct answer index`);
    return { question, options, correctIndex, explanation };
  });

  return { chapterId, status, batchId, rows };
}

export type BulkImportResult = {
  inserted: number;
  skippedDuplicates: number;
  duplicateIndexes: number[];
  batchId: string;
};

export const bulkImportMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateBulkImport)
  .handler(async ({ data, context }): Promise<BulkImportResult> => {
    await assertAdmin(context);
    const { supabase } = context;

    // Duplicate detection against existing questions in the same chapter.
    const { data: existing, error: exErr } = await supabase
      .from("mcq_questions")
      .select("question")
      .eq("chapter_id", data.chapterId);
    if (exErr) throw new Error(exErr.message);
    const existingSet = new Set(
      (existing ?? []).map((r: { question: string }) => r.question.trim().toLowerCase()),
    );

    // Also dedupe within the incoming batch (preserve first occurrence).
    const seenInBatch = new Set<string>();
    const toInsert: Array<{ raw: BulkImportInputRow; idx: number }> = [];
    const duplicateIndexes: number[] = [];
    data.rows.forEach((r, i) => {
      const key = r.question.trim().toLowerCase();
      if (existingSet.has(key) || seenInBatch.has(key)) {
        duplicateIndexes.push(i);
        return;
      }
      seenInBatch.add(key);
      toInsert.push({ raw: r, idx: i });
    });

    const batchId =
      data.batchId ?? `Bulk-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

    if (!toInsert.length) {
      return {
        inserted: 0,
        skippedDuplicates: duplicateIndexes.length,
        duplicateIndexes,
        batchId,
      };
    }

    let position = await nextPosition(supabase, data.chapterId);

    // Insert in chunks of 500 preserving upload order via `position`.
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const slice = toInsert.slice(i, i + CHUNK);
      const rows = slice.map(({ raw }) => ({
        chapter_id: data.chapterId,
        question: raw.question,
        options: raw.options,
        correct_index: raw.correctIndex,
        explanation: raw.explanation || null,
        status: data.status,
        position: position++,
        created_by: context.userId,
        batch_id: batchId,
        tags: [],
      }));
      const { error } = await supabase.from("mcq_questions").insert(rows);
      if (error) throw new Error(error.message);
      inserted += rows.length;
    }

    return {
      inserted,
      skippedDuplicates: duplicateIndexes.length,
      duplicateIndexes,
      batchId,
    };
  });

// ---------------------------------------------------------------------------
// getMcqStats — KPI panel data
// ---------------------------------------------------------------------------

export const getMcqStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const iso = startOfDay.toISOString();

    const [totalR, publishedR, draftR, todayR, levelsR, subjectsR, chaptersR] = await Promise.all([
      supabase.from("mcq_questions").select("id", { count: "exact", head: true }),
      supabase
        .from("mcq_questions")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      supabase
        .from("mcq_questions")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      supabase
        .from("mcq_questions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", iso),
      supabase.from("academic_levels").select("id", { count: "exact", head: true }),
      supabase.from("academic_subjects").select("id", { count: "exact", head: true }),
      supabase.from("academic_chapters").select("id", { count: "exact", head: true }),
    ]);

    return {
      total: totalR.count ?? 0,
      published: publishedR.count ?? 0,
      draft: draftR.count ?? 0,
      today: todayR.count ?? 0,
      levels: levelsR.count ?? 0,
      subjects: subjectsR.count ?? 0,
      chapters: chaptersR.count ?? 0,
    };
  });
