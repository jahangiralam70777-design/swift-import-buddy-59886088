import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Flag,
  Moon,
  Sparkles,
  Sun,
  Target,
  User,
  X,
  XCircle,
} from "lucide-react";
import { z } from "zod";
import { useTheme } from "@/hooks/use-theme";
import {
  getQbankChapterSession,
  restartChapterQbankSession,
  submitQbankAnswer,
  toggleQbankBookmark,
  type ChapterSession,
  type SessionQuestion,
} from "@/lib/qbank-practice.functions";

/* -------------------------------------------------------------- */
/* Route                                                            */
/* -------------------------------------------------------------- */

const searchSchema = z.object({
  levelId: z.string(),
  subjectId: z.string(),
  chapterId: z.string(),
  mode: z.enum(["continue", "restart"]).optional().default("continue"),
});

export const Route = createFileRoute("/_authenticated/student_/qns-bank-practice/session")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Practice Session — Qns Bank Practice" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SessionPage,
});

/* -------------------------------------------------------------- */
/* Local helpers (replace legacy academic-store helpers)             */
/* -------------------------------------------------------------- */

type Outcome = "correct" | "wrong";
type OutcomeState = Outcome | "skipped";

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

/* -------------------------------------------------------------- */
/* Page shell — loads the session and dispatches restart when asked */
/* -------------------------------------------------------------- */

function SessionPage() {
  const { levelId, subjectId, chapterId, mode } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchSession = useServerFn(getQbankChapterSession);
  const restart = useServerFn(restartChapterQbankSession);

  const queryKey = useMemo(() => ["qbank-practice", "session", chapterId] as const, [chapterId]);

  const sessionQ = useQuery({
    queryKey,
    queryFn: () => fetchSession({ data: { chapterId } }),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // If mode=restart, wipe the caller's attempts server-side once, then
  // drop mode back to "continue" so refresh doesn't re-restart.
  const restartRanRef = useRef(false);
  useEffect(() => {
    if (mode !== "restart") {
      restartRanRef.current = false;
      return;
    }
    if (restartRanRef.current) return;
    restartRanRef.current = true;
    (async () => {
      try {
        await restart({ data: { chapterId } });
      } catch {
        /* surfaced by the query below when it refetches */
      }
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["qbank-practice", "taxonomy"] });
      navigate({
        to: "/student/qns-bank-practice/session",
        search: { levelId, subjectId, chapterId, mode: "continue" },
        replace: true,
      });
    })();
  }, [mode, chapterId, levelId, subjectId, restart, queryClient, queryKey, navigate]);

  if (sessionQ.isLoading || mode === "restart") {
    return <SessionSkeleton />;
  }
  if (sessionQ.isError) {
    return (
      <NotFoundShell
        title="Couldn't load this chapter"
        message={sessionQ.error instanceof Error ? sessionQ.error.message : "Something went wrong."}
        onBack={() =>
          navigate({ to: "/student/qns-bank-practice", search: { levelId, subjectId } })
        }
      />
    );
  }
  const session = sessionQ.data;
  if (!session) {
    return (
      <NotFoundShell
        title="Chapter not found"
        message="This chapter no longer exists in the curriculum."
        onBack={() => navigate({ to: "/student/qns-bank-practice", search: {} })}
      />
    );
  }
  if (session.questions.length === 0) {
    return (
      <NotFoundShell
        title="No published questions yet"
        message="This chapter has no published Questions. Check back later."
        onBack={() =>
          navigate({ to: "/student/qns-bank-practice", search: { levelId, subjectId } })
        }
      />
    );
  }

  return (
    <Session
      session={session}
      queryKey={queryKey as unknown as readonly unknown[]}
      levelId={levelId}
      subjectId={subjectId}
      chapterId={chapterId}
      mode={mode}
    />
  );
}

function NotFoundShell({
  title,
  message,
  onBack,
}: {
  title: string;
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/15 to-amber-500/15 text-rose-500">
          <X className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/30"
        >
          Back to Qns Bank Practice
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Session — Supabase-backed practice runner                        */
/* -------------------------------------------------------------- */

type LocalChoice = { chosen: string | null };

function Session({
  session,
  queryKey,
  levelId,
  subjectId,
  chapterId,
  mode,
}: {
  session: ChapterSession;
  queryKey: readonly unknown[];
  levelId: string;
  subjectId: string;
  chapterId: string;
  mode: "continue" | "restart";
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const submitFn = useServerFn(submitQbankAnswer);
  const bookmarkFn = useServerFn(toggleQbankBookmark);

  const { chapter, questions, attempts, bookmarkedQuestionIds, lastIndex } = session;
  const total = questions.length;

  // Server-authoritative view — indexed for O(1) lookups.
  const attemptByQid = useMemo(() => {
    const m = new Map<string, { selectedIndex: number; isCorrect: boolean }>();
    for (const a of attempts) {
      if (a.selectedIndex != null) {
        m.set(a.questionId, {
          selectedIndex: a.selectedIndex,
          isCorrect: a.isCorrect,
        });
      }
    }
    return m;
  }, [attempts]);

  const bookmarkedSet = useMemo(() => new Set(bookmarkedQuestionIds), [bookmarkedQuestionIds]);

  // Cursor: pick up at first unanswered (server-provided) on first mount.
  const [cursor, setCursor] = useState<number>(() =>
    Math.max(0, Math.min(lastIndex, Math.max(0, total - 1))),
  );
  useEffect(() => {
    // If the underlying question list changes shape (e.g. after restart),
    // clamp the cursor back into range.
    setCursor((c) => Math.max(0, Math.min(c, Math.max(0, total - 1))));
  }, [total]);

  // Local "chosen but not yet submitted" state — cleared on cursor move.
  const [localChoice, setLocalChoice] = useState<Record<number, LocalChoice>>({});
  // Local "skipped this session" markers (not persisted — skipping doesn't
  // create a wrong-answer record and shouldn't overwrite a real attempt).
  const [skippedIdx, setSkippedIdx] = useState<Set<number>>(() => new Set());

  const [showFinish, setShowFinish] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportedIdx, setReportedIdx] = useState<Set<number>>(() => new Set());

  // Elapsed-time counters — used for display and for per-answer time_spent_ms.
  const [elapsedMs, setElapsedMs] = useState(0);
  const sessionStartRef = useRef<number>(Date.now());
  const questionStartRef = useRef<number>(Date.now());

  useEffect(() => {
    sessionStartRef.current = Date.now();
    const t = setInterval(() => {
      setElapsedMs(Date.now() - sessionStartRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [chapterId]);

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [cursor]);

  const current = questions[cursor];

  // Derived UI state for the current question.
  const currentAttempt = attemptByQid.get(current.id);
  const currentLocalChoice = localChoice[cursor]?.chosen ?? null;
  const submittedOutcome: OutcomeState | null = currentAttempt
    ? currentAttempt.isCorrect
      ? "correct"
      : "wrong"
    : skippedIdx.has(cursor)
      ? "skipped"
      : null;
  const submitted = submittedOutcome !== null;

  const currentChosenKey = submitted
    ? currentAttempt
      ? (current.options[currentAttempt.selectedIndex]?.key ?? null)
      : null
    : currentLocalChoice;

  const isBookmarked = bookmarkedSet.has(current.id);
  const isReported = reportedIdx.has(cursor);

  // Aggregated stats across the whole chapter (server-truth).
  const stats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    for (const a of attemptByQid.values()) {
      if (a.isCorrect) correct++;
      else wrong++;
    }
    const skipped = skippedIdx.size;
    const answered = correct + wrong;
    const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);
    return { correct, wrong, skipped, accuracy };
  }, [attemptByQid, skippedIdx]);

  const answeredCount = stats.correct + stats.wrong + stats.skipped;
  const chapterCompleted = stats.correct + stats.wrong;
  const remaining = Math.max(0, total - answeredCount);
  const runProgressPct = pct(chapterCompleted, total);

  // Persisted per-index outcome map (for question navigator colouring).
  const persistedByIndex = useMemo(() => {
    const map: Record<number, Outcome> = {};
    questions.forEach((q, i) => {
      const a = attemptByQid.get(q.id);
      if (a) map[i] = a.isCorrect ? "correct" : "wrong";
    });
    return map;
  }, [questions, attemptByQid]);

  // -------- Mutations --------
  const submitMutation = useMutation({
    mutationFn: async (vars: { questionId: string; selectedIndex: number }) => {
      const timeSpentMs = Math.max(0, Math.min(10 * 60_000, Date.now() - questionStartRef.current));
      return submitFn({
        data: {
          questionId: vars.questionId,
          selectedIndex: vars.selectedIndex,
          timeSpentMs,
        },
      });
    },
    onSuccess: () => {
      // Session cache is the source of truth for attempts & bookmarks;
      // invalidate the taxonomy so the landing page updates too.
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["qbank-practice", "taxonomy"] });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: (vars: { questionId: string }) =>
      bookmarkFn({ data: { questionId: vars.questionId } }),
    onMutate: async (vars) => {
      // Optimistic bookmark toggle — flip the cached array immediately.
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ChapterSession | null>(queryKey);
      if (prev) {
        const has = prev.bookmarkedQuestionIds.includes(vars.questionId);
        const next: ChapterSession = {
          ...prev,
          bookmarkedQuestionIds: has
            ? prev.bookmarkedQuestionIds.filter((id) => id !== vars.questionId)
            : [...prev.bookmarkedQuestionIds, vars.questionId],
        };
        queryClient.setQueryData(queryKey, next);
      }
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["qbank-practice", "taxonomy"] });
    },
  });

  // -------- Handlers --------
  const chooseOption = (optionKey: string) => {
    if (submitted) return;
    setLocalChoice((s) => ({ ...s, [cursor]: { chosen: optionKey } }));
  };

  const submitAnswer = () => {
    if (submitted) return;
    const chosen = currentLocalChoice;
    if (!chosen) return;
    const idx = current.options.findIndex((o) => o.key === chosen);
    if (idx < 0) return;
    // Clear any prior "skipped" flag for this cursor — user's answering now.
    if (skippedIdx.has(cursor)) {
      setSkippedIdx((s) => {
        const next = new Set(s);
        next.delete(cursor);
        return next;
      });
    }
    submitMutation.mutate({ questionId: current.id, selectedIndex: idx });
  };

  const skipQuestion = () => {
    if (submitted) return;
    setSkippedIdx((s) => {
      const next = new Set(s);
      next.add(cursor);
      return next;
    });
  };

  const goNext = () => {
    if (!submitted && !currentLocalChoice) skipQuestion();
    setCursor((c) => Math.min(total - 1, c + 1));
  };
  const goPrev = () => setCursor((c) => Math.max(0, c - 1));

  const toggleBookmark = () => {
    bookmarkMutation.mutate({ questionId: current.id });
  };

  const sendReport = (_reason: string) => {
    // Reports are transient session-only markers for now — the schema has
    // no reports table for Questions. The UI cue remains so students can flag.
    setReportedIdx((s) => {
      const next = new Set(s);
      next.add(cursor);
      return next;
    });
    setReportSent(true);
    setTimeout(() => {
      setReportSent(false);
      setReportOpen(false);
    }, 1400);
  };

  const chapterTimeMs = elapsedMs; // per-session view; server aggregates persist across sessions

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute -top-24 right-0 h-[360px] w-[360px] rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>

      <SessionHeader
        levelId={chapter.levelId}
        levelName={chapter.levelName}
        subjectId={chapter.subjectId}
        subjectName={chapter.subjectName}
        chapterName={chapter.name}
        onFinish={() => setShowFinish(true)}
      />

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 pb-40 pt-6 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
        <div className="order-1">
          <MetricsStrip
            cursor={cursor}
            total={total}
            remaining={remaining}
            accuracy={stats.accuracy}
            elapsedMs={elapsedMs}
            chapterTimeMs={chapterTimeMs}
            bookmarks={bookmarkedSet.size}
            mode={mode}
            isBookmarked={isBookmarked}
            isReported={isReported}
            onBookmark={toggleBookmark}
            onReport={() => setReportOpen(true)}
          />

          <div className="mb-6">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Chapter progress</span>
                <MotivationChip progressPct={runProgressPct} />
              </div>
              <span className="font-semibold text-foreground tabular-nums">{runProgressPct}%</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/70">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500"
                initial={false}
                animate={{ width: `${runProgressPct}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={cursor}
              initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card/70 p-6 shadow-2xl shadow-indigo-500/[0.07] backdrop-blur-xl sm:p-9"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/10 to-transparent blur-2xl"
              />
              <div className="relative mb-7 flex items-start gap-4">
                <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
                  {String(cursor + 1).padStart(2, "0")}
                </span>
                <h2 className="text-xl font-semibold leading-[1.35] tracking-tight text-foreground sm:text-2xl md:text-[26px]">
                  {current.question}
                </h2>
              </div>

              <div className="relative flex flex-col gap-3">
                {current.options.map((opt) => {
                  const selected = currentChosenKey === opt.key;
                  const isCorrect = opt.key === current.answerKey;
                  const showCorrect = submitted && isCorrect;
                  const showWrong = submitted && selected && !isCorrect;
                  return (
                    <motion.button
                      whileTap={submitted ? undefined : { scale: 0.99 }}
                      key={opt.key}
                      type="button"
                      disabled={submitted || submitMutation.isPending}
                      onClick={() => chooseOption(opt.key)}
                      className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border-2 px-4 py-4 text-left text-[15px] transition-all sm:px-5 sm:py-4 ${
                        showCorrect
                          ? "border-emerald-400/80 bg-emerald-400/10 shadow-lg shadow-emerald-500/10"
                          : showWrong
                            ? "border-rose-400/80 bg-rose-400/10 shadow-lg shadow-rose-500/10"
                            : selected
                              ? "border-indigo-400/80 bg-indigo-400/10 shadow-md shadow-indigo-500/15"
                              : "border-border/60 bg-background/40 hover:-translate-y-[1px] hover:border-indigo-300/70 hover:bg-accent/40 hover:shadow-md hover:shadow-indigo-500/[0.06]"
                      } ${submitted ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className="relative flex shrink-0 items-center gap-3">
                        <span
                          className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
                            showCorrect
                              ? "border-emerald-500 bg-emerald-500"
                              : showWrong
                                ? "border-rose-500 bg-rose-500"
                                : selected
                                  ? "border-indigo-500 bg-indigo-500"
                                  : "border-border/80 bg-background group-hover:border-indigo-400"
                          }`}
                          aria-hidden
                        >
                          {(selected || showCorrect || showWrong) && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                              className="h-2 w-2 rounded-full bg-white"
                            />
                          )}
                        </span>
                        <span
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition ${
                            showCorrect
                              ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                              : showWrong
                                ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                                : selected
                                  ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30"
                                  : "bg-muted text-muted-foreground group-hover:bg-accent"
                          }`}
                        >
                          {opt.key}
                        </span>
                      </span>
                      <span className="flex-1 text-[15px] leading-relaxed text-foreground sm:text-base">
                        {opt.text}
                      </span>
                      {showCorrect && (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                      )}
                      {showWrong && <XCircle className="h-5 w-5 shrink-0 text-rose-500" />}
                    </motion.button>
                  );
                })}
              </div>

              <AnimatePresence>
                {submitted && submittedOutcome !== "skipped" && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: 6, height: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-6 overflow-hidden"
                  >
                    <ResultBanner
                      outcome={submittedOutcome as Outcome}
                      correctKey={current.answerKey}
                      correctText={
                        current.options.find((o) => o.key === current.answerKey)?.text ?? ""
                      }
                    />
                    {current.explanation && (
                      <div className="mt-4 rounded-2xl border border-border/60 bg-background/50 p-5">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                          Explanation
                        </div>
                        <p className="text-[15px] leading-relaxed text-foreground/90">
                          {current.explanation}
                        </p>
                      </div>
                    )}
                    {cursor < total - 1 && (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={goNext}
                          className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl hover:shadow-fuchsia-500/30 active:scale-[0.98]"
                        >
                          Next Question
                          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="order-2 hidden flex-col gap-4 lg:sticky lg:top-24 lg:flex lg:self-start">
          <StatsCard
            stats={stats}
            answered={answeredCount}
            total={total}
            elapsedMs={elapsedMs}
            totalTimeMs={chapterTimeMs}
            bookmarks={bookmarkedSet.size}
            chapterCompleted={chapterCompleted}
            chapterTotal={total}
          />

          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Questions
              </div>
              <div className="text-[11px] text-muted-foreground">{total} total</div>
            </div>
            <div className="grid grid-cols-6 gap-1.5 xl:grid-cols-8">
              {questions.map((_, i) => {
                const persisted = persistedByIndex[i];
                const localSkipped = skippedIdx.has(i);
                const state: OutcomeState | null = persisted ?? (localSkipped ? "skipped" : null);
                const isCurrent = i === cursor;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCursor(i)}
                    className={`relative flex h-8 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition ${
                      isCurrent ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-background" : ""
                    } ${
                      state === "correct"
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                        : state === "wrong"
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-300"
                          : state === "skipped"
                            ? "bg-amber-400/20 text-amber-600 dark:text-amber-300"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                    aria-label={`Question ${i + 1}${state ? ` (${state})` : ""}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-500/60" /> Correct
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-rose-500/60" /> Wrong
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-amber-400/60" /> Skipped
              </span>
            </div>
          </div>
        </aside>
      </div>

      <MobileProgressSheet
        stats={stats}
        answered={answeredCount}
        total={total}
        elapsedMs={elapsedMs}
        chapterTimeMs={chapterTimeMs}
        bookmarks={bookmarkedSet.size}
        chapterCompleted={chapterCompleted}
        questions={questions}
        persistedByIndex={persistedByIndex}
        skippedIdx={skippedIdx}
        cursor={cursor}
        onJump={setCursor}
      />

      <AnimatePresence>
        {showFinish && (
          <FinishModal
            stats={stats}
            answered={answeredCount}
            total={total}
            persistedCompleted={chapterCompleted}
            chapterTotal={total}
            onClose={() => setShowFinish(false)}
            onExit={() =>
              navigate({
                to: "/student/qns-bank-practice",
                search: { levelId, subjectId },
              })
            }
            onRestart={() => {
              setShowFinish(false);
              navigate({
                to: "/student/qns-bank-practice/session",
                search: { levelId, subjectId, chapterId, mode: "restart" },
              });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reportOpen && (
          <ReportModal
            questionNumber={cursor + 1}
            sent={reportSent}
            onClose={() => setReportOpen(false)}
            onSubmit={sendReport}
          />
        )}
      </AnimatePresence>

      <BottomBar
        cursor={cursor}
        total={total}
        submitted={submitted}
        submitting={submitMutation.isPending}
        canSubmit={!!currentLocalChoice && !submitted}
        isBookmarked={isBookmarked}
        onPrev={goPrev}
        onNext={goNext}
        onSubmit={submitAnswer}
        onBookmark={toggleBookmark}
        onFinish={() => setShowFinish(true)}
      />
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Presentational sub-components (kept unchanged in look & feel)     */
/* -------------------------------------------------------------- */

function ResultBanner({
  outcome,
  correctKey,
  correctText,
}: {
  outcome: Outcome;
  correctKey: string;
  correctText: string;
}) {
  const isCorrect = outcome === "correct";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden rounded-2xl border p-5 ${
        isCorrect
          ? "border-emerald-400/60 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent"
          : "border-rose-400/60 bg-gradient-to-br from-rose-500/15 via-rose-500/5 to-transparent"
      }`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${
            isCorrect
              ? "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/30"
              : "bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-500/30"
          }`}
        >
          {isCorrect ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={`text-lg font-semibold tracking-tight ${
              isCorrect
                ? "text-emerald-600 dark:text-emerald-300"
                : "text-rose-600 dark:text-rose-300"
            }`}
          >
            {isCorrect ? "Correct!" : "Not quite"}
          </div>
          {!isCorrect && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground/80">
              <span className="text-muted-foreground">Correct answer:</span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-300">
                <span className="text-[11px] font-bold">{correctKey}</span>
                <span className="max-w-[240px] truncate sm:max-w-none">{correctText}</span>
              </span>
            </div>
          )}
          {isCorrect && (
            <div className="mt-1 text-sm text-muted-foreground">
              Nicely done — moving your accuracy up.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function BottomBar({
  cursor,
  total,
  submitted,
  submitting,
  canSubmit,
  isBookmarked,
  onPrev,
  onNext,
  onSubmit,
  onBookmark,
  onFinish,
}: {
  cursor: number;
  total: number;
  submitted: boolean;
  submitting: boolean;
  canSubmit: boolean;
  isBookmarked: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onBookmark: () => void;
  onFinish: () => void;
}) {
  const atFirst = cursor === 0;
  const atLast = cursor >= total - 1;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-1.5 rounded-2xl border border-border/60 bg-background/80 p-1.5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:gap-2 sm:p-2">
        <BarBtn
          onClick={onPrev}
          disabled={atFirst}
          label="Previous"
          icon={<ChevronLeft className="h-4 w-4" />}
        />
        <BarBtn
          onClick={onBookmark}
          label={isBookmarked ? "Saved" : "Bookmark"}
          icon={
            isBookmarked ? (
              <BookmarkCheck className="h-4 w-4 text-amber-500" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )
          }
          active={isBookmarked}
        />
        {!submitted ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className="mx-1 inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl hover:shadow-fuchsia-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="hidden sm:inline">{submitting ? "Saving…" : "Submit Answer"}</span>
            <span className="sm:hidden">{submitting ? "…" : "Submit"}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={atLast}
            className="mx-1 inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl hover:shadow-fuchsia-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <span className="hidden sm:inline">Next Question</span>
            <span className="sm:hidden">Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <BarBtn
          onClick={onNext}
          disabled={atLast}
          label="Next"
          icon={<ChevronRight className="h-4 w-4" />}
          reverse
        />
        <BarBtn
          onClick={onFinish}
          label="Finish"
          icon={<Sparkles className="h-4 w-4" />}
          tone="emerald"
        />
      </div>
    </div>
  );
}

function BarBtn({
  onClick,
  disabled,
  label,
  icon,
  active,
  reverse,
  tone,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  reverse?: boolean;
  tone?: "emerald";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-sm";
  const state = active
    ? "bg-amber-400/15 text-amber-600 dark:text-amber-300"
    : tone === "emerald"
      ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-300"
      : "text-muted-foreground hover:bg-accent hover:text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${state}`}
      aria-label={label}
    >
      {!reverse && icon}
      <span className="hidden sm:inline">{label}</span>
      {reverse && icon}
    </button>
  );
}

function SessionSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-muted/70" />
          <div className="space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted/70" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            <div className="mb-4 h-6 w-56 animate-pulse rounded-full bg-muted/70" />
            <div className="mb-6 h-2 w-full animate-pulse rounded-full bg-muted/70" />
            <div className="rounded-[28px] border border-border/60 bg-card/60 p-8 backdrop-blur-xl">
              <div className="mb-6 flex items-start gap-4">
                <div className="h-11 w-11 animate-pulse rounded-2xl bg-muted/70" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-11/12 animate-pulse rounded bg-muted/70" />
                  <div className="h-5 w-9/12 animate-pulse rounded bg-muted/70" />
                  <div className="h-5 w-6/12 animate-pulse rounded bg-muted/70" />
                </div>
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-2xl border border-border/50 bg-muted/40"
                  />
                ))}
              </div>
            </div>
          </div>
          <aside className="hidden lg:block">
            <div className="h-48 animate-pulse rounded-2xl border border-border/60 bg-card/50" />
            <div className="mt-4 h-56 animate-pulse rounded-2xl border border-border/60 bg-card/50" />
          </aside>
        </div>
      </div>
    </div>
  );
}

function SessionHeader({
  levelId,
  levelName,
  subjectId,
  subjectName,
  chapterName,
  onFinish,
}: {
  levelId: string;
  levelName: string;
  subjectId: string;
  subjectName: string;
  chapterName: string;
  onFinish: () => void;
}) {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          to="/student/qns-bank-practice"
          search={{ levelId, subjectId }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground transition hover:text-foreground"
          aria-label="Back to chapters"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>{levelName}</span>
            <span>·</span>
            <span>{subjectName}</span>
          </div>
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
            {chapterName}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onFinish}
            className="hidden rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent sm:inline-flex"
          >
            Finish
          </button>
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
    </header>
  );
}

function StatsCard({
  stats,
  answered,
  total,
  elapsedMs,
  totalTimeMs,
  bookmarks,
  chapterCompleted,
  chapterTotal,
}: {
  stats: { correct: number; wrong: number; skipped: number; accuracy: number };
  answered: number;
  total: number;
  elapsedMs: number;
  totalTimeMs: number;
  bookmarks: number;
  chapterCompleted: number;
  chapterTotal: number;
}) {
  const chapterRemaining = Math.max(0, chapterTotal - chapterCompleted);
  const chapterPct = chapterTotal === 0 ? 0 : Math.round((chapterCompleted / chapterTotal) * 100);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 shadow-lg shadow-indigo-500/[0.06] backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-500">
          <Target className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold">Chapter progress</div>
          <div className="text-[11px] text-muted-foreground">Live tracking</div>
        </div>
        <div className="ml-auto text-2xl font-semibold tabular-nums">
          {chapterPct}
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500"
          initial={false}
          animate={{ width: `${chapterPct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <MiniRow label="Completed" value={chapterCompleted} />
        <MiniRow label="Remaining" value={chapterRemaining} />
        <MiniRow label="Accuracy" value={`${stats.accuracy}%`} />
        <MiniRow label="Bookmarks" value={bookmarks} />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCell label="Correct" value={stats.correct} tone="emerald" />
        <StatCell label="Wrong" value={stats.wrong} tone="rose" />
        <StatCell label="Skipped" value={stats.skipped} tone="amber" />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Answered {answered} of {total}
        </span>
        <span className="tabular-nums">
          <span className="opacity-70">Session</span>{" "}
          <span className="font-semibold text-foreground">{formatDuration(elapsedMs)}</span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Chapter time spent</span>
        <span className="font-semibold tabular-nums text-foreground">
          {formatDuration(totalTimeMs)}
        </span>
      </div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function MetricsStrip({
  cursor,
  total,
  remaining,
  accuracy,
  elapsedMs,
  chapterTimeMs,
  bookmarks,
  mode,
  isBookmarked,
  isReported,
  onBookmark,
  onReport,
}: {
  cursor: number;
  total: number;
  remaining: number;
  accuracy: number;
  elapsedMs: number;
  chapterTimeMs: number;
  bookmarks: number;
  mode: "continue" | "restart";
  isBookmarked: boolean;
  isReported: boolean;
  onBookmark: () => void;
  onReport: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <MetricPill
        label="Question"
        value={`${String(cursor + 1).padStart(2, "0")} / ${total}`}
        primary
      />
      <MetricPill label="Remaining" value={remaining} />
      <MetricPill label="Accuracy" value={`${accuracy}%`} tone="emerald" />
      <MetricPill
        label="Session"
        value={formatDuration(elapsedMs)}
        icon={<Clock className="h-3 w-3" />}
      />
      <MetricPill label="Chapter time" value={formatDuration(chapterTimeMs)} />
      <MetricPill
        label="Bookmarks"
        value={bookmarks}
        icon={<Bookmark className="h-3 w-3" />}
        tone="amber"
      />
      {mode === "restart" && (
        <span className="rounded-full border border-border/60 bg-background/60 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Fresh session
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBookmark}
          aria-pressed={isBookmarked}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            isBookmarked
              ? "border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-300"
              : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          {isBookmarked ? (
            <BookmarkCheck className="h-3.5 w-3.5" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
        </button>
        <button
          type="button"
          onClick={onReport}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            isReported
              ? "border-rose-400/60 bg-rose-400/10 text-rose-600 dark:text-rose-300"
              : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Flag className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{isReported ? "Reported" : "Report"}</span>
        </button>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  primary,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  primary?: boolean;
  tone?: "emerald" | "amber";
  icon?: React.ReactNode;
}) {
  const cls = primary
    ? "border-indigo-400/40 bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/15 text-indigo-600 dark:text-indigo-300"
    : tone === "emerald"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
      : tone === "amber"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
        : "border-border/60 bg-card/60 text-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      {icon}
      <span className="opacity-70">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function MotivationChip({ progressPct }: { progressPct: number }) {
  const { text, tone } = motivationalMessage(progressPct);
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

function MobileProgressSheet({
  stats,
  answered,
  total,
  elapsedMs,
  chapterTimeMs,
  bookmarks,
  chapterCompleted,
  questions,
  persistedByIndex,
  skippedIdx,
  cursor,
  onJump,
}: {
  stats: { correct: number; wrong: number; skipped: number; accuracy: number };
  answered: number;
  total: number;
  elapsedMs: number;
  chapterTimeMs: number;
  bookmarks: number;
  chapterCompleted: number;
  questions: SessionQuestion[];
  persistedByIndex: Record<number, Outcome>;
  skippedIdx: Set<number>;
  cursor: number;
  onJump: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const chapterPct = total === 0 ? 0 : Math.round((chapterCompleted / total) * 100);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-3 right-3 z-30 mx-auto inline-flex max-w-3xl items-center gap-3 rounded-2xl border border-border/60 bg-background/85 px-4 py-2.5 text-left text-xs shadow-2xl shadow-black/20 backdrop-blur-xl lg:hidden"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30">
          <Target className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{chapterPct}% complete</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{stats.accuracy}% accuracy</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all"
              style={{ width: `${chapterPct}%` }}
            />
          </div>
        </div>
        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl border-t border-border/60 bg-background p-5 pb-8 shadow-2xl"
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted" />
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold">Chapter progress</div>
                  <div className="text-xs text-muted-foreground">
                    Answered {answered} of {total} this session
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card/60"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                <MiniRow label="Completed" value={chapterCompleted} />
                <MiniRow label="Remaining" value={Math.max(0, total - chapterCompleted)} />
                <MiniRow label="Accuracy" value={`${stats.accuracy}%`} />
                <MiniRow label="Bookmarks" value={bookmarks} />
                <MiniRow label="Session time" value={formatDuration(elapsedMs)} />
                <MiniRow label="Chapter time" value={formatDuration(chapterTimeMs)} />
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2">
                <StatCell label="Correct" value={stats.correct} tone="emerald" />
                <StatCell label="Wrong" value={stats.wrong} tone="rose" />
                <StatCell label="Skipped" value={stats.skipped} tone="amber" />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Jump to question
              </div>
              <div className="mt-2 grid grid-cols-8 gap-1.5">
                {questions.map((_, i) => {
                  const persisted = persistedByIndex[i];
                  const localSkipped = skippedIdx.has(i);
                  const state: OutcomeState | null = persisted ?? (localSkipped ? "skipped" : null);
                  const isCurrent = i === cursor;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onJump(i);
                        setOpen(false);
                      }}
                      className={`relative flex h-8 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition ${
                        isCurrent
                          ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-background"
                          : ""
                      } ${
                        state === "correct"
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                          : state === "wrong"
                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-300"
                            : state === "skipped"
                              ? "bg-amber-400/20 text-amber-600 dark:text-amber-300"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "amber";
}) {
  const map = {
    emerald: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    rose: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
    amber: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
  } as const;
  return (
    <div className={`rounded-xl border px-2.5 py-2 text-center ${map[tone]}`}>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function FinishModal({
  stats,
  answered,
  total,
  persistedCompleted,
  chapterTotal,
  onClose,
  onExit,
  onRestart,
}: {
  stats: { correct: number; wrong: number; skipped: number; accuracy: number };
  answered: number;
  total: number;
  persistedCompleted: number;
  chapterTotal: number;
  onClose: () => void;
  onExit: () => void;
  onRestart: () => void;
}) {
  return (
    <ModalShell onClose={onClose}>
      <div className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight">Great work</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        You answered {answered} of {total} this session, with {stats.accuracy}% accuracy.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatCell label="Correct" value={stats.correct} tone="emerald" />
        <StatCell label="Wrong" value={stats.wrong} tone="rose" />
        <StatCell label="Skipped" value={stats.skipped} tone="amber" />
      </div>
      <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
        Chapter progress:{" "}
        <span className="font-semibold text-foreground">
          {persistedCompleted}/{chapterTotal}
        </span>{" "}
        answered overall.
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/30 transition hover:shadow-lg hover:shadow-fuchsia-500/30"
        >
          Back to chapters
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/60 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
        >
          Restart chapter
        </button>
      </div>
    </ModalShell>
  );
}

function ReportModal({
  questionNumber,
  sent,
  onClose,
  onSubmit,
}: {
  questionNumber: number;
  sent: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<string>("Wrong answer");
  const CATEGORIES = ["Wrong answer", "Typo", "Ambiguous", "Not relevant", "Other"];
  return (
    <ModalShell onClose={onClose}>
      {sent ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h3 className="mt-3 text-lg font-semibold">Thanks — report sent</h3>
          <p className="mt-1 text-sm text-muted-foreground">Our team will review this question.</p>
        </div>
      ) : (
        <>
          <h3 className="text-lg font-semibold tracking-tight">Report Q{questionNumber}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Let us know what's off — your feedback improves the bank.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  category === c
                    ? "border-indigo-400 bg-indigo-500/15 text-indigo-500"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Add details (optional)…"
            className="mt-3 w-full resize-none rounded-xl border border-border/60 bg-background/40 p-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border/60 bg-background/60 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(`${category}${reason ? `: ${reason}` : ""}`)}
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/30 transition hover:shadow-lg hover:shadow-fuchsia-500/30"
            >
              Send report
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
