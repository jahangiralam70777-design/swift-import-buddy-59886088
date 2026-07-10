import { useMemo, useState } from "react";
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  Info,
  Medal,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { ProgressMap } from "@/lib/routine-progress";
import type { SharedRoutine } from "@/lib/routines-shared";
import {
  buildCalendarDays,
  computeBadges,
  computeOverallStatus,
  STATUS_LABEL,
  STATUS_TONE,
  type DayStatus,
} from "@/lib/routine-intelligence";

const BADGE_ICONS = {
  flame: Flame,
  trophy: Trophy,
  sparkles: Sparkles,
  crown: Crown,
  medal: Medal,
};

const DAY_TONE: Record<DayStatus, { bg: string; ring: string; label: string }> = {
  completed: {
    bg: "bg-emerald-500/85 text-white shadow-[0_0_10px_rgba(16,185,129,0.45)]",
    ring: "bg-emerald-500",
    label: "Completed",
  },
  partial: {
    bg: "bg-amber-400/85 text-amber-950 shadow-[0_0_10px_rgba(251,191,36,0.4)]",
    ring: "bg-amber-400",
    label: "Partial",
  },
  missed: {
    bg: "bg-rose-500/80 text-white shadow-[0_0_8px_rgba(244,63,94,0.4)]",
    ring: "bg-rose-500",
    label: "Missed",
  },
  future: {
    bg: "bg-muted/60 text-muted-foreground",
    ring: "bg-muted",
    label: "Upcoming",
  },
  outside: {
    bg: "bg-transparent text-muted-foreground/60",
    ring: "bg-muted/40",
    label: "Off",
  },
};

export function IntelligencePanel({
  routines,
  progressMap,
}: {
  routines: SharedRoutine[];
  progressMap: ProgressMap;
}) {
  const overall = useMemo(
    () => computeOverallStatus(routines, progressMap),
    [routines, progressMap],
  );
  const badges = useMemo(() => computeBadges(routines, progressMap), [routines, progressMap]);

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const days = useMemo(
    () => buildCalendarDays(routines, progressMap, monthCursor),
    [routines, progressMap, monthCursor],
  );

  const monthLabel = monthCursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const tone = STATUS_TONE[overall.status];
  const ratioPct = Math.round(overall.ratio * 100);

  return (
    <section className="mb-8 grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Verdict card */}
      <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-indigo-500/20 via-fuchsia-500/10 to-transparent blur-2xl"
          aria-hidden
        />
        <div className="relative">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> How you're doing
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
            {STATUS_LABEL[overall.status]}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {verdictSentence(overall.status, ratioPct, overall.actual, overall.expected)}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <MiniStat label="Expected" value={`${round1(overall.expected)}h`} />
            <MiniStat label="Actual" value={`${round1(overall.actual)}h`} accent />
            <MiniStat label="Pace" value={`${ratioPct}%`} />
          </div>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Schedule adherence</span>
              <span className="tabular-nums font-medium text-foreground">{ratioPct}%</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-emerald-500 transition-all duration-700"
                style={{ width: `${Math.min(150, ratioPct) / 1.5}%` }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 left-[66.6%] w-px bg-foreground/40"
                title="On track"
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>Behind</span>
              <span>On track</span>
              <span>Ahead</span>
            </div>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <Award className="h-3.5 w-3.5" /> Achievements
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {badges.filter((b) => b.earned).length}/{badges.length} earned
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          {badges.map((b) => {
            const Icon = BADGE_ICONS[b.icon];
            return (
              <li
                key={b.id}
                title={b.description}
                className={`group relative overflow-hidden rounded-xl border p-3 text-center transition-all duration-300 hover:-translate-y-0.5 ${
                  b.earned
                    ? "border-transparent bg-gradient-to-br text-white shadow-md " + b.tone
                    : "border-dashed border-border/60 bg-muted/30 text-muted-foreground"
                }`}
              >
                {b.earned && (
                  <div
                    className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/25 blur-xl"
                    aria-hidden
                  />
                )}
                <div className="relative flex flex-col items-center gap-1">
                  <Icon className={`h-5 w-5 ${b.earned ? "" : "opacity-60"}`} />
                  <div className="text-[11px] font-semibold leading-tight">{b.label}</div>
                  {!b.earned && (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border/60">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400"
                        style={{ width: `${Math.round(b.progress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Calendar heatmap */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Consistency Calendar
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthCursor(shiftMonth(monthCursor, -1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-[110px] text-center text-xs font-medium tabular-nums">
              {monthLabel}
            </div>
            <button
              type="button"
              onClick={() => setMonthCursor(shiftMonth(monthCursor, 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((c) => {
            const t = DAY_TONE[c.status];
            const inMonth = c.date.getMonth() === monthCursor.getMonth();
            return (
              <div
                key={c.iso}
                title={`${c.iso} · ${t.label}${c.target ? ` · ${round1(c.hours)}h / ${round1(c.target)}h` : ""}`}
                className={`relative flex aspect-square items-center justify-center rounded-md text-[10px] font-medium transition-transform duration-200 hover:scale-110 ${t.bg} ${
                  inMonth ? "" : "opacity-35"
                }`}
              >
                {c.date.getDate()}
              </div>
            );
          })}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground">
          {(["completed", "partial", "missed", "future"] as DayStatus[]).map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${DAY_TONE[k].ring}`} />
              {DAY_TONE[k].label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular-nums ${accent ? "text-indigo-500" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function shiftMonth(d: Date, delta: number) {
  const c = new Date(d);
  c.setMonth(c.getMonth() + delta);
  return c;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function verdictSentence(status: string, ratioPct: number, actual: number, expected: number) {
  const a = round1(actual);
  const e = round1(expected);
  switch (status) {
    case "completed_today":
      return `You've hit today's goal. You're at ${ratioPct}% of your assigned pace (${a}h of ${e}h expected).`;
    case "ahead":
      return `You're ahead — ${ratioPct}% of your assigned pace. Keep the momentum without burning out.`;
    case "on_track":
      return `You're right on schedule at ${ratioPct}% of pace. Consistency > intensity.`;
    case "behind":
      return `You're at ${ratioPct}% of pace — down ${Math.max(0, round1(e - a))}h. Small daily catch-ups will fix this fast.`;
    case "missed_today":
      return `No study logged today yet. Even 30 minutes protects your streak.`;
    case "upcoming":
      return `Your routine hasn't started yet. Get ready.`;
    default:
      return "";
  }
}
