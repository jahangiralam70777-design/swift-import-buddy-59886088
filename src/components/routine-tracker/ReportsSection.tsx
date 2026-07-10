import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  CalendarIcon,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  ListChecks,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";
import type { DailyLog, ProgressMap, TaskStatus } from "@/lib/routine-progress";
import { tasksForRoutine, type SharedRoutine } from "@/lib/routines-shared";

type Range = "daily" | "weekly" | "d15" | "d30" | "d45" | "monthly" | "custom";

const RANGE_OPTIONS: { key: Range; label: string; days: number | null }[] = [
  { key: "daily", label: "Daily", days: 1 },
  { key: "weekly", label: "Weekly", days: 7 },
  { key: "d15", label: "15 Days", days: 15 },
  { key: "d30", label: "30 Days", days: 30 },
  { key: "d45", label: "45 Days", days: 45 },
  { key: "monthly", label: "Monthly", days: 30 },
  { key: "custom", label: "Custom", days: null },
];

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function short(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysBetween(start: Date, end: Date) {
  const out: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (cur <= stop) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

const PIE_COLORS = [
  "oklch(0.68 0.19 30)",
  "oklch(0.72 0.17 150)",
  "oklch(0.7 0.18 260)",
  "oklch(0.75 0.15 90)",
  "oklch(0.68 0.19 330)",
  "oklch(0.72 0.16 210)",
];

export function ReportsSection({
  routines,
  progressMap,
}: {
  routines: SharedRoutine[];
  progressMap: ProgressMap;
}) {
  const [range, setRange] = useState<Range>("d30");
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(addDays(today, -14));
  const [customTo, setCustomTo] = useState<Date | undefined>(today);

  const { from, to } = useMemo(() => {
    if (range === "custom") {
      const f = customFrom ?? addDays(today, -14);
      const t = customTo ?? today;
      return f <= t ? { from: f, to: t } : { from: t, to: f };
    }
    const opt = RANGE_OPTIONS.find((o) => o.key === range)!;
    const days = opt.days ?? 30;
    return { from: addDays(today, -(days - 1)), to: today };
  }, [range, customFrom, customTo, today]);

  const report = useMemo(
    () => buildReport(routines, progressMap, from, to),
    [routines, progressMap, from, to],
  );

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Reports
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Progress Reports</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {short(from)} — {short(to)} · {daysBetween(from, to).length} days
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-xl border border-border/60 bg-card p-1 shadow-sm">
            {RANGE_OPTIONS.filter((o) => o.key !== "custom").map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setRange(o.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  range === o.key
                    ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRange("custom")}
                className={cn(
                  "h-9 justify-start gap-2 text-xs",
                  range === "custom" && "border-indigo-500/60 bg-indigo-500/10",
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {range === "custom" && customFrom && customTo
                  ? `${short(customFrom)} → ${short(customTo)}`
                  : "Custom range"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <div className="flex flex-col gap-2 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  From
                </div>
                <Calendar
                  mode="single"
                  selected={customFrom}
                  onSelect={(d) => {
                    if (d) {
                      setCustomFrom(d);
                      setRange("custom");
                    }
                  }}
                  className={cn("pointer-events-auto rounded-md border border-border/60 p-2")}
                />
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">To</div>
                <Calendar
                  mode="single"
                  selected={customTo}
                  onSelect={(d) => {
                    if (d) {
                      setCustomTo(d);
                      setRange("custom");
                    }
                  }}
                  className={cn("pointer-events-auto rounded-md border border-border/60 p-2")}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <ReportStat
          icon={Target}
          label="Assigned Hours"
          value={`${round1(report.assignedH)}h`}
          tone="text-indigo-500"
          bg="from-indigo-500/15 to-transparent"
        />
        <ReportStat
          icon={Clock}
          label="Completed Hours"
          value={`${round1(report.completedH)}h`}
          tone="text-emerald-500"
          bg="from-emerald-500/15 to-transparent"
        />
        <ReportStat
          icon={TrendingUp}
          label="Completion %"
          value={`${report.completionPct}%`}
          tone="text-fuchsia-500"
          bg="from-fuchsia-500/15 to-transparent"
        />
        <ReportStat
          icon={ListChecks}
          label="Completed MCQs"
          value={`${report.mcqs}`}
          tone="text-sky-500"
          bg="from-sky-500/15 to-transparent"
        />
        <ReportStat
          icon={BookOpen}
          label="Completed Chapters"
          value={`${report.chapters}`}
          tone="text-teal-500"
          bg="from-teal-500/15 to-transparent"
        />
        <ReportStat
          icon={XCircle}
          label="Missed Days"
          value={`${report.missedDays}`}
          tone="text-amber-500"
          bg="from-amber-500/15 to-transparent"
        />
        <ReportStat
          icon={Flame}
          label="Current Streak"
          value={`${report.currentStreak}d`}
          tone="text-orange-500"
          bg="from-orange-500/15 to-transparent"
        />
        <ReportStat
          icon={Trophy}
          label="Longest Streak"
          value={`${report.longestStreak}d`}
          tone="text-rose-500"
          bg="from-rose-500/15 to-transparent"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Study Hours" subtitle="Assigned vs. completed per day">
          {report.series.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={report.series} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gAssigned" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.18 260)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.7 0.18 260)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDone" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.17 150)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="oklch(0.72 0.17 150)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" fontSize={10} stroke="var(--color-muted-foreground)" />
                <YAxis fontSize={10} stroke="var(--color-muted-foreground)" />
                <Tooltip content={<TT />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="assigned"
                  name="Assigned"
                  stroke="oklch(0.7 0.18 260)"
                  fill="url(#gAssigned)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="oklch(0.72 0.17 150)"
                  fill="url(#gDone)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Completion %" subtitle="Daily completion ratio">
          {report.series.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={report.series} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" fontSize={10} stroke="var(--color-muted-foreground)" />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  fontSize={10}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip content={<TT suffix="%" />} />
                <Line
                  type="monotone"
                  dataKey="pct"
                  name="Completion"
                  stroke="oklch(0.68 0.22 320)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Routine Consistency" subtitle="Active days out of range">
          {report.consistency.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={report.consistency}
                margin={{ left: -10, right: 8, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  stroke="var(--color-muted-foreground)"
                  interval={0}
                  angle={-12}
                  height={40}
                />
                <YAxis
                  unit="%"
                  domain={[0, 100]}
                  fontSize={10}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip content={<TT suffix="%" />} />
                <Bar dataKey="pct" name="Consistency" radius={[6, 6, 0, 0]}>
                  {report.consistency.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Subject Progress" subtitle="Share of completed study hours">
          {report.subjectBreakdown.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Tooltip content={<TT suffix="h" />} />
                <Pie
                  data={report.subjectBreakdown}
                  dataKey="hours"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {report.subjectBreakdown.map((_, i) => (
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                      stroke="var(--color-card)"
                    />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Chapter Progress" subtitle="Completed hours per chapter" wide>
          {report.chapterBreakdown.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                layout="vertical"
                data={report.chapterBreakdown}
                margin={{ left: 40, right: 8, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" fontSize={10} stroke="var(--color-muted-foreground)" />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={10}
                  width={110}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip content={<TT suffix="h" />} />
                <Bar dataKey="hours" name="Hours" radius={[0, 6, 6, 0]}>
                  {report.chapterBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Insights */}
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          label="Most Productive Subject"
          value={report.insights.mostProductiveSubject?.name ?? "—"}
          detail={
            report.insights.mostProductiveSubject
              ? `${round1(report.insights.mostProductiveSubject.hours)}h logged`
              : "No activity yet"
          }
          tone="from-emerald-500/20 to-transparent border-emerald-500/30"
          accent="text-emerald-500"
        />
        <InsightCard
          icon={TrendingDown}
          label="Least Practiced Subject"
          value={report.insights.leastPracticedSubject?.name ?? "—"}
          detail={
            report.insights.leastPracticedSubject
              ? `${round1(report.insights.leastPracticedSubject.hours)}h logged`
              : "No activity yet"
          }
          tone="from-amber-500/20 to-transparent border-amber-500/30"
          accent="text-amber-500"
        />
        <InsightCard
          icon={Layers}
          label="Most Missed Chapter"
          value={report.insights.mostMissedChapter?.name ?? "—"}
          detail={
            report.insights.mostMissedChapter
              ? `${report.insights.mostMissedChapter.missed} missed day${report.insights.mostMissedChapter.missed === 1 ? "" : "s"}`
              : "Nothing missed"
          }
          tone="from-rose-500/20 to-transparent border-rose-500/30"
          accent="text-rose-500"
        />
        <InsightCard
          icon={CheckCircle2}
          label="Best Day"
          value={report.insights.bestDay ? short(new Date(report.insights.bestDay.date)) : "—"}
          detail={
            report.insights.bestDay
              ? `${round1(report.insights.bestDay.completed)}h studied`
              : "No study logged"
          }
          tone="from-indigo-500/20 to-transparent border-indigo-500/30"
          accent="text-indigo-500"
        />
        <InsightCard
          icon={Flame}
          label="Consistency Score"
          value={`${report.insights.consistencyScore}%`}
          detail={`${report.insights.activeDays} of ${daysBetween(from, to).length} days active`}
          tone="from-orange-500/20 to-transparent border-orange-500/30"
          accent="text-orange-500"
        />
        <InsightCard
          icon={Sparkles}
          label="Avg Daily Hours"
          value={`${round1(report.insights.avgDailyHours)}h`}
          detail={`${report.insights.avgDailyMcqs} MCQs · ${report.insights.avgDailyChapters} chapters`}
          tone="from-fuchsia-500/20 to-transparent border-fuchsia-500/30"
          accent="text-fuchsia-500"
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Report computation                                                   */
/* ------------------------------------------------------------------ */

type DaySeries = {
  date: string;
  label: string;
  assigned: number;
  completed: number;
  pct: number;
  mcqs: number;
  chapters: number;
};

function buildReport(routines: SharedRoutine[], progressMap: ProgressMap, from: Date, to: Date) {
  const days = daysBetween(from, to);
  const activeRoutines = routines.filter((r) => r.status === "active");

  // Filter routines active within window based on their start/end dates too
  const withinRange = activeRoutines.filter((r) => {
    const s = new Date(r.startDate);
    const e = new Date(r.endDate);
    return s <= to && e >= from;
  });

  const dailyAssignedH = withinRange.reduce(
    (s, r) => (r.type === "daily" ? s + r.hoursPerDay : s),
    0,
  );
  const weeklyAssignedH = withinRange.reduce(
    (s, r) => (r.type === "weekly" ? s + r.hoursPerDay : s),
    0,
  );

  const series: DaySeries[] = days.map((d) => {
    const iso = toISO(d);
    let completed = 0;
    let mcqs = 0;
    let chapters = 0;
    for (const r of withinRange) {
      const log: DailyLog | undefined = progressMap[r.id]?.dailyLogs[iso];
      if (log) {
        completed += log.hours;
        mcqs += log.mcqs;
        chapters += log.chapters;
      }
    }
    // Assigned per day: daily routines always, weekly ones only on Sunday
    const isSunday = d.getDay() === 0;
    const assigned = dailyAssignedH + (isSunday ? weeklyAssignedH : 0);
    const pct = assigned > 0 ? Math.min(100, Math.round((completed / assigned) * 100)) : 0;
    return {
      date: iso,
      label: short(d),
      assigned: round1(assigned),
      completed: round1(completed),
      pct,
      mcqs,
      chapters,
    };
  });

  const assignedH = series.reduce((s, x) => s + x.assigned, 0);
  const completedH = series.reduce((s, x) => s + x.completed, 0);
  const totalMcqs = series.reduce((s, x) => s + x.mcqs, 0);
  const totalChapters = series.reduce((s, x) => s + x.chapters, 0);
  const completionPct =
    assignedH > 0 ? Math.min(100, Math.round((completedH / assignedH) * 100)) : 0;

  const activeDaysSet = new Set(
    series.filter((s) => s.completed > 0 || s.mcqs > 0 || s.chapters > 0).map((s) => s.date),
  );
  const missedDays = series.filter((s) => s.assigned > 0 && !activeDaysSet.has(s.date)).length;

  // Streaks across window
  let cur = 0;
  let longest = 0;
  for (const s of series) {
    if (activeDaysSet.has(s.date)) {
      cur += 1;
      longest = Math.max(longest, cur);
    } else {
      cur = 0;
    }
  }
  // Current streak: tail run ending at 'to'
  let currentStreak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (activeDaysSet.has(series[i].date)) currentStreak += 1;
    else break;
  }

  // Consistency per routine
  const consistency = withinRange.map((r) => {
    const logs = progressMap[r.id]?.dailyLogs ?? {};
    const activeCount = days.filter((d) => {
      const l = logs[toISO(d)];
      return l && (l.hours > 0 || l.mcqs > 0 || l.chapters > 0);
    }).length;
    return {
      name: truncate(r.title, 14),
      pct: days.length ? Math.round((activeCount / days.length) * 100) : 0,
      routineId: r.id,
    };
  });

  // Subject + chapter buckets: sum completed hours from logs, weighted by task completion
  const subjectMap = new Map<string, number>();
  const chapterMap = new Map<string, number>();
  const chapterMissedMap = new Map<string, number>();

  for (const r of withinRange) {
    const logs = progressMap[r.id]?.dailyLogs ?? {};
    const statuses: Record<string, TaskStatus> = progressMap[r.id]?.taskStatuses ?? {};
    let hoursInWindow = 0;
    for (const d of days) {
      const l = logs[toISO(d)];
      if (l) hoursInWindow += l.hours;
    }
    if (r.subject) subjectMap.set(r.subject, (subjectMap.get(r.subject) ?? 0) + hoursInWindow);
    if (r.chapter) chapterMap.set(r.chapter, (chapterMap.get(r.chapter) ?? 0) + hoursInWindow);

    // Missed days per chapter: days assigned but no activity
    if (r.chapter && r.type === "daily") {
      const missed = days.filter((d) => {
        const iso = toISO(d);
        const l = logs[iso];
        return !(l && (l.hours > 0 || l.mcqs > 0 || l.chapters > 0));
      }).length;
      chapterMissedMap.set(r.chapter, (chapterMissedMap.get(r.chapter) ?? 0) + missed);
    }

    // Include planned tasks completed as extra chapter signal
    const doneTasks = tasksForRoutine(r).filter((t) => statuses[t.id] === "completed");
    if (r.chapter && doneTasks.length > 0) {
      chapterMap.set(
        r.chapter,
        (chapterMap.get(r.chapter) ?? 0) + doneTasks.reduce((s, t) => s + t.hours, 0) * 0, // avoid double-count; kept for future weighting
      );
    }
  }

  const subjectBreakdown = Array.from(subjectMap.entries())
    .map(([name, hours]) => ({ name, hours: round1(hours) }))
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const chapterBreakdown = Array.from(chapterMap.entries())
    .map(([name, hours]) => ({ name, hours: round1(hours) }))
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  // Insights
  const mostProductiveSubject = subjectBreakdown[0] ?? null;
  const leastPracticedSubject =
    subjectBreakdown.length > 1 ? subjectBreakdown[subjectBreakdown.length - 1] : null;
  const missedRanked = Array.from(chapterMissedMap.entries())
    .map(([name, missed]) => ({ name, missed }))
    .filter((x) => x.missed > 0)
    .sort((a, b) => b.missed - a.missed);
  const mostMissedChapter = missedRanked[0] ?? null;

  const bestDay = series.reduce<DaySeries | null>(
    (best, s) => (s.completed > (best?.completed ?? 0) ? s : best),
    null,
  );
  const activeDays = activeDaysSet.size;
  const consistencyScore = days.length ? Math.round((activeDays / days.length) * 100) : 0;
  const activeDayCount = Math.max(1, activeDays);
  const avgDailyHours = completedH / activeDayCount;
  const avgDailyMcqs = Math.round(totalMcqs / activeDayCount);
  const avgDailyChapters = Math.round(totalChapters / activeDayCount);

  return {
    series,
    assignedH,
    completedH,
    completionPct,
    mcqs: totalMcqs,
    chapters: totalChapters,
    missedDays,
    currentStreak,
    longestStreak: longest,
    consistency,
    subjectBreakdown,
    chapterBreakdown,
    insights: {
      mostProductiveSubject,
      leastPracticedSubject,
      mostMissedChapter,
      bestDay,
      consistencyScore,
      activeDays,
      avgDailyHours,
      avgDailyMcqs,
      avgDailyChapters,
    },
  };
}

/* ------------------------------------------------------------------ */
/* UI sub-components                                                   */
/* ------------------------------------------------------------------ */

function ReportStat({
  icon: Icon,
  label,
  value,
  tone,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
  bg: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className={`absolute inset-0 bg-gradient-to-br ${bg}`} aria-hidden />
      <div className="relative">
        <Icon className={`mb-2 h-4 w-4 ${tone}`} />
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border/60 bg-card p-5 shadow-sm ${wide ? "lg:col-span-2" : ""}`}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
      No activity in this range yet — log study to see it here.
    </div>
  );
}

function InsightCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone: string;
  accent: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm bg-gradient-to-br ${tone}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg bg-background/60 ${accent}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="text-lg font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function TT({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string | number;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="tabular-nums font-medium">
            {p.value}
            {suffix ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
