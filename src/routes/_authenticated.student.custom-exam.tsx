import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Database,
  FileText,
  GraduationCap,
  Hash,
  Layers,
  ListChecks,
  RotateCcw,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  generateCustomExam,
  getCustomExamTaxonomy,
  type ExamSource,
  type TaxonomyChapter,
} from "@/lib/custom-exam.functions";

// Local shape matching the legacy UI expectations.
type ChapterRef = {
  src: ExamSource;
  levelId: string;
  levelName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  count: number;
};

export const Route = createFileRoute("/_authenticated/student/custom-exam")({
  head: () => ({
    meta: [
      { title: "Custom Exam — CL Aspire Student" },
      {
        name: "description",
        content:
          "Design your own timed exam. Pick level, subjects, question sources and chapters — we sample real questions from the admin banks.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CustomExamBuilder,
});

/* ------------------------------------------------------------------ */

type SourceKey = ExamSource;

function CustomExamBuilder() {
  const navigate = useNavigate();
  const fetchTaxonomy = useServerFn(getCustomExamTaxonomy);
  const generateFn = useServerFn(generateCustomExam);
  const {
    data: taxonomy,
    isLoading: taxonomyLoading,
    error: taxonomyError,
  } = useQuery({
    queryKey: ["custom-exam", "taxonomy"],
    queryFn: () => fetchTaxonomy(),
    staleTime: 60_000,
  });

  // ---- Wizard state ---------------------------------------------------
  const [levelName, setLevelName] = useState<string>("");
  const [subjectNames, setSubjectNames] = useState<string[]>([]);
  const [sources, setSources] = useState<SourceKey[]>([]);
  const [chapterKeys, setChapterKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [numQuestions, setNumQuestions] = useState<number>(20);
  const [durationMin, setDurationMin] = useState<number>(30);
  const [examName, setExamName] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Flatten taxonomy → per-source ChapterRef list, filtered by chosen sources.
  const allChapterRefs = useMemo<ChapterRef[]>(() => {
    if (!taxonomy) return [];
    const out: ChapterRef[] = [];
    for (const lvl of taxonomy.levels) {
      for (const sub of lvl.subjects) {
        for (const ch of sub.chapters) {
          const push = (src: ExamSource, count: number) => {
            if (count <= 0) return;
            out.push({
              src,
              levelId: lvl.id,
              levelName: lvl.name,
              subjectId: sub.id,
              subjectName: sub.name,
              chapterId: ch.id,
              chapterName: ch.name,
              count,
            });
          };
          push("mcq", ch.mcqCount);
          push("qbank", ch.qbankCount);
        }
      }
    }
    return out;
  }, [taxonomy]);

  const levelOptions = useMemo(
    () => Array.from(new Set(allChapterRefs.map((c) => c.levelName))).sort(),
    [allChapterRefs],
  );
  const subjectOptions = useMemo(() => {
    if (!levelName) return [] as string[];
    return Array.from(
      new Set(allChapterRefs.filter((c) => c.levelName === levelName).map((c) => c.subjectName)),
    ).sort();
  }, [allChapterRefs, levelName]);

  const availableChapters = useMemo<ChapterRef[]>(() => {
    if (!levelName || subjectNames.length === 0 || sources.length === 0) return [];
    const subjSet = new Set(subjectNames);
    const srcSet = new Set(sources);
    return allChapterRefs.filter(
      (c) => c.levelName === levelName && subjSet.has(c.subjectName) && srcSet.has(c.src),
    );
  }, [allChapterRefs, levelName, subjectNames, sources]);

  const filteredChapters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableChapters;
    return availableChapters.filter(
      (c) => c.chapterName.toLowerCase().includes(q) || c.subjectName.toLowerCase().includes(q),
    );
  }, [availableChapters, search]);

  const chapterKey = (c: ChapterRef) => `${c.src}::${c.chapterId}`;

  const selectedChapters = useMemo(
    () => availableChapters.filter((c) => chapterKeys.has(chapterKey(c))),
    [availableChapters, chapterKeys],
  );

  const totalAvailable = useMemo(
    () => selectedChapters.reduce((n, c) => n + c.count, 0),
    [selectedChapters],
  );

  // ---- Effects: prune invalid selections when parent step changes -----
  useEffect(() => {
    setSubjectNames((prev) => prev.filter((s) => subjectOptions.includes(s)));
  }, [subjectOptions]);

  useEffect(() => {
    const allowed = new Set(availableChapters.map(chapterKey));
    setChapterKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((k) => {
        if (allowed.has(k)) next.add(k);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [availableChapters]);

  // ---- Step gating ----------------------------------------------------
  const step1Done = !!levelName;
  const step2Done = step1Done && subjectNames.length > 0;
  const step3Done = step2Done && sources.length > 0;
  const step4Done = step3Done && chapterKeys.size > 0;
  const canGenerate = step4Done && numQuestions > 0 && durationMin > 0 && totalAvailable > 0;
  const shortfall = step4Done && numQuestions > totalAvailable;

  const currentStep = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : !step4Done ? 4 : 5;

  // ---- Actions --------------------------------------------------------
  const reset = () => {
    setLevelName("");
    setSubjectNames([]);
    setSources([]);
    setChapterKeys(new Set());
    setSearch("");
    setNumQuestions(20);
    setDurationMin(30);
    setExamName("");
    setError("");
  };

  const toggleSubject = (name: string) => {
    setSubjectNames((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  };

  const setSource = (src: SourceKey, on: boolean) => {
    setSources((prev) => {
      const has = prev.includes(src);
      if (on && !has) return [...prev, src];
      if (!on && has) return prev.filter((s) => s !== src);
      return prev;
    });
  };

  const toggleChapter = (c: ChapterRef) => {
    const k = chapterKey(c);
    setChapterKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setChapterKeys((prev) => {
      const next = new Set(prev);
      for (const c of filteredChapters) next.add(chapterKey(c));
      return next;
    });
  };
  const clearAllFiltered = () => {
    setChapterKeys((prev) => {
      const next = new Set(prev);
      for (const c of filteredChapters) next.delete(chapterKey(c));
      return next;
    });
  };

  type GenerateInput = {
    title: string;
    sources: ExamSource[];
    chapterIds: string[];
    numQuestions: number;
    durationMinutes: number;
    levelName: string;
    subjectNames: string[];
  };
  const generateMutation = useMutation({
    mutationFn: (input: GenerateInput) => generateFn({ data: input }),
    onSuccess: ({ sessionId }) => {
      navigate({ to: "/student/custom-exam/session", search: { id: sessionId } });
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to generate exam");
    },
  });

  const generate = () => {
    setError("");
    if (!canGenerate) return;
    if (shortfall) {
      const ok =
        typeof window !== "undefined"
          ? window.confirm(
              `Only ${totalAvailable} question${totalAvailable === 1 ? "" : "s"} are available in the selected chapters, but you asked for ${numQuestions}.\n\nGenerate an exam with ${totalAvailable} question${totalAvailable === 1 ? "" : "s"} instead?`,
            )
          : false;
      if (!ok) return;
    }
    const target = Math.min(numQuestions, totalAvailable);
    // Distinct chapter ids across selection (server samples per source).
    const chapterIds = Array.from(new Set(selectedChapters.map((c) => c.chapterId)));
    generateMutation.mutate({
      title: examName.trim(),
      sources,
      chapterIds,
      numQuestions: target,
      durationMinutes: durationMin,
      levelName,
      subjectNames,
    });
  };

  if (taxonomyLoading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Loading question banks…
      </div>
    );
  }
  if (taxonomyError) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-2 text-sm font-semibold text-rose-500">Couldn't load question banks</div>
        <div className="text-xs text-muted-foreground">
          {taxonomyError instanceof Error ? taxonomyError.message : "Please try again."}
        </div>
      </div>
    );
  }

  // ---- Render ---------------------------------------------------------
  return (
    <div className="relative min-h-screen">
      {/* Ambient */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute -top-24 right-0 h-[360px] w-[360px] rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
        <Header currentStep={currentStep} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Steps column */}
          <div className="flex flex-col gap-5">
            <StepCard
              index={1}
              title="Select Level"
              subtitle="Choose the level you want to be examined on."
              icon={<GraduationCap className="h-4 w-4" />}
              done={step1Done}
              active={currentStep === 1}
            >
              {levelOptions.length === 0 ? (
                <EmptyRow text="No levels available yet." />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {levelOptions.map((lvl) => (
                    <ChoicePill
                      key={lvl}
                      label={lvl}
                      selected={levelName === lvl}
                      onClick={() => setLevelName(levelName === lvl ? "" : lvl)}
                    />
                  ))}
                </div>
              )}
            </StepCard>

            <StepCard
              index={2}
              title="Select Subject"
              subtitle="Pick one or more subjects."
              icon={<BookOpen className="h-4 w-4" />}
              done={step2Done}
              active={currentStep === 2}
              disabled={!step1Done}
            >
              {!step1Done ? (
                <EmptyRow text="Pick a level first." />
              ) : subjectOptions.length === 0 ? (
                <EmptyRow text="No subjects available under this level." />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {subjectOptions.map((s) => (
                    <ChoicePill
                      key={s}
                      label={s}
                      selected={subjectNames.includes(s)}
                      onClick={() => toggleSubject(s)}
                      multi
                    />
                  ))}
                </div>
              )}
            </StepCard>

            <StepCard
              index={3}
              title="Select Question Source"
              subtitle="Choose one or both."
              icon={<Layers className="h-4 w-4" />}
              done={step3Done}
              active={currentStep === 3}
              disabled={!step2Done}
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <SourceCard
                  active={sources.includes("mcq")}
                  onToggle={(on) => setSource("mcq", on)}
                  label="MCQ Practice"
                  hint="Admin MCQ Manager"
                  icon={<ListChecks className="h-4 w-4" />}
                />
                <SourceCard
                  active={sources.includes("qbank")}
                  onToggle={(on) => setSource("qbank", on)}
                  label="Question Bank"
                  hint="Admin Qns Bank Manager"
                  icon={<Database className="h-4 w-4" />}
                />
                <SourceCard
                  active={sources.includes("mcq") && sources.includes("qbank")}
                  onToggle={(on) => {
                    if (on) setSources(["mcq", "qbank"]);
                    else setSources([]);
                  }}
                  label="Both"
                  hint="Mix from both banks"
                  icon={<Sparkles className="h-4 w-4" />}
                />
              </div>
            </StepCard>

            <StepCard
              index={4}
              title="Select Chapter"
              subtitle="Pick single, multiple, or all chapters."
              icon={<FileText className="h-4 w-4" />}
              done={step4Done}
              active={currentStep === 4}
              disabled={!step3Done}
            >
              {!step3Done ? (
                <EmptyRow text="Pick sources first." />
              ) : availableChapters.length === 0 ? (
                <EmptyRow text="No chapters available. Try different subjects/sources." />
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search chapters..."
                        className="w-full rounded-xl border border-border/60 bg-background/60 py-2 pl-8 pr-3 text-sm outline-none ring-indigo-400/40 transition focus:ring-2"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      className="rounded-xl border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-semibold transition hover:bg-accent"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearAllFiltered}
                      className="rounded-xl border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-semibold transition hover:bg-accent"
                    >
                      Clear
                    </button>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {chapterKeys.size} selected · {totalAvailable} questions
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-2xl border border-border/60 bg-background/40 p-2">
                    {filteredChapters.length === 0 ? (
                      <EmptyRow text="No chapters match your search." />
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {filteredChapters.map((c) => {
                          const k = chapterKey(c);
                          const on = chapterKeys.has(k);
                          return (
                            <li key={k}>
                              <button
                                type="button"
                                onClick={() => toggleChapter(c)}
                                className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                                  on
                                    ? "border-indigo-400/60 bg-indigo-500/10"
                                    : "border-transparent hover:border-border/60 hover:bg-accent/40"
                                }`}
                              >
                                <span
                                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                                    on
                                      ? "border-indigo-500 bg-indigo-500 text-white"
                                      : "border-border/80 bg-background"
                                  }`}
                                  aria-hidden
                                >
                                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium">
                                    {c.chapterName}
                                  </div>
                                  <div className="truncate text-[11px] text-muted-foreground">
                                    {c.subjectName} ·{" "}
                                    {c.src === "mcq" ? "MCQ Practice" : "Question Bank"}
                                  </div>
                                </div>
                                <span className="shrink-0 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                                  {c.count} Q
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </StepCard>

            <StepCard
              index={5}
              title="Exam Settings"
              subtitle="Set the length, duration and (optionally) a name."
              icon={<Wand2 className="h-4 w-4" />}
              done={canGenerate}
              active={currentStep === 5}
              disabled={!step4Done}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Number of Questions"
                  value={numQuestions}
                  min={1}
                  max={Math.max(1, totalAvailable)}
                  onChange={setNumQuestions}
                  disabled={!step4Done}
                  hint={step4Done ? `Up to ${totalAvailable} available` : "Pick chapters first"}
                />
                <NumberField
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Duration (Minutes)"
                  value={durationMin}
                  min={1}
                  max={480}
                  onChange={setDurationMin}
                  disabled={!step4Done}
                  hint="1 – 480 min"
                />
                <TextField
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label="Exam Name (Optional)"
                  value={examName}
                  onChange={setExamName}
                  placeholder={
                    step2Done ? defaultExamName(levelName, subjectNames) : "My custom exam"
                  }
                  disabled={!step4Done}
                />
              </div>
              {error && (
                <div className="mt-3 rounded-xl border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                  {error}
                </div>
              )}
              {step4Done && numQuestions > totalAvailable && (
                <div className="mt-3 rounded-xl border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
                  You asked for {numQuestions} questions but only {totalAvailable} are available in
                  the selected chapters.
                </div>
              )}
            </StepCard>
          </div>

          {/* Summary column */}
          <aside className="order-first lg:order-none lg:sticky lg:top-6 lg:self-start">
            <SummaryPanel
              levelName={levelName}
              subjectNames={subjectNames}
              sources={sources}
              selectedChapterCount={chapterKeys.size}
              totalAvailable={totalAvailable}
              numQuestions={numQuestions}
              durationMin={durationMin}
              canGenerate={canGenerate}
              onGenerate={generate}
              onReset={reset}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function defaultExamName(level: string, subjects: string[]): string {
  if (!level) return "Custom Exam";
  const subj =
    subjects.length === 0
      ? ""
      : subjects.length <= 2
        ? ` — ${subjects.join(" & ")}`
        : ` — ${subjects.length} subjects`;
  return `${level}${subj} Custom Exam`;
}

/* ------------------------------------------------------------------ */

function Header({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
          <Sparkles className="h-3 w-3" />
          Custom Exam Builder
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Design your exam</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Choose level, subjects, question sources and chapters — we sample real questions from the
          admin banks and time your session like a real exam.
        </p>
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-2xl border border-border/60 bg-card/60 px-3 py-2 text-xs">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-semibold tabular-nums transition ${
              currentStep === n
                ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30"
                : n < currentStep
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
            }`}
            aria-label={`Step ${n}`}
          >
            {n < currentStep ? <Check className="h-3.5 w-3.5" /> : n}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StepCard({
  index,
  title,
  subtitle,
  icon,
  done,
  active,
  disabled,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  done?: boolean;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`relative rounded-2xl border bg-card/60 p-5 backdrop-blur-xl transition ${
        active
          ? "border-indigo-400/60 shadow-lg shadow-indigo-500/[0.08]"
          : done
            ? "border-emerald-400/40"
            : "border-border/60"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-md ${
            done
              ? "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/30"
              : active
                ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-indigo-500/30"
                : "bg-muted-foreground/60"
          }`}
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : index}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {icon}
            <span>Step {index}</span>
          </div>
          <div className="truncate text-base font-semibold">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function ChoicePill({
  label,
  selected,
  onClick,
  multi,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        selected
          ? "border-indigo-400/60 bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/15 text-indigo-600 shadow-sm shadow-indigo-500/10 dark:text-indigo-300"
          : "border-border/60 bg-background/50 text-foreground hover:border-indigo-300/60 hover:bg-accent/40"
      }`}
      aria-pressed={selected}
    >
      {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      <span>{label}</span>
      {multi && !selected && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">+</span>
      )}
    </button>
  );
}

function SourceCard({
  active,
  onToggle,
  label,
  hint,
  icon,
}: {
  active: boolean;
  onToggle: (on: boolean) => void;
  label: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!active)}
      aria-pressed={active}
      className={`group relative flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition ${
        active
          ? "border-indigo-400/70 bg-indigo-500/10 shadow-md shadow-indigo-500/15"
          : "border-border/60 bg-background/40 hover:-translate-y-[1px] hover:border-indigo-300/60 hover:bg-accent/40"
      }`}
    >
      <div className="flex w-full items-center gap-2">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-md ${
            active
              ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-indigo-500/30"
              : "bg-muted-foreground/60"
          }`}
        >
          {icon}
        </span>
        <span className="text-sm font-semibold">{label}</span>
        {active && <Check className="ml-auto h-4 w-4 text-indigo-500" strokeWidth={3} />}
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}

function NumberField({
  icon,
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.max(min, Math.min(max, Math.floor(n))));
        }}
        disabled={disabled}
        className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm outline-none ring-indigo-400/40 transition focus:ring-2 disabled:opacity-50"
      />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function TextField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm outline-none ring-indigo-400/40 transition focus:ring-2 disabled:opacity-50"
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */

function SummaryPanel({
  levelName,
  subjectNames,
  sources,
  selectedChapterCount,
  totalAvailable,
  numQuestions,
  durationMin,
  canGenerate,
  onGenerate,
  onReset,
}: {
  levelName: string;
  subjectNames: string[];
  sources: ExamSource[];
  selectedChapterCount: number;
  totalAvailable: number;
  numQuestions: number;
  durationMin: number;
  canGenerate: boolean;
  onGenerate: () => void;
  onReset: () => void;
}) {
  const srcLabel =
    sources.length === 0
      ? "—"
      : sources.length === 2
        ? "MCQ + Question Bank"
        : sources[0] === "mcq"
          ? "MCQ Practice"
          : "Question Bank";
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-xl shadow-indigo-500/[0.08] backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30">
          <Wand2 className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold">Exam summary</div>
          <div className="text-[11px] text-muted-foreground">Live preview</div>
        </div>
      </div>
      <dl className="space-y-2 text-xs">
        <SummaryRow label="Level" value={levelName || "—"} />
        <SummaryRow label="Subjects" value={subjectNames.length ? subjectNames.join(", ") : "—"} />
        <SummaryRow label="Source" value={srcLabel} />
        <SummaryRow
          label="Chapters"
          value={selectedChapterCount ? `${selectedChapterCount} selected` : "—"}
        />
        <SummaryRow label="Available Qs" value={totalAvailable ? totalAvailable.toString() : "—"} />
        <SummaryRow label="Exam length" value={`${numQuestions} questions`} />
        <SummaryRow label="Duration" value={`${durationMin} min`} />
      </dl>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl hover:shadow-fuchsia-500/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <Sparkles className="h-4 w-4" />
          Generate Exam
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/60 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] truncate text-right text-xs font-semibold">{value}</dd>
    </div>
  );
}
