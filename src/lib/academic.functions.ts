// Server functions for the Academic Manager.
// The database is the single source of truth for the Level → Subject → Chapter hierarchy.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type DbClient = SupabaseClient<Database>;

export type ChapterStatus = "draft" | "published";

export type ApiChapter = {
  id: string;
  name: string;
  code: string;
  description: string;
  status: ChapterStatus;
  createdAt: number;
  updatedAt: number;
  mcqCount: number;
  quizCount: number;
  mockCount: number;
};

export type ApiSubject = {
  id: string;
  name: string;
  code: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  chapters: ApiChapter[];
};

export type ApiLevel = {
  id: string;
  name: string;
  code: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  subjects: ApiSubject[];
};

export type AcademicMutationResult = {
  id: string;
  tree: ApiLevel[];
};

type EntityInput = {
  id?: string;
  parentId?: string;
  name: string;
  code?: string;
  description?: string;
  status?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function assertAdmin(context: { supabase: DbClient; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

function normalizeStatus(v: unknown): ChapterStatus {
  return v === "published" ? "published" : "draft";
}

function cleanEntity(input: unknown, needsId: boolean, needsParent: boolean): EntityInput {
  const src = (input ?? {}) as Record<string, unknown>;
  const id = typeof src.id === "string" ? src.id : undefined;
  const parentId = typeof src.parentId === "string" ? src.parentId : undefined;
  const name = typeof src.name === "string" ? src.name.trim() : "";
  const code = typeof src.code === "string" ? src.code.trim().slice(0, 32) : "";
  const description =
    typeof src.description === "string" ? src.description.trim().slice(0, 500) : "";
  const status = typeof src.status === "string" ? src.status : undefined;
  if (needsId && (!id || !UUID_RE.test(id))) throw new Error("Valid id is required");
  if (needsParent && (!parentId || !UUID_RE.test(parentId))) throw new Error("Valid parent id is required");
  if (!name) throw new Error("Name is required");
  if (name.length > 120) throw new Error("Name must be 120 characters or fewer");
  return { id, parentId, name, code, description, status };
}

async function countPublishedByChapter(
  supabase: DbClient,
  table: "mcq_questions" | "quizzes" | "mock_tests",
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          val: string,
        ) => Promise<{
          data: Array<{ chapter_id: string | null }> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await client.from(table).select("chapter_id").eq("status", "published");
  if (error) {
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    if (!row.chapter_id) continue;
    map.set(row.chapter_id, (map.get(row.chapter_id) ?? 0) + 1);
  }
  return map;
}

async function loadTree(supabase: DbClient): Promise<ApiLevel[]> {
  const [levelsRes, subjectsRes, chaptersRes, mcqCounts, quizCounts, mockCounts] =
    await Promise.all([
      supabase.from("academic_levels").select("*").order("position"),
      supabase.from("academic_subjects").select("*").order("position"),
      supabase.from("academic_chapters").select("*").order("position"),
      countPublishedByChapter(supabase, "mcq_questions"),
      countPublishedByChapter(supabase, "quizzes"),
      countPublishedByChapter(supabase, "mock_tests"),
    ]);
  if (levelsRes.error) throw new Error(levelsRes.error.message);
  if (subjectsRes.error) throw new Error(subjectsRes.error.message);
  if (chaptersRes.error) throw new Error(chaptersRes.error.message);

  const chaptersBySubject = new Map<string, ApiChapter[]>();
  for (const c of (chaptersRes.data ?? []) as Array<
    Database["public"]["Tables"]["academic_chapters"]["Row"] & { status?: string | null }
  >) {
    const arr = chaptersBySubject.get(c.subject_id) ?? [];
    arr.push({
      id: c.id,
      name: c.name,
      code: c.slug ?? "",
      description: c.description ?? "",
      status: normalizeStatus(c.status),
      createdAt: Date.parse(c.created_at),
      updatedAt: Date.parse(c.updated_at),
      mcqCount: mcqCounts.get(c.id) ?? 0,
      quizCount: quizCounts.get(c.id) ?? 0,
      mockCount: mockCounts.get(c.id) ?? 0,
    });
    chaptersBySubject.set(c.subject_id, arr);
  }

  const subjectsByLevel = new Map<string, ApiSubject[]>();
  for (const s of subjectsRes.data ?? []) {
    const arr = subjectsByLevel.get(s.level_id) ?? [];
    arr.push({
      id: s.id,
      name: s.name,
      code: s.slug ?? "",
      description: s.description ?? "",
      createdAt: Date.parse(s.created_at),
      updatedAt: Date.parse(s.updated_at),
      chapters: chaptersBySubject.get(s.id) ?? [],
    });
    subjectsByLevel.set(s.level_id, arr);
  }

  return (levelsRes.data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    code: l.slug ?? "",
    description: l.description ?? "",
    createdAt: Date.parse(l.created_at),
    updatedAt: Date.parse(l.updated_at),
    subjects: subjectsByLevel.get(l.id) ?? [],
  }));
}

async function nextPosition(
  supabase: DbClient,
  table: "academic_levels" | "academic_subjects" | "academic_chapters",
  parent?: { column: "level_id" | "subject_id"; id: string },
): Promise<number> {
  const base = supabase
    .from(table)
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  const query = parent
    ? (base as unknown as { eq: (column: string, value: string) => typeof base }).eq(
        parent.column,
        parent.id,
      )
    : base;
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const current = Number(data?.[0]?.position ?? -1);
  return Number.isFinite(current) ? current + 1 : 0;
}

function assertDeleted(kind: string, rows: Array<{ id: string }> | null) {
  if (!rows?.length) throw new Error(`${kind} was not found or was already deleted`);
}

export const getAcademicTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadTree(context.supabase));

export const createAcademicLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    return cleanEntity(input, false, false);
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const position = await nextPosition(supabase, "academic_levels");
    const { data: row, error } = await supabase
      .from("academic_levels")
      .insert({
        name: data.name,
        slug: data.code || null,
        description: data.description ?? "",
        position,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });

export const updateAcademicLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cleanEntity(input, true, false))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("academic_levels")
      .update({ name: data.name, slug: data.code || null, description: data.description ?? "" })
      .eq("id", data.id!)
      .select("id");
    if (error) throw new Error(error.message);
    assertDeleted("Level", rows);
    return { id: data.id!, tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });

export const deleteAcademicLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const id = typeof src.id === "string" ? src.id : "";
    if (!UUID_RE.test(id)) throw new Error("Valid level id is required");
    return { id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("academic_levels")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    assertDeleted("Level", rows);
    return { id: data.id, tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });

export const createAcademicSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cleanEntity(input, false, true))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const position = await nextPosition(supabase, "academic_subjects", {
      column: "level_id",
      id: data.parentId!,
    });
    const { data: row, error } = await supabase
      .from("academic_subjects")
      .insert({
        level_id: data.parentId!,
        name: data.name,
        slug: data.code || null,
        description: data.description ?? "",
        position,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });

export const updateAcademicSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cleanEntity(input, true, false))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("academic_subjects")
      .update({ name: data.name, slug: data.code || null, description: data.description ?? "" })
      .eq("id", data.id!)
      .select("id");
    if (error) throw new Error(error.message);
    assertDeleted("Subject", rows);
    return { id: data.id!, tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });

export const deleteAcademicSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const id = typeof src.id === "string" ? src.id : "";
    if (!UUID_RE.test(id)) throw new Error("Valid subject id is required");
    return { id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("academic_subjects")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    assertDeleted("Subject", rows);
    return { id: data.id, tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });

export const createAcademicChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cleanEntity(input, false, true))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const position = await nextPosition(supabase, "academic_chapters", {
      column: "subject_id",
      id: data.parentId!,
    });
    const table = supabase.from("academic_chapters") as unknown as {
      insert: (row: unknown) => { select: (cols: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } };
    };
    const { data: row, error } = await table
      .insert({
        subject_id: data.parentId!,
        name: data.name,
        slug: data.code || null,
        description: data.description ?? "",
        position,
        status: normalizeStatus(data.status),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Chapter insert returned no row");
    return { id: row.id, tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });

export const updateAcademicChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cleanEntity(input, true, false))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const table = supabase.from("academic_chapters") as unknown as {
      update: (row: unknown) => { eq: (col: string, value: string) => { select: (cols: string) => Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }> } };
    };
    const { data: rows, error } = await table
      .update({
        name: data.name,
        slug: data.code || null,
        description: data.description ?? "",
        status: normalizeStatus(data.status),
      })
      .eq("id", data.id!)
      .select("id");
    if (error) throw new Error(error.message);
    assertDeleted("Chapter", rows);
    return { id: data.id!, tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });

export const deleteAcademicChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const src = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(src.ids)
      ? src.ids.filter((id): id is string => typeof id === "string" && UUID_RE.test(id))
      : [];
    const id = typeof src.id === "string" && UUID_RE.test(src.id) ? src.id : undefined;
    const finalIds = ids.length ? ids : id ? [id] : [];
    if (!finalIds.length) throw new Error("At least one valid chapter id is required");
    return { ids: Array.from(new Set(finalIds)) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("academic_chapters")
      .delete()
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    if ((rows?.length ?? 0) !== data.ids.length) {
      throw new Error("One or more chapters were not found or were already deleted");
    }
    return { id: data.ids[0], tree: await loadTree(supabase) } satisfies AcademicMutationResult;
  });
