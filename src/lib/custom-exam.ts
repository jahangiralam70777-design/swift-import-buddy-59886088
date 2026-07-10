// Custom Exam — normalized read layer over both question sources.
// Only this module reads across MCQ Practice (academic-store + mcq-bank)
// and Qns Bank Practice (qbank-store); no other module is touched.

import { readLevels as readMcqLevels, chapterMcqTotal as mcqChapterTotal } from "./academic-store";
import { getChapterMcqs as getMcqQuestions, type Mcq as SourceMcq } from "./mcq-bank";
import {
  readLevels as readQbankLevels,
  chapterMcqTotal as qbankChapterTotal,
  getChapterMcqs as getQbankQuestions,
} from "./qbank-store";

export type ExamSource = "mcq" | "qbank";

export type ChapterRef = {
  src: ExamSource;
  levelId: string;
  levelName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  count: number;
};

export type ExamQuestion = {
  uid: string; // stable per exam
  src: ExamSource;
  chapterId: string;
  chapterName: string;
  subjectName: string;
  levelName: string;
  question: string;
  options: { key: string; text: string }[];
  answer: string;
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
  chapterRefs: ChapterRef[];
  questions: ExamQuestion[];
};

/* ------------------------------------------------------------------ */

function collectChapters(src: ExamSource): ChapterRef[] {
  const out: ChapterRef[] = [];
  const levels = src === "mcq" ? readMcqLevels() : readQbankLevels();
  const totalFor = src === "mcq" ? mcqChapterTotal : qbankChapterTotal;
  for (const l of levels) {
    for (const s of l.subjects) {
      for (const c of s.chapters) {
        out.push({
          src,
          levelId: l.id,
          levelName: l.name,
          subjectId: s.id,
          subjectName: s.name,
          chapterId: c.id,
          chapterName: c.name,
          count: totalFor(c.id),
        });
      }
    }
  }
  return out;
}

/** All chapters across the requested sources. Empty sources → empty list. */
export function allChapters(sources: ExamSource[]): ChapterRef[] {
  const uniq = Array.from(new Set(sources));
  return uniq.flatMap(collectChapters);
}

/** Distinct level names across selected sources (or all sources if empty). */
export function listLevelNames(sources: ExamSource[]): string[] {
  const src = sources.length ? sources : (["mcq", "qbank"] as ExamSource[]);
  const set = new Set<string>();
  for (const c of allChapters(src)) set.add(c.levelName);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Distinct subject names under a level across selected sources. */
export function listSubjectNames(sources: ExamSource[], levelName: string): string[] {
  const src = sources.length ? sources : (["mcq", "qbank"] as ExamSource[]);
  const set = new Set<string>();
  for (const c of allChapters(src)) {
    if (c.levelName === levelName) set.add(c.subjectName);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Chapters matching (level, subjects) across selected sources. */
export function listChapters(
  sources: ExamSource[],
  levelName: string,
  subjectNames: string[],
): ChapterRef[] {
  if (!sources.length || !levelName || !subjectNames.length) return [];
  const subjSet = new Set(subjectNames);
  return allChapters(sources).filter(
    (c) => c.levelName === levelName && subjSet.has(c.subjectName),
  );
}

/* ------------------------------------------------------------------ */
/* Question sampling                                                   */

function loadQuestions(ref: ChapterRef): SourceMcq[] {
  return ref.src === "mcq" ? getMcqQuestions(ref.chapterId) : getQbankQuestions(ref.chapterId);
}

// Mulberry32 — deterministic shuffle when seeded, still fast.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Sample up to `n` questions across the chosen chapter refs.
 *  - Only reads from each ref's own source (mcq vs qbank).
 *  - Deduplicates by (src, chapterId, index).
 *  - Shuffles question order and per-question option order.
 *  - Uses partial Fisher–Yates on a lightweight (refIdx, qIdx) index so
 *    picking 500 out of 100k stays effectively instant.
 */
export function sampleQuestions(refs: ChapterRef[], n: number): ExamQuestion[] {
  if (n <= 0 || refs.length === 0) return [];

  // Snapshot each chapter's raw question list once.
  const chapters = refs.map((ref) => ({ ref, qs: loadQuestions(ref) }));

  // Build lightweight index [refIdx, qIdx] pairs — no ExamQuestion objects yet.
  let totalCount = 0;
  for (const c of chapters) totalCount += c.qs.length;
  if (totalCount === 0) return [];

  const idxRef = new Uint16Array(totalCount);
  const idxQ = new Uint32Array(totalCount);
  let w = 0;
  for (let r = 0; r < chapters.length; r++) {
    const len = chapters[r].qs.length;
    for (let i = 0; i < len; i++) {
      idxRef[w] = r;
      idxQ[w] = i;
      w++;
    }
  }

  const rng = makeRng(Date.now() & 0xffffffff);
  const take = Math.min(n, totalCount);

  // Partial Fisher–Yates: only the first `take` positions need to be finalized.
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (totalCount - i));
    const tr = idxRef[i];
    idxRef[i] = idxRef[j];
    idxRef[j] = tr;
    const tq = idxQ[i];
    idxQ[i] = idxQ[j];
    idxQ[j] = tq;
  }

  // Materialize only the sampled entries. (Index pairs are unique per source,
  // so no separate dedupe pass is needed.)
  const out: ExamQuestion[] = new Array(take);
  for (let i = 0; i < take; i++) {
    const { ref, qs } = chapters[idxRef[i]];
    const qi = idxQ[i];
    const q = qs[qi];
    const opts = q.options.slice();
    shuffleInPlace(opts, rng);
    out[i] = {
      uid: `${ref.src}:${ref.chapterId}:${qi}`,
      src: ref.src,
      chapterId: ref.chapterId,
      chapterName: ref.chapterName,
      subjectName: ref.subjectName,
      levelName: ref.levelName,
      question: q.question,
      options: opts,
      answer: q.answer,
      explanation: q.explanation,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Persisted exam handoff — wizard writes, runner reads.               */

const EXAM_KEY = "cla:custom-exam:v1";

export function saveExam(cfg: ExamConfig) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(EXAM_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore quota */
  }
}

export function loadExam(): ExamConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(EXAM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ExamConfig;
  } catch {
    return null;
  }
}

export function clearExam() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(EXAM_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */

export function formatDurationLong(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function sumQuestions(refs: ChapterRef[]): number {
  let n = 0;
  for (const r of refs) n += r.count;
  return n;
}
