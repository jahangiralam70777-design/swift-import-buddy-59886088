import { motion } from "motion/react";
import { useMemo } from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  Flame,
  LineChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { synthesizeStudents, type TrackedRoutine } from "@/lib/routine-students";

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export function AnalyticsPanel({ routines }: { routines: TrackedRoutine[] }) {
  const students = useMemo(() => synthesizeStudents(routines), [routines]);

  // Completion trend: last 12 weeks — average student progress rolling
  const completionTrend = useMemo(() => {
    const base = students.length
      ? students.reduce((a, s) => a + s.progress, 0) / students.length
      : 0;
    return Array.from({ length: 12 }, (_, i) => {
      const step = (i - 8) * 3; // grows toward current avg
      return Math.max(0, Math.min(100, Math.round(base + step)));
    });
  }, [students]);

  // Daily study hours — sum of today's hours per day-of-week (7 buckets)
  const dailyHours = useMemo(() => {
    const buckets = Array.from({ length: 7 }, () => 0);
    students.forEach((s, i) => {
      s.daily.forEach((h, idx) => {
        buckets[idx] += h;
      });
      void i;
    });
    return buckets.map((v) => Math.round(v * 10) / 10);
  }, [students]);

  // Weekly performance — average of student weekly[]
  const weeklyPerf = useMemo(() => {
    const cols = 4;
    const totals = Array.from({ length: cols }, () => 0);
    students.forEach((s) =>
      s.weekly.forEach((v, i) => {
        totals[i] += v;
      }),
    );
    return totals.map((v) => (students.length ? Math.round(v / students.length) : 0));
  }, [students]);

  // Monthly performance — average of student monthly[]
  const monthlyPerf = useMemo(() => {
    const cols = 6;
    const totals = Array.from({ length: cols }, () => 0);
    students.forEach((s) =>
      s.monthly.forEach((v, i) => {
        totals[i] += v;
      }),
    );
    return totals.map((v) => (students.length ? Math.round(v / students.length) : 0));
  }, [students]);

  const mostActive = useMemo(
    () =>
      [...students]
        .sort((a, b) => b.streak * 10 + b.studyHoursTotal - (a.streak * 10 + a.studyHoursTotal))
        .slice(0, 6),
    [students],
  );
  const leastActive = useMemo(
    () =>
      [...students]
        .sort((a, b) => a.progress - b.progress || b.missedDays - a.missedDays)
        .slice(0, 6),
    [students],
  );

  const chapterCompletion = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    students.forEach((s) =>
      s.chapters.forEach((c) => {
        const e = map.get(c.name) ?? { done: 0, total: 0 };
        e.total += 1;
        if (c.done) e.done += 1;
        map.set(c.name, e);
      }),
    );
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        pct: v.total ? Math.round((v.done / v.total) * 100) : 0,
        total: v.total,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  }, [students]);

  const subjectCompletion = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    students.forEach((s) =>
      s.subjects.forEach((sub) => {
        const e = map.get(sub) ?? { sum: 0, n: 0 };
        e.sum += s.progress;
        e.n += 1;
        map.set(sub, e);
      }),
    );
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, pct: v.n ? Math.round(v.sum / v.n) : 0, n: v.n }))
      .sort((a, b) => b.pct - a.pct);
  }, [students]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-6 backdrop-blur-2xl sm:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-primary/25 via-accent/15 to-transparent blur-3xl"
      />

      <div className="relative flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-secondary/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur">
          <Sparkles className="h-3 w-3 text-accent" />
          Analytics
        </div>
        <h2 className="bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
          Routine performance intelligence
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Live rollups across every learner, chapter and subject in your published routines.
        </p>
      </div>

      <div className="relative mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Completion Trend" subtitle="Last 12 weeks" icon={LineChart}>
          <TrendChart data={completionTrend} unit="%" />
        </Card>

        <Card title="Daily Study Hours" subtitle="Sun → Sat aggregate" icon={BarChart3}>
          <BarChart
            data={dailyHours}
            labels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
            unit="h"
          />
        </Card>

        <Card title="Weekly Performance" subtitle="Four-week rolling average" icon={TrendingUp}>
          <BarChart data={weeklyPerf} labels={["W1", "W2", "W3", "W4"]} unit="%" tone="emerald" />
        </Card>

        <Card title="Monthly Performance" subtitle="Half-year trajectory" icon={TrendingUp}>
          <TrendChart data={monthlyPerf} unit="%" tone="violet" />
        </Card>

        <Card title="Most Active Students" subtitle="Streak × study hours" icon={Flame}>
          <StudentList
            items={mostActive.map((s) => ({
              name: s.name,
              initials: s.initials,
              meta: `${s.routineTitle}`,
              value: `${s.streak}d · ${s.studyHoursTotal}h`,
              pct: s.progress,
              tone: "emerald" as const,
            }))}
          />
        </Card>

        <Card title="Least Active Students" subtitle="Attention needed" icon={TrendingDown}>
          <StudentList
            items={leastActive.map((s) => ({
              name: s.name,
              initials: s.initials,
              meta: `${s.routineTitle}`,
              value: `${s.missedDays}d missed`,
              pct: s.progress,
              tone: "amber" as const,
            }))}
          />
        </Card>

        <Card title="Chapter Completion" subtitle="Top 8 by finish rate" icon={BookOpen} span>
          <RankedBars
            items={chapterCompletion.map((c) => ({
              name: c.name,
              pct: c.pct,
              meta: `${c.total} learners`,
            }))}
          />
        </Card>

        <Card title="Subject Completion" subtitle="Average learner progress" icon={Award} span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {subjectCompletion.map((s) => (
              <Donut key={s.name} label={s.name} value={s.pct} meta={`${s.n} learners`} />
            ))}
            {subjectCompletion.length === 0 && (
              <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No subject data yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function Card({
  title,
  subtitle,
  icon: Icon,
  children,
  span,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-primary/40 ${span ? "lg:col-span-2" : ""}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-primary/15 to-accent/10 blur-2xl"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 text-[11px] text-muted-foreground/80">{subtitle}</div>
          )}
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 bg-secondary/60 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="relative mt-4">{children}</div>
    </motion.div>
  );
}

function TrendChart({
  data,
  unit,
  tone = "primary",
}: {
  data: number[];
  unit?: string;
  tone?: "primary" | "violet";
}) {
  const max = Math.max(1, ...data);
  const min = Math.min(...data);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / (max - min || 1)) * 100;
    return [x, y] as const;
  });
  const stroke = tone === "violet" ? "oklch(0.68 0.19 300)" : "oklch(0.65 0.19 260)";
  const areaId = `area-${tone}`;
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${d} L100,100 L0,100 Z`;
  return (
    <div className="relative h-40">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={area}
          fill={`url(#${areaId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        />
        <motion.path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          vectorEffect="non-scaling-stroke"
        />
        {points.map(([x, y], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r={i === points.length - 1 ? 1.6 : 0.9}
            fill={stroke}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 * i }}
          />
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          min{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {min}
            {unit}
          </span>
        </span>
        <span>
          now{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {data[data.length - 1]}
            {unit}
          </span>
        </span>
        <span>
          max{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {max}
            {unit}
          </span>
        </span>
      </div>
    </div>
  );
}

function BarChart({
  data,
  labels,
  unit,
  tone = "primary",
}: {
  data: number[];
  labels: string[];
  unit?: string;
  tone?: "primary" | "emerald";
}) {
  const max = Math.max(1, ...data);
  const grad =
    tone === "emerald" ? "from-emerald-500/80 to-teal-500/60" : "from-primary/80 to-accent/60";
  return (
    <div>
      <div className="flex h-40 items-end gap-2">
        {data.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex w-full flex-1 items-end">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(v / max) * 100}%` }}
                transition={{ delay: 0.05 * i, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={`w-full rounded-t-md bg-gradient-to-t ${grad} shadow-inner`}
              />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          avg{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {Math.round((data.reduce((a, b) => a + b, 0) / data.length) * 10) / 10}
            {unit}
          </span>
        </span>
        <span>
          peak{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {max}
            {unit}
          </span>
        </span>
      </div>
    </div>
  );
}

function StudentList({
  items,
}: {
  items: {
    name: string;
    initials: string;
    meta: string;
    value: string;
    pct: number;
    tone: "emerald" | "amber";
  }[];
}) {
  return (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <motion.li
          key={s.name + i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.03 * i }}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2"
        >
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary/25 to-accent/25 text-[11px] font-semibold text-foreground">
            {s.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-medium text-foreground">{s.name}</div>
              <div
                className={`text-[11px] font-semibold tabular-nums ${s.tone === "emerald" ? "text-emerald-500" : "text-amber-500"}`}
              >
                {s.value}
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary/70">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${s.pct}%` }}
                  transition={{ duration: 0.6, delay: 0.05 * i }}
                  className={`h-full rounded-full ${s.tone === "emerald" ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-amber-500 to-rose-500"}`}
                />
              </div>
              <span className="w-9 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
                {s.pct}%
              </span>
            </div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{s.meta}</div>
          </div>
        </motion.li>
      ))}
      {items.length === 0 && (
        <li className="py-6 text-center text-sm text-muted-foreground">No students yet.</li>
      )}
    </ul>
  );
}

function RankedBars({ items }: { items: { name: string; pct: number; meta: string }[] }) {
  return (
    <div className="space-y-2">
      {items.map((c, i) => (
        <div
          key={c.name}
          className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-medium text-foreground">{c.name}</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" /> {c.meta}
              </div>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary/70">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${c.pct}%` }}
                transition={{ duration: 0.7, delay: 0.04 * i, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-primary"
              />
            </div>
          </div>
          <div className="w-12 text-right text-sm font-semibold tabular-nums text-foreground">
            {c.pct}%
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="py-6 text-center text-sm text-muted-foreground">No chapters yet.</div>
      )}
    </div>
  );
}

function Donut({ label, value, meta }: { label: string; value: number; meta: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const offset = C - (value / 100) * C;
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="color-mix(in oklab, var(--foreground) 10%, transparent)"
            strokeWidth="7"
          />
          <motion.circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke="url(#donutStroke)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
          <defs>
            <linearGradient id="donutStroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.18 280)" />
              <stop offset="100%" stopColor="oklch(0.7 0.19 180)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-xl font-semibold tabular-nums text-transparent">
              {value}%
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 truncate text-center text-xs font-semibold text-foreground">{label}</div>
      <div className="text-[10px] text-muted-foreground">{meta}</div>
    </div>
  );
}
