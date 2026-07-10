import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  BookmarkX,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  Database,
  Download,
  Eye,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  Play,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { formatBookmarkDate, isToday } from "@/lib/bookmarks-store";
import {
  getMyBookmarks,
  removeBookmarks as removeBookmarksFn,
  type BookmarkRow,
} from "@/lib/bookmarks.functions";
import {
  CorrectAnswerBanner,
  ExplanationCard,
  OptionCard,
  QuestionCard,
} from "@/components/mcq/QuestionCard";
import { ConfirmDialog } from "@/components/mcq/ConfirmDialog";

// UI-facing record shape (keeps legacy field names used throughout this file).
type BookmarkRecord = BookmarkRow & {
  key: string;
  reviewedAt: number | null;
};

export const Route = createFileRoute("/_authenticated/student/bookmarks")({
  head: () => ({
    meta: [
      { title: "Study Later — CL Aspire" },
      {
        name: "description",
        content:
          "Every question you've bookmarked from MCQ Practice and Question Bank Practice, ready to review later.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BookmarksPage,
});

type SourceFilter = "all" | "mcq" | "qbank";
type SortMode = "newest" | "oldest" | "reviewed";

// Initial window + growth chunk. Cards use `content-visibility: auto` so the
// browser can skip layout/paint for off-screen items even at 10k+ scale.
const PAGE_SIZE = 48;
// A single card's approximate rendered height — used as the intrinsic-size hint
// so scroll position stays stable when browsers virtualize offscreen cards.
const CARD_INTRINSIC = "0 320px";

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportBookmarksToCsv(rows: BookmarkRecord[]) {
  if (typeof window === "undefined") return;
  const header = [
    "Source",
    "Level",
    "Subject",
    "Chapter",
    "Question #",
    "Question",
    "Options",
    "Correct Answer",
    "Explanation",
    "Bookmarked At",
    "Last Attempt",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    const optsText = r.options.map((o) => `${o.key}) ${o.text}`).join(" | ");
    const correct = r.options.find((o) => o.key === r.answer);
    const correctText = correct ? `${correct.key}) ${correct.text}` : r.answer;
    lines.push(
      [
        r.sourceLabel,
        r.levelName,
        r.subjectName,
        r.chapterName,
        r.qNumber,
        r.question,
        optsText,
        correctText,
        r.explanation,
        r.addedAt ? new Date(r.addedAt).toISOString() : "",
        r.lastAttemptAt ? new Date(r.lastAttemptAt).toISOString() : "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function BookmarksPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks", "all"],
    queryFn: () => getMyBookmarks(),
    staleTime: 15_000,
  });

  const records = useMemo<BookmarkRecord[]>(() => {
    const raw = bookmarksQuery.data ?? [];
    return raw.map((b) => ({ ...b, key: b.id, reviewedAt: b.lastAttemptAt }));
  }, [bookmarksQuery.data]);

  const { levelOptions, subjectOptions, chapterOptions } = useMemo(() => {
    const levels = new Map<string, { id: string; name: string }>();
    const subjects = new Map<string, { id: string; name: string; levelId: string }>();
    const chapters = new Map<string, { id: string; name: string; subjectId: string }>();
    for (const r of records) {
      if (!levels.has(r.levelId)) levels.set(r.levelId, { id: r.levelId, name: r.levelName });
      if (!subjects.has(r.subjectId))
        subjects.set(r.subjectId, { id: r.subjectId, name: r.subjectName, levelId: r.levelId });
      if (!chapters.has(r.chapterId))
        chapters.set(r.chapterId, {
          id: r.chapterId,
          name: r.chapterName,
          subjectId: r.subjectId,
        });
    }
    const cmp = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return {
      levelOptions: [...levels.values()].sort(cmp),
      subjectOptions: [...subjects.values()].sort(cmp),
      chapterOptions: [...chapters.values()].sort(cmp),
    };
  }, [records]);

  const hydrated = !bookmarksQuery.isLoading;

  const [levelId, setLevelIdRaw] = useState<string>("");
  const [subjectId, setSubjectIdRaw] = useState<string>("");
  const [chapterId, setChapterIdRaw] = useState<string>("");
  const [source, setSourceRaw] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSortRaw] = useState<SortMode>("newest");
  const [, startTransition] = useTransition();
  const setLevelId = (v: string) => startTransition(() => setLevelIdRaw(v));
  const setSubjectId = (v: string) => startTransition(() => setSubjectIdRaw(v));
  const setChapterId = (v: string) => startTransition(() => setChapterIdRaw(v));
  const setSource = (v: SourceFilter) => startTransition(() => setSourceRaw(v));
  const setSort = (v: SortMode) => startTransition(() => setSortRaw(v));

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);

  const removeMutation = useMutation({
    mutationFn: (ids: string[]) => removeBookmarksFn({ data: { ids } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["wrong-answers"] });
      queryClient.invalidateQueries({ queryKey: ["mcq-practice"] });
      queryClient.invalidateQueries({ queryKey: ["qbank-practice"] });
      queryClient.invalidateQueries({ queryKey: ["custom-exam"] });
    },
  });

  const toggleSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const clearSelected = useCallback(() => setSelected(new Set()), []);

  // Purge selection when underlying records change (removed items).
  useEffect(() => {
    if (selected.size === 0) return;
    const alive = new Set(records.map((r) => r.key));
    let changed = false;
    const next = new Set<string>();
    for (const k of selected) {
      if (alive.has(k)) next.add(k);
      else changed = true;
    }
    if (changed) setSelected(next);
  }, [records, selected]);

  // Keyboard shortcut: "/" or "Cmd/Ctrl+K" focuses the search input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cascade: clear child filters when parent changes / becomes invalid.
  useEffect(() => {
    if (
      subjectId &&
      !subjectOptions.some((s) => s.id === subjectId && (!levelId || s.levelId === levelId))
    ) {
      setSubjectId("");
    }
  }, [levelId, subjectOptions, subjectId]);
  useEffect(() => {
    if (
      chapterId &&
      !chapterOptions.some((c) => c.id === chapterId && (!subjectId || c.subjectId === subjectId))
    ) {
      setChapterId("");
    }
  }, [subjectId, chapterOptions, chapterId]);

  const summary = useMemo(() => {
    let total = 0;
    let mcq = 0;
    let qbank = 0;
    let today = 0;
    let reviewed = 0;
    for (const r of records) {
      total++;
      if (r.source === "mcq") mcq++;
      else qbank++;
      if (isToday(r.addedAt)) today++;
      if ((r.reviewedAt ?? 0) > 0) reviewed++;
    }
    return { total, mcq, qbank, today, reviewed };
  }, [records]);

  // Pre-lowercase question text once per records change so filter loop is O(n)
  // regardless of how many keystrokes the student types.
  const searchIndex = useMemo(() => {
    return records.map((r) =>
      `${r.question} ${r.chapterName} ${r.subjectName} ${r.levelName}`.toLowerCase(),
    );
  }, [records]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const out: BookmarkRecord[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (levelId && r.levelId !== levelId) continue;
      if (subjectId && r.subjectId !== subjectId) continue;
      if (chapterId && r.chapterId !== chapterId) continue;
      if (source !== "all" && r.source !== source) continue;
      if (q && !searchIndex[i].includes(q)) continue;
      out.push(r);
    }
    if (sort === "newest") out.sort((a, b) => b.addedAt - a.addedAt);
    else if (sort === "oldest") out.sort((a, b) => a.addedAt - b.addedAt);
    else out.sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));
    return out;
  }, [records, searchIndex, levelId, subjectId, chapterId, source, deferredQuery, sort]);

  // Reset window when filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [levelId, subjectId, chapterId, source, deferredQuery, sort]);

  // IntersectionObserver auto-loads the next page as the sentinel scrolls in.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (visibleCount >= filtered.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
          }
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, filtered.length]);

  const visibleRecords = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const visibleSubjects = levelId
    ? subjectOptions.filter((s) => s.levelId === levelId)
    : subjectOptions;
  const visibleChapters = subjectId
    ? chapterOptions.filter((c) => c.subjectId === subjectId)
    : levelId
      ? chapterOptions.filter((c) => visibleSubjects.some((s) => s.id === c.subjectId))
      : chapterOptions;

  const clearAll = () => {
    setLevelId("");
    setSubjectId("");
    setChapterId("");
    setSource("all");
    setQuery("");
    setSort("newest");
  };

  const openReview = (r: BookmarkRecord) => {
    setReviewingKey(r.key);
  };

  const practiceAgain = (r: BookmarkRecord) => {
    if (r.source === "mcq") {
      navigate({
        to: "/student/mcq-practice/session",
        search: {
          levelId: r.levelId,
          subjectId: r.subjectId,
          chapterId: r.chapterId,
          mode: "continue",
        },
      });
    } else {
      navigate({
        to: "/student/qns-bank-practice/session",
        search: {
          levelId: r.levelId,
          subjectId: r.subjectId,
          chapterId: r.chapterId,
          mode: "continue",
        },
      });
    }
  };

  const doRemove = (key: string) => {
    if (reviewingKey === key) {
      const idx = filtered.findIndex((f) => f.key === key);
      const neighbor = filtered[idx + 1] ?? filtered[idx - 1] ?? null;
      setReviewingKey(neighbor ? neighbor.key : null);
    }
    setConfirmRemoveKey(null);
    removeMutation.mutate([key]);
  };

  const doBulkRemove = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setConfirmBulkRemove(false);
    clearSelected();
    removeMutation.mutate(ids);
  };

  const doExportCsv = () => {
    const chosen = selected.size > 0 ? filtered.filter((r) => selected.has(r.key)) : filtered;
    exportBookmarksToCsv(chosen);
  };

  // ------------------ REVIEW MODE ------------------
  if (reviewingKey) {
    const reviewIdx = filtered.findIndex((f) => f.key === reviewingKey);
    const current = reviewIdx >= 0 ? filtered[reviewIdx] : null;

    if (!current) {
      // The current record got filtered out or removed — exit review.
      return (
        <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">This bookmark is no longer available.</p>
          <button
            type="button"
            onClick={() => setReviewingKey(null)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-white shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Bookmarks
          </button>
        </div>
      );
    }

    const goPrev = () => {
      if (reviewIdx > 0) {
        setReviewingKey(filtered[reviewIdx - 1].key);
      }
    };
    const goNext = () => {
      if (reviewIdx < filtered.length - 1) {
        setReviewingKey(filtered[reviewIdx + 1].key);
      }
    };

    const confirmingHere = confirmRemoveKey === current.key;
    const correctText = current.options.find((o) => o.key === current.answer)?.text ?? "";

    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Top nav */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setReviewingKey(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Bookmarks
          </button>
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{reviewIdx + 1}</span> of{" "}
            {filtered.length}
          </div>
        </div>

        <QuestionCard
          number={current.qNumber}
          question={current.question}
          headerRight={
            <>
              <SourceBadge source={current.source} label={current.sourceLabel} />
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3 w-3" /> {formatBookmarkDate(current.addedAt)}
              </span>
              {current.reviewedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                  <BookmarkCheck className="h-3 w-3" /> Reviewed
                </span>
              ) : null}
            </>
          }
        >
          {current.options.map((opt) => (
            <OptionCard
              key={opt.key}
              option={opt}
              readOnly
              variant={opt.key === current.answer ? "correct" : "default"}
            />
          ))}
        </QuestionCard>

        <div className="mt-5 space-y-4">
          <CorrectAnswerBanner correctKey={current.answer} correctText={correctText} />
          <ExplanationCard text={current.explanation} />

          <div className="flex flex-wrap items-center gap-1.5">
            <MetaBadge
              tone="amber"
              icon={<Layers className="h-3 w-3" />}
              label={current.levelName}
            />
            <MetaBadge
              tone="sky"
              icon={<FileText className="h-3 w-3" />}
              label={current.subjectName}
            />
            <MetaBadge
              tone="violet"
              icon={<Database className="h-3 w-3" />}
              label={current.chapterName}
            />
          </div>
        </div>

        {/* Bottom nav */}
        <div className="sticky bottom-4 mt-8 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card/80 p-3 shadow-lg backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={reviewIdx === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={reviewIdx >= filtered.length - 1}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => practiceAgain(current)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-indigo-400/60 hover:bg-indigo-500/10 hover:text-indigo-600"
            >
              <Play className="h-3.5 w-3.5" /> Practice Again
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemoveKey(current.key)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-500"
            >
              <BookmarkX className="h-3.5 w-3.5" /> Remove Bookmark
            </button>
            <button
              type="button"
              onClick={() => setReviewingKey(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-fuchsia-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Bookmarks
            </button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmingHere}
          destructive
          title="Remove this bookmark?"
          description="This will delete the bookmark immediately. You can bookmark the question again from the practice session."
          confirmLabel="Remove Bookmark"
          cancelLabel="Cancel"
          onCancel={() => setConfirmRemoveKey(null)}
          onConfirm={() => doRemove(current.key)}
        />
      </div>
    );
  }

  // ------------------ LIST MODE ------------------
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <Sparkles className="h-3 w-3 text-amber-500" />
          Saved from your practice sessions
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Study Later</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A quiet queue of questions you want to come back to. Tap any card to keep reviewing
          exactly where you left off — no searching required.
        </p>
      </div>

      {/* Continue review banner — jumps straight into the most recent bookmark. */}
      {hydrated &&
        records.length > 0 &&
        (() => {
          // Prefer most recently added; falls back to most recently reviewed.
          const resume = [...records].sort(
            (a, b) =>
              Math.max(b.addedAt, b.reviewedAt ?? 0) - Math.max(a.addedAt, a.reviewedAt ?? 0),
          )[0];
          if (!resume) return null;
          return (
            <button
              type="button"
              onClick={() => openReview(resume)}
              className="group mb-6 flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/5 to-transparent p-4 text-left shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-indigo-300/60 hover:shadow-lg hover:shadow-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 sm:p-5"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
                <Eye className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
                  Continue reviewing
                  <span className="text-muted-foreground/70">
                    · {formatBookmarkDate(Math.max(resume.reviewedAt ?? 0, resume.addedAt))}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {resume.question}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <SourceBadge source={resume.source} label={resume.sourceLabel} />
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {resume.subjectName} · {resume.chapterName}
                  </span>
                </div>
              </div>
              <ChevronRight className="hidden h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
            </button>
          );
        })()}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Saved for Later"
          value={summary.total}
          icon={<Bookmark className="h-4 w-4" />}
          tint="from-indigo-500/15 to-fuchsia-500/10 text-indigo-500"
          hydrated={hydrated}
        />
        <SummaryCard
          label="MCQ Practice"
          value={summary.mcq}
          icon={<ListChecks className="h-4 w-4" />}
          tint="from-sky-500/15 to-cyan-500/10 text-sky-500"
          hydrated={hydrated}
        />
        <SummaryCard
          label="Question Bank"
          value={summary.qbank}
          icon={<Database className="h-4 w-4" />}
          tint="from-violet-500/15 to-purple-500/10 text-violet-500"
          hydrated={hydrated}
        />
        <SummaryCard
          label="Added Today"
          value={summary.today}
          icon={<CalendarDays className="h-4 w-4" />}
          tint="from-emerald-500/15 to-teal-500/10 text-emerald-500"
          hydrated={hydrated}
        />
        <SummaryCard
          label="Reviewed"
          value={summary.reviewed}
          icon={<BookmarkCheck className="h-4 w-4" />}
          tint="from-amber-500/15 to-orange-500/10 text-amber-500"
          hydrated={hydrated}
        />
      </div>

      {/* Filters — sticky on scroll so long lists stay quick to refine. */}
      <div className="sticky top-2 z-20 mt-8 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-card/60 sm:top-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Level"
            value={levelId}
            onChange={setLevelId}
            options={[
              { value: "", label: "All levels" },
              ...levelOptions.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
          <SelectField
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Subject"
            value={subjectId}
            onChange={setSubjectId}
            options={[
              { value: "", label: "All subjects" },
              ...visibleSubjects.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <SelectField
            icon={<Database className="h-3.5 w-3.5" />}
            label="Chapter"
            value={chapterId}
            onChange={setChapterId}
            options={[
              { value: "", label: "All chapters" },
              ...visibleChapters.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Bookmark className="h-3.5 w-3.5" />
              Question Source
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-border/60 bg-background/60 p-1">
              {(
                [
                  { v: "mcq", label: "MCQ" },
                  { v: "qbank", label: "Qns Bank" },
                  { v: "all", label: "Both" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setSource(opt.v)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                    source === opt.v
                      ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px] sm:items-end">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              Search Questions
            </div>
            <div className="group relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-indigo-500" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search question text, chapter, subject…"
                aria-label="Search bookmarked questions"
                className="w-full rounded-xl border border-border/60 bg-background/60 py-2.5 pl-9 pr-24 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-indigo-500/60 focus:bg-background focus:ring-2 focus:ring-indigo-500/20"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                  <Command className="h-2.5 w-2.5" />K
                </kbd>
              )}
            </div>
          </div>
          <SelectField
            label="Sort By"
            value={sort}
            onChange={(v) => setSort(v as SortMode)}
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "reviewed", label: "Recently Reviewed" },
            ]}
          />
        </div>

        {(levelId || subjectId || chapterId || source !== "all" || query || sort !== "newest") && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
              {records.length} bookmarks
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Result count + bulk actions */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div>
          {hydrated ? (
            <>
              <span className="font-semibold text-foreground tabular-nums">
                {filtered.length.toLocaleString()}
              </span>{" "}
              {filtered.length === 1 ? "bookmark" : "bookmarks"}
              {filtered.length !== records.length && (
                <span className="text-muted-foreground/80">
                  {" "}
                  · of {records.length.toLocaleString()}
                </span>
              )}
              {selected.size > 0 && (
                <span className="ml-2 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-600 ring-1 ring-indigo-500/20">
                  {selected.size} selected
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading your bookmarks…
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <>
              <button
                type="button"
                onClick={clearSelected}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-3 w-3" /> Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulkRemove(true)}
                disabled={removeMutation.isPending}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
              >
                <BookmarkX className="h-3 w-3" /> Remove {selected.size}
              </button>
            </>
          )}
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={doExportCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              <Download className="h-3 w-3" /> Export {selected.size > 0 ? "Selected" : "CSV"}
            </button>
          )}
          {hydrated && visibleCount < filtered.length && (
            <span className="tabular-nums text-muted-foreground/80">
              Showing {visibleCount.toLocaleString()} · scroll for more
            </span>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="mt-3">
        {!hydrated ? (
          <BookmarkGridSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState hasAny={records.length > 0} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleRecords.map((r, i) => (
                <BookmarkListCard
                  key={r.key}
                  record={r}
                  index={i}
                  selected={selected.has(r.key)}
                  onToggleSelected={() => toggleSelected(r.key)}
                  onReview={() => openReview(r)}
                  onPractice={() => practiceAgain(r)}
                  onRemove={() => setConfirmRemoveKey(r.key)}
                />
              ))}
            </div>
            {visibleCount < filtered.length && (
              <div
                ref={sentinelRef}
                className="mt-6 flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemoveKey !== null}
        destructive
        title="Remove this bookmark?"
        description="This will delete the bookmark immediately. You can bookmark the question again from the practice session."
        confirmLabel="Remove Bookmark"
        cancelLabel="Cancel"
        onCancel={() => setConfirmRemoveKey(null)}
        onConfirm={() => confirmRemoveKey && doRemove(confirmRemoveKey)}
      />

      <ConfirmDialog
        open={confirmBulkRemove}
        destructive
        title={`Remove ${selected.size} bookmarks?`}
        description="These bookmarks will be deleted immediately. You can bookmark the questions again from the practice sessions."
        confirmLabel="Remove All"
        cancelLabel="Cancel"
        onCancel={() => setConfirmBulkRemove(false)}
        onConfirm={doBulkRemove}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presentation                                                       */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  icon,
  tint,
  hydrated,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tint: string;
  hydrated: boolean;
}) {
  const gradient = tint.split(" text-")[0];
  const iconColor = tint.split(" ").pop();
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur transition hover:border-border">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 ${gradient}`}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
            {hydrated ? value : "—"}
          </div>
        </div>
        <div
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-background/70 shadow-sm ring-1 ring-border/60 ${iconColor}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full cursor-pointer appearance-none rounded-xl border border-border/60 bg-background/60 py-2.5 pl-3 pr-9 text-sm text-foreground outline-none transition hover:border-border focus:border-indigo-500/60 focus:bg-background focus:ring-2 focus:ring-indigo-500/20"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

function BookmarkListCard({
  record,
  index,
  selected,
  onToggleSelected,
  onReview,
  onPractice,
  onRemove,
}: {
  record: BookmarkRecord;
  index: number;
  selected: boolean;
  onToggleSelected: () => void;
  onReview: () => void;
  onPractice: () => void;
  onRemove: () => void;
}) {
  const attempted = (record.reviewedAt ?? 0) > 0;
  const delayMs = index < 24 ? index * 22 : 0;
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card/70 shadow-sm backdrop-blur transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-indigo-300/60 hover:shadow-xl hover:shadow-indigo-500/[0.08] motion-safe:animate-[cla-fade-in-up_.4s_ease-out_both] ${selected ? "border-indigo-400/70 ring-2 ring-indigo-500/30" : "border-border/60"}`}
      style={{
        animationDelay: `${delayMs}ms`,
        contentVisibility: "auto",
        containIntrinsicSize: CARD_INTRINSIC,
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400 opacity-70 transition-opacity group-hover:opacity-100" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              aria-label="Select bookmark"
              className="h-3.5 w-3.5 cursor-pointer rounded border-border/60 text-indigo-500 focus:ring-indigo-500/40"
            />
            <SourceBadge source={record.source} label={record.sourceLabel} />
          </div>
          {attempted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20">
              <BookmarkCheck className="h-3 w-3" /> {formatBookmarkDate(record.reviewedAt)}
            </span>
          )}
        </div>

        <p className="line-clamp-4 text-[15px] font-medium leading-relaxed tracking-tight text-foreground">
          {record.question}
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <MetaBadge tone="amber" icon={<Layers className="h-3 w-3" />} label={record.levelName} />
          <MetaBadge
            tone="sky"
            icon={<FileText className="h-3 w-3" />}
            label={record.subjectName}
          />
          <MetaBadge
            tone="violet"
            icon={<Database className="h-3 w-3" />}
            label={record.chapterName}
          />
        </div>

        <div className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          Bookmarked {formatBookmarkDate(record.addedAt)}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 bg-background/40 px-5 py-3">
        <button
          type="button"
          onClick={onReview}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:from-indigo-600 hover:to-fuchsia-600 hover:shadow-md hover:shadow-indigo-500/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          <Eye className="h-3.5 w-3.5" /> Review
        </button>
        <button
          type="button"
          onClick={onPractice}
          aria-label="Practice again"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-indigo-400/60 hover:bg-indigo-500/10 hover:text-indigo-600 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          <Play className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Practice</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove bookmark"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
        >
          <BookmarkX className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

function BookmarkGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-5 shadow-sm"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500/40 via-fuchsia-500/40 to-amber-400/40" />
          <div className="mb-3 flex items-center justify-between">
            <div className="h-4 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-14 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
            <div className="h-3 w-9/12 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-4 flex gap-1.5">
            <div className="h-4 w-14 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-6 flex gap-2">
            <div className="h-8 flex-1 animate-pulse rounded-lg bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SourceBadge({ source, label }: { source: "mcq" | "qbank"; label: string }) {
  const cls =
    source === "mcq"
      ? "bg-sky-500/10 text-sky-600 ring-sky-500/20"
      : "bg-violet-500/10 text-violet-600 ring-violet-500/20";
  const Icon = source === "mcq" ? ListChecks : Database;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function MetaBadge({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "amber" | "sky" | "violet";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300"
      : tone === "sky"
        ? "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300"
        : "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300";
  return (
    <span
      title={label}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-500">
        <Bookmark className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        {hasAny ? "Nothing matches those filters" : "Your Study Later queue is empty"}
      </h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {hasAny
          ? "Adjust or clear the filters to see more of your saved questions."
          : "Tap the bookmark icon on any question in MCQ Practice or Qns Bank Practice — it lands here for later."}
      </p>
    </div>
  );
}
