import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Archive,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Copy,
  Eye,
  Filter,
  Home,
  Loader2,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  archiveRoutines,
  createRoutine,
  deleteRoutines,
  duplicateRoutine,
  getRoutineStats,
  listRoutines,
  listRoutineStudents,
  updateRoutine,
  type RoutineRow,
  type RoutineStudentRow,
} from "@/lib/routine.functions";
import { getAcademicTree } from "@/lib/academic.functions";

type AcademicOptions = {
  levels: string[];
  subjectsByLevel: Record<string, string[]>;
  chaptersBySubject: Record<string, string[]>;
  isLoading: boolean;
};

function useAcademicOptions(): AcademicOptions {
  const fetchTree = useServerFn(getAcademicTree);
  const q = useQuery({
    queryKey: ["academic", "tree"] as const,
    queryFn: () => fetchTree(),
    staleTime: 60_000,
  });
  return useMemo(() => {
    const tree = q.data ?? [];
    const levels: string[] = [];
    const subjectsByLevel: Record<string, string[]> = {};
    const chaptersBySubject: Record<string, string[]> = {};
    for (const l of tree) {
      levels.push(l.name);
      const subs: string[] = [];
      for (const s of l.subjects) {
        subs.push(s.name);
        chaptersBySubject[s.name] = s.chapters.map((c) => c.name);
      }
      subjectsByLevel[l.name] = subs;
    }
    return { levels, subjectsByLevel, chaptersBySubject, isLoading: q.isLoading };
  }, [q.data, q.isLoading]);
}

export const Route = createFileRoute("/_authenticated/admin/routine-manager")({
  head: () => ({
    meta: [
      { title: "Routine Manager — Admin Console" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RoutineManagerPage,
});

/* ------------------------------------------------------------------ */
/* Types + reference data                                              */
/* ------------------------------------------------------------------ */

type RStatus = "active" | "inactive";
type RoutineType = "daily" | "weekly" | "monthly" | "custom";

type Routine = RoutineRow;

const ACCENTS = [
  "oklch(0.68 0.19 30)",
  "oklch(0.66 0.16 165)",
  "oklch(0.62 0.18 265)",
  "oklch(0.72 0.16 60)",
  "oklch(0.66 0.19 320)",
  "oklch(0.6 0.14 210)",
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const LIST_KEY = ["admin", "routines", "list"] as const;
const STATS_KEY = ["admin", "routines", "stats"] as const;
const STUDENTS_KEY = ["admin", "routines", "students"] as const;

function RoutineManagerPage() {
  const [editing, setEditing] = useState<Routine | null>(null);
  const [viewing, setViewing] = useState<Routine | null>(null);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const dQuery = useDebouncedValue(query, 300);

  const academic = useAcademicOptions();
  const listFn = useServerFn(listRoutines);
  const statsFn = useServerFn(getRoutineStats);

  const listQuery = useQuery({
    queryKey: [...LIST_KEY, dQuery, levelFilter, statusFilter, page],
    queryFn: () =>
      listFn({
        data: {
          page,
          pageSize: 20,
          level: levelFilter || null,
          status: (statusFilter as "active" | "inactive" | null) || null,
          search: dQuery.trim() || null,
          sort: "newest",
        },
      }),
    placeholderData: (prev) => prev,
  });

  const statsQuery = useQuery({
    queryKey: STATS_KEY,
    queryFn: () => statsFn(),
  });

  const routines = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;

  const stats = statsQuery.data;

  return (
    <div className="space-y-10 pb-16">
      <PageHeader />

      <Section
        eyebrow="01 · Overview"
        title="Snapshot"
        description="Live signals from every routine you're running right now."
      >
        <OverviewGrid
          totalRoutines={stats?.total ?? 0}
          active={stats?.active ?? 0}
          upcoming={stats?.upcoming ?? 0}
          completed={stats?.completed ?? 0}
          archived={stats?.archived ?? 0}
          studentsFollowing={stats?.studentsFollowing ?? 0}
          avgCompletion={stats?.avgCompletion ?? 0}
        />
      </Section>

      <Section
        eyebrow="02 · Create routine"
        title="Design a new study routine"
        description="Fewer fields, faster shipping — publish a routine in under a minute."
      >
        <CreateRoutineCard
          editing={editing}
          onDoneEditing={() => setEditing(null)}
          academic={academic}
        />
      </Section>

      <Section
        eyebrow="03 · Routine list"
        title="All routines"
        description="Search, filter and manage every routine in one clean table."
      >
        <RoutineListCard
          routines={routines}
          total={total}
          page={page}
          totalPages={totalPages}
          loading={listQuery.isFetching}
          query={query}
          onQueryChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          levelFilter={levelFilter}
          onLevelFilterChange={(v) => {
            setLevelFilter(v);
            setPage(1);
          }}
          statusFilter={statusFilter}
          onStatusFilterChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          onPageChange={setPage}
          onView={setViewing}
          onEdit={(r) => {
            setEditing(r);
            document
              .getElementById("routine-create")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          levels={academic.levels}
        />
      </Section>

      <Section
        eyebrow="04 · Routine progress"
        title="Student progress"
        description="How real students are moving through every active routine."
      >
        <ProgressCard />
      </Section>

      <ViewRoutineDialog routine={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header + Section shell                                              */
/* ------------------------------------------------------------------ */

function PageHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 backdrop-blur-2xl sm:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-gradient-to-br from-primary/20 via-accent/15 to-transparent blur-3xl"
      />
      <nav className="relative flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <Home className="h-3 w-3" />
          Admin
        </Link>
        <ChevronRight className="h-3 w-3 opacity-60" />
        <span className="text-foreground">Routine Manager</span>
      </nav>

      <div className="relative mt-4 flex flex-col gap-3">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur">
          <Sparkles className="h-3 w-3 text-accent" />
          Academic operations
        </div>
        <h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
          Routine Manager
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A calm, focused space to plan, publish and observe every study routine your students
          follow. Real-time metrics stream from the backend below.
        </p>
      </div>
    </motion.div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-right">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function OverviewGrid(props: {
  totalRoutines: number;
  active: number;
  upcoming: number;
  completed: number;
  archived: number;
  studentsFollowing: number;
  avgCompletion: number;
}) {
  const cards = [
    {
      label: "Total routines",
      value: props.totalRoutines,
      icon: BookOpen,
      accent: "from-primary/25 to-transparent",
    },
    {
      label: "Active",
      value: props.active,
      icon: Activity,
      accent: "from-emerald-400/25 to-transparent",
    },
    {
      label: "Upcoming",
      value: props.upcoming,
      icon: CalendarClock,
      accent: "from-sky-400/25 to-transparent",
    },
    {
      label: "Completed",
      value: props.completed,
      icon: CheckCircle2,
      accent: "from-violet-400/25 to-transparent",
    },
    {
      label: "Archived",
      value: props.archived,
      icon: Archive,
      accent: "from-muted/40 to-transparent",
    },
    {
      label: "Students following",
      value: props.studentsFollowing,
      icon: Users,
      accent: "from-fuchsia-400/25 to-transparent",
    },
    {
      label: "Avg completion",
      value: props.avgCompletion,
      suffix: "%",
      icon: Sparkles,
      accent: "from-amber-300/25 to-transparent",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-sm backdrop-blur-2xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
        >
          <div
            aria-hidden
            className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${c.accent} blur-2xl`}
          />
          <div className="relative flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {c.label}
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-background/50 text-muted-foreground transition-colors group-hover:text-foreground">
              <c.icon className="h-4 w-4" />
            </div>
          </div>
          <div className="relative mt-6 flex items-baseline gap-1">
            <span className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-4xl font-semibold tracking-tight text-transparent">
              <AnimatedCounter value={c.value} />
            </span>
            {c.suffix && (
              <span className="text-base font-medium text-muted-foreground">{c.suffix}</span>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = display;
    const duration = 800;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const rounded = Math.round(display);
  return <>{rounded.toLocaleString()}</>;
}

/* ------------------------------------------------------------------ */
/* Create routine                                                      */
/* ------------------------------------------------------------------ */

type FormState = {
  title: string;
  description: string;
  level: string;
  subject: string;
  chapter: string;
  type: RoutineType;
  hoursPerDay: string;
  startDate: string;
  endDate: string;
  status: RStatus;
  targetMcqs: string;
  targetChapters: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  level: "",
  subject: "",
  chapter: "",
  type: "daily",
  hoursPerDay: "2",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  status: "active",
  targetMcqs: "",
  targetChapters: "",
};

function CreateRoutineCard({
  editing,
  onDoneEditing,
  academic,
}: {
  editing: Routine | null;
  onDoneEditing: () => void;
  academic: AcademicOptions;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qc = useQueryClient();
  const createFn = useServerFn(createRoutine);
  const updateFn = useServerFn(updateRoutine);

  const createMut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (input: any) => createFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
  const updateMut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (input: any) => updateFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });

  useEffect(() => {
    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description ?? "",
        level: editing.level ?? "",
        subject: editing.subject ?? "",
        chapter: editing.chapter ?? "",
        type: editing.type,
        hoursPerDay: String(editing.hoursPerDay),
        startDate: editing.startDate,
        endDate: editing.endDate,
        status: editing.status,
        targetMcqs: editing.targetMcqs != null ? String(editing.targetMcqs) : "",
        targetChapters: editing.targetChapters != null ? String(editing.targetChapters) : "",
      });
      setAdvanced(true);
    }
  }, [editing]);

  const subjects = form.level ? (academic.subjectsByLevel[form.level] ?? []) : [];
  const chapters = form.subject ? (academic.chaptersBySubject[form.subject] ?? []) : [];

  const reset = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setAdvanced(false);
    if (editing) onDoneEditing();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Please give this routine a title.");
    if (!form.level) return setError("Choose a level.");
    if (!form.startDate || !form.endDate) return setError("Pick a start and end date.");
    if (form.endDate < form.startDate) return setError("End date can't be before start date.");
    setError(null);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      level: form.level,
      subject: form.subject || null,
      chapter: form.chapter || null,
      type: form.type,
      hoursPerDay: Number(form.hoursPerDay) || 1,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      targetMcqs: form.targetMcqs ? Number(form.targetMcqs) : null,
      targetChapters: form.targetChapters ? Number(form.targetChapters) : null,
      accent: editing?.accent ?? ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
    };

    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createMut.mutateAsync(payload);
      }
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save routine.");
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <form
      id="routine-create"
      onSubmit={submit}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-sm backdrop-blur-2xl sm:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-gradient-to-br from-primary/15 via-accent/10 to-transparent blur-3xl"
      />

      <div className="relative grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Level" required>
          <Select
            value={form.level}
            onChange={(v) => setForm((f) => ({ ...f, level: v, subject: "", chapter: "" }))}
            options={academic.levels.map((l) => ({ value: l, label: l }))}
            placeholder={academic.levels.length ? "Choose a level" : "No levels — add in Academic Manager"}
          />
        </Field>

        <Field label="Subject" hint="Optional">
          <Select
            value={form.subject}
            onChange={(v) => setForm((f) => ({ ...f, subject: v, chapter: "" }))}
            options={subjects.map((s) => ({ value: s, label: s }))}
            placeholder={form.level ? "Any subject" : "Pick a level first"}
            disabled={!form.level}
          />
        </Field>

        <Field label="Chapter" hint="Optional">
          <Select
            value={form.chapter}
            onChange={(v) => setForm((f) => ({ ...f, chapter: v }))}
            options={chapters.map((c) => ({ value: c, label: c }))}
            placeholder={form.subject ? "Any chapter" : "Pick a subject first"}
            disabled={!form.subject}
          />
        </Field>

        <Field label="Routine title" required>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Morning Physics Sprint"
            className={inputBase}
          />
        </Field>

        <Field label="Routine type" required>
          <div
            role="radiogroup"
            className="grid grid-cols-4 overflow-hidden rounded-xl border border-border/60 bg-background/40 p-1 text-xs font-semibold"
          >
            {(["daily", "weekly", "monthly", "custom"] as RoutineType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={form.type === t}
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={`rounded-lg px-2 py-2 capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                  form.type === t
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Study hours per day" required>
          <input
            type="number"
            min={0.5}
            max={16}
            step={0.5}
            value={form.hoursPerDay}
            onChange={(e) => setForm((f) => ({ ...f, hoursPerDay: e.target.value }))}
            className={inputBase}
          />
        </Field>

        <Field label="Start date" required>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className={inputBase}
          />
        </Field>

        <Field label="End date" required>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className={inputBase}
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="relative mt-6 inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-expanded={advanced}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Advanced settings
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${advanced ? "rotate-90" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {advanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-5 pt-5 md:grid-cols-2">
              <Field label="Short description" hint="Optional">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="What this routine covers, in one line."
                  className={`${inputBase} min-h-24 resize-none`}
                />
              </Field>

              <Field label="Status">
                <div
                  role="radiogroup"
                  className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/60 bg-background/40 p-1 text-xs font-semibold"
                >
                  {(["active", "inactive"] as RStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={form.status === s}
                      onClick={() => setForm((f) => ({ ...f, status: s }))}
                      className={`rounded-lg px-2 py-2 capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                        form.status === s
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Target MCQs" hint="Optional">
                <input
                  type="number"
                  min={0}
                  value={form.targetMcqs}
                  onChange={(e) => setForm((f) => ({ ...f, targetMcqs: e.target.value }))}
                  className={inputBase}
                  placeholder="e.g. 500"
                />
              </Field>

              <Field label="Target chapters" hint="Optional">
                <input
                  type="number"
                  min={0}
                  value={form.targetChapters}
                  onChange={(e) => setForm((f) => ({ ...f, targetChapters: e.target.value }))}
                  className={inputBase}
                  placeholder="e.g. 12"
                />
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="relative mt-5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {editing ? "Editing existing routine." : "New routines are saved instantly."}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={saving}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary via-primary to-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_-12px_color-mix(in_oklab,var(--primary)_65%,transparent)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-14px_color-mix(in_oklab,var(--primary)_70%,transparent)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
            )}
            {editing ? "Update routine" : "Save routine"}
          </button>
        </div>
      </div>
    </form>
  );
}

const inputBase =
  "w-full rounded-xl border border-border/60 bg-background/40 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-inner transition-colors focus:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      <span className="flex items-center gap-2">
        {label}
        {required && <span className="text-destructive/80">*</span>}
        {hint && (
          <span className="ml-auto font-medium normal-case tracking-normal text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>
      <div className="normal-case tracking-normal">{children}</div>
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${inputBase} appearance-none pr-9 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <option value="">{placeholder ?? "Select"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Routine list                                                        */
/* ------------------------------------------------------------------ */

function RoutineListCard(props: {
  routines: Routine[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  query: string;
  onQueryChange: (v: string) => void;
  levelFilter: string;
  onLevelFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  onPageChange: (p: number) => void;
  onView: (r: Routine) => void;
  onEdit: (r: Routine) => void;
  levels: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteRoutines);
  const archiveFn = useServerFn(archiveRoutines);
  const dupFn = useServerFn(duplicateRoutine);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: LIST_KEY });
    qc.invalidateQueries({ queryKey: STATS_KEY });
    qc.invalidateQueries({ queryKey: STUDENTS_KEY });
  };

  const delMut = useMutation({
    mutationFn: (ids: string[]) => deleteFn({ data: { ids } }),
    onSuccess: invalidate,
  });
  const archMut = useMutation({
    mutationFn: (input: { ids: string[]; archived: boolean }) => archiveFn({ data: input }),
    onSuccess: invalidate,
  });
  const dupMut = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const allSelectedOnPage =
    props.routines.length > 0 && props.routines.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) props.routines.forEach((r) => next.delete(r.id));
      else props.routines.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} routine(s)?`)) return;
    await delMut.mutateAsync(Array.from(selected));
    setSelected(new Set());
  };
  const bulkArchive = async (archived: boolean) => {
    if (!selected.size) return;
    await archMut.mutateAsync({ ids: Array.from(selected), archived });
    setSelected(new Set());
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-2xl">
      <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={props.query}
            onChange={(e) => props.onQueryChange(e.target.value)}
            placeholder="Search routines, levels, subjects…"
            className={`${inputBase} pl-9`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            icon={<Filter className="h-3.5 w-3.5" />}
            label="Level"
            value={props.levelFilter}
            onChange={props.onLevelFilterChange}
            options={props.levels}
          />
          <FilterPill
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Status"
            value={props.statusFilter}
            onChange={props.onStatusFilterChange}
            options={["active", "inactive", "upcoming", "completed", "archived"]}
          />
          {selected.size > 0 && (
            <>
              <button
                type="button"
                onClick={() => bulkArchive(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive {selected.size}
              </button>
              <button
                type="button"
                onClick={bulkDelete}
                className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selected.size}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={allSelectedOnPage}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-border/60 accent-primary"
                />
              </th>
              <th className="px-3 py-3 text-left">Routine</th>
              <th className="px-3 py-3 text-left">Level</th>
              <th className="px-3 py-3 text-left">Subject</th>
              <th className="px-3 py-3 text-left">Chapter</th>
              <th className="px-3 py-3 text-left">Duration</th>
              <th className="px-3 py-3 text-left">Hrs/day</th>
              <th className="px-3 py-3 text-left">Students</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Created</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.routines.length === 0 && !props.loading && (
              <tr>
                <td colSpan={11} className="px-6 py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-background/40">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <p className="text-sm">
                      No routines match your filters yet. Try clearing filters or create a new one
                      above.
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {props.loading && props.routines.length === 0 && (
              <tr>
                <td colSpan={11} className="px-6 py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {props.routines.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-secondary/30"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.title}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    className="h-4 w-4 rounded border-border/60 accent-primary"
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-8 w-1 rounded-full"
                      style={{ background: r.accent }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{r.title}</div>
                      {r.description && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {r.description}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{r.level ?? "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">{r.subject ?? "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">{r.chapter ?? "—"}</td>
                <td className="px-3 py-3 capitalize text-muted-foreground">{r.type}</td>
                <td className="px-3 py-3 text-muted-foreground">{r.hoursPerDay}h</td>
                <td className="px-3 py-3 text-muted-foreground">{r.assigned.toLocaleString()}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.isArchived ? "archived" : r.status} />
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {r.createdAt.slice(0, 10)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton label="View" onClick={() => props.onView(r)}>
                      <Eye className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Edit" onClick={() => props.onEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Duplicate" onClick={() => dupMut.mutate(r.id)}>
                      <Copy className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={r.isArchived ? "Unarchive" : "Archive"}
                      onClick={() => archMut.mutate({ ids: [r.id], archived: !r.isArchived })}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Delete"
                      destructive
                      onClick={() => {
                        if (confirm(`Delete "${r.title}"?`)) delMut.mutate([r.id]);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          Showing <span className="font-semibold text-foreground">{props.routines.length}</span> of{" "}
          <span className="font-semibold text-foreground">{props.total}</span> routine
          {props.total === 1 ? "" : "s"}
        </div>
        <div className="flex items-center gap-1.5">
          <PageButton
            disabled={props.page === 1}
            onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
          >
            Prev
          </PageButton>
          <div className="px-2 font-semibold text-foreground">
            {props.page} / {props.totalPages}
          </div>
          <PageButton
            disabled={props.page >= props.totalPages}
            onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
          >
            Next
          </PageButton>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground focus-within:ring-2 focus-within:ring-ring/40">
      {icon}
      <span className="uppercase tracking-[0.18em]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer bg-transparent capitalize text-foreground focus:outline-none"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: RStatus | "archived" }) {
  const styles =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
      : status === "archived"
        ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border/60";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "active"
            ? "bg-emerald-500"
            : status === "archived"
              ? "bg-amber-500"
              : "bg-muted-foreground/50"
        }`}
      />
      {status}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-background/40 transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
        destructive
          ? "text-destructive hover:border-destructive/50 hover:bg-destructive/10"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 font-semibold text-foreground transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* View dialog                                                         */
/* ------------------------------------------------------------------ */

function ViewRoutineDialog({ routine, onClose }: { routine: Routine | null; onClose: () => void }) {
  useEffect(() => {
    if (!routine) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [routine, onClose]);

  return (
    <AnimatePresence>
      {routine && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-end bg-background/60 backdrop-blur-sm sm:place-items-center"
          onClick={onClose}
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl overflow-hidden rounded-t-3xl border border-border/60 bg-card/90 p-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl sm:p-8"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
              style={{
                background: `radial-gradient(circle, ${routine.accent}55, transparent 70%)`,
              }}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-background/40 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Routine
              </div>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight">{routine.title}</h3>
              {routine.description && (
                <p className="mt-2 text-sm text-muted-foreground">{routine.description}</p>
              )}

              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <MetaItem label="Level" value={routine.level ?? "—"} />
                <MetaItem label="Subject" value={routine.subject ?? "—"} />
                <MetaItem label="Chapter" value={routine.chapter ?? "—"} />
                <MetaItem label="Type" value={routine.type} capitalize />
                <MetaItem label="Hours per day" value={`${routine.hoursPerDay}h`} />
                <MetaItem label="Start" value={routine.startDate} />
                <MetaItem label="End" value={routine.endDate} />
                <MetaItem label="Assigned students" value={routine.assigned.toLocaleString()} />
                <MetaItem label="Completion" value={`${routine.completion}%`} />
                <MetaItem
                  label="Status"
                  value={routine.isArchived ? "archived" : routine.status}
                  capitalize
                />
                {routine.targetMcqs != null && (
                  <MetaItem label="Target MCQs" value={String(routine.targetMcqs)} />
                )}
                {routine.targetChapters != null && (
                  <MetaItem label="Target chapters" value={String(routine.targetChapters)} />
                )}
              </dl>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MetaItem({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm font-semibold text-foreground ${capitalize ? "capitalize" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

function ProgressCard() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [routineFilter, setRoutineFilter] = useState<string>("");

  const studentsFn = useServerFn(listRoutineStudents);
  const studentsQuery = useQuery({
    queryKey: STUDENTS_KEY,
    queryFn: () => studentsFn(),
  });

  const dQuery = useDebouncedValue(query, 200);
  const q = dQuery.trim().toLowerCase();

  const routineOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const s of studentsQuery.data ?? []) set.set(s.routineId, s.routineTitle);
    return Array.from(set.entries()).map(([id, title]) => ({ id, title }));
  }, [studentsQuery.data]);

  const filtered = useMemo(() => {
    return (studentsQuery.data ?? []).filter((s: RoutineStudentRow) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (routineFilter && s.routineId !== routineFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.routineTitle.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    });
  }, [studentsQuery.data, statusFilter, routineFilter, q]);

  const deferred = useDeferredValue(filtered);
  const shown = deferred.slice(0, 100);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-2xl">
      <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students or routines…"
            className={`${inputBase} pl-9`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            icon={<Filter className="h-3.5 w-3.5" />}
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={["on-track", "behind", "completed"]}
          />
          <label className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground focus-within:ring-2 focus-within:ring-ring/40">
            <BookOpen className="h-3.5 w-3.5" />
            <span className="uppercase tracking-[0.18em]">Routine</span>
            <select
              value={routineFilter}
              onChange={(e) => setRoutineFilter(e.target.value)}
              className="cursor-pointer bg-transparent text-foreground focus:outline-none"
            >
              <option value="">All</option>
              {routineOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-4 py-3 text-left">Student</th>
              <th className="px-3 py-3 text-left">Routine</th>
              <th className="px-3 py-3 text-left">Completion</th>
              <th className="px-3 py-3 text-left">Today</th>
              <th className="px-3 py-3 text-left">Last activity</th>
              <th className="px-3 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {studentsQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!studentsQuery.isLoading && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-background/40">
                      <Users className="h-5 w-5" />
                    </div>
                    <p className="text-sm">
                      No student progress yet. Once students start following an active routine,
                      their live progress will appear here.
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {shown.map((s: RoutineStudentRow) => (
              <tr
                key={s.id}
                className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-secondary/30"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-background/40 text-[11px] font-semibold text-foreground">
                      {s.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">{s.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-6 w-1 rounded-full"
                      style={{ background: s.routineAccent }}
                    />
                    <span className="truncate text-muted-foreground">{s.routineTitle}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                        style={{ width: `${s.progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-foreground">{s.progress}%</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {s.todayCompleted}/{s.todayTotal}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{s.lastActivity ?? "—"}</td>
                <td className="px-3 py-3">
                  <ProgressStatusBadge status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProgressStatusBadge({ status }: { status: "on-track" | "behind" | "completed" }) {
  const map = {
    "on-track": "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    behind: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    completed: "bg-primary/15 text-primary border-primary/30",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${map[status]}`}
    >
      {status}
    </span>
  );
}
