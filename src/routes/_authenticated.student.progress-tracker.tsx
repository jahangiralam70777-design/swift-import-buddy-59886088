import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  Clock,
  GraduationCap,
  Hourglass,
  Layers,
  Lock,
  PieChart as PieIcon,
  Presentation,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getMyProgressTracker,
  setMyProgressCheckpoint,
  type ManualCheckpoint,
  type TrackerLevel,
  type TrackerSubject,
  type TrackerChapter,
  type ChapterCheckpointsDTO,
} from "@/lib/progress-tracker.functions";

export const Route = createFileRoute("/_authenticated/student/progress-tracker")({
  head: () => ({
    meta: [
      { title: "Progress Tracker — Student Panel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProgressTrackerPage,
});

/* ------------------------------------------------------------------ */
/* Types / helpers                                                     */
/* ------------------------------------------------------------------ */

type Checkpoint = "cls" | "slide" | "easy" | "mcq";

type ChapterCheckpoints = ChapterCheckpointsDTO;

type Level = TrackerLevel;
type Subject = TrackerSubject;

const CHECKPOINT_WEIGHT = 25;

function emptyCheckpoints(): ChapterCheckpoints {
  return {
    cls: false,
    slide: false,
    easy: false,
    mcq: false,
    mcqAuto: false,
    mcqDone: 0,
    mcqTotal: 0,
    updatedAt: 0,
  };
}

function chapterPct(cp: ChapterCheckpoints): number {
  return (
    (cp.cls ? CHECKPOINT_WEIGHT : 0) +
    (cp.slide ? CHECKPOINT_WEIGHT : 0) +
    (cp.easy ? CHECKPOINT_WEIGHT : 0) +
    (cp.mcq ? CHECKPOINT_WEIGHT : 0)
  );
}

type Status = "not_started" | "in_progress" | "completed";

function chapterStatus(pct: number): Status {
  if (pct >= 100) return "completed";
  if (pct > 0) return "in_progress";
  return "not_started";
}

function chapterMap(chapter: TrackerChapter): ChapterCheckpoints {
  return chapter.checkpoints;
}

function subjectPct(sub: Subject): number {
  if (sub.chapters.length === 0) return 0;
  const sum = sub.chapters.reduce((s, c) => s + chapterPct(c.checkpoints), 0);
  return Math.round(sum / sub.chapters.length);
}

function levelPct(lvl: Level): number {
  const chapters = lvl.subjects.flatMap((s) => s.chapters);
  if (chapters.length === 0) return 0;
  const sum = chapters.reduce((s, c) => s + chapterPct(c.checkpoints), 0);
  return Math.round(sum / chapters.length);
}

function formatRelative(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  const d = new Date(ts);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today ${t}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday ${t}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type SortKey = "name" | "cls" | "slide" | "easy" | "mcq" | "pct" | "status";
type SortDir = "asc" | "desc";
const STATUS_ORDER: Record<Status, number> = { not_started: 0, in_progress: 1, completed: 2 };

const PROGRESS_KEY = ["student", "progress-tracker"] as const;

function ProgressTrackerPage() {
  const qc = useQueryClient();
  const fetchTracker = useServerFn(getMyProgressTracker);
  const saveCheckpoint = useServerFn(setMyProgressCheckpoint);

  const { data, isLoading } = useQuery({
    queryKey: PROGRESS_KEY,
    queryFn: () => fetchTracker(),
    staleTime: 15_000,
  });

  const levels: Level[] = useMemo(() => data?.levels ?? [], [data]);
  const hydrated = !isLoading;

  const [levelId, setLevelId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 180);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedLevel = useMemo(
    () => levels.find((l) => l.id === levelId) ?? null,
    [levels, levelId],
  );
  const selectedSubject = useMemo(
    () => selectedLevel?.subjects.find((s) => s.id === subjectId) ?? null,
    [selectedLevel, subjectId],
  );

  const mutation = useMutation({
    mutationFn: (v: { chapterId: string; key: ManualCheckpoint; value: boolean }) =>
      saveCheckpoint({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: PROGRESS_KEY });
      const prev = qc.getQueryData<{ levels: Level[] }>(PROGRESS_KEY);
      if (prev) {
        const nextLevels = prev.levels.map((l) => ({
          ...l,
          subjects: l.subjects.map((s) => ({
            ...s,
            chapters: s.chapters.map((c) =>
              c.id === v.chapterId
                ? {
                    ...c,
                    checkpoints: {
                      ...c.checkpoints,
                      [v.key]: v.value,
                      updatedAt: Date.now(),
                    },
                  }
                : c,
            ),
          })),
        }));
        qc.setQueryData(PROGRESS_KEY, { levels: nextLevels });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(PROGRESS_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PROGRESS_KEY });
    },
  });

  const toggle = useCallback(
    (chapterId: string, key: Checkpoint) => {
      // MCQ is auto-derived from mcq_attempts — read only.
      if (key === "mcq") return;
      const chapter = selectedSubject?.chapters.find((c) => c.id === chapterId);
      if (!chapter) return;
      const current = chapter.checkpoints[key];
      mutation.mutate({ chapterId, key, value: !current });
    },
    [mutation, selectedSubject],
  );

  const rows = useMemo(() => {
    if (!selectedSubject) return [];
    const base = selectedSubject.chapters.map((ch, i) => {
      const cp = ch.checkpoints;
      const pct = chapterPct(cp);
      return {
        id: ch.id,
        name: ch.name,
        code: ch.code || String(i + 1).padStart(2, "0"),
        cp,
        pct,
        status: chapterStatus(pct),
      };
    });

    const q = debouncedSearch.trim().toLowerCase();
    let filtered = q
      ? base.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
      : base;
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "cls":
          return (Number(a.cp.cls) - Number(b.cp.cls)) * dir;
        case "slide":
          return (Number(a.cp.slide) - Number(b.cp.slide)) * dir;
        case "easy":
          return (Number(a.cp.easy) - Number(b.cp.easy)) * dir;
        case "mcq":
          return (Number(a.cp.mcq) - Number(b.cp.mcq)) * dir;
        case "pct":
          return (a.pct - b.pct) * dir;
        case "status":
          return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;
      }
    });
    return sorted;
  }, [selectedSubject, debouncedSearch, sortKey, sortDir, statusFilter]);

  // Reset page when filter/sort/subject changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortKey, sortDir, subjectId, levelId, pageSize, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = useMemo(
    () => rows.slice(pageStart, pageStart + pageSize),
    [rows, pageStart, pageSize],
  );

  const summary = useMemo(() => {
    if (!selectedSubject)
      return { total: 0, completed: 0, inProgress: 0, notStarted: 0, subjPct: 0, lvlPct: 0 };
    const statuses = selectedSubject.chapters.map((c) => chapterStatus(chapterPct(c.checkpoints)));
    return {
      total: statuses.length,
      completed: statuses.filter((s) => s === "completed").length,
      inProgress: statuses.filter((s) => s === "in_progress").length,
      notStarted: statuses.filter((s) => s === "not_started").length,
      subjPct: subjectPct(selectedSubject),
      lvlPct: selectedLevel ? levelPct(selectedLevel) : 0,
    };
  }, [selectedLevel, selectedSubject]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  return (
    <div className="min-w-0 p-4 sm:p-6 md:p-8">
      {/* Header */}
      <header className="mb-6 animate-fade-in">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Student Panel
        </div>
        <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl md:text-4xl">
          Progress Tracker
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Tick each checkpoint as you complete it — chapter, subject and level progress update
          instantly and save automatically.
        </p>
      </header>

      {/* Stepper */}
      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <StepCard
          step={1}
          title="Select Level"
          icon={GraduationCap}
          active={!selectedLevel}
          done={!!selectedLevel}
        >
          {!hydrated ? (
            <SkeletonPills />
          ) : levels.length === 0 ? (
            <EmptyHint text="No levels found. Ask an admin to add levels in Academic Manager." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {levels.map((l) => (
                <PillButton
                  key={l.id}
                  selected={levelId === l.id}
                  onClick={() => {
                    setLevelId(l.id);
                    setSubjectId("");
                  }}
                >
                  {l.name}
                </PillButton>
              ))}
            </div>
          )}
        </StepCard>

        <StepCard
          step={2}
          title="Select Subject"
          icon={BookOpen}
          active={!!selectedLevel && !selectedSubject}
          done={!!selectedSubject}
          disabled={!selectedLevel}
        >
          {!selectedLevel ? (
            <EmptyHint text="Choose a level first." />
          ) : selectedLevel.subjects.length === 0 ? (
            <EmptyHint text="No subjects in this level yet." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedLevel.subjects.map((s) => (
                <PillButton
                  key={s.id}
                  selected={subjectId === s.id}
                  onClick={() => setSubjectId(s.id)}
                >
                  {s.name}
                </PillButton>
              ))}
            </div>
          )}
        </StepCard>
      </section>

      {selectedLevel && selectedSubject && (
        <>
          {/* Top summary */}
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard
              icon={GraduationCap}
              label="Selected Level"
              value={selectedLevel.name}
              hint={`${summary.lvlPct}% level progress`}
              tone="from-indigo-500/20 via-indigo-500/5 to-transparent"
              accent="text-indigo-500"
            />
            <SummaryCard
              icon={BookOpen}
              label="Selected Subject"
              value={selectedSubject.name}
              hint={`${selectedSubject.chapters.length} chapters`}
              tone="from-fuchsia-500/20 via-fuchsia-500/5 to-transparent"
              accent="text-fuchsia-500"
            />
            <SummaryCard
              icon={Layers}
              label="Total Chapters"
              value={String(summary.total)}
              hint="in this subject"
              tone="from-sky-500/20 via-sky-500/5 to-transparent"
              accent="text-sky-500"
            />
            <SummaryCard
              icon={CheckCircle2}
              label="Completed Chapters"
              value={`${summary.completed}/${summary.total}`}
              hint={`${summary.inProgress} in progress`}
              tone="from-emerald-500/20 via-emerald-500/5 to-transparent"
              accent="text-emerald-500"
            />
            <SummaryCard
              icon={Target}
              label="Overall Subject Progress"
              value={`${summary.subjPct}%`}
              hint="live weighted avg"
              tone="from-amber-500/20 via-amber-500/5 to-transparent"
              accent="text-amber-500"
              progress={summary.subjPct}
            />
          </section>

          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chapters…"
                className="h-10 w-full rounded-xl border border-border/60 bg-card pl-9 pr-9 text-sm shadow-sm outline-none transition-all focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px]">
              <LegendPill
                status="not_started"
                count={summary.notStarted}
                active={statusFilter === "not_started"}
                onClick={() =>
                  setStatusFilter((f) => (f === "not_started" ? "all" : "not_started"))
                }
              />
              <LegendPill
                status="in_progress"
                count={summary.inProgress}
                active={statusFilter === "in_progress"}
                onClick={() =>
                  setStatusFilter((f) => (f === "in_progress" ? "all" : "in_progress"))
                }
              />
              <LegendPill
                status="completed"
                count={summary.completed}
                active={statusFilter === "completed"}
                onClick={() => setStatusFilter((f) => (f === "completed" ? "all" : "completed"))}
              />
              {statusFilter !== "all" && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            {rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {search ? "No chapters match your search." : "No chapters in this subject."}
              </div>
            ) : (
              <div className="relative max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead className="sticky top-0 z-10 bg-card/95 text-[11px] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-xl">
                    <tr className="border-b border-border/60">
                      <SortableTh
                        label="Chapter"
                        sortKey="name"
                        active={sortKey}
                        dir={sortDir}
                        onClick={toggleSort}
                        align="left"
                      />
                      <SortableTh
                        label="Class"
                        sortKey="cls"
                        active={sortKey}
                        dir={sortDir}
                        onClick={toggleSort}
                      />
                      <SortableTh
                        label="Slide"
                        sortKey="slide"
                        active={sortKey}
                        dir={sortDir}
                        onClick={toggleSort}
                      />
                      <SortableTh
                        label="Easy Slide"
                        sortKey="easy"
                        active={sortKey}
                        dir={sortDir}
                        onClick={toggleSort}
                      />
                      <SortableTh
                        label="MCQ"
                        sortKey="mcq"
                        active={sortKey}
                        dir={sortDir}
                        onClick={toggleSort}
                      />
                      <SortableTh
                        label="Progress"
                        sortKey="pct"
                        active={sortKey}
                        dir={sortDir}
                        onClick={toggleSort}
                        className="min-w-[220px]"
                      />
                      <SortableTh
                        label="Status"
                        sortKey="status"
                        active={sortKey}
                        dir={sortDir}
                        onClick={toggleSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => (
                      <ChapterRow
                        key={r.id}
                        id={r.id}
                        name={r.name}
                        code={r.code}
                        cp={r.cp}
                        pct={r.pct}
                        status={r.status}
                        zebra={(pageStart + i) % 2 === 1}
                        onToggle={toggle}
                        expanded={expanded.has(r.id)}
                        onExpand={toggleExpanded}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > 0 && (
              <TablePager
                page={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                total={rows.length}
                onPage={setPage}
                onPageSize={setPageSize}
              />
            )}
          </section>

          {/* Bottom Subject + Level progress */}
          <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <ProgressPanel
              icon={BookOpen}
              title="Subject Progress"
              subtitle={selectedSubject.name}
              pct={summary.subjPct}
              color="oklch(0.65 0.22 320)"
              stats={[
                { label: "Completed", value: `${summary.completed}/${summary.total}` },
                { label: "In Progress", value: String(summary.inProgress) },
                { label: "Not Started", value: String(summary.notStarted) },
              ]}
            />
            <ProgressPanel
              icon={GraduationCap}
              title="Level Progress"
              subtitle={selectedLevel.name}
              pct={summary.lvlPct}
              color="oklch(0.68 0.19 260)"
              stats={[
                { label: "Subjects", value: String(selectedLevel.subjects.length) },
                {
                  label: "Chapters",
                  value: String(selectedLevel.subjects.reduce((s, x) => s + x.chapters.length, 0)),
                },
                {
                  label: "Fully Done",
                  value: String(
                    selectedLevel.subjects
                      .flatMap((s) => s.chapters)
                      .filter((c) => chapterPct(c.checkpoints) >= 100).length,
                  ),
                },
              ]}
            />
          </section>

          <AnalyticsSection level={selectedLevel} subject={selectedSubject} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function StepCard({
  step,
  title,
  icon: Icon,
  active,
  done,
  disabled,
  children,
}: {
  step: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  done?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all ${
        disabled ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-lg"
      } ${active ? "border-indigo-500/60 ring-2 ring-indigo-500/20" : "border-border/60"}`}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-500/20 via-fuchsia-500/10 to-transparent blur-2xl"
        aria-hidden
      />
      <div className="relative mb-3 flex items-center gap-3">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
            done
              ? "bg-emerald-500/15 text-emerald-500"
              : active
                ? "bg-indigo-500/15 text-indigo-500"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : `0${step}`}
        </span>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold tracking-tight">{title}</div>
        </div>
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function PillButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
        selected
          ? "border-transparent bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-fuchsia-500/25"
          : "border-border/60 bg-background text-foreground hover:-translate-y-0.5 hover:border-border hover:shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground">{text}</div>;
}

function SkeletonPills() {
  return (
    <div className="flex flex-wrap gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-muted" />
      ))}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  accent,
  progress,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone: string;
  accent: string;
  progress?: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-lg">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone} opacity-80 transition-opacity duration-300 group-hover:opacity-100`}
        aria-hidden
      />
      <div className="relative">
        <Icon
          className={`mb-2 h-4 w-4 ${accent} transition-transform duration-300 group-hover:scale-110`}
        />
        <div className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        {hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>}
        {typeof progress === "number" && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-orange-400 transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  active,
  dir,
  onClick,
  align = "center",
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "center";
  className?: string;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-4 py-3 font-semibold ${align === "left" ? "text-left" : "text-center"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent hover:text-foreground ${
          isActive ? "text-foreground" : ""
        }`}
      >
        {label}
        <Icon className={`h-3 w-3 ${isActive ? "text-indigo-500" : "text-muted-foreground/60"}`} />
      </button>
    </th>
  );
}

const ACCENT_STYLES: Record<string, { on: string; off: string; ring: string }> = {
  indigo: {
    on: "bg-gradient-to-br from-indigo-500 to-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/30",
    off: "hover:border-indigo-500/60 hover:bg-indigo-500/5",
    ring: "focus-visible:ring-indigo-500/40",
  },
  sky: {
    on: "bg-gradient-to-br from-sky-500 to-sky-600 border-sky-500 text-white shadow-md shadow-sky-500/30",
    off: "hover:border-sky-500/60 hover:bg-sky-500/5",
    ring: "focus-visible:ring-sky-500/40",
  },
  teal: {
    on: "bg-gradient-to-br from-teal-500 to-teal-600 border-teal-500 text-white shadow-md shadow-teal-500/30",
    off: "hover:border-teal-500/60 hover:bg-teal-500/5",
    ring: "focus-visible:ring-teal-500/40",
  },
  fuchsia: {
    on: "bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 border-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30",
    off: "hover:border-fuchsia-500/60 hover:bg-fuchsia-500/5",
    ring: "focus-visible:ring-fuchsia-500/40",
  },
};

const CheckCell = memo(function CheckCell({
  icon: Icon,
  checked,
  onToggle,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  checked: boolean;
  onToggle: () => void;
  accent: keyof typeof ACCENT_STYLES;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <td className="px-2 py-2.5 text-center sm:px-4 sm:py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className={`group/chk inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus:outline-none focus-visible:ring-2 sm:px-3 ${s.ring} ${
          checked ? s.on + " border" : "border-border/60 bg-background text-foreground " + s.off
        }`}
      >
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
            checked
              ? "border-white/60 bg-white/20 scale-100"
              : "border-border bg-background group-hover/chk:border-foreground/40"
          }`}
          aria-hidden
        >
          {checked ? (
            <Check className="h-3.5 w-3.5 text-white animate-scale-in" strokeWidth={3} />
          ) : (
            <Icon className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
        <span className="hidden text-xs font-semibold tabular-nums sm:inline">
          {checked ? "+25%" : "25%"}
        </span>
      </button>
    </td>
  );
});

const ChapterRow = memo(function ChapterRow({
  id,
  name,
  code,
  cp,
  pct,
  status,
  zebra,
  onToggle,
  expanded,
  onExpand,
}: {
  id: string;
  name: string;
  code: string;
  cp: ChapterCheckpoints;
  pct: number;
  status: Status;
  zebra: boolean;
  onToggle: (chapterId: string, key: Checkpoint) => void;
  expanded: boolean;
  onExpand: (id: string) => void;
}) {
  const onCls = useCallback(() => onToggle(id, "cls"), [id, onToggle]);
  const onSlide = useCallback(() => onToggle(id, "slide"), [id, onToggle]);
  const onEasy = useCallback(() => onToggle(id, "easy"), [id, onToggle]);
  const onMcq = useCallback(() => onToggle(id, "mcq"), [id, onToggle]);
  const onRowClick = useCallback(() => onExpand(id), [id, onExpand]);
  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onExpand(id);
      }
    },
    [id, onExpand],
  );
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onRowClick}
        onKeyDown={onKey}
        className={`cursor-pointer border-t border-border/60 outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/60 ${zebra ? "bg-background/40" : ""} ${expanded ? "bg-indigo-500/[0.04]" : ""}`}
      >
        <td className="px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-3">
            <CircularProgress value={pct} size={40} stroke={4} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90 text-indigo-500" : ""}`}
                />
                <div className="truncate font-medium text-foreground">{name}</div>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 pl-5 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono tabular-nums">
                  {code}
                </span>
                <Clock className="h-3 w-3" />
                <span>{formatRelative(cp.updatedAt)}</span>
              </div>
            </div>
          </div>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <CheckCellInner icon={Presentation} checked={cp.cls} onToggle={onCls} accent="indigo" />
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <CheckCellInner icon={Layers} checked={cp.slide} onToggle={onSlide} accent="sky" />
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <CheckCellInner icon={Sparkles} checked={cp.easy} onToggle={onEasy} accent="teal" />
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <CheckCellInner icon={Target} checked={cp.mcq} onToggle={onMcq} accent="fuchsia" />
        </td>
        <td className="px-4 py-3">
          <ProgressBar pct={pct} />
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-center">
          <StatusBadge status={status} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border/40 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-fuchsia-500/[0.04]">
          <td colSpan={7} className="px-4 py-4 sm:px-6 sm:py-5">
            <div className="animate-fade-in">
              <ChapterDetails cp={cp} pct={pct} status={status} name={name} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

/* CheckCell inner: same visuals as before but not wrapped in <td> so we can wrap
   with a <td onClick={stopPropagation}> to keep the row click for expansion. */
const CheckCellInner = memo(function CheckCellInner({
  icon: Icon,
  checked,
  onToggle,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  checked: boolean;
  onToggle: () => void;
  accent: keyof typeof ACCENT_STYLES;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <div className="px-2 py-2.5 text-center sm:px-4 sm:py-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className={`group/chk inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus:outline-none focus-visible:ring-2 sm:px-3 ${s.ring} ${
          checked ? s.on + " border" : "border-border/60 bg-background text-foreground " + s.off
        }`}
      >
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
            checked
              ? "border-white/60 bg-white/20"
              : "border-border bg-background group-hover/chk:border-foreground/40"
          }`}
          aria-hidden
        >
          {checked ? (
            <Check className="h-3.5 w-3.5 text-white animate-scale-in" strokeWidth={3} />
          ) : (
            <Icon className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
        <span className="hidden text-xs font-semibold tabular-nums sm:inline">
          {checked ? "+25%" : "25%"}
        </span>
      </button>
    </div>
  );
});

const CHECKPOINT_META: Array<{
  key: Checkpoint;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "cls", label: "Class Status", icon: Presentation },
  { key: "slide", label: "Slide Status", icon: Layers },
  { key: "easy", label: "Easy Slide Status", icon: Sparkles },
  { key: "mcq", label: "MCQ Progress", icon: Target },
];

function ChapterDetails({
  cp,
  pct,
  status,
  name,
}: {
  cp: ChapterCheckpoints;
  pct: number;
  status: Status;
  name: string;
}) {
  const completionDate =
    pct >= 100 && cp.updatedAt
      ? new Date(cp.updatedAt).toLocaleString([], {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {CHECKPOINT_META.map((m) => (
          <CheckpointStatusCard key={m.key} label={m.label} icon={m.icon} done={cp[m.key]} />
        ))}
      </div>
      <div className="flex flex-col items-stretch justify-between gap-2 rounded-xl border border-border/60 bg-background/60 p-3 md:min-w-[240px]">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Chapter
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold" title={name}>
            {name}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Progress
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{pct}%</div>
          </div>
          <StatusBadge status={status} />
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {completionDate ? "Completion Date" : cp.updatedAt ? "Last Updated" : "Not Started"}
          </div>
          <div className="mt-0.5 text-xs font-medium">
            {completionDate ?? (cp.updatedAt ? formatRelative(cp.updatedAt) : "—")}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckpointStatusCard({
  label,
  icon: Icon,
  done,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
}) {
  const cls = done
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "border-border/60 bg-background/60 text-muted-foreground";
  const dot = done
    ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]"
    : "bg-muted-foreground/40";
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${cls}`}>
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-background/60">
        <Icon className="h-4 w-4" />
        <span
          className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${dot}`}
        />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-xs font-semibold">
          {done ? "Completed" : "Pending"}
          <span className="ml-1.5 tabular-nums text-muted-foreground">{done ? "+25%" : "0%"}</span>
        </div>
      </div>
    </div>
  );
}

function TablePager({
  page,
  totalPages,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-border hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-card/60 px-4 py-2.5 text-xs">
      <div className="text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{from.toLocaleString()}</span>
        {"–"}
        <span className="font-semibold tabular-nums text-foreground">{to.toLocaleString()}</span>
        {" of "}
        <span className="font-semibold tabular-nums text-foreground">{total.toLocaleString()}</span>
        {" chapters"}
      </div>
      <label className="ml-auto flex items-center gap-1.5 text-muted-foreground">
        Rows
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs outline-none transition-colors hover:border-border focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
        >
          {[25, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={btn}
          onClick={() => onPage(1)}
          disabled={page <= 1}
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[80px] text-center tabular-nums text-muted-foreground">
          Page <span className="font-semibold text-foreground">{page}</span> / {totalPages}
        </span>
        <button
          type="button"
          className={btn}
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => onPage(totalPages)}
          disabled={page >= totalPages}
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="min-w-[200px]">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium">
        <span className="text-muted-foreground">Progress</span>
        <span className="tabular-nums text-foreground">{pct}%</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-orange-400 shadow-[0_0_12px_rgba(217,70,239,0.35)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        >
          <span
            className="absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}

const STATUS_META: Record<
  Status,
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }>; dot: string }
> = {
  not_started: {
    label: "Not Started",
    cls: "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
    icon: Circle,
    dot: "bg-muted-foreground/50",
  },
  in_progress: {
    label: "In Progress",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: Clock,
    dot: "bg-amber-500",
  },
  completed: {
    label: "Completed",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
  },
};

function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${m.cls}`}
    >
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function LegendPill({
  status,
  count,
  active,
  onClick,
}: {
  status: Status;
  count: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const m = STATUS_META[status];
  const base = `inline-flex items-center gap-1.5 rounded-full border px-2 py-1 transition-all ${m.cls}`;
  const interactive = onClick
    ? ` cursor-pointer hover:-translate-y-0.5 hover:shadow-sm ${active ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-90"}`
    : "";
  const content = (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
      <span className="tabular-nums font-semibold">{count}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={base + interactive}>
        {content}
      </button>
    );
  }
  return <span className={base}>{content}</span>;
}

function CircularProgress({
  value,
  size = 64,
  stroke = 6,
  showLabel = false,
}: {
  value: number;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  const id = `pt-grad-${size}`;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="oklch(0.65 0.22 280)" />
            <stop offset="50%" stopColor="oklch(0.68 0.24 330)" />
            <stop offset="100%" stopColor="oklch(0.75 0.19 60)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-muted)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      {showLabel ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums leading-none">{value}%</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Complete
          </span>
        </div>
      ) : (
        <span className="absolute text-[10px] font-semibold tabular-nums text-foreground">
          {value}%
        </span>
      )}
    </div>
  );
}

function ProgressPanel({
  icon: Icon,
  title,
  subtitle,
  pct,
  color,
  stats,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  pct: number;
  color: string;
  stats: { label: string; value: string }[];
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full blur-3xl opacity-40 transition-opacity duration-500 group-hover:opacity-70"
        style={{ background: color }}
        aria-hidden
      />
      <div className="relative mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-500">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </div>
          <div className="truncate text-sm font-semibold tracking-tight">{subtitle}</div>
        </div>
      </div>
      <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
        <CircularProgress value={pct} size={132} stroke={10} showLabel />
        <div className="grid flex-1 grid-cols-3 gap-3 sm:gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 text-center"
            >
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-4">
        <ProgressBar pct={pct} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

const CHART_COLORS = [
  "oklch(0.65 0.22 280)",
  "oklch(0.68 0.24 330)",
  "oklch(0.72 0.17 210)",
  "oklch(0.72 0.17 150)",
  "oklch(0.75 0.19 60)",
  "oklch(0.68 0.19 30)",
];

function AnalyticsSection({ level, subject }: { level: Level; subject: Subject }) {
  const data = useMemo(() => {
    const chapterRows = subject.chapters.map((c, i) => {
      const pct = chapterPct(c.checkpoints);
      return {
        id: c.id,
        name: c.name,
        short: c.code || c.name.slice(0, 3).toUpperCase() || String(i + 1),
        pct,
      };
    });
    const totalChapters = chapterRows.length;
    const completedChapters = chapterRows.filter((r) => r.pct >= 100).length;
    const remainingChapters = totalChapters - completedChapters;
    const avgPct = totalChapters
      ? Math.round(chapterRows.reduce((s, r) => s + r.pct, 0) / totalChapters)
      : 0;
    const completedPct = totalChapters ? Math.round((completedChapters / totalChapters) * 100) : 0;
    const remainingPct = 100 - completedPct;

    const subjectRows = level.subjects.map((s, i) => ({
      id: s.id,
      name: s.name,
      short: s.code || s.name.slice(0, 4),
      pct: subjectPct(s),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
    const levelCompletionPct = levelPct(level);

    // Cap bar chart data to keep it fast for 1000+ chapters
    const CHART_LIMIT = 60;
    const chartRows =
      chapterRows.length > CHART_LIMIT ? chapterRows.slice(0, CHART_LIMIT) : chapterRows;

    return {
      chapterRows,
      chartRows,
      chartTruncated: chapterRows.length > CHART_LIMIT,
      chartLimit: CHART_LIMIT,
      subjectRows,
      kpi: {
        totalChapters,
        completedChapters,
        remainingChapters,
        completedPct,
        remainingPct,
        avgPct,
      },
      completionSplit: [
        { name: "Completed", value: completedPct },
        { name: "Remaining", value: remainingPct },
      ],
      levelCompletionPct,
    };
  }, [level, subject]);

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-500">
          <BarChart3 className="h-4 w-4" />
        </span>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Analytics
          </div>
          <h2 className="text-sm font-semibold tracking-tight sm:text-base">
            {subject.name} · Insights & Charts
          </h2>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={CheckCircle2}
          label="Completed Chapters"
          value={String(data.kpi.completedChapters)}
          hint={`of ${data.kpi.totalChapters}`}
          tone="from-emerald-500/25 via-emerald-500/5 to-transparent"
          accent="text-emerald-500"
          progress={data.kpi.completedPct}
        />
        <KpiCard
          icon={Hourglass}
          label="Remaining Chapters"
          value={String(data.kpi.remainingChapters)}
          hint={`of ${data.kpi.totalChapters}`}
          tone="from-amber-500/25 via-amber-500/5 to-transparent"
          accent="text-amber-500"
          progress={data.kpi.remainingPct}
        />
        <KpiCard
          icon={TrendingUp}
          label="Completed %"
          value={`${data.kpi.completedPct}%`}
          hint="chapters fully done"
          tone="from-indigo-500/25 via-indigo-500/5 to-transparent"
          accent="text-indigo-500"
          progress={data.kpi.completedPct}
        />
        <KpiCard
          icon={Circle}
          label="Remaining %"
          value={`${data.kpi.remainingPct}%`}
          hint="left to complete"
          tone="from-fuchsia-500/25 via-fuchsia-500/5 to-transparent"
          accent="text-fuchsia-500"
          progress={data.kpi.remainingPct}
        />
        <KpiCard
          icon={Activity}
          label="Average Progress"
          value={`${data.kpi.avgPct}%`}
          hint="across all chapters"
          tone="from-sky-500/25 via-sky-500/5 to-transparent"
          accent="text-sky-500"
          progress={data.kpi.avgPct}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          icon={BarChart3}
          title="Chapter Progress"
          subtitle={
            data.chartTruncated
              ? `Showing first ${data.chartLimit} of ${data.chapterRows.length} chapters`
              : `${data.chapterRows.length} chapter${data.chapterRows.length === 1 ? "" : "s"}`
          }
          className="lg:col-span-2"
        >
          {data.chartRows.length === 0 ? (
            <ChartEmpty />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.chartRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="pt-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.22 320)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="oklch(0.6 0.2 280)" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="short"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  interval={data.chartRows.length > 24 ? "preserveStartEnd" : 0}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
                  content={<ChartTooltip suffix="%" nameKey="name" />}
                />
                <Bar
                  dataKey="pct"
                  fill="url(#pt-bar)"
                  radius={[8, 8, 4, 4]}
                  maxBarSize={44}
                  isAnimationActive={data.chartRows.length <= 40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          icon={PieIcon}
          title="Subject Completion"
          subtitle={`${subject.name} · ${data.kpi.completedPct}% done`}
        >
          <div className="relative">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <defs>
                  <linearGradient id="pt-done" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.19 150)" />
                    <stop offset="100%" stopColor="oklch(0.65 0.22 200)" />
                  </linearGradient>
                  <linearGradient id="pt-rem" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.68 0.24 330)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="oklch(0.6 0.2 280)" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <Tooltip content={<ChartTooltip suffix="%" nameKey="name" />} />
                <Pie
                  data={data.completionSplit}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                  stroke="var(--color-card)"
                  strokeWidth={3}
                >
                  <Cell fill="url(#pt-done)" />
                  <Cell fill="url(#pt-rem)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-semibold tabular-nums leading-none">
                {data.kpi.completedPct}%
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Completed
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Completed{" "}
              <span className="font-semibold tabular-nums">{data.kpi.completedPct}%</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-fuchsia-500/60" /> Remaining{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {data.kpi.remainingPct}%
              </span>
            </span>
          </div>
        </ChartCard>

        <ChartCard
          icon={GraduationCap}
          title="Level Completion"
          subtitle={`${level.name} · ${data.levelCompletionPct}% overall`}
          className="lg:col-span-3"
        >
          {data.subjectRows.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="space-y-3">
              {data.subjectRows.map((s) => (
                <div key={s.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                  <div className="flex min-w-[140px] items-center gap-2 truncate text-sm">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <span className="truncate font-medium">{s.name}</span>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${s.pct}%`,
                        background: `linear-gradient(90deg, ${s.color}, oklch(0.75 0.19 60))`,
                        boxShadow: `0 0 12px ${s.color}`,
                      }}
                    />
                  </div>
                  <div className="w-12 text-right text-xs font-semibold tabular-nums">{s.pct}%</div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </section>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  accent,
  progress,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone: string;
  accent: string;
  progress?: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-lg">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone} opacity-80 transition-opacity duration-300 group-hover:opacity-100`}
        aria-hidden
      />
      <div className="relative">
        <div className="mb-2 flex items-center justify-between">
          <Icon
            className={`h-4 w-4 ${accent} transition-transform duration-300 group-hover:scale-110`}
          />
          {typeof progress === "number" && (
            <span className="rounded-full border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {progress}%
            </span>
          )}
        </div>
        <div className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>}
        {typeof progress === "number" && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-orange-400 transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  subtitle,
  children,
  className = "",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/10 to-transparent blur-3xl"
        aria-hidden
      />
      <div className="relative mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-500">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
      No data yet
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  suffix = "",
  nameKey,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; payload?: Record<string, unknown> }>;
  label?: string | number;
  suffix?: string;
  nameKey?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  const displayName =
    (nameKey && (p.payload?.[nameKey] as string)) || p.name || String(label ?? "");
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-medium text-foreground">{displayName}</div>
      <div className="mt-0.5 text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">
          {p.value}
          {suffix}
        </span>
      </div>
    </div>
  );
}
