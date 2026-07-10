// Server functions for the Academic Manager.
//
// Single source of truth for the Level -> Subject -> Chapter hierarchy
// and every count/metric displayed for it. Everything comes from the
// database: no hashes, no random values, no placeholders.

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

async function countPublishedByChapter(
  supabase: DbClient,
  table: "mcq_questions" | "quizzes" | "mock_tests",
): Promise<Map<string, number>> {
  // Fetch only chapter_id for rows with status='published'; count in JS.
  // Small per-project volumes and the (chapter_id, status) indexes keep this cheap.
  const { data, error } = await supabase
    .from(table)
    .select("chapter_id")
    .eq("status", "published");
  if (error) throw new Error(`${table}: ${error.message}`);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ chapter_id: string | null }>) {
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

export const getAcademicTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadTree(context.supabase));

type TreeInput = {
  levels: Array<{
    id: string;
    name: string;
    code: string;
    description: string;
    subjects: Array<{
      id: string;
      name: string;
      code: string;
      description: string;
      chapters: Array<{
        id: string;
        name: string;
        code: string;
        description: string;
        status?: string;
      }>;
    }>;
  }>;
};

function isTreeInput(v: unknown): v is TreeInput {
  if (!v || typeof v !== "object") return false;
  const t = v as { levels?: unknown };
  return Array.isArray(t.levels);
}

export const syncAcademicTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!isTreeInput(input)) throw new Error("Invalid tree payload");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const levelRows = data.levels.map((l, i) => ({
      id: l.id,
      name: l.name,
      slug: l.code || null,
      description: l.description,
      position: i,
    }));
    const subjectRows: Array<{
      id: string;
      level_id: string;
      name: string;
      slug: string | null;
      description: string;
      position: number;
    }> = [];
    const chapterRows: Array<{
      id: string;
      subject_id: string;
      name: string;
      slug: string | null;
      description: string;
      position: number;
      status: ChapterStatus;
    }> = [];
    for (const l of data.levels) {
      l.subjects.forEach((s, si) => {
        subjectRows.push({
          id: s.id,
          level_id: l.id,
          name: s.name,
          slug: s.code || null,
          description: s.description,
          position: si,
        });
        s.chapters.forEach((c, ci) => {
          chapterRows.push({
            id: c.id,
            subject_id: s.id,
            name: c.name,
            slug: c.code || null,
            description: c.description,
            position: ci,
            status: normalizeStatus(c.status),
          });
        });
      });
    }

    if (levelRows.length) {
      const r = await supabase.from("academic_levels").upsert(levelRows, { onConflict: "id" });
      if (r.error) throw new Error(r.error.message);
    }
    if (subjectRows.length) {
      const r = await supabase.from("academic_subjects").upsert(subjectRows, { onConflict: "id" });
      if (r.error) throw new Error(r.error.message);
    }
    if (chapterRows.length) {
      // status is a new column; cast to bypass stale generated types.
      const r = await supabase
        .from("academic_chapters")
        .upsert(chapterRows as unknown as Database["public"]["Tables"]["academic_chapters"]["Insert"][], {
          onConflict: "id",
        });
      if (r.error) throw new Error(r.error.message);
    }

    const keepLevelIds = levelRows.map((r) => r.id);
    const keepSubjectIds = subjectRows.map((r) => r.id);
    const keepChapterIds = chapterRows.map((r) => r.id);

    const delChapters = keepChapterIds.length
      ? await supabase
          .from("academic_chapters")
          .delete()
          .not("id", "in", `(${keepChapterIds.map((id) => `"${id}"`).join(",")})`)
      : await supabase
          .from("academic_chapters")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delChapters.error) throw new Error(delChapters.error.message);

    const delSubjects = keepSubjectIds.length
      ? await supabase
          .from("academic_subjects")
          .delete()
          .not("id", "in", `(${keepSubjectIds.map((id) => `"${id}"`).join(",")})`)
      : await supabase
          .from("academic_subjects")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delSubjects.error) throw new Error(delSubjects.error.message);

    const delLevels = keepLevelIds.length
      ? await supabase
          .from("academic_levels")
          .delete()
          .not("id", "in", `(${keepLevelIds.map((id) => `"${id}"`).join(",")})`)
      : await supabase
          .from("academic_levels")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delLevels.error) throw new Error(delLevels.error.message);

    return loadTree(supabase);
  });
