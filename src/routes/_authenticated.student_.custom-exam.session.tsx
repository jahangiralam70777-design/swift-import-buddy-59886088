import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Timer,
  XCircle,
} from "lucide-react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  finishCustomExam,
  getCustomExamSession,
  submitCustomExamAnswer,
  toggleCustomExamBookmark,
  type ExamConfig,
  type ExamQuestion,
  type ExamSession,
} from "@/lib/custom-exam.functions";

const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_authenticated/student_/custom-exam/session")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Custom Exam Session — CL Aspire" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CustomExamSessionPage,
});

/* ------------------------------------------------------------------ */

type AnswerRecord = { chosen: string | null };

function formatDurationLong(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function CustomExamSessionPage() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const fetchSession = useServerFn(getCustomExamSession);
  const {
    data: session,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["custom-exam", "session", id],
    queryFn: () => (id ? fetchSession({ data: { sessionId: id } }) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
  });

  if (!id) {
    return <NoExam onBack={() => navigate({ to: "/student/custom-exam" })} />;
  }
  if (isLoading) return <Skeleton />;
  if (error) {
    return (
      <NoExam
        onBack={() => navigate({ to: "/student/custom-exam" })}
        message={error instanceof Error ? error.message : "Failed to load exam."}
      />
    );
  }
  if (!session || session.config.questions.length === 0) {
    return <NoExam onBack={() => navigate({ to: "/student/custom-exam" })} />;
  }
  return <Runner session={session} />;
}

function NoExam({ onBack, message }: { onBack: () => void; message?: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/15 to-amber-500/15 text-rose-500">
        <Flag className="h-5 w-5" />
      </div>
      <h1 className="text-lg font-semibold">{message ? "Couldn't load exam" : "No exam found"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "Design a new exam to get started."}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-500/30"
      >
        Back to Custom Exam
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Runner({ session }: { session: ExamSession }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = session.config;
  const total = config.questions.length;

  const submitAnswerFn = useServerFn(submitCustomExamAnswer);
  const toggleBookmarkFn = useServerFn(toggleCustomExamBookmark);
  const finishFn = useServerFn(finishCustomExam);

  // Build a uid → position index for fast lookups.
  const uidToIndex = useMemo(() => {
    const map = new Map<string, number>();
    config.questions.forEach((q, i) => map.set(q.uid, i));
    return map;
  }, [config.questions]);

  // Hydrate persisted state from server.
  const initialAnswers = useMemo(() => {
    const out: Record<number, AnswerRecord> = {};
    for (const a of session.answers) {
      const i = uidToIndex.get(a.questionUid);
      if (i === undefined) continue;
      const q = config.questions[i];
      const key =
        a.selectedIndex !== null && a.selectedIndex >= 0
          ? (q.options[a.selectedIndex]?.key ?? null)
          : null;
      out[i] = { chosen: key };
    }
    return out;
  }, [session.answers, uidToIndex, config.questions]);

  const initialBookmarks = useMemo(() => {
    const set = new Set<number>();
    for (const uid of session.bookmarkedUids) {
      const i = uidToIndex.get(uid);
      if (i !== undefined) set.add(i);
    }
    return set;
  }, [session.bookmarkedUids, uidToIndex]);

  const firstUnansweredIndex = useMemo(() => {
    for (let i = 0; i < total; i++) {
      if (!initialAnswers[i]?.chosen) return i;
    }
    return Math.max(0, total - 1);
  }, [initialAnswers, total]);

  const [answers, setAnswers] = useState<Record<number, AnswerRecord>>(initialAnswers);
  const [bookmarks, setBookmarks] = useState<Set<number>>(initialBookmarks);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([firstUnansweredIndex]));
  const [cursor, setCursor] = useState<number>(
    Math.min(total - 1, Math.max(0, firstUnansweredIndex)),
  );
  const [submitted, setSubmitted] = useState<boolean>(session.finishedAt !== null);
  const [endedAt, setEndedAt] = useState<number | null>(session.finishedAt);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const startedAt = session.startedAt;
  const deadline = startedAt + config.durationMs;

  const current = config.questions[cursor];
  const currentAnswer = answers[cursor];

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(cursor)) return prev;
      const next = new Set(prev);
      next.add(cursor);
      return next;
    });
  }, [cursor]);

  const stats = useMemo(() => {
    let correct = 0,
      wrong = 0,
      answered = 0;
    for (let i = 0; i < total; i++) {
      const a = answers[i]?.chosen;
      if (!a) continue;
      answered++;
      if (a === config.questions[i].answer) correct++;
      else wrong++;
    }
    const skipped = total - answered;
    const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);
    const score = total === 0 ? 0 : Math.round((correct / total) * 100);
    return { correct, wrong, answered, skipped, accuracy, score };
  }, [answers, total, config.questions]);

  const answeredCount = stats.answered;
  const progressPct = total === 0 ? 0 : Math.round((answeredCount / total) * 100);

  const answerMutation = useMutation({
    mutationFn: (input: {
      sessionId: string;
      questionId: string;
      source: "mcq" | "qbank";
      selectedIndex: number;
    }) => submitAnswerFn({ data: input }),
  });

  const bookmarkMutation = useMutation({
    mutationFn: (input: { questionId: string; source: "mcq" | "qbank" }) =>
      toggleBookmarkFn({ data: input }),
  });

  const finishMutation = useMutation({
    mutationFn: (sessionId: string) => finishFn({ data: { sessionId } }),
  });

  const chooseOption = useCallback(
    (key: string) => {
      if (submitted) return;
      const q = config.questions[cursor];
      const selectedIndex = q.options.findIndex((o) => o.key === key);
      if (selectedIndex < 0) return;
      // Optimistic UI.
      setAnswers((prev) => ({ ...prev, [cursor]: { chosen: key } }));
      answerMutation.mutate({
        sessionId: session.id,
        questionId: q.questionId,
        source: q.src,
        selectedIndex,
      });
    },
    [cursor, submitted, config.questions, answerMutation, session.id],
  );

  const goPrev = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
  const goNext = useCallback(() => setCursor((c) => Math.min(total - 1, c + 1)), [total]);
  const jumpTo = useCallback((i: number) => setCursor(i), []);

  const toggleBookmark = useCallback(() => {
    const q = config.questions[cursor];
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(cursor)) next.delete(cursor);
      else next.add(cursor);
      return next;
    });
    bookmarkMutation.mutate({ questionId: q.questionId, source: q.src });
  }, [cursor, config.questions, bookmarkMutation]);

  const submitAnswer = useCallback(() => {
    if (!currentAnswer?.chosen) return;
    setCursor((c) => Math.min(total - 1, c + 1));
  }, [currentAnswer, total]);

  const finishNow = useCallback(() => {
    setEndedAt((prev) => prev ?? Date.now());
    setSubmitted(true);
    finishMutation.mutate(session.id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["custom-exam", "session", session.id] });
      },
    });
  }, [finishMutation, session.id, queryClient]);

  const doFinish = useCallback(() => {
    finishNow();
    setConfirmSubmit(false);
  }, [finishNow]);

  // Auto-submit at deadline.
  useEffect(() => {
    if (submitted) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      finishNow();
      return;
    }
    const t = setTimeout(() => finishNow(), remaining);
    return () => clearTimeout(t);
  }, [deadline, submitted, finishNow]);

  const exit = useCallback(() => {
    navigate({ to: "/student/custom-exam" });
  }, [navigate]);

  const restart = useCallback(() => {
    // Retake = start a fresh exam from the wizard (server-authoritative).
    navigate({ to: "/student/custom-exam" });
  }, [navigate]);

  if (submitted) {
    const timeTakenMs = Math.max(0, (endedAt ?? Date.now()) - startedAt);
    return (
      <ResultView
        config={config}
        answers={answers}
        stats={stats}
        timeTakenMs={timeTakenMs}
        onRestart={restart}
        onExit={exit}
        onJump={(i) => {
          setSubmitted(false);
          setCursor(i);
        }}
      />
    );
  }

  const bookmarked = bookmarks.has(cursor);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute -top-24 right-0 h-[360px] w-[360px] rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>

      <ExamHeader
        name={config.name}
        cursor={cursor}
        total={total}
        progressPct={progressPct}
        deadline={deadline}
        onExit={() => setConfirmExit(true)}
      />

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 pb-40 pt-6 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <div>
          <TopStrip cursor={cursor} total={total} answered={answeredCount} deadline={deadline} />

          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Exam progress</span>
              <span className="font-semibold text-foreground tabular-nums">{progressPct}%</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/70">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500"
                initial={false}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          <QuestionCard
            q={current}
            cursor={cursor}
            chosen={currentAnswer?.chosen ?? null}
            bookmarked={bookmarked}
            onChoose={chooseOption}
          />
        </div>

        <aside className="hidden flex-col gap-4 lg:sticky lg:top-24 lg:flex lg:self-start">
          <SideStats stats={stats} total={total} deadline={deadline} examName={config.name} />
          <NavigatorPanel
            total={total}
            answers={answers}
            bookmarks={bookmarks}
            visited={visited}
            cursor={cursor}
            onJump={jumpTo}
          />
        </aside>
      </div>

      <BottomBar
        cursor={cursor}
        total={total}
        chosen={!!currentAnswer?.chosen}
        bookmarked={bookmarked}
        onPrev={goPrev}
        onNext={goNext}
        onBookmark={toggleBookmark}
        onSubmitAnswer={submitAnswer}
        onFinish={() => setConfirmSubmit(true)}
      />

      <AnimatePresence>
        {confirmSubmit && (
          <ConfirmModal
            title="Finish exam?"
            body={`You have answered ${answeredCount} of ${total}. Unanswered questions will be marked as skipped.`}
            confirmLabel="Finish exam"
            onCancel={() => setConfirmSubmit(false)}
            onConfirm={doFinish}
          />
        )}
        {confirmExit && (
          <ConfirmModal
            title="Exit exam?"
            body="Your progress is saved. You can resume this exam from the Custom Exam page."
            confirmLabel="Exit"
            danger
            onCancel={() => setConfirmExit(false)}
            onConfirm={exit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ExamHeader({
  name,
  cursor,
  total,
  progressPct,
  deadline,
  onExit,
}: {
  name: string;
  cursor: number;
  total: number;
  progressPct: number;
  deadline: number;
  onExit: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground transition hover:text-foreground"
          aria-label="Exit exam"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            <span>Custom Exam</span>
          </div>
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{name}</h1>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs font-medium">
            <span className="opacity-60">Q</span>
            <span className="font-semibold tabular-nums">
              {String(cursor + 1).padStart(2, "0")}/{total}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs font-medium">
            <span className="opacity-60">Progress</span>
            <span className="font-semibold tabular-nums">{progressPct}%</span>
          </span>
          <CountdownPill deadline={deadline} />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function useTick(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) & 0x3fffffff), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

const CountdownPill = memo(function CountdownPill({ deadline }: { deadline: number }) {
  useTick(1000);
  const remaining = Math.max(0, deadline - Date.now());
  const critical = remaining <= 60_000;
  const warn = remaining <= 300_000 && !critical;
  const cls = critical
    ? "border-rose-400/60 bg-rose-500/10 text-rose-600 dark:text-rose-300"
    : warn
      ? "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-300"
      : "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <Timer className="h-3 w-3" />
      <span className="opacity-70">Time left</span>
      <span className="tabular-nums">{formatDurationLong(remaining)}</span>
    </span>
  );
});

function TopStrip({
  cursor,
  total,
  answered,
  deadline,
}: {
  cursor: number;
  total: number;
  answered: number;
  deadline: number;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/40 bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/15 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-300">
        <span className="opacity-70">Question</span>
        <span className="font-semibold tabular-nums">
          {String(cursor + 1).padStart(2, "0")} / {total}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs font-medium text-foreground">
        <Target className="h-3 w-3" />
        <span className="opacity-70">Answered</span>
        <span className="font-semibold tabular-nums">
          {answered} / {total}
        </span>
      </span>
      <CountdownPill deadline={deadline} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

const QuestionCard = memo(function QuestionCard({
  q,
  cursor,
  chosen,
  bookmarked,
  onChoose,
}: {
  q: ExamQuestion;
  cursor: number;
  chosen: string | null;
  bookmarked: boolean;
  onChoose: (k: string) => void;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={cursor}
        initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card/70 p-6 shadow-2xl shadow-indigo-500/[0.07] backdrop-blur-xl sm:p-9"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/10 to-transparent blur-2xl"
        />
        <div className="relative mb-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="rounded-full border border-border/60 bg-background/50 px-2 py-0.5">
            {q.subjectName}
          </span>
          <span>·</span>
          <span>{q.chapterName}</span>
          <span>·</span>
          <span
            className={
              q.src === "mcq"
                ? "text-indigo-500 dark:text-indigo-300"
                : "text-fuchsia-500 dark:text-fuchsia-300"
            }
          >
            {q.src === "mcq" ? "MCQ Practice" : "Question Bank"}
          </span>
          {bookmarked && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-300">
              <BookmarkCheck className="h-3 w-3" />
              <span className="text-[10px] font-semibold">Bookmarked</span>
            </span>
          )}
        </div>
        <div className="relative mb-7 flex items-start gap-4">
          <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
            {String(cursor + 1).padStart(2, "0")}
          </span>
          <h2 className="text-xl font-semibold leading-[1.35] tracking-tight text-foreground sm:text-2xl md:text-[26px]">
            {q.question}
          </h2>
        </div>
        <div className="flex flex-col gap-3">
          {q.options.map((opt) => {
            const selected = chosen === opt.key;
            return (
              <motion.button
                whileTap={{ scale: 0.99 }}
                key={opt.key}
                type="button"
                onClick={() => onChoose(opt.key)}
                className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border-2 px-4 py-4 text-left text-[15px] transition-all sm:px-5 sm:py-4 ${
                  selected
                    ? "border-indigo-400/80 bg-indigo-400/10 shadow-md shadow-indigo-500/15"
                    : "border-border/60 bg-background/40 hover:-translate-y-[1px] hover:border-indigo-300/70 hover:bg-accent/40"
                }`}
              >
                <span className="relative flex shrink-0 items-center gap-3">
                  <span
                    className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-500"
                        : "border-border/80 bg-background group-hover:border-indigo-400"
                    }`}
                    aria-hidden
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition ${
                      selected
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
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

/* ------------------------------------------------------------------ */

const SideStats = memo(function SideStats({
  stats,
  total,
  deadline,
  examName,
}: {
  stats: { answered: number; skipped: number; correct: number; wrong: number };
  total: number;
  deadline: number;
  examName: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-lg shadow-indigo-500/[0.06] backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-500">
          <Clock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{examName}</div>
          <div className="text-[11px] text-muted-foreground">Timed session</div>
        </div>
      </div>
      <div className="mb-3">
        <CountdownPill deadline={deadline} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <MiniRow label="Answered" value={stats.answered} />
        <MiniRow label="Skipped" value={total - stats.answered} />
        <MiniRow label="Total" value={total} />
        <MiniRow
          label="Complete"
          value={`${total === 0 ? 0 : Math.round((stats.answered / total) * 100)}%`}
        />
      </div>
    </div>
  );
});

function MiniRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const PAGE_SIZE = 100;

const NavigatorPanel = memo(function NavigatorPanel({
  total,
  answers,
  bookmarks,
  visited,
  cursor,
  onJump,
}: {
  total: number;
  answers: Record<number, AnswerRecord>;
  bookmarks: Set<number>;
  visited: Set<number>;
  cursor: number;
  onJump: (i: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [page, setPage] = useState(() => Math.min(pages - 1, Math.floor(cursor / PAGE_SIZE)));
  useEffect(() => {
    const target = Math.min(pages - 1, Math.floor(cursor / PAGE_SIZE));
    setPage((p) => (p === target ? p : target));
  }, [cursor, pages]);
  const start = page * PAGE_SIZE;
  const end = Math.min(total, start + PAGE_SIZE);
  const idxs: number[] = [];
  for (let i = start; i < end; i++) idxs.push(i);
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Question palette
        </div>
        <div className="text-[11px] text-muted-foreground">{total} total</div>
      </div>
      <div className="grid grid-cols-6 gap-1.5 xl:grid-cols-8">
        {idxs.map((i) => {
          const chosen = !!answers[i]?.chosen;
          const isCurrent = i === cursor;
          const isBookmarked = bookmarks.has(i);
          const wasVisited = visited.has(i);
          // Status priority: current > answered > skipped(visited & !answered) > not-visited.
          const base = isCurrent
            ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30"
            : chosen
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
              : wasVisited
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                : "bg-muted text-muted-foreground hover:bg-accent";
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              className={`relative flex h-8 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition ${base}`}
              aria-label={`Question ${i + 1}${
                chosen ? " (answered)" : wasVisited ? " (skipped)" : " (not visited)"
              }${isBookmarked ? " (bookmarked)" : ""}${isCurrent ? " (current)" : ""}`}
            >
              {i + 1}
              {isBookmarked && (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] text-white shadow ring-2 ring-background"
                >
                  <Bookmark className="h-2 w-2" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/50 px-2 font-medium transition hover:bg-accent disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" /> Prev
          </button>
          <span className="tabular-nums">
            Q{start + 1}–{end} · Page {page + 1}/{pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/50 px-2 font-medium transition hover:bg-accent disabled:opacity-40"
          >
            Next <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-indigo-500 to-fuchsia-500" />{" "}
          Current
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/60" /> Answered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/50" /> Skipped
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" /> Not visited
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full bg-amber-500 text-[6px] text-white">
            <Bookmark className="h-1.5 w-1.5" strokeWidth={3} />
          </span>
          Bookmarked
        </span>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */

const BottomBar = memo(function BottomBar({
  cursor,
  total,
  chosen,
  bookmarked,
  onPrev,
  onNext,
  onBookmark,
  onSubmitAnswer,
  onFinish,
}: {
  cursor: number;
  total: number;
  chosen: boolean;
  bookmarked: boolean;
  onPrev: () => void;
  onNext: () => void;
  onBookmark: () => void;
  onSubmitAnswer: () => void;
  onFinish: () => void;
}) {
  const atFirst = cursor === 0;
  const atLast = cursor >= total - 1;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="pointer-events-auto mx-auto flex w-full max-w-4xl flex-wrap items-center gap-1.5 rounded-2xl border border-border/60 bg-background/80 p-1.5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:gap-2 sm:p-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={atFirst}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <button
          type="button"
          onClick={onBookmark}
          aria-pressed={bookmarked}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition sm:text-sm ${
            bookmarked
              ? "border-amber-400/70 bg-amber-500/15 text-amber-600 dark:text-amber-300"
              : "border-border/60 bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          <span className="hidden sm:inline">{bookmarked ? "Bookmarked" : "Bookmark"}</span>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={atLast}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onSubmitAnswer}
            disabled={!chosen || atLast}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/30 transition hover:shadow-lg hover:shadow-indigo-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:text-sm"
            title={!chosen ? "Select an option first" : "Submit and continue"}
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Submit Answer</span>
          </button>
          <button
            type="button"
            onClick={onFinish}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:shadow-lg hover:shadow-emerald-500/40 active:scale-[0.98] sm:px-4 sm:text-sm"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="hidden sm:inline">Finish Exam</span>
            <span className="sm:hidden">Finish</span>
          </button>
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */

function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-border/60 bg-background p-6 shadow-2xl"
      >
        <div className="text-lg font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-semibold transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition ${
              danger
                ? "bg-gradient-to-r from-rose-500 to-orange-500 shadow-rose-500/30 hover:shadow-xl hover:shadow-rose-500/40"
                : "bg-gradient-to-r from-indigo-500 to-fuchsia-500 shadow-indigo-500/30 hover:shadow-xl hover:shadow-fuchsia-500/30"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function ResultView({
  config,
  answers,
  stats,
  timeTakenMs,
  onRestart,
  onExit,
  onJump,
}: {
  config: ExamConfig;
  answers: Record<number, AnswerRecord>;
  stats: {
    correct: number;
    wrong: number;
    skipped: number;
    answered: number;
    accuracy: number;
    score: number;
  };
  timeTakenMs: number;
  onRestart: () => void;
  onExit: () => void;
  onJump: (i: number) => void;
}) {
  const total = config.questions.length;
  const [showReview, setShowReview] = useState(false);
  const [filter, setFilter] = useState<"all" | "correct" | "wrong" | "skipped">("all");
  const percentage = total === 0 ? 0 : Math.round((stats.correct / total) * 100);

  const filtered = useMemo(() => {
    return config.questions
      .map((q, i) => ({ q, i, chosen: answers[i]?.chosen ?? null }))
      .filter(({ q, chosen }) => {
        if (filter === "all") return true;
        if (filter === "skipped") return !chosen;
        const ok = chosen === q.answer;
        return filter === "correct" ? ok : !!chosen && !ok;
      });
  }, [config.questions, answers, filter]);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute -top-24 right-0 h-[360px] w-[360px] rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>
      <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">
              <Sparkles className="h-3 w-3" />
              Exam complete
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {config.name}
            </h1>
            <div className="mt-1 text-xs text-muted-foreground">
              {config.levelName} · {config.subjectNames.join(", ")}
            </div>
          </div>
          <Link
            to="/student/custom-exam"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs font-semibold transition hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Builder
          </Link>
        </div>

        {/* Score summary grid */}
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ScoreCard label="Score" value={`${stats.score}%`} accent />
          <ScoreCard label="Percentage" value={`${percentage}%`} />
          <ScoreCard label="Accuracy" value={`${stats.accuracy}%`} />
          <ScoreCard label="Time Taken" value={formatDurationLong(timeTakenMs)} />
          <ScoreCard label="Total Questions" value={total} />
          <ScoreCard label="Attempted" value={stats.answered} tone="emerald" />
          <ScoreCard label="Skipped" value={total - stats.answered} tone="amber" />
          <ScoreCard label="Correct" value={stats.correct} tone="emerald" />
          <ScoreCard label="Wrong" value={stats.wrong} tone="rose" />
        </div>

        {/* Charts */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Correct vs Wrong vs Skipped">
            <StackedBar
              segments={[
                { label: "Correct", value: stats.correct, cls: "bg-emerald-500" },
                { label: "Wrong", value: stats.wrong, cls: "bg-rose-500" },
                { label: "Skipped", value: total - stats.answered, cls: "bg-amber-500" },
              ]}
              total={total}
            />
          </ChartCard>
          <ChartCard title="Accuracy">
            <AccuracyDonut
              accuracy={stats.accuracy}
              correct={stats.correct}
              answered={stats.answered}
            />
          </ChartCard>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowReview((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/30 transition hover:shadow-lg hover:shadow-indigo-500/40"
          >
            <Target className="h-4 w-4" />
            {showReview ? "Hide Answers" : "Review Answers"}
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-semibold transition hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" />
            Retake Exam
          </button>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:shadow-lg hover:shadow-emerald-500/40"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Custom Exam
          </button>
        </div>

        {/* Question Review */}
        {showReview && (
          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Question review
              </h2>
              <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1 text-[11px]">
                {(["all", "correct", "wrong", "skipped"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`rounded-full px-2.5 py-1 font-semibold capitalize transition ${
                      filter === f
                        ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
                No questions in this category.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {filtered.map(({ q, i, chosen }) => (
                  <ReviewItem key={q.uid} q={q} i={i} chosen={chosen} onJump={() => onJump(i)} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReviewItem({
  q,
  i,
  chosen,
  onJump,
}: {
  q: ExamQuestion;
  i: number;
  chosen: string | null;
  onJump: () => void;
}) {
  const isCorrect = !!chosen && chosen === q.answer;
  const isSkipped = !chosen;
  const status = isSkipped ? "Skipped" : isCorrect ? "Correct" : "Wrong";
  const statusCls = isSkipped
    ? "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-300"
    : isCorrect
      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
      : "border-rose-400/60 bg-rose-500/10 text-rose-600 dark:text-rose-300";
  const cardCls = isSkipped
    ? "border-border/60 bg-card/50"
    : isCorrect
      ? "border-emerald-400/40 bg-emerald-500/[0.06]"
      : "border-rose-400/40 bg-rose-500/[0.06]";
  return (
    <li className={`rounded-2xl border p-4 ${cardCls}`}>
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ${
            isSkipped
              ? "bg-amber-500/80"
              : isCorrect
                ? "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md shadow-emerald-500/30"
                : "bg-gradient-to-br from-rose-500 to-orange-500 shadow-md shadow-rose-500/30"
          }`}
        >
          {isSkipped ? (
            "—"
          ) : isCorrect ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Q{i + 1}</span>
            <span>·</span>
            <span>{q.subjectName}</span>
            <span>·</span>
            <span>{q.chapterName}</span>
            <span
              className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}
            >
              {status}
            </span>
          </div>
          <div className="mt-1 text-sm font-medium leading-relaxed sm:text-[15px]">
            {q.question}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div
              className={`rounded-xl border px-3 py-2 text-xs ${
                isSkipped
                  ? "border-amber-400/40 bg-amber-500/5"
                  : isCorrect
                    ? "border-emerald-400/40 bg-emerald-500/5"
                    : "border-rose-400/40 bg-rose-500/5"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                Selected Answer
              </div>
              <div className="mt-0.5 font-semibold">
                {chosen ? `${chosen}. ${textOfOption(q, chosen)}` : "Not attempted"}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/5 px-3 py-2 text-xs">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 opacity-80 dark:text-emerald-300">
                Correct Answer
              </div>
              <div className="mt-0.5 font-semibold text-emerald-700 dark:text-emerald-200">
                {q.answer}. {textOfOption(q, q.answer)}
              </div>
            </div>
          </div>
          {q.explanation && (
            <div className="mt-3 rounded-xl border border-indigo-400/30 bg-indigo-500/[0.06] px-3 py-2 text-xs leading-relaxed">
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                Explanation
              </div>
              <div className="text-foreground/90">{q.explanation}</div>
            </div>
          )}
          <button
            type="button"
            onClick={onJump}
            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-3 w-3" />
            Open question
          </button>
        </div>
      </div>
    </li>
  );
}

function textOfOption(q: ExamQuestion, key: string): string {
  const o = q.options.find((x) => x.key === key);
  return o ? o.text : "";
}

/* ------------------------------------------------------------------ */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur-xl">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function StackedBar({
  segments,
  total,
}: {
  segments: { label: string; value: number; cls: string }[];
  total: number;
}) {
  const denom = Math.max(1, total);
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted/60">
        {segments.map((s) => {
          const pct = (s.value / denom) * 100;
          if (pct === 0) return null;
          return (
            <motion.div
              key={s.label}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className={`h-full ${s.cls}`}
              title={`${s.label}: ${s.value}`}
            />
          );
        })}
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-2 text-xs">
        {segments.map((s) => {
          const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
          return (
            <li
              key={s.label}
              className="rounded-xl border border-border/60 bg-background/50 px-3 py-2"
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${s.cls}`} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </span>
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {s.value}{" "}
                <span className="text-[11px] font-normal text-muted-foreground">({pct}%)</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccuracyDonut({
  accuracy,
  correct,
  answered,
}: {
  accuracy: number;
  correct: number;
  answered: number;
}) {
  const size = 160;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (accuracy / 100) * c;
  return (
    <div className="flex items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted/60"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#accuracyGrad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - dash }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
          <defs>
            <linearGradient id="accuracyGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-semibold tabular-nums">{accuracy}%</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Accuracy</div>
        </div>
      </div>
      <div className="flex-1 text-xs text-muted-foreground">
        <div className="mb-1">
          Correct on attempted:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {correct}/{answered || 0}
          </span>
        </div>
        <div>Accuracy is the share of attempted questions you answered correctly.</div>
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  tone?: "emerald" | "rose" | "amber";
}) {
  const cls = accent
    ? "border-indigo-400/60 bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-600 dark:text-indigo-300"
    : tone === "emerald"
      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
      : tone === "rose"
        ? "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300"
        : tone === "amber"
          ? "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
          : "border-border/60 bg-card/60";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${cls}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Skeleton() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 h-12 w-full animate-pulse rounded-2xl bg-muted/60" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="h-96 animate-pulse rounded-[28px] bg-muted/50" />
          <div className="hidden lg:block">
            <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
            <div className="mt-4 h-56 animate-pulse rounded-2xl bg-muted/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
