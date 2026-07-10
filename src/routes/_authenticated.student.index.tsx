import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Database,
  FileText,
  ListChecks,
  LogOut,
  Moon,
  Pencil,
  Play,
  Rocket,
  Sparkles,
  Sun,
  Target,
  Timer,
  TrendingUp,
  User as UserIcon,
  XCircle,
} from "lucide-react";

import {
  getStudentDashboard,
  setExamCountdown as setExamCountdownFn,
  updateStudentName as updateStudentNameFn,
  type StudentDashboardData,
  type ExamCountdown,
  type ChapterActivity,
  type RoutineActivity,
} from "@/lib/student-dashboard.functions";

export const Route = createFileRoute("/_authenticated/student/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Student Panel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StudentDashboard,
});

/* ------------------------------------------------------------------ */
/* Adapters — map server payload to shape used by subcomponents        */
/* ------------------------------------------------------------------ */

type Countdown = ExamCountdown;

type Summary = {
  mcq: { done: number; total: number; wrong: number; lastAt: number };
  qbank: { done: number; total: number; wrong: number; lastAt: number };
  routine: { done: number; total: number; lastAt: number };
  overallPct: number;
  wrongTotal: number;
  lastCustomExam: { name: string; at: number } | null;
  chapters: ChapterActivity[];
  routines: RoutineActivity[];
  continueMcq: ChapterActivity | null;
  continueQb: ChapterActivity | null;
  continueRoutine: RoutineActivity | null;
  continueExam: { sessionId: string; title: string; at: number } | null;
  today: {
    mcqs: number;
    qbanks: number;
    completedTasks: number;
    plannedTasks: number;
    routinePct: number;
  };
};

function toSummary(d: StudentDashboardData): Summary {
  const continueMcq = d.continueTargets.find((t) => t.kind === "mcq") as
    | { kind: "mcq"; chapter: ChapterActivity }
    | undefined;
  const continueQb = d.continueTargets.find((t) => t.kind === "qbank") as
    | { kind: "qbank"; chapter: ChapterActivity }
    | undefined;
  const continueRoutine = d.continueTargets.find((t) => t.kind === "routine") as
    | { kind: "routine"; routine: RoutineActivity }
    | undefined;
  const continueExam = d.continueTargets.find((t) => t.kind === "custom-exam") as
    | { kind: "custom-exam"; sessionId: string; title: string; at: number }
    | undefined;
  const lastCustomActivity = d.recentActivity.find((a) => a.kind === "custom-exam");
  return {
    mcq: d.mcq,
    qbank: d.qbank,
    routine: d.routine,
    overallPct: d.overallPct,
    wrongTotal: d.wrongTotal,
    lastCustomExam: lastCustomActivity
      ? { name: lastCustomActivity.title, at: lastCustomActivity.at }
      : null,
    chapters: d.chapters,
    routines: d.routines,
    continueMcq: continueMcq?.chapter ?? null,
    continueQb: continueQb?.chapter ?? null,
    continueRoutine: continueRoutine?.routine ?? null,
    continueExam: continueExam
      ? { sessionId: continueExam.sessionId, title: continueExam.title, at: continueExam.at }
      : null,
    today: {
      mcqs: d.today.mcqs,
      qbanks: d.today.qbanks,
      completedTasks: d.today.completedTasks,
      plannedTasks: d.today.plannedTasks,
      routinePct: d.today.routinePct,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function useAnimatedNumber(target: number, duration = 900) {
  const [n, setN] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    fromRef.current = n;
    startRef.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return n;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatFullDate(d = new Date()) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  const w = Math.round(days / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ms).toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const DASHBOARD_KEY = ["student", "dashboard"] as const;

function StudentDashboard() {
  const qc = useQueryClient();
  const fetchDashboard = useServerFn(getStudentDashboard);
  const saveCountdown = useServerFn(setExamCountdownFn);
  const saveName = useServerFn(updateStudentNameFn);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: () => fetchDashboard(),
    staleTime: 30_000,
  });

  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  const summary = useMemo(() => (data ? toSummary(data) : null), [data]);
  const countdown = data?.examCountdown ?? null;
  const displayName = (data?.profile.fullName || "").trim() || "Student";

  const countdownMutation = useMutation({
    mutationFn: async (next: Countdown) => {
      if (next === null) return saveCountdown({ data: { clear: true } });
      return saveCountdown({ data: { name: next.name, dateISO: next.dateISO } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DASHBOARD_KEY }),
  });

  const nameMutation = useMutation({
    mutationFn: async (fullName: string) => saveName({ data: { fullName } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DASHBOARD_KEY }),
  });

  const now = useNow(1000);
  const hydrated = !isLoading && !!data;

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
      {/* Ambient luxe background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.72 0.19 265 / 0.35), transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 h-[420px] w-[720px] translate-x-1/3 translate-y-1/4 rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.72 0.2 330 / 0.35), transparent 70%)",
          }}
        />
      </div>

      <Header name={displayName} onSaveName={(n) => nameMutation.mutate(n)} />

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-600 dark:text-red-300">
          Failed to load dashboard: {(error as Error).message}.{" "}
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-1 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      <div className="mt-8 sm:mt-10">
        <CountdownCard
          value={countdown}
          now={now}
          onSave={(v) => countdownMutation.mutate(v)}
          hydrated={hydrated}
        />
      </div>

      <div className="mt-10 sm:mt-12">
        <SectionTitle icon={<Target className="h-4 w-4" />} title="Your progress" />
        <SummaryGrid summary={summary} hydrated={hydrated} />
      </div>

      <div className="mt-6 grid gap-4 sm:gap-5 lg:grid-cols-2">
        <TodayCard summary={summary} hydrated={hydrated} />
        <ContinueCard summary={summary} hydrated={hydrated} />
      </div>

      <div className="mt-12 sm:mt-14">
        <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Latest activity" />
        <LatestActivity summary={summary} hydrated={hydrated} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({ name, onSaveName }: { name: string; onSaveName: (n: string) => void }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === "dark";
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name === "Student" ? "" : name), [name]);

  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const initials =
    (name || "S")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "S";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {greeting(now)}
        </p>
        <h1 className="mt-2 truncate bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl lg:text-[42px]">
          {name}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{formatFullDate(now)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card/70 text-foreground shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-border hover:bg-accent hover:shadow-md active:translate-y-0"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border/60 bg-card/70 pl-1 pr-3 text-sm font-medium shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-border hover:bg-accent hover:shadow-md active:translate-y-0"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-semibold text-white shadow-md ring-1 ring-white/30">
              {initials}
            </span>
            <span className="hidden sm:inline">Profile</span>
          </button>

          {profileOpen && (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-2 w-64 origin-top-right rounded-2xl border border-border/60 bg-popover p-2 shadow-xl shadow-black/5 animate-in fade-in-0 zoom-in-95"
            >
              <div className="px-3 pb-2 pt-1">
                <div className="text-xs text-muted-foreground">Signed in as</div>
                {!editing ? (
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold">{name}</div>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Edit name"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <form
                    className="mt-1 flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSaveName(draft.trim());
                      setEditing(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Your name"
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                      maxLength={40}
                    />
                    <button
                      type="submit"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                      aria-label="Save name"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </div>
              <div className="my-1 h-px bg-border/60" />
              <MenuItem icon={<UserIcon className="h-4 w-4" />} to="/student/progress-tracker">
                Progress tracker
              </MenuItem>
              <MenuItem icon={<CalendarClock className="h-4 w-4" />} to="/student/routine-tracker">
                Routine tracker
              </MenuItem>
              <div className="my-1 h-px bg-border/60" />
              <MenuItem icon={<LogOut className="h-4 w-4" />} to="/login">
                Sign out
              </MenuItem>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  to,
  children,
}: {
  icon: React.ReactNode;
  to: "/student/progress-tracker" | "/student/routine-tracker" | "/login";
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground/90 transition hover:bg-accent"
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Countdown                                                           */
/* ------------------------------------------------------------------ */

function CountdownCard({
  value,
  now,
  onSave,
  hydrated,
}: {
  value: Countdown;
  now: number;
  onSave: (v: Countdown) => void;
  hydrated: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value?.name ?? "");
  const [date, setDate] = useState(value?.dateISO ?? "");

  useEffect(() => {
    setName(value?.name ?? "");
    setDate(value?.dateISO ?? "");
  }, [value]);

  const parts = useMemo(() => {
    if (!value?.dateISO) return null;
    const target = new Date(value.dateISO + "T00:00:00").getTime();
    const diff = target - now;
    if (isNaN(target)) return null;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, past: true };
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    const seconds = Math.floor((diff % 60_000) / 1000);
    return { days, hours, minutes, seconds, past: false };
  }, [value, now]);

  const showForm = editing || !value;

  return (
    <div className="group/countdown relative overflow-hidden rounded-[28px] border border-white/40 bg-card/70 shadow-[0_20px_60px_-20px_oklch(0.2_0.05_265/0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-card/40">
      {/* Sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 320px at 0% 0%, oklch(0.72 0.19 265 / 0.22), transparent 60%), radial-gradient(900px 280px at 100% 100%, oklch(0.72 0.2 330 / 0.20), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20"
      />
      <div className="relative p-6 sm:p-8 lg:p-10">
        {!hydrated ? (
          <div className="space-y-4">
            <div className="h-6 w-48 animate-pulse rounded-full bg-muted/50" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/40" />
              ))}
            </div>
          </div>
        ) : showForm ? (
          <CountdownForm
            name={name}
            date={date}
            setName={setName}
            setDate={setDate}
            hasValue={!!value}
            onCancel={() => {
              setEditing(false);
              setName(value?.name ?? "");
              setDate(value?.dateISO ?? "");
            }}
            onSave={() => {
              const cleanName = name.trim();
              if (!cleanName || !date) return;
              onSave({ name: cleanName, dateISO: date });
              setEditing(false);
            }}
            onClear={() => {
              onSave(null);
              setEditing(false);
            }}
          />
        ) : (
          <CountdownDisplay value={value!} parts={parts} onEdit={() => setEditing(true)} />
        )}
      </div>
    </div>
  );
}

function CountdownForm({
  name,
  date,
  setName,
  setDate,
  hasValue,
  onSave,
  onCancel,
  onClear,
}: {
  name: string;
  date: string;
  setName: (v: string) => void;
  setDate: (v: string) => void;
  hasValue: boolean;
  onSave: () => void;
  onCancel: () => void;
  onClear: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const canSave = name.trim().length > 0 && date >= today;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave();
      }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/20">
          <CalendarClock className="h-4 w-4" />
        </span>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Exam countdown
          </div>
          <div className="text-lg font-semibold tracking-tight">
            {hasValue ? "Edit your exam" : "Set your upcoming exam"}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. HSC Physics 1st Paper"
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:ring-2 focus:ring-ring/40"
          maxLength={80}
        />
        <input
          type="date"
          min={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-ring/40"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
          {hasValue && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border/60 px-4 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {hasValue && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
          >
            Remove countdown
          </button>
        </div>
      )}
    </form>
  );
}

function CountdownDisplay({
  value,
  parts,
  onEdit,
}: {
  value: NonNullable<Countdown>;
  parts: { days: number; hours: number; minutes: number; seconds: number; past: boolean } | null;
  onEdit: () => void;
}) {
  const dateLabel = new Date(value.dateISO + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/20">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Exam countdown
              </div>
              <div className="truncate text-lg font-semibold tracking-tight">{value.name}</div>
            </div>
          </div>
          <div className="mt-1 pl-11 text-xs text-muted-foreground">{dateLabel}</div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 text-xs font-medium text-foreground transition hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TimeBox label="Days" value={parts?.days ?? 0} />
        <TimeBox label="Hours" value={parts?.hours ?? 0} />
        <TimeBox label="Minutes" value={parts?.minutes ?? 0} />
        <TimeBox label="Seconds" value={parts?.seconds ?? 0} live />
      </div>

      {parts?.past && (
        <div className="mt-4 rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
          Your exam date has passed. Set a new one to keep the countdown going.
        </div>
      )}
    </div>
  );
}

function TimeBox({ label, value, live }: { label: string; value: number; live?: boolean }) {
  return (
    <div className="group/box relative overflow-hidden rounded-2xl border border-white/50 bg-white/60 px-4 py-5 text-center shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/box:opacity-100"
        style={{
          background:
            "radial-gradient(200px 80px at 50% 0%, oklch(0.72 0.19 265 / 0.18), transparent 70%)",
        }}
      />
      <div className="relative tabular-nums text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
        {String(value).padStart(2, "0")}
      </div>
      <div className="relative mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
        {live && (
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle shadow-[0_0_8px_oklch(0.72_0.18_155)]" />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summary Grid                                                        */
/* ------------------------------------------------------------------ */

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-card/70 text-foreground/70 shadow-sm backdrop-blur">
        {icon}
      </span>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
        {title}
      </h2>
      <div className="ml-1 h-px flex-1 bg-gradient-to-r from-border/70 to-transparent" />
    </div>
  );
}

type CardTo =
  | "/student/mcq-practice"
  | "/student/qns-bank-practice"
  | "/student/routine-tracker"
  | "/student/wrong-answers"
  | "/student/bookmarks"
  | "/student/custom-exam"
  | "/student/progress-tracker";

function SummaryGrid({ summary, hydrated }: { summary: Summary | null; hydrated: boolean }) {
  if (!hydrated || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        to="/student/progress-tracker"
        icon={<TrendingUp className="h-4 w-4" />}
        label="Overall progress"
        value={summary.overallPct}
        unit="%"
        pct={summary.overallPct}
        accent="from-indigo-500 to-fuchsia-500"
      />
      <StatCard
        to="/student/mcq-practice"
        icon={<ListChecks className="h-4 w-4" />}
        label="MCQs completed"
        value={summary.mcq.done}
        unit={` / ${summary.mcq.total}`}
        pct={summary.mcq.total > 0 ? Math.round((summary.mcq.done / summary.mcq.total) * 100) : 0}
        accent="from-sky-500 to-indigo-500"
      />
      <StatCard
        to="/student/qns-bank-practice"
        icon={<Database className="h-4 w-4" />}
        label="Question bank"
        value={summary.qbank.done}
        unit={` / ${summary.qbank.total}`}
        pct={
          summary.qbank.total > 0 ? Math.round((summary.qbank.done / summary.qbank.total) * 100) : 0
        }
        accent="from-emerald-500 to-teal-500"
      />
      <StatCard
        to="/student/routine-tracker"
        icon={<CalendarClock className="h-4 w-4" />}
        label="Routine completion"
        value={summary.routine.done}
        unit={` / ${summary.routine.total}`}
        pct={
          summary.routine.total > 0
            ? Math.round((summary.routine.done / summary.routine.total) * 100)
            : 0
        }
        accent="from-amber-500 to-orange-500"
      />
      <StatCard
        to="/student/wrong-answers"
        icon={<XCircle className="h-4 w-4" />}
        label="Wrong questions"
        value={summary.wrongTotal}
        unit=""
        pct={
          summary.mcq.done + summary.qbank.done > 0
            ? Math.round(
                (summary.wrongTotal / Math.max(1, summary.mcq.done + summary.qbank.done)) * 100,
              )
            : 0
        }
        accent="from-rose-500 to-red-500"
        muted
      />
    </div>
  );
}

function StatCard({
  to,
  icon,
  label,
  value,
  unit,
  pct,
  accent,
  muted,
}: {
  to: CardTo;
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  pct: number;
  accent: string;
  muted?: boolean;
}) {
  const animated = useAnimatedNumber(value);
  return (
    <Link
      to={to}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/50 bg-card/70 p-5 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/80 hover:shadow-xl hover:shadow-black/10 dark:border-white/10 dark:bg-card/50 dark:hover:border-white/20"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br ${accent} opacity-0 transition-opacity duration-500 group-hover:opacity-[0.06]`}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10"
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-md ring-1 ring-white/30 transition-transform duration-300 group-hover:scale-110`}
          >
            {icon}
          </span>
          <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-all duration-300 group-hover:translate-x-1 group-hover:text-foreground" />
      </div>

      <div className="relative mt-6 flex items-baseline gap-1.5">
        <span className="tabular-nums text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {animated.toLocaleString()}
        </span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </div>

      <div className="relative mt-5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/70 ring-1 ring-inset ring-black/[0.03] dark:ring-white/5">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${accent} shadow-[0_0_12px_-2px_currentColor] transition-[width] duration-1000 ease-out`}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%`, opacity: muted ? 0.7 : 1 }}
          />
        </div>
        <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {pct}% complete
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Today                                                               */
/* ------------------------------------------------------------------ */

function TodayCard({ summary, hydrated }: { summary: Summary | null; hydrated: boolean }) {
  if (!hydrated || !summary) {
    return (
      <div className="h-48 animate-pulse rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20" />
    );
  }
  const t = summary.today;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/50 bg-card/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-card/50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(500px 160px at 100% 0%, oklch(0.72 0.16 170 / 0.14), transparent 60%)",
        }}
      />
      <div className="relative flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md ring-1 ring-white/30">
          <Timer className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold tracking-tight">Today's progress</div>
          <div className="text-xs text-muted-foreground">Live from your routine tracker</div>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-3 gap-3">
        <TodayStat label="MCQs" value={t.mcqs.toLocaleString()} />
        <TodayStat label="Q-Bank" value={t.qbanks.toLocaleString()} />
        <TodayStat label="Routine" value={`${t.routinePct}%`} />
      </div>

      <div className="relative mt-5 h-2 w-full overflow-hidden rounded-full bg-muted/70 ring-1 ring-inset ring-black/[0.03] dark:ring-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_12px_-2px_oklch(0.72_0.16_170)] transition-[width] duration-1000 ease-out"
          style={{ width: `${t.routinePct}%` }}
        />
      </div>
      <div className="relative mt-2 text-[11px] text-muted-foreground">
        {t.plannedTasks > 0
          ? `${t.completedTasks} of ${t.plannedTasks} daily tasks done today`
          : "No daily routine planned for today"}
      </div>
    </div>
  );
}

function TodayStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/50 bg-white/60 px-3 py-3.5 text-center shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04]">
      <div className="tabular-nums text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Continue Learning                                                   */
/* ------------------------------------------------------------------ */

function ContinueCard({ summary, hydrated }: { summary: Summary | null; hydrated: boolean }) {
  if (!hydrated || !summary) {
    return (
      <div className="h-48 animate-pulse rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20" />
    );
  }

  const items: {
    to: CardTo;
    icon: React.ReactNode;
    label: string;
    title: string;
    subtitle: string;
    accent: string;
  }[] = [];

  if (summary.continueExam) {
    items.push({
      to: "/student/custom-exam",
      icon: <FileText className="h-4 w-4" />,
      label: "Custom Exam",
      title: summary.continueExam.title,
      subtitle: "Resume in progress",
      accent: "from-fuchsia-500 to-pink-500",
    });
  }
  if (summary.continueMcq) {
    items.push({
      to: "/student/mcq-practice",
      icon: <ListChecks className="h-4 w-4" />,
      label: "MCQ Practice",
      title: summary.continueMcq.chapterName,
      subtitle: `${summary.continueMcq.subjectName} · ${summary.continueMcq.done}/${summary.continueMcq.total}`,
      accent: "from-sky-500 to-indigo-500",
    });
  }
  if (summary.continueQb) {
    items.push({
      to: "/student/qns-bank-practice",
      icon: <Database className="h-4 w-4" />,
      label: "Question Bank",
      title: summary.continueQb.chapterName,
      subtitle: `${summary.continueQb.subjectName} · ${summary.continueQb.done}/${summary.continueQb.total}`,
      accent: "from-emerald-500 to-teal-500",
    });
  }
  if (summary.continueRoutine) {
    const remaining = Math.max(
      0,
      summary.continueRoutine.totalTasks - summary.continueRoutine.completedTasks,
    );
    items.push({
      to: "/student/routine-tracker",
      icon: <CalendarClock className="h-4 w-4" />,
      label: "Routine",
      title: summary.continueRoutine.title,
      subtitle:
        remaining > 0
          ? `${remaining} task${remaining === 1 ? "" : "s"} left`
          : "All tasks done — great work",
      accent: "from-amber-500 to-orange-500",
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/50 bg-card/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-card/50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(500px 160px at 100% 0%, oklch(0.72 0.19 320 / 0.14), transparent 60%)",
        }}
      />
      <div className="relative flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md ring-1 ring-white/30">
          <Rocket className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold tracking-tight">Continue learning</div>
          <div className="text-xs text-muted-foreground">Pick up where you left off</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="relative mt-6 rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-8 text-center">
          <div className="text-sm font-medium text-foreground">Nothing in progress yet</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Start a chapter and it'll appear here.
          </div>
        </div>
      ) : (
        <ul className="relative mt-5 space-y-2">
          {items.map((it) => (
            <li key={it.label}>
              <Link
                to={it.to}
                className="group flex items-center gap-3 rounded-xl border border-white/50 bg-white/60 px-3 py-3 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white/80 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04]"
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${it.accent} text-white shadow-md ring-1 ring-white/30 transition-transform group-hover:scale-110`}
                >
                  {it.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {it.label}
                  </div>
                  <div className="truncate text-sm font-semibold text-foreground">{it.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{it.subtitle}</div>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground transition-all group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md">
                  <Play className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Latest activity (top 5)                                             */
/* ------------------------------------------------------------------ */

type ActivityItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  subtitle?: string;
  at: number;
  to: CardTo;
};

function LatestActivity({ summary, hydrated }: { summary: Summary | null; hydrated: boolean }) {
  if (!hydrated || !summary) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl border border-border/60 bg-gradient-to-r from-muted/40 to-muted/20"
          />
        ))}
      </div>
    );
  }

  const items: ActivityItem[] = [];

  for (const ch of summary.chapters) {
    items.push({
      key: `${ch.source}-${ch.chapterName}-${ch.at}`,
      icon:
        ch.source === "qbank" ? (
          <Database className="h-4 w-4" />
        ) : (
          <ListChecks className="h-4 w-4" />
        ),
      label: ch.source === "qbank" ? "Question Bank Practice" : "MCQ Practice",
      title: ch.chapterName,
      subtitle: `${ch.subjectName} · ${ch.done}/${ch.total}`,
      at: ch.at,
      to: ch.source === "qbank" ? "/student/qns-bank-practice" : "/student/mcq-practice",
    });
  }

  for (const r of summary.routines) {
    if (r.at <= 0) continue;
    items.push({
      key: `routine-${r.id}-${r.at}`,
      icon: <CalendarClock className="h-4 w-4" />,
      label: "Routine update",
      title: r.title,
      subtitle: `${r.completedTasks}/${r.totalTasks} tasks`,
      at: r.at,
      to: "/student/routine-tracker",
    });
  }

  if (summary.lastCustomExam) {
    items.push({
      key: `exam-${summary.lastCustomExam.at}`,
      icon: <FileText className="h-4 w-4" />,
      label: "Custom exam",
      title: summary.lastCustomExam.name,
      at: summary.lastCustomExam.at,
      to: "/student/mcq-practice",
    });
  }

  const top = items.sort((a, b) => b.at - a.at).slice(0, 5);

  if (top.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 px-5 py-10 text-center backdrop-blur">
        <div className="text-sm font-medium text-foreground">No activity yet</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Practice a chapter or update a routine to see it here.
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-white/50 bg-card/70 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-card/50">
      {top.map((it) => (
        <li key={it.key}>
          <Link
            to={it.to}
            className="group flex items-center gap-4 px-5 py-4 transition-all hover:bg-accent/40"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-foreground/70 shadow-sm transition-all group-hover:scale-110 group-hover:border-transparent group-hover:bg-gradient-to-br group-hover:from-indigo-500 group-hover:to-fuchsia-500 group-hover:text-white">
              {it.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {it.label}
              </div>
              <div className="truncate text-sm font-semibold text-foreground">{it.title}</div>
              {it.subtitle && (
                <div className="truncate text-[11px] text-muted-foreground">{it.subtitle}</div>
              )}
            </div>
            <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {formatRelativeTime(it.at)}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-1 group-hover:text-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
