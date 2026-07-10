// Shared read-only access to the Admin > Qns Bank Manager question bank,
// plus a per-chapter progress tracker for the student Qns Bank Practice
// module. Mirrors the API of `academic-store` + `mcq-bank` so the practice
// UI can be reused verbatim, only the data source differs.

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

export type McqOption = { key: string; text: string };
export type Mcq = {
  id: string;
  chapterId: string;
  index: number;
  question: string;
  options: McqOption[];
  answer: string;
  explanation: string;
};

/* ------------------------------------------------------------------ */
/* Source data — mirrors Admin > Qns Bank Manager seed rows            */
/* ------------------------------------------------------------------ */

const LEVELS = ["Class 9", "Class 10", "Class 11", "Class 12", "JEE Main", "NEET"];
const SUBJECTS = ["Physics", "Chemistry", "Biology", "Mathematics", "English"];
const CHAPTERS = [
  "Kinematics",
  "Thermodynamics",
  "Cell Biology",
  "Organic Chemistry",
  "Trigonometry",
  "Electromagnetism",
  "Genetics",
  "Algebra",
];
const SEEDS: { q: string; options: string[]; answer: string; explanation: string }[] = [
  {
    q: "Which planet in our solar system has the most moons?",
    options: ["Jupiter", "Saturn", "Uranus", "Neptune"],
    answer: "B",
    explanation: "Saturn currently leads with the highest confirmed moon count.",
  },
  {
    q: "The chemical symbol 'Au' represents which element?",
    options: ["Silver", "Aluminium", "Gold", "Argon"],
    answer: "C",
    explanation: "Au comes from the Latin word 'aurum' meaning gold.",
  },
  {
    q: "Which data structure uses LIFO ordering?",
    options: ["Queue", "Stack", "Heap", "Linked list"],
    answer: "B",
    explanation: "A stack follows Last-In-First-Out semantics via push/pop.",
  },
  {
    q: "In economics, GDP stands for",
    options: [
      "Gross Domestic Product",
      "General Development Plan",
      "Global Demand Price",
      "Growth Distribution Point",
    ],
    answer: "A",
    explanation:
      "GDP is the total monetary value of goods and services produced within a country in a period.",
  },
  {
    q: "Which enzyme unwinds DNA during replication?",
    options: ["Ligase", "Helicase", "Primase", "Polymerase"],
    answer: "B",
    explanation:
      "Helicase breaks the hydrogen bonds between complementary bases to open the double helix.",
  },
  {
    q: "The derivative of ln(x) with respect to x is",
    options: ["x", "1/x", "e^x", "ln(x)"],
    answer: "B",
    explanation: "d/dx [ln x] = 1/x for x > 0.",
  },
  {
    q: "The Great Wall of China was primarily built during which dynasty?",
    options: ["Han", "Tang", "Ming", "Qing"],
    answer: "C",
    explanation: "Most of the surviving wall was built during the Ming dynasty (1368–1644).",
  },
  {
    q: "Which gas is most abundant in the Earth's atmosphere?",
    options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Argon"],
    answer: "B",
    explanation: "Nitrogen makes up roughly 78% of the atmosphere by volume.",
  },
  {
    q: "The SI unit of electric current is",
    options: ["Coulomb", "Volt", "Ampere", "Ohm"],
    answer: "C",
    explanation: "The ampere (A) is the base SI unit of electric current.",
  },
  {
    q: "Which of these sorting algorithms has O(n log n) average complexity?",
    options: ["Bubble sort", "Insertion sort", "Quick sort", "Selection sort"],
    answer: "C",
    explanation: "Quick sort averages O(n log n); the others are O(n²) on average.",
  },
];
const ROW_COUNT = 162;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const levelId = (l: string) => `qb-l-${slug(l)}`;
const subjectId = (l: string, s: string) => `qb-s-${slug(l)}-${slug(s)}`;
const chapterIdOf = (l: string, s: string, c: string) => `qb-c-${slug(l)}-${slug(s)}-${slug(c)}`;

const _levels: Level[] = [];
const _chapterMcqs: Record<string, Mcq[]> = {};

(function build() {
  const lMap = new Map<string, Level>();
  for (let i = 0; i < ROW_COUNT; i++) {
    const lName = LEVELS[i % LEVELS.length];
    const sName = SUBJECTS[i % SUBJECTS.length];
    const cName = CHAPTERS[i % CHAPTERS.length];
    const seed = SEEDS[i % SEEDS.length];
    const lid = levelId(lName);
    const sid = subjectId(lName, sName);
    const cid = chapterIdOf(lName, sName, cName);

    let lvl = lMap.get(lid);
    if (!lvl) {
      lvl = {
        id: lid,
        name: lName,
        code: lName.toUpperCase().replace(/\s+/g, ""),
        description: `Question Bank curated for ${lName}.`,
        createdAt: 0,
        updatedAt: 0,
        subjects: [],
      };
      lMap.set(lid, lvl);
      _levels.push(lvl);
    }
    let sub = lvl.subjects.find((x) => x.id === sid);
    if (!sub) {
      sub = {
        id: sid,
        name: sName,
        code: sName.slice(0, 4).toUpperCase(),
        description: `${sName} — verified bank items.`,
        createdAt: 0,
        updatedAt: 0,
        chapters: [],
      };
      lvl.subjects.push(sub);
    }
    let ch = sub.chapters.find((x) => x.id === cid);
    if (!ch) {
      ch = {
        id: cid,
        name: cName,
        code: cName.slice(0, 4).toUpperCase(),
        description: `${cName} question bank.`,
        createdAt: 0,
        updatedAt: 0,
      };
      sub.chapters.push(ch);
      _chapterMcqs[cid] = [];
    }
    const list = _chapterMcqs[cid];
    const idx = list.length;
    list.push({
      id: `${cid}::${idx}`,
      chapterId: cid,
      index: idx + 1,
      question: `Q${idx + 1}. ${seed.q}`,
      options: seed.options.map((t, j) => ({ key: String.fromCharCode(65 + j), text: t })),
      answer: seed.answer,
      explanation: seed.explanation,
    });
  }
})();

export function readLevels(): Level[] {
  // The academic hierarchy lives in the database (Academic Manager). Local
  // fake/seed trees are no longer surfaced — student pages must derive their
  // Level → Subject → Chapter list from the server tree instead.
  return [];
}


export function chapterMcqTotal(chapterId: string): number {
  return _chapterMcqs[chapterId]?.length ?? 0;
}

export function getChapterMcqs(chapterId: string): Mcq[] {
  return _chapterMcqs[chapterId] ?? [];
}

/* ------------------------------------------------------------------ */
/* Progress — separate key from MCQ Practice                           */
/* ------------------------------------------------------------------ */

const PROGRESS_KEY = "cla:qbank-progress:v1";

export type AnswerState = "correct" | "wrong" | "skipped";
export type ChapterProgress = {
  completed: number;
  lastIndex: number;
  answers: Record<number, AnswerState>;
  bookmarks: number[];
  reports: number[];
  timeSpent: number;
  lastPracticedAt: number;
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
    /* ignore */
  }
}

export function chapterCompleted(progress: ProgressMap, chapterId: string): number {
  const total = chapterMcqTotal(chapterId);
  const c = progress[chapterId]?.completed ?? 0;
  return Math.min(total, Math.max(0, c));
}
export function chapterCorrectWrong(progress: ProgressMap, chapterId: string) {
  const cp = progress[chapterId];
  let correct = 0,
    wrong = 0,
    skipped = 0;
  if (cp?.answers)
    for (const v of Object.values(cp.answers)) {
      if (v === "correct") correct++;
      else if (v === "wrong") wrong++;
      else if (v === "skipped") skipped++;
    }
  return { correct, wrong, skipped };
}
export function chapterAccuracy(progress: ProgressMap, chapterId: string): number {
  const { correct, wrong } = chapterCorrectWrong(progress, chapterId);
  const answered = correct + wrong;
  return answered === 0 ? 0 : Math.round((correct / answered) * 100);
}
export function chapterTimeSpent(progress: ProgressMap, chapterId: string): number {
  return progress[chapterId]?.timeSpent ?? 0;
}
export function bookmarksCount(progress: ProgressMap, chapterId: string): number {
  return progress[chapterId]?.bookmarks?.length ?? 0;
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
  let totalMcqs = 0,
    completedMcqs = 0,
    correct = 0,
    wrong = 0,
    completedChapters = 0,
    timeSpent = 0;
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
  return {
    chapters: sub.chapters.length,
    totalMcqs,
    completedMcqs,
    correct,
    wrong,
    avgAccuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    completedChapters,
    timeSpent,
  };
}
export type LevelRollup = SubjectRollup & { subjects: number; remainingChapters: number };
export function rollupLevel(level: Level, progress: ProgressMap): LevelRollup {
  let chapters = 0,
    totalMcqs = 0,
    completedMcqs = 0,
    correct = 0,
    wrong = 0,
    completedChapters = 0,
    timeSpent = 0;
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
  return {
    subjects: level.subjects.length,
    chapters,
    totalMcqs,
    completedMcqs,
    correct,
    wrong,
    avgAccuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    completedChapters,
    remainingChapters: Math.max(0, chapters - completedChapters),
    timeSpent,
  };
}
