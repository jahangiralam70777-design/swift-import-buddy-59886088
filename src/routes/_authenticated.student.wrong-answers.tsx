import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookmarkIcon,
  BookmarkCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  Database,
  Filter,
  Hourglass,
  Layers,
  LineChart as LineChartIcon,
  ListChecks,
  Moon,
  Repeat2,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/hooks/use-theme";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  getMyWrongAnswers,
  setWrongCleared,
  submitWrongRetry,
  toggleWrongBookmark,
  type WrongAnswerRow,
} from "@/lib/wrong-answers.functions";

export const Route = createFileRoute("/_authenticated/student/wrong-answers")({
  head: () => ({
    meta: [
      { title: "Wrong Answers — Student Panel" },
      {
        name: "description",
        content:
          "Every question you answered incorrectly, collected automatically from MCQ Practice, Question Bank Practice, and Custom Exam.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WrongAnswersPage,
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Source = "mcq" | "qbank";

type WrongItem = {
  key: string; // wrong_answer_bookmarks.id
  source: Source;
  questionId: string;
  levelId: string;
  levelName: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  questionIndex: number;
  question: string;
  options: { key: string; text: string }[];
  correctKey: string;
  correctIndex: number;
  explanation: string;
  attempts: number;
  lastWrongAt: number;
  clearedAt: number | null;
  haystack: string;
};

type SortKey = "newest" | "oldest" | "most-repeated";
type SourceFilter = "both" | "mcq" | "qbank";
type ReviewFilter = "all" | "reviewed" | "pending" | "repeated";

function rowToItem(r: WrongAnswerRow): WrongItem {
  return {
    key: r.id,
    source: r.source,
    questionId: r.questionId,
    levelId: r.levelId,
    levelName: r.levelName,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
    chapterId: r.chapterId,
    chapterName: r.chapterName,
    questionIndex: r.questionIndex,
    question: r.question,
    options: r.options,
    correctKey: r.correctKey,
    correctIndex: r.correctIndex,
    explanation: r.explanation,
    attempts: r.wrongCount,
    lastWrongAt: r.lastWrongAt,
    clearedAt: r.clearedAt,
    haystack: (
      r.question +
      " " +
      r.chapterName +
      " " +
      r.subjectName +
      " " +
      r.levelName
    ).toLowerCase(),
  };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function WrongAnswersPage() {
  const { theme, toggle } = useTheme();
  const queryClient = useQueryClient();

  const getRows = useServerFn(getMyWrongAnswers);
  const setClearedFn = useServerFn(setWrongCleared);
  const toggleBookmarkFn = useServerFn(toggleWrongBookmark);
  const submitRetryFn = useServerFn(submitWrongRetry);

  const wrongQuery = useQuery({
    queryKey: ["wrong-answers", "list"],
    queryFn: () => getRows(),
    staleTime: 30_000,
  });

  const hydrated = !wrongQuery.isLoading;
  const allWrong = useMemo<WrongItem[]>(
    () => (wrongQuery.data ?? []).map(rowToItem),
    [wrongQuery.data],
  );

  // Session-only UI state — NOT persisted anywhere (no localStorage).
  // Tracks the letter the student picked in the current review modal open,
  // and how many times they successfully re-answered a question in the
  // current tab. Both reset on reload — that's fine for premium UX.
  const [attempts, setAttempts] = useState<Record<string, string>>({});
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});

  const [levelId, setLevelId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("both");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 180);
  const [sort, setSort] = useState<SortKey>("newest");

  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const PAGE_SIZE = 40;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /* ------------------- derived: reviewed + bookmarks ---------------- */

  // "Reviewed" ↔ server cleared_at. Same for "Removed" — both actions
  // set cleared_at; the "Show removed" toggle just flips visibility.
  const reviewMap = useMemo(() => {
    const m: Record<string, { reviewed: boolean; updatedAt: number }> = {};
    for (const w of allWrong) {
      m[w.key] = { reviewed: w.clearedAt !== null, updatedAt: w.clearedAt ?? 0 };
    }
    return m;
  }, [allWrong]);

  const removed = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const w of allWrong) if (w.clearedAt !== null) m[w.key] = true;
    return m;
  }, [allWrong]);

  const bookmarks = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of wrongQuery.data ?? []) if (r.bookmarked) m[r.id] = true;
    return m;
  }, [wrongQuery.data]);

  /* ------------------- mutations ------------------- */

  const invalidateList = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["wrong-answers", "list"] });
  }, [queryClient]);

  const bookmarkMutation = useMutation({
    mutationFn: (args: { questionId: string; source: Source }) => toggleBookmarkFn({ data: args }),
    onSuccess: invalidateList,
  });

  const clearMutation = useMutation({
    mutationFn: (args: { ids: string[]; cleared: boolean }) => setClearedFn({ data: args }),
    onSuccess: invalidateList,
  });

  const retryMutation = useMutation({
    mutationFn: (args: { id: string; selectedIndex: number }) => submitRetryFn({ data: args }),
    onSuccess: invalidateList,
  });

  const toggleReviewed = useCallback(
    (key: string, force?: boolean) => {
      const cur = reviewMap[key]?.reviewed ?? false;
      const nextVal = force ?? !cur;
      clearMutation.mutate({ ids: [key], cleared: nextVal });
    },
    [reviewMap, clearMutation],
  );

  const toggleBookmark = useCallback(
    (key: string) => {
      const w = allWrong.find((x) => x.key === key);
      if (!w) return;
      bookmarkMutation.mutate({ questionId: w.questionId, source: w.source });
    },
    [allWrong, bookmarkMutation],
  );

  const removeCard = useCallback(
    (key: string) => {
      clearMutation.mutate({ ids: [key], cleared: true });
    },
    [clearMutation],
  );

  const restoreCard = useCallback(
    (key: string) => {
      clearMutation.mutate({ ids: [key], cleared: false });
    },
    [clearMutation],
  );

  const recordAttempt = useCallback((key: string, chosen: string) => {
    setAttempts((prev) => ({ ...prev, [key]: chosen }));
  }, []);

  const incrementReviewCount = useCallback((key: string) => {
    setReviewCounts((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  }, []);

  /* ---------------------- summary metrics ------------------------ */

  const visibleWrong = useMemo(
    () => allWrong.filter((w) => (showRemoved ? removed[w.key] : !removed[w.key])),
    [allWrong, removed, showRemoved],
  );

  const summary = useMemo(() => {
    const total = allWrong.length;
    const mcqCount = allWrong.filter((w) => w.source === "mcq").length;
    const qbankCount = allWrong.filter((w) => w.source === "qbank").length;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = allWrong.filter((w) => w.lastWrongAt >= startOfDay.getTime()).length;
    const reviewed = allWrong.filter((w) => reviewMap[w.key]?.reviewed).length;
    const pending = total - reviewed;
    const repeated = allWrong.filter((w) => w.attempts > 1).length;
    return { total, mcqCount, qbankCount, today, reviewed, pending, repeated };
  }, [allWrong, reviewMap]);

  /* ---------------------- tracking / charts ---------------------- */

  const trackingStats = useMemo(() => {
    const scope = allWrong;
    const bucket = <K extends string>(keyOf: (w: WrongItem) => { id: K; label: string }) => {
      const map = new Map<
        K,
        { id: K; label: string; total: number; reviewed: number; repeated: number }
      >();
      for (const w of scope) {
        const { id, label } = keyOf(w);
        const cur = map.get(id) ?? { id, label, total: 0, reviewed: 0, repeated: 0 };
        cur.total += 1;
        if (reviewMap[w.key]?.reviewed) cur.reviewed += 1;
        if (w.attempts > 1) cur.repeated += 1;
        map.set(id, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    };

    const byLevel = bucket((w) => ({ id: w.levelId, label: w.levelName }));
    const bySubject = bucket((w) => ({ id: w.subjectId, label: w.subjectName }));
    const byChapter = bucket((w) => ({ id: w.chapterId, label: w.chapterName }));
    const bySource = bucket((w) => ({
      id: w.source,
      label: w.source === "mcq" ? "MCQ Practice" : "Question Bank",
    }));

    const days: { date: string; label: string; wrong: number; reviewed: number }[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(start.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const from = d.getTime();
      const to = next.getTime();
      let wrong = 0;
      let reviewed = 0;
      for (const w of scope) {
        if (w.lastWrongAt >= from && w.lastWrongAt < to) {
          wrong += 1;
          if (reviewMap[w.key]?.reviewed) reviewed += 1;
        }
      }
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString([], { month: "short", day: "numeric" }),
        wrong,
        reviewed,
      });
    }

    return { byLevel, bySubject, byChapter, bySource, overTime: days };
  }, [allWrong, reviewMap]);

  /* --------------------- filter option lists --------------------- */

  const levelOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const w of visibleWrong) {
      if (sourceFilter !== "both" && w.source !== sourceFilter) continue;
      if (!seen.has(w.levelId)) seen.set(w.levelId, w.levelName);
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [visibleWrong, sourceFilter]);

  const subjectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const w of visibleWrong) {
      if (sourceFilter !== "both" && w.source !== sourceFilter) continue;
      if (levelId && w.levelId !== levelId) continue;
      if (!seen.has(w.subjectId)) seen.set(w.subjectId, w.subjectName);
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [visibleWrong, sourceFilter, levelId]);

  const chapterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const w of visibleWrong) {
      if (sourceFilter !== "both" && w.source !== sourceFilter) continue;
      if (levelId && w.levelId !== levelId) continue;
      if (subjectId && w.subjectId !== subjectId) continue;
      if (!seen.has(w.chapterId)) seen.set(w.chapterId, w.chapterName);
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [visibleWrong, sourceFilter, levelId, subjectId]);

  useEffect(() => {
    if (levelId && !levelOptions.find((l) => l.id === levelId)) setLevelId("");
  }, [levelOptions, levelId]);
  useEffect(() => {
    if (subjectId && !subjectOptions.find((s) => s.id === subjectId)) setSubjectId("");
  }, [subjectOptions, subjectId]);
  useEffect(() => {
    if (chapterId && !chapterOptions.find((c) => c.id === chapterId)) setChapterId("");
  }, [chapterOptions, chapterId]);

  /* ----------------------- filtered rows ------------------------- */

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = visibleWrong.filter((w) => {
      if (sourceFilter !== "both" && w.source !== sourceFilter) return false;
      if (levelId && w.levelId !== levelId) return false;
      if (subjectId && w.subjectId !== subjectId) return false;
      if (chapterId && w.chapterId !== chapterId) return false;
      const isReviewed = !!reviewMap[w.key]?.reviewed;
      if (reviewFilter === "reviewed" && !isReviewed) return false;
      if (reviewFilter === "pending" && isReviewed) return false;
      if (reviewFilter === "repeated" && w.attempts < 2) return false;
      if (showBookmarkedOnly && !bookmarks[w.key]) return false;
      if (q && !w.haystack.includes(q)) return false;
      return true;
    });

    if (sort === "newest") {
      list = [...list].sort((a, b) => b.lastWrongAt - a.lastWrongAt);
    } else if (sort === "oldest") {
      list = [...list].sort((a, b) => a.lastWrongAt - b.lastWrongAt);
    } else if (sort === "most-repeated") {
      list = [...list].sort((a, b) => b.attempts - a.attempts);
    }
    return list;
  }, [
    visibleWrong,
    sourceFilter,
    levelId,
    subjectId,
    chapterId,
    reviewFilter,
    reviewMap,
    bookmarks,
    showBookmarkedOnly,
    debouncedSearch,
    sort,
  ]);

  const reviewingIndex = useMemo(
    () => (reviewingKey ? filtered.findIndex((w) => w.key === reviewingKey) : -1),
    [filtered, reviewingKey],
  );
  const reviewingItem = useMemo(
    () =>
      reviewingIndex >= 0
        ? filtered[reviewingIndex]
        : (allWrong.find((w) => w.key === reviewingKey) ?? null),
    [filtered, reviewingIndex, allWrong, reviewingKey],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    sourceFilter,
    levelId,
    subjectId,
    chapterId,
    reviewFilter,
    showBookmarkedOnly,
    showRemoved,
    debouncedSearch,
    sort,
  ]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) =>
            c >= filtered.length ? c : Math.min(c + PAGE_SIZE, filtered.length),
          );
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  /* --------------------- retry handler --------------------------- */

  const handleRetry = useCallback(
    async (item: WrongItem, chosenKey: string) => {
      const idx = item.options.findIndex((o) => o.key === chosenKey);
      if (idx < 0) return { isCorrect: false };
      const res = await retryMutation.mutateAsync({
        id: item.key,
        selectedIndex: idx,
      });
      return res;
    },
    [retryMutation],
  );

  /* -------------------------- render ----------------------------- */

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-rose-500/15 blur-3xl" />
        <div className="absolute -top-24 right-0 h-[360px] w-[360px] rounded-full bg-amber-500/15 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/30">
            <XCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              Wrong Answers
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Auto-collected from MCQ Practice, Question Bank, and Custom Exam.
            </p>
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-foreground transition hover:bg-accent"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 text-rose-500 ring-1 ring-inset ring-rose-500/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Learn from every mistake
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every incorrect answer from MCQ Practice, Question Bank, and Custom Exam lands here
              automatically. Retry them, bookmark the tricky ones, and clear them as you master each
              one.
            </p>
          </div>
        </div>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard
            icon={XCircle}
            label="Total Wrong Questions"
            value={summary.total}
            tone="from-rose-500/20 via-rose-500/5 to-transparent"
            accent="text-rose-500"
          />
          <SummaryCard
            icon={ListChecks}
            label="MCQ Practice Wrong"
            value={summary.mcqCount}
            tone="from-indigo-500/20 via-indigo-500/5 to-transparent"
            accent="text-indigo-500"
          />
          <SummaryCard
            icon={Database}
            label="Question Bank Wrong"
            value={summary.qbankCount}
            tone="from-fuchsia-500/20 via-fuchsia-500/5 to-transparent"
            accent="text-fuchsia-500"
          />
          <SummaryCard
            icon={CalendarDays}
            label="Today's Wrong Answers"
            value={summary.today}
            tone="from-amber-500/20 via-amber-500/5 to-transparent"
            accent="text-amber-500"
          />
          <SummaryCard
            icon={CheckCircle2}
            label="Cleared"
            value={summary.reviewed}
            tone="from-emerald-500/20 via-emerald-500/5 to-transparent"
            accent="text-emerald-500"
          />
          <SummaryCard
            icon={Hourglass}
            label="Pending"
            value={summary.pending}
            tone="from-sky-500/20 via-sky-500/5 to-transparent"
            accent="text-sky-500"
          />
        </section>

        <ProgressIndicators summary={summary} />

        <TrackingSection summary={summary} stats={trackingStats} />

        <section className="mb-4 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xl sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Level"
              value={levelId}
              onChange={(v) => {
                setLevelId(v);
                setSubjectId("");
                setChapterId("");
              }}
              options={[
                { value: "", label: "All levels" },
                ...levelOptions.map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
            <SelectField
              label="Subject"
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setChapterId("");
              }}
              options={[
                { value: "", label: "All subjects" },
                ...subjectOptions.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <SelectField
              label="Chapter"
              value={chapterId}
              onChange={setChapterId}
              options={[
                { value: "", label: "All chapters" },
                ...chapterOptions.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Question Source
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { v: "mcq", label: "MCQ Practice" },
                    { v: "qbank", label: "Question Bank" },
                    { v: "both", label: "Both" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setSourceFilter(opt.v)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      sourceFilter === opt.v
                        ? "border-rose-400/70 bg-rose-500/10 text-foreground"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search question, chapter, subject…"
                className="h-10 w-full rounded-xl border border-border/60 bg-background pl-9 pr-3 text-sm shadow-sm outline-none transition-all focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Sort By
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-10 rounded-xl border border-border/60 bg-background px-3 text-sm shadow-sm outline-none focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="most-repeated">Most Repeated Wrong</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(
              [
                { v: "all", label: "All" },
                { v: "pending", label: "Only Pending" },
                { v: "reviewed", label: "Only Cleared" },
                { v: "repeated", label: "Only Repeated Mistakes" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setReviewFilter(opt.v)}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                  reviewFilter === opt.v
                    ? "border-rose-400/70 bg-rose-500/10 text-foreground"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowBookmarkedOnly((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                showBookmarkedOnly
                  ? "border-amber-400/70 bg-amber-500/10 text-foreground"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <BookmarkCheck className="h-3 w-3" /> Bookmarked
            </button>
            <button
              type="button"
              onClick={() => setShowRemoved((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                showRemoved
                  ? "border-sky-400/70 bg-sky-500/10 text-foreground"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Trash2 className="h-3 w-3" /> {showRemoved ? "Viewing cleared" : "Show cleared"}
            </button>

            {filtered.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const ids = filtered.map((w) => w.key);
                    if (ids.length === 0) return;
                    clearMutation.mutate({ ids, cleared: !showRemoved });
                  }}
                  disabled={clearMutation.isPending}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-500/15 disabled:opacity-50 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {showRemoved ? "Restore filtered" : "Bulk clear filtered"}
                </button>
              </>
            )}
          </div>
        </section>

        <section>
          {hydrated && filtered.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span>
                <span className="tabular-nums text-foreground">
                  {filtered.length.toLocaleString()}
                </span>{" "}
                {filtered.length === 1 ? "question" : "questions"}
                {filtered.length !== visibleWrong.length && (
                  <span className="ml-1 normal-case tracking-normal text-muted-foreground">
                    (of {visibleWrong.length.toLocaleString()})
                  </span>
                )}
              </span>
              <span className="normal-case tracking-normal">
                Sorted by{" "}
                <span className="font-semibold text-foreground">
                  {sort === "newest" ? "Newest" : sort === "oldest" ? "Oldest" : "Most repeated"}
                </span>
              </span>
            </div>
          )}
          {!hydrated ? (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="relative h-40 overflow-hidden rounded-2xl border border-border/60 bg-card/40"
                >
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState total={visibleWrong.length} showRemoved={showRemoved} />
          ) : (
            <>
              <div className="grid gap-4">
                {visibleRows.map((w) => (
                  <WrongCard
                    key={w.key}
                    item={w}
                    reviewed={!!reviewMap[w.key]?.reviewed}
                    bookmarked={!!bookmarks[w.key]}
                    isRemoved={!!removed[w.key]}
                    reviewCount={reviewCounts[w.key] ?? 0}
                    onToggleReviewed={() => toggleReviewed(w.key)}
                    onToggleBookmark={() => toggleBookmark(w.key)}
                    onRemove={() => removeCard(w.key)}
                    onRestore={() => restoreCard(w.key)}
                    onReview={() => setReviewingKey(w.key)}
                  />
                ))}
              </div>
              {visibleCount < filtered.length && (
                <div ref={sentinelRef} className="mt-6 flex flex-col items-center gap-3">
                  <div className="flex w-full max-w-md items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="tabular-nums">
                      Showing {visibleCount.toLocaleString()} of {filtered.length.toLocaleString()}
                    </span>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/70 px-4 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition hover:-translate-y-[1px] hover:border-rose-300/70 hover:shadow-md hover:shadow-rose-500/10"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {reviewingItem && (
        <ReviewModal
          item={reviewingItem}
          reviewed={!!reviewMap[reviewingItem.key]?.reviewed}
          bookmarked={!!bookmarks[reviewingItem.key]}
          previousWrongKey={attempts[reviewingItem.key] ?? null}
          hasPrev={reviewingIndex > 0}
          hasNext={reviewingIndex >= 0 && reviewingIndex < filtered.length - 1}
          position={reviewingIndex >= 0 ? reviewingIndex + 1 : null}
          total={filtered.length}
          attempts={reviewingItem.attempts}
          reviewCount={reviewCounts[reviewingItem.key] ?? 0}
          onClose={() => setReviewingKey(null)}
          onPrev={() => {
            if (reviewingIndex > 0) setReviewingKey(filtered[reviewingIndex - 1].key);
          }}
          onNext={() => {
            if (reviewingIndex >= 0 && reviewingIndex < filtered.length - 1)
              setReviewingKey(filtered[reviewingIndex + 1].key);
          }}
          onToggleReviewed={() => toggleReviewed(reviewingItem.key)}
          onToggleBookmark={() => toggleBookmark(reviewingItem.key)}
          onRecordAttempt={(k) => recordAttempt(reviewingItem.key, k)}
          onIncrementReviewCount={() => incrementReviewCount(reviewingItem.key)}
          onRetry={(chosenKey) => handleRetry(reviewingItem, chosenKey)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone: string;
  accent: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${tone} p-4 shadow-sm backdrop-blur-xl`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl bg-background/60 ring-1 ring-inset ring-border/60 ${accent}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
        {value}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-sm shadow-sm outline-none focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyState({ total, showRemoved }: { total: number; showRemoved: boolean }) {
  const noneAtAll = total === 0;
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-12 text-center backdrop-blur">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-sky-500/15 text-emerald-500">
        {noneAtAll ? <CheckCircle2 className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
      </div>
      <h3 className="text-base font-semibold">
        {noneAtAll
          ? showRemoved
            ? "Nothing in the removed list"
            : "No wrong answers yet"
          : "No matches for the current filters"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {noneAtAll && !showRemoved
          ? "As soon as you answer a question incorrectly in MCQ Practice or Qns Bank Practice, it will appear here automatically."
          : "Try clearing a filter, changing the source, or updating your search."}
      </p>
    </div>
  );
}

function formatWhen(ts: number) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d >= startOfToday) return `Today ${time}`;
  if (d >= startOfYesterday) return `Yesterday ${time}`;
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Wrong card                                                          */
/* ------------------------------------------------------------------ */

function WrongCard({
  item,
  reviewed,
  bookmarked,
  isRemoved,
  reviewCount,
  onToggleReviewed,
  onToggleBookmark,
  onRemove,
  onRestore,
  onReview,
}: {
  item: WrongItem;
  reviewed: boolean;
  bookmarked: boolean;
  isRemoved: boolean;
  reviewCount: number;
  onToggleReviewed: () => void;
  onToggleBookmark: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onReview: () => void;
}) {
  const sourceLabel = item.source === "mcq" ? "MCQ Practice" : "Question Bank";
  const SourceIcon = item.source === "mcq" ? ListChecks : Database;
  const correctOption = item.options.find((o) => o.key === item.correctKey);
  const isRepeated = item.attempts >= 2;
  const isHot = item.attempts >= 3;

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur-xl transition-all sm:p-6 ${
        isHot
          ? "border-amber-400/60 ring-1 ring-inset ring-amber-400/25 shadow-md shadow-amber-500/10"
          : isRepeated
            ? "border-amber-300/50"
            : reviewed
              ? "border-emerald-400/40"
              : "border-border/60 hover:border-rose-400/50"
      }`}
    >
      {isHot && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/70 to-transparent"
        />
      )}
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        <AttemptBadge attempts={item.attempts} />
        {reviewCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-600 dark:text-sky-400">
            <RotateCcw className="h-3 w-3" /> Reviewed × {reviewCount}
          </span>
        )}
        {reviewed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Reviewed
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-muted-foreground">
          <SourceIcon className="h-3 w-3" /> {sourceLabel}
        </span>
        <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-muted-foreground">
          {item.levelName}
        </span>
        <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-muted-foreground">
          {item.subjectName}
        </span>
        <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-muted-foreground">
          {item.chapterName}
        </span>
      </div>

      {/* Question */}
      <h3 className="mt-3 flex items-start gap-3 text-base font-semibold leading-snug tracking-tight sm:text-lg">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 text-xs font-bold text-white shadow-md shadow-rose-500/25">
          {String(item.questionIndex + 1).padStart(2, "0")}
        </span>
        <span>{item.question}</span>
      </h3>

      {/* Selected wrong / correct answer summary */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/5 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-600 dark:text-rose-400">
            <XCircle className="h-3.5 w-3.5" /> Selected Wrong Answer
          </div>
          <p className="text-sm text-muted-foreground">
            Your specific choice isn't stored during practice. Use{" "}
            <span className="font-medium text-foreground">Review Again</span> to retry this question
            and see where you go wrong.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/5 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Correct Answer
          </div>
          <p className="text-sm text-foreground">
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-500 text-[11px] font-bold text-white">
              {item.correctKey}
            </span>
            {correctOption?.text ?? "—"}
          </p>
        </div>
      </div>

      {/* Explanation */}
      {item.explanation && (
        <div className="mt-3 rounded-xl border border-border/60 bg-background/50 p-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Explanation
          </div>
          <p className="text-muted-foreground">{item.explanation}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="Level" value={item.levelName} />
        <StatChip label="Subject" value={item.subjectName} />
        <StatChip label="Chapter" value={item.chapterName} />
        <StatChip label="Source" value={sourceLabel} />
        <StatChip label="Wrong Attempts" value={String(item.attempts)} accent="text-rose-500" />
        <StatChip label="Last Wrong" value={formatWhen(item.lastWrongAt)} />
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReview}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-rose-500/25 transition hover:shadow-lg hover:shadow-rose-500/30"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Review Again
        </button>

        <button
          type="button"
          onClick={onToggleBookmark}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
            bookmarked
              ? "border-amber-400/70 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-border/60 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {bookmarked ? (
            <>
              <BookmarkCheck className="h-3.5 w-3.5" /> Bookmarked
            </>
          ) : (
            <>
              <BookmarkIcon className="h-3.5 w-3.5" /> Bookmark
            </>
          )}
        </button>

        {isRemoved ? (
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/70 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-500/15 dark:text-sky-300"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-rose-400/60 hover:bg-rose-500/5 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}

        <button
          type="button"
          onClick={onToggleReviewed}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
            reviewed
              ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-border/60 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {reviewed ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Reviewed
            </>
          ) : (
            <>
              <Circle className="h-3.5 w-3.5" /> Mark as reviewed
            </>
          )}
        </button>
      </div>
    </article>
  );
}

function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-0.5 truncate text-sm font-semibold ${accent ?? "text-foreground"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Review Again — modal, no timer, no scoring                          */
/* ------------------------------------------------------------------ */

function ReviewModal({
  item,
  reviewed,
  bookmarked,
  previousWrongKey,
  hasPrev,
  hasNext,
  position,
  total,
  attempts,
  reviewCount,
  onClose,
  onPrev,
  onNext,
  onToggleReviewed,
  onToggleBookmark,
  onRecordAttempt,
  onIncrementReviewCount,
  onRetry,
}: {
  item: WrongItem;
  reviewed: boolean;
  bookmarked: boolean;
  previousWrongKey: string | null;
  hasPrev: boolean;
  hasNext: boolean;
  position: number | null;
  total: number;
  attempts: number;
  reviewCount: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleReviewed: () => void;
  onToggleBookmark: () => void;
  onRecordAttempt: (chosen: string) => void;
  onIncrementReviewCount: () => void;
  onRetry: (chosenKey: string) => Promise<{ isCorrect: boolean }>;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // The wrong choice they made *before* the current attempt — carried
  // across submissions inside this open session.
  const [sessionPrev, setSessionPrev] = useState<string | null>(
    previousWrongKey && previousWrongKey !== item.correctKey ? previousWrongKey : null,
  );

  useEffect(() => {
    setChosen(null);
    setSubmitted(false);
    setSessionPrev(
      previousWrongKey && previousWrongKey !== item.correctKey ? previousWrongKey : null,
    );
  }, [item.key, previousWrongKey, item.correctKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && hasNext) onNext();
      else if (e.key === "ArrowLeft" && hasPrev) onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const isCorrect = submitted && chosen === item.correctKey;

  const check = async () => {
    if (!chosen || submitted) return;
    setSubmitted(true);
    onRecordAttempt(chosen);
    // Fire-and-forget server call — scoring is deterministic client-side
    // via correctKey, and the server auto-clears when correct.
    void onRetry(chosen).catch(() => {});
    if (chosen === item.correctKey) {
      onIncrementReviewCount();
    } else {
      setSessionPrev(chosen);
    }
  };

  const tryAgain = () => {
    setChosen(null);
    setSubmitted(false);
  };

  const correctOption = item.options.find((o) => o.key === item.correctKey);
  const previousOption = sessionPrev ? item.options.find((o) => o.key === sessionPrev) : null;
  const chosenOption = chosen ? item.options.find((o) => o.key === chosen) : null;
  const sourceLabel = item.source === "mcq" ? "MCQ Practice" : "Question Bank";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Review question"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border/60 bg-card shadow-2xl shadow-rose-500/10 sm:max-h-[92vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* decorative wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/20 via-amber-500/10 to-transparent blur-2xl"
        />

        {/* header */}
        <div className="relative flex items-start gap-3 border-b border-border/60 bg-gradient-to-br from-rose-500/10 via-amber-500/5 to-transparent p-4 sm:p-5">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-md shadow-rose-500/25">
            <RotateCcw className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span>Review Mode</span>
              <span aria-hidden>·</span>
              <span>No timer · No scoring</span>
              {position && total > 0 && (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] tabular-nums normal-case tracking-normal text-foreground">
                  {position} / {total}
                </span>
              )}
              {reviewed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Reviewed
                </span>
              )}
            </div>
            <h2 className="mt-1 truncate text-base font-semibold sm:text-lg">{item.chapterName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span>{item.levelName}</span>
              <span aria-hidden>·</span>
              <span>{item.subjectName}</span>
              <span aria-hidden>·</span>
              <span>{sourceLabel}</span>
              <span aria-hidden>·</span>
              <span>Wrong × {attempts}</span>
              {reviewCount > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>Reviewed × {reviewCount}</span>
                </>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <AttemptBadge attempts={attempts} />
              {reviewCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                  <RotateCcw className="h-3 w-3" /> Reviewed × {reviewCount}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="relative flex-1 overflow-y-auto p-5 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Question */}
              <div className="flex items-start gap-4">
                <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-sm font-bold text-white shadow-lg shadow-rose-500/30">
                  {String(item.questionIndex + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl font-semibold leading-[1.35] tracking-tight text-foreground sm:text-2xl md:text-[26px]">
                  {item.question}
                </h3>
              </div>

              {/* Options — premium option cards */}
              <div className="mt-7 flex flex-col gap-3">
                {item.options.map((opt) => {
                  const selected = chosen === opt.key;
                  const optCorrect = opt.key === item.correctKey;
                  const showCorrect = submitted && optCorrect;
                  const showWrong = submitted && selected && !optCorrect;
                  return (
                    <motion.button
                      whileTap={submitted ? undefined : { scale: 0.99 }}
                      key={opt.key}
                      type="button"
                      disabled={submitted}
                      onClick={() => setChosen(opt.key)}
                      className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border-2 px-4 py-4 text-left text-[15px] transition-all sm:px-5 sm:py-4 ${
                        showCorrect
                          ? "border-emerald-400/80 bg-emerald-400/10 shadow-lg shadow-emerald-500/10"
                          : showWrong
                            ? "border-rose-400/80 bg-rose-400/10 shadow-lg shadow-rose-500/10"
                            : selected
                              ? "border-rose-400/80 bg-rose-400/10 shadow-md shadow-rose-500/15"
                              : "border-border/60 bg-background/40 hover:-translate-y-[1px] hover:border-rose-300/70 hover:bg-accent/40 hover:shadow-md hover:shadow-rose-500/[0.06]"
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
                                  ? "border-rose-500 bg-rose-500"
                                  : "border-border/80 bg-background group-hover:border-rose-400"
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
                                  ? "bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-md shadow-rose-500/30"
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

              {/* Result panels */}
              <AnimatePresence>
                {submitted && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: 6, height: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-6 overflow-hidden"
                  >
                    <div
                      className={`rounded-2xl border p-4 text-sm ${
                        isCorrect
                          ? "border-emerald-400/60 bg-emerald-500/5"
                          : "border-rose-400/60 bg-rose-500/5"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span className="text-emerald-700 dark:text-emerald-400">
                              Correct — marked as reviewed
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-rose-600" />
                            <span className="text-rose-700 dark:text-rose-400">
                              Not quite yet — try again
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <AnswerPill
                        label="Correct Answer"
                        optionKey={item.correctKey}
                        text={correctOption?.text ?? "—"}
                        tone="emerald"
                        icon={CheckCircle2}
                      />
                      <AnswerPill
                        label="Your Current Answer"
                        optionKey={chosen ?? "—"}
                        text={chosenOption?.text ?? "—"}
                        tone={isCorrect ? "emerald" : "rose"}
                        icon={isCorrect ? CheckCircle2 : XCircle}
                      />
                      {previousOption && (
                        <AnswerPill
                          label="Your Previous Wrong Answer"
                          optionKey={previousOption.key}
                          text={previousOption.text}
                          tone="amber"
                          icon={RotateCcw}
                          className="sm:col-span-2"
                        />
                      )}
                    </div>

                    {item.explanation && (
                      <div className="mt-4 rounded-2xl border border-border/60 bg-background/50 p-5">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-rose-500" />
                          Explanation
                        </div>
                        <p className="text-[15px] leading-relaxed text-foreground/90">
                          {item.explanation}
                        </p>
                      </div>
                    )}

                    {!isCorrect && (
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={tryAgain}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl hover:shadow-rose-500/30 active:scale-[0.98]"
                        >
                          <RotateCcw className="h-4 w-4" /> Try again
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* footer */}
        <div className="relative flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/70 p-3 backdrop-blur sm:p-4">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeftIcon /> Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next <ChevronRightIcon />
          </button>

          <button
            type="button"
            onClick={onToggleBookmark}
            aria-pressed={bookmarked}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              bookmarked
                ? "border-amber-400/70 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border/60 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {bookmarked ? (
              <BookmarkCheck className="h-3.5 w-3.5" />
            ) : (
              <BookmarkIcon className="h-3.5 w-3.5" />
            )}
            {bookmarked ? "Bookmarked" : "Bookmark"}
          </button>

          <button
            type="button"
            onClick={onToggleReviewed}
            aria-pressed={reviewed}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              reviewed
                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-border/60 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {reviewed ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
            {reviewed ? "Reviewed" : "Mark as Reviewed"}
          </button>

          <div className="ml-auto flex items-center gap-2">
            {!submitted ? (
              <button
                type="button"
                disabled={!chosen}
                onClick={check}
                className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-md transition ${
                  chosen
                    ? "bg-gradient-to-r from-rose-500 to-amber-500 shadow-rose-500/25 hover:shadow-lg hover:shadow-rose-500/30"
                    : "cursor-not-allowed bg-muted text-muted-foreground shadow-none"
                }`}
              >
                Submit answer
              </button>
            ) : hasNext ? (
              <button
                type="button"
                onClick={onNext}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-rose-500/25 transition hover:shadow-lg hover:shadow-rose-500/30"
              >
                Next question <ChevronRightIcon />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-rose-500/25 transition hover:shadow-lg hover:shadow-rose-500/30"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function AnswerPill({
  label,
  optionKey,
  text,
  tone,
  icon: Icon,
  className,
}: {
  label: string;
  optionKey: string;
  text: string;
  tone: "emerald" | "rose" | "amber";
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const styles =
    tone === "emerald"
      ? {
          border: "border-emerald-400/60",
          bg: "bg-emerald-500/5",
          label: "text-emerald-700 dark:text-emerald-400",
          badge: "bg-emerald-500 text-white",
          iconColor: "text-emerald-600",
        }
      : tone === "rose"
        ? {
            border: "border-rose-400/60",
            bg: "bg-rose-500/5",
            label: "text-rose-700 dark:text-rose-400",
            badge: "bg-rose-500 text-white",
            iconColor: "text-rose-600",
          }
        : {
            border: "border-amber-400/60",
            bg: "bg-amber-500/5",
            label: "text-amber-700 dark:text-amber-400",
            badge: "bg-amber-500 text-white",
            iconColor: "text-amber-600",
          };
  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} p-4 ${className ?? ""}`}>
      <div
        className={`mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${styles.label}`}
      >
        <Icon className={`h-3.5 w-3.5 ${styles.iconColor}`} />
        {label}
      </div>
      <div className="flex items-start gap-2 text-sm text-foreground">
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${styles.badge}`}
        >
          {optionKey}
        </span>
        <span className="pt-0.5 leading-relaxed">{text}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tracking / charts                                                   */
/* ------------------------------------------------------------------ */

type BucketRow = {
  id: string;
  label: string;
  total: number;
  reviewed: number;
  repeated: number;
};

type TrackingStats = {
  byLevel: BucketRow[];
  bySubject: BucketRow[];
  byChapter: BucketRow[];
  bySource: BucketRow[];
  overTime: { date: string; label: string; wrong: number; reviewed: number }[];
};

const BAR_COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#8b5cf6",
  "#0ea5e9",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
];

function TrackingSection({
  summary,
  stats,
}: {
  summary: {
    total: number;
    reviewed: number;
    pending: number;
    repeated: number;
    mcqCount: number;
    qbankCount: number;
  };
  stats: TrackingStats;
}) {
  const completion = summary.total > 0 ? Math.round((summary.reviewed / summary.total) * 100) : 0;
  const hasData = summary.total > 0;

  return (
    <section className="mb-6 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" /> Tracking
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TrackerStat
          icon={XCircle}
          label="Total Wrong"
          value={summary.total}
          tone="from-rose-500/20 via-rose-500/5 to-transparent"
          accent="text-rose-500"
        />
        <TrackerStat
          icon={CheckCircle2}
          label="Reviewed"
          value={summary.reviewed}
          hint={hasData ? `${completion}% complete` : undefined}
          tone="from-emerald-500/20 via-emerald-500/5 to-transparent"
          accent="text-emerald-500"
        />
        <TrackerStat
          icon={Hourglass}
          label="Pending"
          value={summary.pending}
          tone="from-sky-500/20 via-sky-500/5 to-transparent"
          accent="text-sky-500"
        />
        <TrackerStat
          icon={Repeat2}
          label="Repeated Wrong"
          value={summary.repeated}
          hint={hasData ? "Answered wrong more than once" : undefined}
          tone="from-amber-500/20 via-amber-500/5 to-transparent"
          accent="text-amber-500"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <BucketTable title="By Level" rows={stats.byLevel} />
        <BucketTable title="By Subject" rows={stats.bySubject} />
        <BucketTable title="By Chapter" rows={stats.byChapter.slice(0, 8)} />
        <BucketTable title="By Question Source" rows={stats.bySource} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Wrong Questions by Subject"
          subtitle="Top subjects driving mistakes"
          empty={stats.bySubject.length === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={stats.bySubject.slice(0, 8)}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={50}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "hsl(var(--accent))", opacity: 0.25 }}
              />
              <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                {stats.bySubject.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Wrong Questions by Chapter"
          subtitle="Top 8 chapters with most wrong answers"
          empty={stats.byChapter.length === 0}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={stats.byChapter.slice(0, 8)}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.4}
                horizontal={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "hsl(var(--accent))", opacity: 0.25 }}
              />
              <Bar dataKey="total" radius={[0, 8, 8, 0]} fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Wrong Questions Over Time"
          subtitle="Last 14 days"
          empty={stats.overTime.every((d) => d.wrong === 0 && d.reviewed === 0)}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={stats.overTime} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="wrong"
                stroke="#f43f5e"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#f43f5e" }}
                activeDot={{ r: 5 }}
                name="Wrong"
              />
              <Line
                type="monotone"
                dataKey="reviewed"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#10b981" }}
                activeDot={{ r: 5 }}
                name="Reviewed"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Review Completion"
          subtitle={
            hasData ? `${summary.reviewed} of ${summary.total} reviewed` : "No wrong answers yet"
          }
          empty={!hasData}
        >
          <div className="flex h-[240px] flex-col items-center justify-center gap-4">
            <CompletionRing percent={completion} />
            <div className="grid w-full grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/5 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">
                  Reviewed
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{summary.reviewed}</div>
              </div>
              <div className="rounded-xl border border-sky-400/40 bg-sky-500/5 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-sky-600 dark:text-sky-400">
                  Pending
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{summary.pending}</div>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>
    </section>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "hsl(var(--foreground))",
  boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
};

function TrackerStat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
  tone: string;
  accent: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${tone} p-4 shadow-sm backdrop-blur-xl`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl bg-background/60 ring-1 ring-inset ring-border/60 ${accent}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
        {value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xl sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <LineChartIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      {empty ? (
        <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 text-xs text-muted-foreground">
          No data yet
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function BucketTable({ title, rows }: { title: string; rows: BucketRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xl sm:p-5">
      <h3 className="mb-3 text-sm font-semibold tracking-tight">{title}</h3>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">
          No data yet
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const pct = Math.round((r.total / max) * 100);
            const reviewedPct = r.total > 0 ? Math.round((r.reviewed / r.total) * 100) : 0;
            return (
              <li key={r.id} className="group">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium text-foreground">{r.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{r.total}</span>
                    <span className="mx-1">·</span>
                    {r.reviewed} reviewed
                    {r.repeated > 0 && (
                      <>
                        <span className="mx-1">·</span>
                        {r.repeated} repeat
                      </>
                    )}
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-background/70">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: BAR_COLORS[i % BAR_COLORS.length],
                      opacity: 0.85,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/70 transition-all"
                    style={{ width: `${Math.round(pct * (reviewedPct / 100))}%` }}
                    aria-hidden
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CompletionRing({ percent }: { percent: number }) {
  const size = 120;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--border))"
          strokeWidth={stroke}
          fill="none"
          opacity={0.4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          fill="none"
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
        <defs>
          <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold tabular-nums tracking-tight">{percent}%</div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Reviewed
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Attempt badge                                                       */
/* ------------------------------------------------------------------ */

function AttemptBadge({ attempts }: { attempts: number }) {
  const n = Math.max(1, attempts);
  const label = n === 1 ? "Wrong 1 Time" : n === 2 ? "Wrong 2 Times" : "Wrong 3+ Times";
  const tone =
    n >= 3
      ? "border-amber-400/60 bg-gradient-to-r from-amber-500/15 to-rose-500/15 text-amber-700 dark:text-amber-300"
      : n === 2
        ? "border-amber-300/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
      title={`Answered incorrectly ${n} time${n === 1 ? "" : "s"}`}
    >
      <XCircle className="h-3 w-3" />
      {label}
      {n >= 3 && <span className="ml-0.5 tabular-nums opacity-70">({n})</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Progress indicators                                                 */
/* ------------------------------------------------------------------ */

function ProgressIndicators({
  summary,
}: {
  summary: {
    total: number;
    reviewed: number;
    pending: number;
    repeated: number;
  };
}) {
  const total = summary.total;
  const reviewedPct = total > 0 ? Math.round((summary.reviewed / total) * 100) : 0;
  const repeatedPct = total > 0 ? Math.round((summary.repeated / total) * 100) : 0;
  const remainingPct = total > 0 ? Math.round((summary.pending / total) * 100) : 0;

  return (
    <section className="mb-6 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-rose-500" /> Your Mistake Notebook
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <ProgressBar
          label="Wrong Questions Remaining"
          value={summary.pending}
          total={total}
          percent={remainingPct}
          gradient="from-rose-500 to-amber-500"
          tone="text-rose-500"
        />
        <ProgressBar
          label="Reviewed"
          value={summary.reviewed}
          total={total}
          percent={reviewedPct}
          gradient="from-emerald-500 to-sky-500"
          tone="text-emerald-500"
        />
        <ProgressBar
          label="Repeated Mistakes"
          value={summary.repeated}
          total={total}
          percent={repeatedPct}
          gradient="from-amber-500 to-fuchsia-500"
          tone="text-amber-500"
        />
      </div>
    </section>
  );
}

function ProgressBar({
  label,
  value,
  total,
  percent,
  gradient,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  percent: number;
  gradient: string;
  tone: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className={`text-xs font-semibold tabular-nums ${tone}`}>{percent}%</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-background/70 ring-1 ring-inset ring-border/40">
        <div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${gradient} transition-[width] duration-700 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-baseline gap-1 text-xs text-muted-foreground">
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {value.toLocaleString()}
        </span>
        <span>of {total.toLocaleString()}</span>
      </div>
    </div>
  );
}
