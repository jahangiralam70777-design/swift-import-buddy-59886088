import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronRight,
  Clock,
  GraduationCap,
  Layers,
  ListChecks,
  Moon,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { z } from "zod";
import { useTheme } from "@/hooks/use-theme";
import { CircularProgress } from "@/components/mcq/CircularProgress";
import {
  getQbankTaxonomy,
  type PracticeChapter,
  type PracticeLevel,
  type PracticeSubject,
} from "@/lib/qbank-practice.functions";

const searchSchema = z.object({
  levelId: z.string().optional(),
  subjectId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/student/qns-bank-practice")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Qns Bank Practice — Student Panel" },
      {
        name: "description",
        content: "Practice chapter-wise Questions across every level and subject.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: McqPracticePage,
});

/* ---------------- Pure helpers (kept local so we drop the legacy store) --- */

function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}
function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "0m";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
function formatRelativeTime(ts: number): string {
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
function chapterAccuracy(c: PracticeChapter): number {
  const ans = c.correct + c.wrong;
  return ans === 0 ? 0 : Math.round((c.correct / ans) * 100);
}
function estimateChapterTimeLeft(c: PracticeChapter): number {
  const remaining = Math.max(0, c.total - c.done);
  if (remaining === 0) return 0;
  const avgMs = c.done >= 3 && c.timeSpentMs > 0 ? c.timeSpentMs / c.done : 45_000;
  return Math.round(remaining * avgMs);
}
function motivationalMessage(progressPct: number): {
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

type SubjectRollup = {
  chapters: number;
  totalMcqs: number;
  completedMcqs: number;
  correct: number;
  wrong: number;
  avgAccuracy: number;
  completedChapters: number;
  timeSpent: number;
};
function rollupSubject(s: PracticeSubject): SubjectRollup {
  let totalMcqs = 0,
    completedMcqs = 0,
    correct = 0,
    wrong = 0,
    completedChapters = 0,
    timeSpent = 0;
  for (const ch of s.chapters) {
    totalMcqs += ch.total;
    completedMcqs += ch.done;
    correct += ch.correct;
    wrong += ch.wrong;
    timeSpent += ch.timeSpentMs;
    if (ch.total > 0 && ch.done >= ch.total) completedChapters++;
  }
  const ans = correct + wrong;
  return {
    chapters: s.chapters.length,
    totalMcqs,
    completedMcqs,
    correct,
    wrong,
    avgAccuracy: ans === 0 ? 0 : Math.round((correct / ans) * 100),
    completedChapters,
    timeSpent,
  };
}
type LevelRollup = SubjectRollup & { subjects: number };
function rollupLevel(l: PracticeLevel): LevelRollup {
  let chapters = 0,
    totalMcqs = 0,
    completedMcqs = 0,
    correct = 0,
    wrong = 0,
    completedChapters = 0,
    timeSpent = 0;
  for (const s of l.subjects) {
    const r = rollupSubject(s);
    chapters += r.chapters;
    totalMcqs += r.totalMcqs;
    completedMcqs += r.completedMcqs;
    correct += r.correct;
    wrong += r.wrong;
    completedChapters += r.completedChapters;
    timeSpent += r.timeSpent;
  }
  const ans = correct + wrong;
  return {
    subjects: l.subjects.length,
    chapters,
    totalMcqs,
    completedMcqs,
    correct,
    wrong,
    avgAccuracy: ans === 0 ? 0 : Math.round((correct / ans) * 100),
    completedChapters,
    timeSpent,
  };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function McqPracticePage() {
  const { levelId, subjectId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const fetchTaxonomy = useServerFn(getQbankTaxonomy);
  const taxonomyQ = useQuery({
    queryKey: ["qbank-practice", "taxonomy"],
    queryFn: () => fetchTaxonomy(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const [query, setQuery] = useState("");

  const levels: PracticeLevel[] = useMemo(() => taxonomyQ.data?.levels ?? [], [taxonomyQ.data]);
  const activeLevel = useMemo(
    () => (levelId ? (levels.find((l) => l.id === levelId) ?? null) : null),
    [levels, levelId],
  );
  const activeSubject = useMemo(
    () =>
      activeLevel && subjectId
        ? (activeLevel.subjects.find((s) => s.id === subjectId) ?? null)
        : null,
    [activeLevel, subjectId],
  );

  const view: "level" | "subject" | "chapter" = activeSubject
    ? "chapter"
    : activeLevel
      ? "subject"
      : "level";

  const crumbs = [
    { label: "Qns Bank Practice", to: { search: {} } as const },
    activeLevel && {
      label: activeLevel.name,
      to: { search: { levelId: activeLevel.id } } as const,
    },
    activeSubject && {
      label: activeSubject.name,
      to: { search: { levelId: activeLevel!.id, subjectId: activeSubject.id } } as const,
    },
  ].filter(Boolean) as { label: string; to: { search: Record<string, string> } }[];

  // Fall back if URL params reference something that no longer exists.
  if (taxonomyQ.data) {
    if (levelId && !activeLevel) {
      navigate({ search: {}, replace: true });
    } else if (subjectId && !activeSubject) {
      navigate({ search: { levelId }, replace: true });
    }
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute -top-24 right-0 h-[360px] w-[360px] rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <PageHeader query={query} setQuery={setQuery} />

      <div className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap items-center gap-1.5 pt-6 text-sm text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
              {i === crumbs.length - 1 ? (
                <span className="font-medium text-foreground">{c.label}</span>
              ) : (
                <Link
                  to="/student/qns-bank-practice"
                  search={c.to.search}
                  className="rounded-md px-1 py-0.5 hover:bg-accent hover:text-foreground"
                >
                  {c.label}
                </Link>
              )}
            </span>
          ))}
        </nav>

        <HeroHeading view={view} level={activeLevel} subject={activeSubject} />

        <div className="mt-6">
          {taxonomyQ.isLoading ? (
            <SkeletonGrid />
          ) : taxonomyQ.isError ? (
            <ErrorState
              message={
                taxonomyQ.error instanceof Error
                  ? taxonomyQ.error.message
                  : "Couldn't load your practice content."
              }
              onRetry={() => taxonomyQ.refetch()}
            />
          ) : view === "level" ? (
            <LevelGrid levels={levels} query={query} />
          ) : view === "subject" ? (
            <SubjectGrid level={activeLevel!} query={query} />
          ) : (
            <ChapterGrid level={activeLevel!} subject={activeSubject!} query={query} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function PageHeader({ query, setQuery }: { query: string; setQuery: (v: string) => void }) {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
            <ListChecks className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              Qns Bank Practice
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Chapter-wise practice across every level and subject.
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-9 w-56 rounded-lg border border-border/60 bg-card/60 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 md:w-72"
            />
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-foreground transition hover:bg-accent"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Profile"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/25"
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-border/40 px-4 py-2 sm:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 w-full rounded-lg border border-border/60 bg-card/60 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero heading                                                        */
/* ------------------------------------------------------------------ */

function HeroHeading({
  view,
  level,
  subject,
}: {
  view: "level" | "subject" | "chapter";
  level: PracticeLevel | null;
  subject: PracticeSubject | null;
}) {
  let title = "Choose your level";
  let subtitle = "Pick a level to explore subjects and start practising.";
  let icon = <Sparkles className="h-5 w-5" />;
  let stats: { label: string; value: string }[] = [];

  if (view === "subject" && level) {
    const r = rollupLevel(level);
    title = level.name;
    subtitle = level.description || "Select a subject to browse its chapters.";
    icon = <GraduationCap className="h-5 w-5" />;
    stats = [
      { label: "Progress", value: `${pct(r.completedMcqs, r.totalMcqs)}%` },
      { label: "Accuracy", value: `${r.avgAccuracy}%` },
      { label: "Chapters Done", value: `${r.completedChapters}/${r.chapters}` },
      { label: "Time", value: formatDuration(r.timeSpent) },
    ];
  } else if (view === "chapter" && subject && level) {
    const r = rollupSubject(subject);
    title = subject.name;
    subtitle = subject.description || "Pick a chapter and jump into practice.";
    icon = <BookOpen className="h-5 w-5" />;
    stats = [
      { label: "Total Questions", value: String(r.totalMcqs) },
      { label: "Completed", value: String(r.completedMcqs) },
      { label: "Progress", value: `${pct(r.completedMcqs, r.totalMcqs)}%` },
      { label: "Avg Accuracy", value: `${r.avgAccuracy}%` },
    ];
  }

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/60 to-card/40 p-6 shadow-xl shadow-indigo-500/5 backdrop-blur-xl sm:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-500 ring-1 ring-inset ring-indigo-500/20">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
                {title}
              </span>
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:min-w-[420px]">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-border/50 bg-background/50 px-3 py-2.5 text-center backdrop-blur"
              >
                <div className="text-lg font-semibold tracking-tight">{s.value}</div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty / error / skeleton                                            */
/* ------------------------------------------------------------------ */

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-52 animate-pulse rounded-3xl border border-border/50 bg-card/40"
        />
      ))}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/60 bg-card/30 p-12 text-center backdrop-blur">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-500">
        <Layers className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-rose-400/50 bg-rose-500/5 p-8 text-center">
      <h3 className="text-base font-semibold text-rose-600 dark:text-rose-300">
        Couldn't load your practice content
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl"
      >
        Try again
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grids                                                               */
/* ------------------------------------------------------------------ */

const GRADIENTS = [
  "bg-gradient-to-br from-indigo-500/25 via-fuchsia-500/15 to-transparent",
  "bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-transparent",
  "bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-transparent",
  "bg-gradient-to-br from-sky-500/25 via-cyan-500/15 to-transparent",
  "bg-gradient-to-br from-rose-500/25 via-pink-500/15 to-transparent",
  "bg-gradient-to-br from-violet-500/25 via-purple-500/15 to-transparent",
];
function grad(i: number) {
  return GRADIENTS[i % GRADIENTS.length];
}

function LevelGrid({ levels, query }: { levels: PracticeLevel[]; query: string }) {
  const navigate = Route.useNavigate();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return levels;
    return levels.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.subjects.some((s) => s.name.toLowerCase().includes(q)),
    );
  }, [levels, query]);

  if (levels.length === 0) {
    return (
      <EmptyState
        title="No levels available yet"
        hint="Ask your admin to add levels in the Academic Manager to see them here."
      />
    );
  }
  if (filtered.length === 0) {
    return <EmptyState title="No matches" hint={`Nothing matches "${query}".`} />;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence mode="popLayout">
        {filtered.map((lvl, i) => {
          const r = rollupLevel(lvl);
          return (
            <LevelCard
              key={lvl.id}
              level={lvl}
              rollup={r}
              gradient={grad(i)}
              onOpen={() => navigate({ search: { levelId: lvl.id } })}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function SubjectGrid({ level, query }: { level: PracticeLevel; query: string }) {
  const navigate = Route.useNavigate();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return level.subjects;
    return level.subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.chapters.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [level, query]);

  return (
    <>
      <BackLink to={{ search: {} }} label="All levels" />
      {level.subjects.length === 0 ? (
        <EmptyState
          title="No subjects in this level"
          hint="Ask your admin to add subjects to this level in the Academic Manager."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" hint={`Nothing matches "${query}".`} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((sub, i) => (
              <SubjectCard
                key={sub.id}
                subject={sub}
                rollup={rollupSubject(sub)}
                gradient={grad(i + 1)}
                onOpen={() => navigate({ search: { levelId: level.id, subjectId: sub.id } })}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

function ChapterGrid({
  level,
  subject,
  query,
}: {
  level: PracticeLevel;
  subject: PracticeSubject;
  query: string;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subject.chapters;
    return subject.chapters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [subject, query]);

  return (
    <>
      <BackLink to={{ search: { levelId: level.id } }} label={`Back to ${level.name}`} />
      {subject.chapters.length === 0 ? (
        <EmptyState
          title="No chapters yet"
          hint="Ask your admin to add chapters to this subject in the Academic Manager."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" hint={`Nothing matches "${query}".`} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((ch, i) => (
              <ChapterCard
                key={ch.id}
                levelId={level.id}
                subjectId={subject.id}
                chapter={ch}
                gradient={grad(i + 2)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

function LevelCard({
  level,
  rollup,
  gradient,
  onOpen,
}: {
  level: PracticeLevel;
  rollup: LevelRollup;
  gradient: string;
  onOpen: () => void;
}) {
  const value = pct(rollup.completedMcqs, rollup.totalMcqs);
  const motiv = motivationalMessage(value);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -5 }}
      onClick={onOpen}
      type="button"
      className="group relative flex w-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-6 text-left shadow-md shadow-black/[0.03] backdrop-blur-xl transition-all hover:border-indigo-400/60 hover:shadow-xl hover:shadow-indigo-500/10"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-28 opacity-80 ${gradient}`}
        style={{ maskImage: "linear-gradient(to bottom, black, transparent)" }}
      />
      <div className="relative flex items-start gap-5">
        <CircularProgress value={value} size={92} stroke={8}>
          <div className="text-center">
            <div className="text-lg font-semibold leading-none tabular-nums">{value}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Progress
            </div>
          </div>
        </CircularProgress>
        <div className="min-w-0 flex-1">
          {level.code && (
            <div className="mb-1.5 inline-flex items-center rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {level.code}
            </div>
          )}
          <h3 className="truncate text-lg font-semibold tracking-tight">{level.name}</h3>
          {level.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{level.description}</p>
          )}
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricTile label="Subjects" value={rollup.subjects} />
        <MetricTile label="Chapters" value={rollup.chapters} />
        <MetricTile label="Questions" value={rollup.totalMcqs} />
        <MetricTile label="Completed" value={rollup.completedMcqs} />
        <MetricTile label="Accuracy" value={`${rollup.avgAccuracy}%`} />
        <MetricTile label="Chapters ✓" value={`${rollup.completedChapters}/${rollup.chapters}`} />
      </div>

      <div className="relative mt-5 flex items-center justify-between text-xs">
        <MotivationTag text={motiv.text} tone={motiv.tone} />
        <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
          Open subjects
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </motion.button>
  );
}

function SubjectCard({
  subject,
  rollup,
  gradient,
  onOpen,
}: {
  subject: PracticeSubject;
  rollup: SubjectRollup;
  gradient: string;
  onOpen: () => void;
}) {
  const value = pct(rollup.completedMcqs, rollup.totalMcqs);
  const remaining = Math.max(0, rollup.totalMcqs - rollup.completedMcqs);
  const estMs = subject.chapters.reduce((acc, ch) => acc + estimateChapterTimeLeft(ch), 0);
  const motiv = motivationalMessage(value);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -5 }}
      onClick={onOpen}
      type="button"
      className="group relative flex w-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-6 text-left shadow-md shadow-black/[0.03] backdrop-blur-xl transition-all hover:border-indigo-400/60 hover:shadow-xl hover:shadow-indigo-500/10"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70 ${gradient}`}
        style={{ maskImage: "linear-gradient(to bottom, black, transparent)" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          {subject.code && (
            <div className="mb-1.5 inline-flex items-center rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {subject.code}
            </div>
          )}
          <h3 className="truncate text-lg font-semibold tracking-tight">{subject.name}</h3>
          {subject.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subject.description}</p>
          )}
        </div>
        <CircularProgress value={value} size={64} stroke={6}>
          <div className="text-[13px] font-semibold tabular-nums">{value}%</div>
        </CircularProgress>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricTile label="Total" value={rollup.totalMcqs} />
        <MetricTile label="Completed" value={rollup.completedMcqs} />
        <MetricTile label="Remaining" value={remaining} />
        <MetricTile label="Accuracy" value={`${rollup.avgAccuracy}%`} />
        <MetricTile label="Chapters" value={rollup.chapters} />
        <MetricTile
          label="Est. time"
          value={estMs === 0 ? "Done" : formatDuration(estMs)}
          icon={<Clock className="h-3 w-3" />}
        />
      </div>

      <div className="relative mt-5 flex items-center justify-between text-xs">
        <MotivationTag text={motiv.text} tone={motiv.tone} />
        <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
          Open chapters
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </motion.button>
  );
}

function ChapterCard({
  levelId,
  subjectId,
  chapter,
  gradient,
}: {
  levelId: string;
  subjectId: string;
  chapter: PracticeChapter;
  gradient: string;
}) {
  const total = chapter.total;
  const done = Math.min(total, chapter.done);
  const remaining = Math.max(0, total - done);
  const progressValue = pct(done, total);
  const accuracy = chapterAccuracy(chapter);
  const answered = chapter.correct + chapter.wrong;
  const correctPct = answered === 0 ? 0 : Math.round((chapter.correct / answered) * 100);
  const wrongPct = answered === 0 ? 0 : Math.round((chapter.wrong / answered) * 100);
  const timeSpent = chapter.timeSpentMs;
  const lastAt = chapter.lastPracticedAt;
  const estLeft = estimateChapterTimeLeft(chapter);
  const isStarted = done > 0;
  const motiv = motivationalMessage(progressValue);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-md shadow-black/[0.03] backdrop-blur-xl transition-all hover:border-indigo-400/60 hover:shadow-xl hover:shadow-indigo-500/10"
    >
      <div className="relative p-6">
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70 ${gradient}`}
          style={{ maskImage: "linear-gradient(to bottom, black, transparent)" }}
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            {chapter.code && (
              <div className="mb-1.5 inline-flex items-center rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {chapter.code}
              </div>
            )}
            <h3 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
              {chapter.name}
            </h3>
            {chapter.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {chapter.description}
              </p>
            )}
            <div className="mt-2.5">
              <MotivationTag text={motiv.text} tone={motiv.tone} />
            </div>
          </div>
          <CircularProgress value={progressValue} size={72} stroke={7}>
            <div className="text-center">
              <div className="text-base font-semibold leading-none tabular-nums">
                {progressValue}%
              </div>
              <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                Done
              </div>
            </div>
          </CircularProgress>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2">
          <MetricTile label="Total" value={total} />
          <MetricTile label="Completed" value={done} />
          <MetricTile label="Remaining" value={remaining} />
          <MetricTile label="Correct" value={`${correctPct}%`} tone="emerald" />
          <MetricTile label="Wrong" value={`${wrongPct}%`} tone="rose" />
          <MetricTile
            label="Bookmarks"
            value={chapter.bookmarks}
            icon={<Bookmark className="h-3 w-3" />}
          />
        </div>

        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last practice:{" "}
            <span className="font-semibold text-foreground">{formatRelativeTime(lastAt)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            Est. completion:{" "}
            <span className="font-semibold text-foreground">
              {estLeft === 0 ? "—" : formatDuration(estLeft)}
            </span>
          </span>
        </div>
      </div>

      <div className="relative mx-4 mb-4 mt-1 overflow-hidden rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/10 via-fuchsia-500/5 to-transparent p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-500/20 via-fuchsia-500/10 to-transparent blur-2xl"
        />
        <div className="relative grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] sm:grid-cols-4">
          <ContinueCell
            label="Last practiced"
            value={isStarted ? formatRelativeTime(lastAt) : "Not started"}
          />
          <ContinueCell
            label="Progress"
            value={isStarted ? `${done} / ${total}` : `0 / ${total}`}
          />
          <ContinueCell label="Remaining" value={`${remaining} Questions`} />
          <ContinueCell
            label="Accuracy"
            value={`${accuracy}%`}
            highlight={accuracy >= 70 ? "emerald" : accuracy > 0 ? "amber" : undefined}
          />
        </div>
        <div className="relative mt-4 flex flex-col gap-2 sm:flex-row">
          <Link
            to="/student/qns-bank-practice/session"
            search={{ levelId, subjectId, chapterId: chapter.id, mode: "continue" }}
            disabled={total === 0}
            className={`group/btn relative inline-flex flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl hover:shadow-fuchsia-500/30 active:scale-[0.98] ${
              total === 0 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Play className="h-4 w-4" />
            {isStarted ? "Continue Practice" : "Start Practice"}
          </Link>
          <Link
            to="/student/qns-bank-practice/session"
            search={{ levelId, subjectId, chapterId: chapter.id, mode: "restart" }}
            disabled={total === 0}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98] sm:flex-none ${
              total === 0 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Start From Beginning</span>
            <span className="sm:hidden">Restart</span>
          </Link>
        </div>
        {timeSpent > 0 && (
          <div className="relative mt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Time invested · {formatDuration(timeSpent)}
          </div>
        )}
        {total === 0 && (
          <div className="relative mt-2 text-[11px] text-muted-foreground">
            No published questions in this chapter yet.
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function MetricTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "rose";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "rose"
        ? "text-rose-600 dark:text-rose-300"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 px-2.5 py-2">
      <div
        className={`flex items-center justify-center gap-1 text-sm font-semibold tabular-nums ${toneCls}`}
      >
        {icon}
        {value}
      </div>
      <div className="mt-0.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function MotivationTag({
  text,
  tone,
}: {
  text: string;
  tone: "start" | "go" | "half" | "close" | "done";
}) {
  const cls =
    tone === "done"
      ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
      : tone === "close"
        ? "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300"
        : tone === "half"
          ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
          : tone === "go"
            ? "border-violet-400/40 bg-violet-500/10 text-violet-600 dark:text-violet-300"
            : "border-border/60 bg-background/60 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {text}
    </span>
  );
}

function ContinueCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "emerald" | "amber";
}) {
  const valueCls =
    highlight === "emerald"
      ? "text-emerald-600 dark:text-emerald-300"
      : highlight === "amber"
        ? "text-amber-600 dark:text-amber-300"
        : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${valueCls}`}>{value}</div>
    </div>
  );
}

function BackLink({ to, label }: { to: { search: Record<string, string> }; label: string }) {
  return (
    <Link
      to="/student/qns-bank-practice"
      search={to.search}
      className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
