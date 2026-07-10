import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Activity,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  Layers,
  ListTodo,
  PlayCircle,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useMyRoutines, tasksForRoutine, type SharedRoutine } from "@/lib/routines-shared";
import {
  emptyDailyLog,
  todayISO,
  useRoutineProgress,
  type DailyLog,
  type TaskStatus,
} from "@/lib/routine-progress";
import { ReportsSection } from "@/components/routine-tracker/ReportsSection";
import { IntelligencePanel } from "@/components/routine-tracker/IntelligencePanel";
import { computeRoutineStatus, STATUS_LABEL, STATUS_TONE } from "@/lib/routine-intelligence";

export const Route = createFileRoute("/_authenticated/student/routine-tracker")({
  head: () => ({
    meta: [
      { title: "Routine Tracker — Student Panel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RoutineTrackerPage,
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<
  TaskStatus,
  { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }
> = {
  not_started: {
    label: "Not Started",
    tone: "text-muted-foreground bg-muted/60 border-border",
    icon: Circle,
  },
  in_progress: {
    label: "In Progress",
    tone: "text-indigo-500 bg-indigo-500/10 border-indigo-500/30",
    icon: PlayCircle,
  },
  completed: {
    label: "Completed",
    tone: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    icon: CheckCircle2,
  },
};

function routineStatusLabel(pct: number) {
  if (pct >= 100) return STATUS_META.completed;
  if (pct > 0) return STATUS_META.in_progress;
  return STATUS_META.not_started;
}

function formatDuration(r: SharedRoutine) {
  const start = new Date(r.startDate);
  const end = new Date(r.endDate);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  if (days >= 30) return `${Math.round(days / 30)} mo`;
  return `${days} days`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function RoutineTrackerPage() {
  const { routines: myRoutines, isLoading: routinesLoading } = useMyRoutines();
  const assigned = useMemo(() => myRoutines.filter((r) => r.status === "active"), [myRoutines]);

  const {
    map: progressMap,
    get,
    hydrated: progressHydrated,
    setTaskStatus,
    updateDailyLog,
  } = useRoutineProgress();
  const hydrated = progressHydrated && !routinesLoading;
  const [viewing, setViewing] = useState<SharedRoutine | null>(null);
  const [updating, setUpdating] = useState<SharedRoutine | null>(null);

  // Per-routine derived stats
  const perRoutine = useMemo(() => {
    return assigned.map((r) => {
      const tasks = tasksForRoutine(r);
      const p = get(r.id);
      const totalH = tasks.reduce((s, t) => s + t.hours, 0);
      const doneCount = tasks.filter((t) => p.taskStatuses[t.id] === "completed").length;
      const inProgCount = tasks.filter((t) => p.taskStatuses[t.id] === "in_progress").length;
      const doneH = tasks
        .filter((t) => p.taskStatuses[t.id] === "completed")
        .reduce((s, t) => s + t.hours, 0);
      const pct = totalH ? Math.round((doneH / totalH) * 100) : 0;
      const todayLog = p.dailyLogs[todayISO()] ?? emptyDailyLog();
      return {
        r,
        tasks,
        progress: p,
        totalH,
        doneH,
        pct,
        doneCount,
        inProgCount,
        pendingCount: tasks.length - doneCount - inProgCount,
        todayLog,
      };
    });
  }, [assigned, get]);

  // Global stats
  const stats = useMemo(() => {
    let completedH = 0;
    let totalH = 0;
    let completedTasks = 0;
    let pendingTasks = 0;
    let bestStreak = 0;
    let sumPct = 0;
    let todaysTasksTotal = 0;
    let todaysTasksDone = 0;
    let todaysHoursTarget = 0;
    let todaysHoursDone = 0;

    for (const p of perRoutine) {
      totalH += p.totalH;
      completedH += p.doneH;
      completedTasks += p.doneCount;
      pendingTasks += p.pendingCount + p.inProgCount;
      bestStreak = Math.max(bestStreak, p.progress.streak);
      sumPct += p.pct;

      if (p.r.type === "daily") {
        todaysHoursTarget += p.r.hoursPerDay;
        todaysTasksTotal += p.tasks.length;
        todaysHoursDone += p.todayLog.hours;
        todaysTasksDone += p.tasks.filter(
          (t) => p.progress.taskStatuses[t.id] === "completed",
        ).length;
      }
    }

    return {
      completedH: round1(completedH + perRoutine.reduce((s, p) => s + p.todayLog.hours, 0)),
      totalH: round1(totalH),
      remainingH: round1(Math.max(0, totalH - completedH)),
      completedTasks,
      pendingTasks,
      bestStreak,
      avgPct: perRoutine.length ? Math.round(sumPct / perRoutine.length) : 0,
      todaysTasksTotal,
      todaysTasksDone,
      todaysHoursTarget: round1(todaysHoursTarget),
      todaysHoursDone: round1(todaysHoursDone),
      todaysPct:
        todaysHoursTarget > 0
          ? Math.min(100, Math.round((todaysHoursDone / todaysHoursTarget) * 100))
          : 0,
    };
  }, [perRoutine]);

  // Aggregates by level / subject / chapter
  const groupAgg = useMemo(() => {
    function bucketify(key: (r: SharedRoutine) => string | undefined) {
      const buckets = new Map<string, { doneH: number; totalH: number }>();
      for (const p of perRoutine) {
        const k = key(p.r);
        if (!k) continue;
        const b = buckets.get(k) ?? { doneH: 0, totalH: 0 };
        b.doneH += p.doneH;
        b.totalH += p.totalH;
        buckets.set(k, b);
      }
      return Array.from(buckets.entries())
        .map(([name, v]) => ({
          name,
          pct: v.totalH ? Math.round((v.doneH / v.totalH) * 100) : 0,
        }))
        .sort((a, b) => b.pct - a.pct);
    }
    return {
      level: bucketify((r) => r.level),
      subject: bucketify((r) => r.subject),
      chapter: bucketify((r) => r.chapter),
    };
  }, [perRoutine]);

  const currentRoutine = perRoutine[0]?.r.title ?? "—";

  return (
    <div className="min-w-0 p-4 sm:p-6 md:p-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Student Panel
          </div>
          <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl md:text-4xl">
            Routine Tracker
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Your daily study rhythm — designed for focused CA prep.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <HeaderChip
            icon={BookOpen}
            label="Current Routine"
            value={truncate(currentRoutine, 28)}
          />
          <HeaderChip
            icon={Target}
            label="Today's Goal"
            value={`${stats.todaysHoursDone}/${stats.todaysHoursTarget || 0} h`}
          />
          <HeaderChip icon={TrendingUp} label="Completion" value={`${stats.avgPct}%`} />
        </div>
      </header>

      {/* Summary cards */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard
          icon={CalendarClock}
          label="Today's Routine"
          value={`${stats.todaysTasksDone}/${stats.todaysTasksTotal}`}
          hint="tasks today"
          tone="from-indigo-500/20 via-indigo-500/5 to-transparent"
          accent="text-indigo-500"
        />
        <StatCard
          icon={Flame}
          label="Current Streak"
          value={`${stats.bestStreak}`}
          hint="days"
          tone="from-orange-500/20 via-orange-500/5 to-transparent"
          accent="text-orange-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Completion %"
          value={`${stats.avgPct}%`}
          hint="overall"
          tone="from-fuchsia-500/20 via-fuchsia-500/5 to-transparent"
          accent="text-fuchsia-500"
        />
        <StatCard
          icon={Clock}
          label="Completed Hours"
          value={`${stats.completedH}h`}
          hint="logged"
          tone="from-emerald-500/20 via-emerald-500/5 to-transparent"
          accent="text-emerald-500"
        />
        <StatCard
          icon={Activity}
          label="Remaining Hours"
          value={`${stats.remainingH}h`}
          hint="to finish"
          tone="from-sky-500/20 via-sky-500/5 to-transparent"
          accent="text-sky-500"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed Tasks"
          value={`${stats.completedTasks}`}
          hint="finished"
          tone="from-teal-500/20 via-teal-500/5 to-transparent"
          accent="text-teal-500"
        />
        <StatCard
          icon={ListTodo}
          label="Pending Tasks"
          value={`${stats.pendingTasks}`}
          hint="remaining"
          tone="from-amber-500/20 via-amber-500/5 to-transparent"
          accent="text-amber-500"
        />
      </section>

      {/* Today's ring + aggregates */}
      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg lg:col-span-1">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-500/20 via-fuchsia-500/10 to-transparent blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-70"
            aria-hidden
          />
          <div className="relative mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Today's Progress
          </div>
          <div className="relative flex flex-col items-center">
            <Ring value={stats.todaysPct} size={148} stroke={12} color="oklch(0.65 0.22 280)" />
            <div className="mt-4 text-center text-xs text-muted-foreground">
              <div>
                <span className="font-semibold text-foreground tabular-nums">
                  {stats.todaysHoursDone}h
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {stats.todaysHoursTarget}h
                </span>{" "}
                today
              </div>
              <div className="mt-0.5 tabular-nums">
                {stats.todaysTasksDone}/{stats.todaysTasksTotal} tasks
              </div>
            </div>
          </div>
        </div>

        <AggregateCard title="Level Progress" items={groupAgg.level} color="oklch(0.68 0.19 30)" />
        <AggregateCard
          title="Subject Progress"
          items={groupAgg.subject}
          color="oklch(0.72 0.17 150)"
        />
        <AggregateCard
          title="Chapter Progress"
          items={groupAgg.chapter}
          color="oklch(0.7 0.18 260)"
        />
      </section>

      {hydrated && <IntelligencePanel routines={assigned} progressMap={progressMap} />}

      {/* Assigned Routines */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">Assigned Routines</h2>
          <span className="rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            {perRoutine.length} routine{perRoutine.length === 1 ? "" : "s"}
          </span>
        </div>

        {!hydrated ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-2xl border border-border/60 bg-gradient-to-br from-muted/60 to-muted/20"
              />
            ))}
          </div>
        ) : perRoutine.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center text-sm text-muted-foreground">
            No routines assigned yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {perRoutine.map((p, idx) => {
              const sched = computeRoutineStatus(p.r, p.progress);
              return (
                <article
                  key={p.r.id}
                  style={{ animationDelay: `${idx * 50}ms` }}
                  className="group relative animate-fade-in overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-border hover:shadow-xl"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-1 opacity-90 transition-opacity group-hover:opacity-100"
                    style={{ background: p.r.accent }}
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
                    style={{ background: p.r.accent }}
                    aria-hidden
                  />
                  <div className="relative mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold tracking-tight sm:text-[15px]">
                        {p.r.title}
                      </h3>
                      {p.r.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {p.r.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[sched.status]}`}
                    >
                      {STATUS_LABEL[sched.status]}
                    </span>
                  </div>

                  <dl className="relative mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <Meta label="Level" value={p.r.level} />
                    <Meta label="Subject" value={p.r.subject ?? "—"} />
                    <Meta label="Chapter" value={p.r.chapter ?? "—"} />
                    <Meta label="Duration" value={formatDuration(p.r)} />
                    <Meta label="Study Hours" value={`${p.r.hoursPerDay}h / day`} />
                    <Meta label="Total" value={`${round1(p.totalH)}h`} />
                  </dl>

                  <PremiumBar pct={p.pct} accent={p.r.accent} />

                  <div className="relative mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewing(p.r)}
                      className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-accent/60 active:translate-y-0"
                    >
                      View Routine
                    </button>
                    <button
                      type="button"
                      onClick={() => setUpdating(p.r)}
                      className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-fuchsia-500/25 active:translate-y-0"
                    >
                      Update Progress
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {hydrated && <ReportsSection routines={assigned} progressMap={progressMap} />}

      {viewing && <ViewDialog routine={viewing} onClose={() => setViewing(null)} />}
      {updating && (
        <UpdateDialog
          routine={updating}
          onClose={() => setUpdating(null)}
          progress={get(updating.id)}
          setTaskStatus={setTaskStatus}
          updateDailyLog={updateDailyLog}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function HeaderChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: string;
  accent: string;
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
        <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {hint}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* Premium gradient bar with shine */
function PremiumBar({
  pct,
  accent,
  label = "Progress",
}: {
  pct: number;
  accent: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{clamped}%</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="relative h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, ${accent}, oklch(0.82 0.14 320))`,
            boxShadow: `0 0 12px ${accent}`,
          }}
        >
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-full bg-white/25 blur-[6px]" />
        </div>
      </div>
    </div>
  );
}

/* Circular progress ring */
function Ring({
  value,
  size = 96,
  stroke = 10,
  color,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  label?: string;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDisplay(value));
    return () => cancelAnimationFrame(t);
  }, [value]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, display));
  const offset = c - (clamped / 100) * c;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 700ms ease-out",
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-semibold tabular-nums">{Math.round(clamped)}%</div>
        {label && (
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}

function AggregateCard({
  title,
  items,
  color,
}: {
  title: string;
  items: { name: string; pct: number }[];
  color: string;
}) {
  const avg = items.length ? Math.round(items.reduce((s, i) => s + i.pct, 0) / items.length) : 0;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        <Ring value={avg} size={44} stroke={5} color={color} />
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-4 text-center text-xs text-muted-foreground">
          No data yet
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 4).map((i) => (
            <li key={i.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate pr-2">{i.name}</span>
                <span className="tabular-nums font-medium">{i.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${i.pct}%`, background: color, boxShadow: `0 0 6px ${color}` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------- Dialogs -------- */

function DialogShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl animate-scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function ViewDialog({ routine, onClose }: { routine: SharedRoutine; onClose: () => void }) {
  const tasks = tasksForRoutine(routine);
  return (
    <DialogShell title={routine.title} onClose={onClose}>
      {routine.description && (
        <p className="mb-4 text-sm text-muted-foreground">{routine.description}</p>
      )}
      <dl className="mb-5 grid grid-cols-2 gap-3 text-xs">
        <Meta label="Level" value={routine.level} />
        <Meta label="Subject" value={routine.subject ?? "—"} />
        <Meta label="Chapter" value={routine.chapter ?? "—"} />
        <Meta label="Type" value={routine.type} />
        <Meta label="Study / day" value={`${routine.hoursPerDay}h`} />
        <Meta label="Duration" value={formatDuration(routine)} />
        <Meta label="Start" value={routine.startDate} />
        <Meta label="End" value={routine.endDate} />
      </dl>
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> Tasks in this routine
        </div>
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            >
              <span className="truncate">{t.title}</span>
              <span className="ml-3 shrink-0 text-xs text-muted-foreground">{t.hours}h</span>
            </li>
          ))}
        </ul>
      </div>
    </DialogShell>
  );
}

const NOTES_MAX = 1000;

function UpdateDialog({
  routine,
  onClose,
  progress,
  setTaskStatus,
  updateDailyLog,
}: {
  routine: SharedRoutine;
  onClose: () => void;
  progress: {
    taskStatuses: Record<string, TaskStatus>;
    dailyLogs: Record<string, DailyLog>;
    streak: number;
  };
  setTaskStatus: (routineId: string, taskId: string, status: TaskStatus) => void;
  updateDailyLog: (routineId: string, patch: Partial<DailyLog>) => void;
}) {
  const tasks = tasksForRoutine(routine);
  const today = todayISO();
  const log = progress.dailyLogs[today] ?? emptyDailyLog();

  // Local form state for numeric inputs so typing feels instant + validated
  const [hours, setHours] = useState<string>(String(log.hours || ""));
  const [mcqs, setMcqs] = useState<string>(String(log.mcqs || ""));
  const [chapters, setChapters] = useState<string>(String(log.chapters || ""));
  const [notes, setNotes] = useState<string>(log.notes);
  const [err, setErr] = useState<string | null>(null);

  // Live push into store on change
  useEffect(() => {
    const h = clampNum(hours, 0, 24);
    const m = clampInt(mcqs, 0, 100000);
    const c = clampInt(chapters, 0, 10000);
    const n = notes.slice(0, NOTES_MAX);
    if (h.error || m.error || c.error) {
      setErr(h.error ?? m.error ?? c.error ?? null);
      return;
    }
    setErr(null);
    // Only push if values differ from stored
    if (
      h.value !== log.hours ||
      m.value !== log.mcqs ||
      c.value !== log.chapters ||
      n !== log.notes
    ) {
      updateDailyLog(routine.id, { hours: h.value, mcqs: m.value, chapters: c.value, notes: n });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, mcqs, chapters, notes]);

  const totalH = tasks.reduce((s, t) => s + t.hours, 0);
  const doneH = tasks
    .filter((t) => progress.taskStatuses[t.id] === "completed")
    .reduce((s, t) => s + t.hours, 0);
  const routinePct = totalH ? Math.round((doneH / totalH) * 100) : 0;
  const todayPct = Math.min(
    100,
    Math.round(((log.hours || 0) / Math.max(0.1, routine.hoursPerDay)) * 100),
  );

  return (
    <DialogShell title={`Update Today · ${routine.title}`} onClose={onClose} wide>
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="flex flex-col items-center rounded-xl border border-border/60 bg-background p-3">
          <Ring value={todayPct} size={92} stroke={8} color="oklch(0.65 0.22 280)" />
          <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Today
          </div>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-border/60 bg-background p-3">
          <Ring value={routinePct} size={92} stroke={8} color={routine.accent} />
          <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Routine
          </div>
        </div>
        <div className="col-span-2 flex flex-col justify-center rounded-xl border border-border/60 bg-background p-3 sm:col-span-1">
          <div className="text-xs text-muted-foreground">Streak</div>
          <div className="mt-1 flex items-baseline gap-1">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-2xl font-semibold tabular-nums">{progress.streak}</span>
            <span className="text-xs text-muted-foreground">days</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Editing: <span className="font-medium text-foreground">{today}</span>
          </div>
        </div>
      </div>

      {/* Today's manual entry */}
      <div className="mb-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Today's log
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumField
            label="Study Hours"
            value={hours}
            onChange={setHours}
            step="0.1"
            max={24}
            suffix="h"
          />
          <NumField label="Completed MCQs" value={mcqs} onChange={setMcqs} step="1" max={100000} />
          <NumField
            label="Completed Chapters"
            value={chapters}
            onChange={setChapters}
            step="1"
            max={10000}
          />
        </div>
        <label className="mt-3 block">
          <div className="mb-1 text-xs text-muted-foreground">Notes (optional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
            rows={3}
            placeholder="What did you focus on today?"
            className="w-full resize-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
          />
          <div className="mt-1 flex justify-end text-[10px] text-muted-foreground">
            {notes.length}/{NOTES_MAX}
          </div>
        </label>
        {err && (
          <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Today's tasks
        </div>
        <ul className="space-y-2">
          {tasks.map((t) => {
            const s = progress.taskStatuses[t.id] ?? "not_started";
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
              >
                <span
                  className={`flex-1 min-w-0 truncate text-sm ${s === "completed" ? "text-muted-foreground line-through" : ""}`}
                >
                  {t.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.hours}h</span>
                <StatusToggle
                  value={s}
                  onChange={(next) => setTaskStatus(routine.id, t.id, next)}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-fuchsia-500/25"
        >
          Done
        </button>
      </div>
    </DialogShell>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
  max,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 pr-8 text-sm tabular-nums outline-none transition-all focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function StatusToggle({
  value,
  onChange,
}: {
  value: TaskStatus;
  onChange: (v: TaskStatus) => void;
}) {
  const order: TaskStatus[] = ["not_started", "in_progress", "completed"];
  return (
    <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
      {order.map((k) => {
        const meta = STATUS_META[k];
        const Icon = meta.icon;
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            title={meta.label}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
              active ? `${meta.tone} border` : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Validation helpers */
function clampNum(raw: string, min: number, max: number): { value: number; error: string | null } {
  if (raw === "" || raw === "-") return { value: 0, error: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: 0, error: "Enter a valid number" };
  if (n < min) return { value: min, error: `Must be ≥ ${min}` };
  if (n > max) return { value: max, error: `Must be ≤ ${max}` };
  return { value: n, error: null };
}
function clampInt(raw: string, min: number, max: number) {
  const r = clampNum(raw, min, max);
  return { value: Math.round(r.value), error: r.error };
}
