import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Flame,
  GraduationCap,
  Layers,
  ListChecks,
  Loader2,
  Search,
  SearchX,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import {
  synthesizeStudents,
  type Student,
  type StudentStatus,
  type TrackedRoutine,
} from "@/lib/routine-students";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export type { TrackedRoutine };

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function TrackingDashboard({ routines }: { routines: TrackedRoutine[] }) {
  const students = useMemo(() => synthesizeStudents(routines), [routines]);

  const [level, setLevel] = useState<string>("all");
  const [subject, setSubject] = useState<string>("all");
  const [chapter, setChapter] = useState<string>("all");
  const [routineId, setRoutineId] = useState<string>("all");
  const [dateWindow, setDateWindow] = useState<"24h" | "7d" | "30d" | "all">("7d");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 180);
  const [selected, setSelected] = useState<Student | null>(null);

  const levels = useMemo(
    () => Array.from(new Set(students.map((s) => s.level))).sort(),
    [students],
  );
  const subjects = useMemo(
    () => Array.from(new Set(students.flatMap((s) => s.subjects))).sort(),
    [students],
  );
  const chapters = useMemo(() => {
    const pool = students.flatMap((s) => s.chapters.map((c) => c.name));
    const filteredCh = subject === "all" ? pool : pool.filter((c) => c.startsWith(`${subject} ·`));
    return Array.from(new Set(filteredCh)).sort();
  }, [students, subject]);

  const windowMs =
    dateWindow === "24h"
      ? 86400000
      : dateWindow === "7d"
        ? 7 * 86400000
        : dateWindow === "30d"
          ? 30 * 86400000
          : Infinity;

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const cutoff = Date.now() - windowMs;
    const out: Student[] = [];
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      if (level !== "all" && s.level !== level) continue;
      if (subject !== "all" && !s.subjects.includes(subject)) continue;
      if (chapter !== "all") {
        let ok = false;
        for (const c of s.chapters)
          if (c.name === chapter) {
            ok = true;
            break;
          }
        if (!ok) continue;
      }
      if (routineId !== "all" && s.routineId !== routineId) continue;
      if (windowMs !== Infinity && s.lastActivityAt.getTime() < cutoff) continue;
      if (q && !s.name.toLowerCase().includes(q) && !s.routineTitle.toLowerCase().includes(q))
        continue;
      out.push(s);
    }
    return out;
  }, [students, level, subject, chapter, routineId, windowMs, debouncedQuery]);

  const deferredFiltered = useDeferredValue(filtered);
  const isPending = deferredFiltered !== filtered || debouncedQuery !== query;

  const summary = useMemo(() => {
    let following = 0,
      notStarted = 0,
      behind = 0,
      completed = 0,
      progSum = 0;
    for (const s of deferredFiltered) {
      if (s.status !== "inactive") following++;
      if (s.progress === 0) notStarted++;
      if (s.status === "behind") behind++;
      if (s.status === "completed") completed++;
      progSum += s.progress;
    }
    const total = deferredFiltered.length;
    return {
      total,
      following,
      notStarted,
      behind,
      completed,
      avg: total === 0 ? 0 : Math.round(progSum / total),
    };
  }, [deferredFiltered]);

  const anyFilter =
    level !== "all" ||
    subject !== "all" ||
    chapter !== "all" ||
    routineId !== "all" ||
    dateWindow !== "7d" ||
    query !== "";

  const clearFilters = useCallback(() => {
    setLevel("all");
    setSubject("all");
    setChapter("all");
    setRoutineId("all");
    setDateWindow("7d");
    setQuery("");
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      aria-labelledby="tracking-title"
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-5 backdrop-blur-2xl sm:p-7 lg:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-gradient-to-br from-primary/20 via-accent/15 to-transparent blur-3xl"
      />

      {/* Header */}
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur">
            <Activity className="h-3 w-3 text-accent" aria-hidden />
            Routine tracking
          </div>
          <h2
            id="tracking-title"
            className="mt-3 bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl"
          >
            Adherence &amp; progress dashboard
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every learner across every published routine — filter, drill down and intervene before
            momentum stalls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search students or routines</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search student or routine…"
              type="search"
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full min-w-[220px] rounded-2xl border border-border/70 bg-card/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground shadow-sm backdrop-blur-md outline-none transition focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-64"
            />
            {isPending && (
              <Loader2
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
          </label>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard icon={Users} label="Total Assigned" value={summary.total} tone="primary" />
        <SummaryCard
          icon={CheckCircle2}
          label="Following"
          value={summary.following}
          tone="emerald"
        />
        <SummaryCard icon={Clock} label="Not Started" value={summary.notStarted} tone="slate" />
        <SummaryCard icon={Flame} label="Behind Schedule" value={summary.behind} tone="amber" />
        <SummaryCard
          icon={GraduationCap}
          label="Completed"
          value={summary.completed}
          tone="violet"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Avg Completion"
          value={summary.avg}
          suffix="%"
          tone="teal"
        />
      </div>

      {/* Filters */}
      <div
        className="relative mt-6 flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label="Student filters"
      >
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <Filter className="h-3 w-3" aria-hidden />
          Filter
        </div>
        <FilterSelect
          icon={Layers}
          label="Level"
          value={level}
          onChange={setLevel}
          options={levels}
        />
        <FilterSelect
          icon={BookOpen}
          label="Subject"
          value={subject}
          onChange={(v) => {
            setSubject(v);
            setChapter("all");
          }}
          options={subjects}
        />
        <FilterSelect
          icon={ListChecks}
          label="Chapter"
          value={chapter}
          onChange={setChapter}
          options={chapters}
          disabled={chapters.length === 0}
        />
        <FilterSelect
          icon={CalendarDays}
          label="Routine"
          value={routineId}
          onChange={setRoutineId}
          options={routines.map((r) => r.id)}
          labelFor={(id) => routines.find((r) => r.id === id)?.title ?? id}
        />
        <DateFilter value={dateWindow} onChange={setDateWindow} />

        {anyFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <X className="h-3 w-3" aria-hidden /> Clear filters
          </button>
        )}
      </div>

      {/* Student table */}
      <div className="relative mt-6">
        <VirtualStudentTable
          students={deferredFiltered}
          onSelect={setSelected}
          selectedId={selected?.id ?? null}
          isPending={isPending}
          hasFilters={anyFilter}
          onClearFilters={clearFilters}
        />
      </div>

      {/* Detail sheet */}
      <StudentDetailSheet student={selected} onClose={() => setSelected(null)} />
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/* Virtualized student table                                           */
/* ------------------------------------------------------------------ */

const ROW_H = 64;
const VIEWPORT_H = 560;
const OVERSCAN = 8;

const COLS = "minmax(220px,2.4fr) 100px minmax(180px,1.6fr) 180px 84px 78px 84px 118px 128px";

function VirtualStudentTable({
  students,
  onSelect,
  selectedId,
  isPending,
  hasFilters,
  onClearFilters,
}: {
  students: Student[];
  onSelect: (s: Student) => void;
  selectedId: string | null;
  isPending: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(top);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // Reset scroll when the underlying data set changes shape (filters cleared etc.)
  const hasNoStudents = students.length === 0;
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [hasNoStudents]);

  const total = students.length;
  const totalHeight = total * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT_H / ROW_H) + OVERSCAN * 2;
  const endIdx = Math.min(total, startIdx + visibleCount);
  const rows = students.slice(startIdx, endIdx);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/40 backdrop-blur">
      {/* Header */}
      <div
        role="row"
        className="grid gap-0 border-b border-border/60 bg-card/85 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur"
        style={{ gridTemplateColumns: COLS }}
      >
        <div role="columnheader">Student</div>
        <div role="columnheader">Level</div>
        <div role="columnheader">Routine</div>
        <div role="columnheader">Progress</div>
        <div role="columnheader" className="text-right">
          Today
        </div>
        <div role="columnheader" className="text-right">
          Streak
        </div>
        <div role="columnheader" className="text-right">
          Missed
        </div>
        <div role="columnheader">Last Activity</div>
        <div role="columnheader">Status</div>
      </div>

      {/* Body */}
      {total === 0 ? (
        <EmptyState hasFilters={hasFilters} onClearFilters={onClearFilters} />
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="rowgroup"
          className="relative overflow-auto"
          style={{ height: Math.min(VIEWPORT_H, Math.max(ROW_H, totalHeight)) }}
        >
          <div className="min-w-[960px]" style={{ height: totalHeight, position: "relative" }}>
            {rows.map((s, i) => {
              const idx = startIdx + i;
              return (
                <StudentRow
                  key={s.id}
                  student={s}
                  top={idx * ROW_H}
                  selected={s.id === selectedId}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Footer meta */}
      <div className="flex items-center justify-between border-t border-border/60 bg-card/60 px-4 py-2 text-[11px] text-muted-foreground">
        <span aria-live="polite">
          {isPending ? "Filtering…" : `${total.toLocaleString()} student${total === 1 ? "" : "s"}`}
        </span>
        {total > 0 && (
          <span className="hidden sm:inline">
            Virtualized · showing rows {startIdx + 1}–{endIdx.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

/* Single row — memoized so scrolling doesn't re-render off-screen rows */
const StudentRow = memo(function StudentRow({
  student,
  top,
  selected,
  onSelect,
}: {
  student: Student;
  top: number;
  selected: boolean;
  onSelect: (s: Student) => void;
}) {
  const handleActivate = () => onSelect(student);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Open ${student.name}, ${student.progress}% complete, status ${student.status}`}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      className={`absolute inset-x-0 grid items-center gap-0 border-b border-border/50 px-4 text-sm outline-none transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 ${selected ? "bg-primary/5" : ""}`}
      style={{ top, height: ROW_H, gridTemplateColumns: COLS }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/25 to-accent/25 text-xs font-semibold text-foreground">
            {student.initials}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{student.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {student.subjects.join(" · ")}
            </div>
          </div>
        </div>
      </div>
      <div className="truncate text-muted-foreground">{student.level}</div>
      <div className="truncate text-muted-foreground">{student.routineTitle}</div>
      <div className="pr-4">
        <StaticProgressBar value={student.progress} />
      </div>
      <div className="text-right tabular-nums text-foreground">
        {student.todayHours.toFixed(1)}h
      </div>
      <div className="text-right">
        <span className="inline-flex items-center gap-1 tabular-nums text-foreground">
          <Flame className="h-3.5 w-3.5 text-amber-500" aria-hidden /> {student.streak}
        </span>
      </div>
      <div className="text-right tabular-nums text-muted-foreground">{student.missedDays}</div>
      <div className="truncate text-muted-foreground">{student.lastActivity}</div>
      <div>
        <StatusBadge status={student.status} />
      </div>
    </div>
  );
});

function EmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-border/70 bg-secondary/40 text-muted-foreground">
        <SearchX className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">No students match</div>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {hasFilters
            ? "Try widening your filters, choosing a longer date window, or clearing your search."
            : "As soon as learners join a routine they'll appear here in real time."}
        </p>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <X className="h-3 w-3" aria-hidden /> Clear all filters
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary + filter primitives                                          */
/* ------------------------------------------------------------------ */

const TONES = {
  primary: "from-primary/25 to-primary/5 text-primary",
  emerald: "from-emerald-500/25 to-emerald-500/5 text-emerald-500",
  slate: "from-slate-400/20 to-slate-400/5 text-slate-500",
  amber: "from-amber-500/25 to-amber-500/5 text-amber-500",
  violet: "from-violet-500/25 to-violet-500/5 text-violet-500",
  teal: "from-teal-500/25 to-teal-500/5 text-teal-500",
} as const;

const SummaryCard = memo(function SummaryCard({
  icon: Icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: number;
  suffix?: string;
  tone: keyof typeof TONES;
}) {
  const iconTone = TONES[tone].split(" ").pop() ?? "text-foreground";
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-2xl transition-transform hover:-translate-y-0.5 hover:border-primary/40">
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-gradient-to-br ${TONES[tone]} blur-2xl opacity-70`}
      />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-semibold tracking-tight text-transparent tabular-nums">
              {value.toLocaleString()}
            </span>
            {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
          </div>
        </div>
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/70 bg-secondary/60 ${iconTone}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      </div>
    </div>
  );
});

function FilterSelect({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  labelFor,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labelFor?: (v: string) => string;
  disabled?: boolean;
}) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div
      className={`group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 pl-3 pr-1 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-md transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/40 ${disabled ? "opacity-50" : "hover:border-primary/40"}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <label htmlFor={id} className="uppercase tracking-[0.18em] text-[10px]">
        {label}
      </label>
      <select
        id={id}
        aria-label={`Filter by ${label.toLowerCase()}`}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[160px] truncate rounded-full bg-transparent px-2 py-1 text-xs font-semibold text-foreground outline-none"
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labelFor ? labelFor(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateFilter({
  value,
  onChange,
}: {
  value: "24h" | "7d" | "30d" | "all";
  onChange: (v: "24h" | "7d" | "30d" | "all") => void;
}) {
  const opts: Array<{ v: "24h" | "7d" | "30d" | "all"; label: string; aria: string }> = [
    { v: "24h", label: "24h", aria: "Last 24 hours" },
    { v: "7d", label: "7d", aria: "Last 7 days" },
    { v: "30d", label: "30d", aria: "Last 30 days" },
    { v: "all", label: "All", aria: "All time" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Activity window"
      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/60 p-1 text-xs shadow-sm backdrop-blur-md"
    >
      <CalendarDays className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          aria-label={o.aria}
          onClick={() => onChange(o.v)}
          className={`rounded-full px-2.5 py-1 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
            value === o.v
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Non-animated progress bar for virtualized rows (cheap re-render) */
function StaticProgressBar({ value }: { value: number }) {
  const tone =
    value >= 90
      ? "from-emerald-500 to-teal-500"
      : value >= 60
        ? "from-primary to-accent"
        : value >= 30
          ? "from-amber-500 to-orange-500"
          : "from-rose-500 to-red-500";
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary/70">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-foreground">
        {value}%
      </span>
    </div>
  );
}

const StatusBadge = memo(function StatusBadge({ status }: { status: StudentStatus }) {
  const map: Record<StudentStatus, { label: string; cls: string; dot: string }> = {
    "on-track": {
      label: "On Track",
      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    behind: {
      label: "Behind",
      cls: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    completed: {
      label: "Completed",
      cls: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300",
      dot: "bg-violet-500",
    },
    inactive: {
      label: "Inactive",
      cls: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
      dot: "bg-slate-400",
    },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
});

/* ------------------------------------------------------------------ */
/* Detail sheet                                                        */
/* ------------------------------------------------------------------ */

function StudentDetailSheet({
  student,
  onClose,
}: {
  student: Student | null;
  onClose: () => void;
}) {
  // Escape to close + focus trap entry
  useEffect(() => {
    if (!student) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [student, onClose]);

  return (
    <AnimatePresence>
      {student && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            key="sheet"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-detail-title"
            className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-[560px] flex-col border-l border-border/70 bg-card/95 shadow-2xl backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="relative overflow-hidden border-b border-border/60 p-5 sm:p-6">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-primary/25 via-accent/20 to-transparent blur-2xl"
              />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 text-lg font-semibold text-foreground">
                    {student.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Student profile
                    </div>
                    <h3
                      id="student-detail-title"
                      className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground"
                    >
                      {student.name}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{student.level}</span>
                      <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />
                      <span className="truncate">{student.routineTitle}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border/70 bg-secondary/60 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  aria-label="Close student detail"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="relative mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge status={student.status} />
                <Chip icon={Flame} tone="amber">
                  {student.streak} day streak
                </Chip>
                <Chip icon={Clock} tone="teal">
                  {student.todayHours.toFixed(1)}h today
                </Chip>
                <Chip icon={TrendingUp} tone="primary">
                  {student.progress}% complete
                </Chip>
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ProgressPanel label="Daily" data={student.daily} unit="h" />
                <ProgressPanel label="Weekly" data={student.weekly} unit="%" />
                <ProgressPanel label="Monthly" data={student.monthly} unit="%" />
              </div>

              <SectionTitle icon={ListChecks}>Chapters</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Completed" value={student.chapters.filter((c) => c.done).length} />
                <MiniStat
                  label="Remaining"
                  value={student.chapters.filter((c) => !c.done).length}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {student.chapters.map((c) => (
                  <li
                    key={c.name}
                    className={`flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm ${c.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    <span className="truncate">{c.name}</span>
                    {c.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Completed" />
                    ) : (
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-border"
                        aria-label="Pending"
                      />
                    )}
                  </li>
                ))}
              </ul>

              <SectionTitle icon={BookOpen}>Study output</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Study Hours" value={student.studyHoursTotal} suffix="h" />
                <MiniStat
                  label="MCQs"
                  value={student.mcqsCompleted}
                  suffix={`/${student.mcqsTotal}`}
                />
                <MiniStat
                  label="Quizzes"
                  value={student.quizCompleted}
                  suffix={`/${student.quizTotal}`}
                />
                <MiniStat
                  label="Mocks"
                  value={student.mockCompleted}
                  suffix={`/${student.mockTotal}`}
                />
              </div>

              <SectionTitle icon={CalendarDays}>Attendance timeline</SectionTitle>
              <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
                >
                  {student.attendance.map((d, i) => {
                    const intensity = d.present ? Math.max(0.25, Math.min(1, d.hours / 6)) : 0;
                    return (
                      <div
                        key={i}
                        title={`${d.day} · ${d.present ? `${d.hours}h` : "absent"}`}
                        className="aspect-square rounded-md border border-border/40"
                        style={{
                          background: d.present
                            ? `color-mix(in oklab, var(--primary) ${Math.round(intensity * 90)}%, transparent)`
                            : "transparent",
                        }}
                      />
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Last 14 days</span>
                  <span className="tabular-nums">
                    {student.attendance.filter((d) => d.present).length}/14 present ·{" "}
                    {student.missedDays} missed
                  </span>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </div>
  );
}

function MiniStat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
        {suffix && (
          <span className="ml-0.5 text-xs font-medium text-muted-foreground">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Chip({
  icon: Icon,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: "amber" | "teal" | "primary";
  children: React.ReactNode;
}) {
  const map = {
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400",
    primary: "border-primary/30 bg-primary/10 text-primary",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </span>
  );
}

function ProgressPanel({ label, data, unit }: { label: string; data: number[]; unit: string }) {
  const max = Math.max(1, ...data);
  const avg = Math.round((data.reduce((a, b) => a + b, 0) / data.length) * 10) / 10;
  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground tabular-nums">
          {avg}
          {unit}
        </span>
      </div>
      <div className="mt-2 flex h-16 items-end gap-1">
        {data.map((v, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${(v / max) * 100}%` }}
            transition={{ delay: i * 0.03, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 rounded-t-md bg-gradient-to-t from-primary/40 to-accent/70"
          />
        ))}
      </div>
    </div>
  );
}
