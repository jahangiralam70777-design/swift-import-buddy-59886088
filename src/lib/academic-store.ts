// Shared read-only access to the curriculum persisted by the Admin Academic
// Manager (localStorage key "cla:academic-manager:v2"), plus a lightweight
// per-chapter progress tracker for the student MCQ Practice module.

export type Chapter = {
  id: string;
  name: string;
  code: string;
  description: string;
  createdAt: number;
  updatedAt: number;
};

export type Subject = {
  id: string;
  name: string;
  code: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  chapters: Chapter[];
};

export type Level = {
  id: string;
  name: string;
  code: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  subjects: Subject[];
};

const ACADEMIC_KEY = "cla:academic-manager:v2";
const PROGRESS_KEY = "cla:mcq-progress:v1";

export function readLevels(): Level[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACADEMIC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Level[]) : [];
  } catch {
    return [];
  }
}

// FNV-1a hash — mirrors admin academic-manager so counts stay consistent.
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

// Deterministic MCQ count per chapter, derived from the chapter id.
// Matches the admin-side "chapterMetrics" formula so totals line up.
export function chapterMcqTotal(chapterId: string): number {
  const h = hash(chapterId);
  return 12 + (h % 44);
}

export type AnswerState = "correct" | "wrong" | "skipped";
export type ChapterProgress = {
  completed: number; // unique MCQs answered (correct + wrong)
  lastIndex: number; // index of next unanswered MCQ (0-based)
  answers: Record<number, AnswerState>;
  bookmarks: number[];
  reports: number[];
  timeSpent: number; // cumulative practice time on this chapter, ms
  lastPracticedAt: number; // epoch ms; 0 if never practiced
};
export type ProgressMap = Record<string, ChapterProgress>;

export function emptyChapterProgress(): ChapterProgress {
  return {
    completed: 0,
    lastIndex: 0,
    answers: {},
    bookmarks: [],
    reports: [],
    timeSpent: 0,
    lastPracticedAt: 0,
  };
}

export function ensureChapterProgress(progress: ProgressMap, chapterId: string): ChapterProgress {
  const raw = progress[chapterId];
  if (!raw) return emptyChapterProgress();
  return {
    completed: typeof raw.completed === "number" ? raw.completed : 0,
    lastIndex: typeof raw.lastIndex === "number" ? raw.lastIndex : 0,
    answers: raw.answers && typeof raw.answers === "object" ? raw.answers : {},
    bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks : [],
    reports: Array.isArray(raw.reports) ? raw.reports : [],
    timeSpent: typeof raw.timeSpent === "number" && raw.timeSpent > 0 ? raw.timeSpent : 0,
    lastPracticedAt:
      typeof raw.lastPracticedAt === "number" && raw.lastPracticedAt > 0 ? raw.lastPracticedAt : 0,
  };
}

export function readProgress(): ProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ProgressMap) : {};
  } catch {
    return {};
  }
}

export function writeProgress(map: ProgressMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function chapterCompleted(progress: ProgressMap, chapterId: string): number {
  const total = chapterMcqTotal(chapterId);
  const cp = progress[chapterId];
  const c = cp?.completed ?? 0;
  return Math.min(total, Math.max(0, c));
}

export function chapterCorrectWrong(
  progress: ProgressMap,
  chapterId: string,
): { correct: number; wrong: number; skipped: number } {
  const cp = progress[chapterId];
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  if (cp && cp.answers) {
    for (const v of Object.values(cp.answers)) {
      if (v === "correct") correct++;
      else if (v === "wrong") wrong++;
      else if (v === "skipped") skipped++;
    }
  }
  return { correct, wrong, skipped };
}

export function chapterAccuracy(progress: ProgressMap, chapterId: string): number {
  const { correct, wrong } = chapterCorrectWrong(progress, chapterId);
  const answered = correct + wrong;
  if (answered === 0) return 0;
  return Math.round((correct / answered) * 100);
}

export function chapterTimeSpent(progress: ProgressMap, chapterId: string): number {
  return progress[chapterId]?.timeSpent ?? 0;
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "0m";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Compact relative time like "Just now", "5m ago", "Today 8:30 PM",
 *  "Yesterday 9:04 AM", "Mar 4". */
export function formatRelativeTime(ts: number): string {
  if (!ts) return "Not started";
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  const d = new Date(ts);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today ${timeStr}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday ${timeStr}`;
  if (d.getFullYear() === today.getFullYear())
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

/** Estimated time to finish a chapter based on the student's own pace,
 *  falling back to 45s / question when there isn't enough history yet. */
export function estimateChapterTimeLeft(progress: ProgressMap, chapterId: string): number {
  const total = chapterMcqTotal(chapterId);
  const cp = progress[chapterId];
  const done = Math.min(total, cp?.completed ?? 0);
  const remaining = Math.max(0, total - done);
  if (remaining === 0) return 0;
  const spent = cp?.timeSpent ?? 0;
  const avgMs = done >= 3 && spent > 0 ? spent / done : 45_000;
  return Math.round(remaining * avgMs);
}

export function bookmarksCount(progress: ProgressMap, chapterId: string): number {
  return progress[chapterId]?.bookmarks?.length ?? 0;
}

/** Encouraging one-liner keyed to chapter completion. */
export function motivationalMessage(progressPct: number): {
  text: string;
  tone: "start" | "go" | "half" | "close" | "done";
} {
  if (progressPct >= 100) return { text: "Chapter completed", tone: "done" };
  if (progressPct >= 90) return { text: "Chapter almost finished", tone: "close" };
  if (progressPct >= 75) return { text: "Home stretch — keep going", tone: "close" };
  if (progressPct >= 50) return { text: "Halfway there", tone: "half" };
  if (progressPct >= 25) return { text: "Great progress", tone: "go" };
  if (progressPct > 0) return { text: "Nice start — keep going", tone: "go" };
  return { text: "Let's begin your journey", tone: "start" };
}

export function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export type SubjectRollup = {
  chapters: number;
  totalMcqs: number;
  completedMcqs: number;
  correct: number;
  wrong: number;
  avgAccuracy: number;
  completedChapters: number;
  timeSpent: number;
};

export function rollupSubject(sub: Subject, progress: ProgressMap): SubjectRollup {
  let totalMcqs = 0;
  let completedMcqs = 0;
  let correct = 0;
  let wrong = 0;
  let completedChapters = 0;
  let timeSpent = 0;
  for (const ch of sub.chapters) {
    const total = chapterMcqTotal(ch.id);
    const done = chapterCompleted(progress, ch.id);
    totalMcqs += total;
    completedMcqs += done;
    const cw = chapterCorrectWrong(progress, ch.id);
    correct += cw.correct;
    wrong += cw.wrong;
    if (total > 0 && done >= total) completedChapters++;
    timeSpent += chapterTimeSpent(progress, ch.id);
  }
  const answered = correct + wrong;
  const avgAccuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);
  return {
    chapters: sub.chapters.length,
    totalMcqs,
    completedMcqs,
    correct,
    wrong,
    avgAccuracy,
    completedChapters,
    timeSpent,
  };
}

export type LevelRollup = SubjectRollup & {
  subjects: number;
  remainingChapters: number;
};

export function rollupLevel(level: Level, progress: ProgressMap): LevelRollup {
  let chapters = 0;
  let totalMcqs = 0;
  let completedMcqs = 0;
  let correct = 0;
  let wrong = 0;
  let completedChapters = 0;
  let timeSpent = 0;
  for (const sub of level.subjects) {
    const r = rollupSubject(sub, progress);
    chapters += r.chapters;
    totalMcqs += r.totalMcqs;
    completedMcqs += r.completedMcqs;
    correct += r.correct;
    wrong += r.wrong;
    completedChapters += r.completedChapters;
    timeSpent += r.timeSpent;
  }
  const answered = correct + wrong;
  const avgAccuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);
  return {
    subjects: level.subjects.length,
    chapters,
    totalMcqs,
    completedMcqs,
    correct,
    wrong,
    avgAccuracy,
    completedChapters,
    remainingChapters: Math.max(0, chapters - completedChapters),
    timeSpent,
  };
}
