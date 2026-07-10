import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  animate as animateMV,
} from "motion/react";
import { BulkUploadDialog, type BulkUploadPayload } from "@/components/mcq/BulkUploadDialog";
import { toast } from "sonner";
import {
  ArrowUpDown,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Copy,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Home,
  Inbox,
  Layers,
  ListChecks,
  MoreHorizontal,
  Move,
  Pencil,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
  ArrowRightLeft,
  User,
  Clock,
  Package,
  RefreshCw,
  LayoutGrid,
  Rows3,
} from "lucide-react";
import {
  listQuestionBankQuestions,
  createQuestionBankQuestion,
  updateQuestionBankQuestion,
  deleteQuestionBankQuestions,
  changeQuestionBankStatus,
  moveQuestionBankQuestions,
  bulkImportQuestionBankQuestions,
  getQuestionBankStats,
  type QBankRow,
  type QBankStatus,
  type QBankListResult,
} from "@/lib/qbank.functions";
import { getAcademicTree, type ApiLevel } from "@/lib/academic.functions";

export const Route = createFileRoute("/_authenticated/admin/qns-bank-manager")({
  head: () => ({
    meta: [
      { title: "Qns Bank Manager — Admin Console" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: QBankManagerPage,
});

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUSES: QBankStatus[] = ["draft", "review", "published", "archived"];
const PAGE_SIZES = [25, 50, 100, 250, 500] as const;
const PAGE_SIZE_KEY = "qbank_manager_page_size";
const FILTERS_KEY = "qbank_manager_filters_v2";

type DateFilter = "any" | "today" | "7d" | "30d";
const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: "any", label: "Any date" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

type SortPreset = "newest" | "oldest" | "updated" | "position" | "question" | "chapter";

const SORT_PRESETS: { key: SortPreset; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "updated", label: "Recently updated" },
  { key: "position", label: "Position (asc)" },
  { key: "question", label: "Question A→Z" },
  { key: "chapter", label: "Chapter A→Z" },
];

type PersistedFilters = {
  levelId: string;
  subjectId: string;
  chapterId: string;
  status: string;
  dateRange: DateFilter;
  batch: string;
  sortPreset: SortPreset;
};

function readPersistedFilters(): Partial<PersistedFilters> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(FILTERS_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedFilters>) : {};
  } catch {
    return {};
  }
}

type Option = { id: string; name: string };

function dateRangeToDays(v: DateFilter): number | null {
  switch (v) {
    case "today":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function QBankManagerPage() {
  const qc = useQueryClient();
  const persisted = useMemo(() => readPersistedFilters(), []);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [levelId, setLevelId] = useState(persisted.levelId ?? "");
  const [subjectId, setSubjectId] = useState(persisted.subjectId ?? "");
  const [chapterId, setChapterId] = useState(persisted.chapterId ?? "");
  const [status, setStatus] = useState(persisted.status ?? "");
  const [dateRange, setDateRange] = useState<DateFilter>(persisted.dateRange ?? "any");
  const [batch, setBatch] = useState(persisted.batch ?? "");
  const [query, setQuery] = useState("");
  const [sortPreset, setSortPreset] = useState<SortPreset>(persisted.sortPreset ?? "newest");

  // Debounced search (server-side)
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          levelId,
          subjectId,
          chapterId,
          status,
          dateRange,
          batch,
          sortPreset,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [levelId, subjectId, chapterId, status, dateRange, batch, sortPreset]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === "undefined") return 100;
    const stored = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
    return (PAGE_SIZES as readonly number[]).includes(stored) ? stored : 100;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(PAGE_SIZE_KEY, String(pageSize));
    } catch {
      /* ignore */
    }
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [
    levelId,
    subjectId,
    chapterId,
    status,
    batch,
    dateRange,
    debouncedQuery,
    sortPreset,
    pageSize,
  ]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "cards">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "cards" : "table",
  );

  const [viewRow, setViewRow] = useState<QBankRow | null>(null);
  const [editRow, setEditRow] = useState<QBankRow | null>(null);
  const [moveRowsSel, setMoveRowsSel] = useState<QBankRow[] | null>(null);
  const [deleteRowsSel, setDeleteRowsSel] = useState<QBankRow[] | null>(null);

  /* -------- Server data -------- */

  const listFn = useServerFn(listQuestionBankQuestions);
  const statsFn = useServerFn(getQuestionBankStats);
  const treeFn = useServerFn(getAcademicTree);
  const createFn = useServerFn(createQuestionBankQuestion);
  const updateFn = useServerFn(updateQuestionBankQuestion);
  const deleteFn = useServerFn(deleteQuestionBankQuestions);
  const statusFn = useServerFn(changeQuestionBankStatus);
  const moveFn = useServerFn(moveQuestionBankQuestions);
  const importFn = useServerFn(bulkImportQuestionBankQuestions);

  const treeQuery = useQuery({
    queryKey: ["academic-tree"],
    queryFn: () => treeFn(),
    staleTime: 60_000,
  });

  const tree: ApiLevel[] = useMemo(() => treeQuery.data ?? [], [treeQuery.data]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize,
      levelId: levelId || null,
      subjectId: subjectId || null,
      chapterId: chapterId || null,
      status: (status || null) as QBankStatus | null,
      batchId: batch || null,
      search: debouncedQuery || null,
      sort: sortPreset === "position" ? ("position" as const) : sortPreset,
      createdWithinDays: dateRangeToDays(dateRange),
    }),
    [
      page,
      pageSize,
      levelId,
      subjectId,
      chapterId,
      status,
      batch,
      debouncedQuery,
      sortPreset,
      dateRange,
    ],
  );

  const listQuery = useQuery({
    queryKey: ["qbank-list", listParams],
    queryFn: () => listFn({ data: listParams }),
    placeholderData: keepPreviousData,
  });

  const statsQuery = useQuery({
    queryKey: ["qbank-stats"],
    queryFn: () => statsFn(),
    staleTime: 15_000,
  });

  const list: QBankListResult = listQuery.data ?? {
    rows: [],
    total: 0,
    page,
    pageSize,
    totalPages: 1,
    batches: [],
  };
  const loading = listQuery.isLoading || treeQuery.isLoading;

  /* -------- Derived selectors -------- */

  const levelOptions: Option[] = useMemo(
    () => tree.map((l) => ({ id: l.id, name: l.name })),
    [tree],
  );

  const subjectOptions: Option[] = useMemo(() => {
    if (!levelId) {
      return tree.flatMap((l) =>
        l.subjects.map((s) => ({ id: s.id, name: `${s.name} — ${l.name}` })),
      );
    }
    const lvl = tree.find((l) => l.id === levelId);
    return (lvl?.subjects ?? []).map((s) => ({ id: s.id, name: s.name }));
  }, [tree, levelId]);

  const chapterOptions: Option[] = useMemo(() => {
    if (subjectId) {
      for (const l of tree)
        for (const s of l.subjects) {
          if (s.id === subjectId) return s.chapters.map((c) => ({ id: c.id, name: c.name }));
        }
      return [];
    }
    if (levelId) {
      const lvl = tree.find((l) => l.id === levelId);
      return (lvl?.subjects ?? []).flatMap((s) =>
        s.chapters.map((c) => ({ id: c.id, name: `${c.name} — ${s.name}` })),
      );
    }
    return tree.flatMap((l) =>
      l.subjects.flatMap((s) =>
        s.chapters.map((c) => ({ id: c.id, name: `${c.name} — ${s.name}` })),
      ),
    );
  }, [tree, levelId, subjectId]);

  /* -------- Selection -------- */

  const pageRows = list.rows;

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function togglePageSelect() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }
  async function selectAllMatching() {
    try {
      const all = await listFn({ data: { ...listParams, page: 1, pageSize: 500 } });
      const ids = new Set<string>();
      let fetched = all.rows.length;
      all.rows.forEach((r) => ids.add(r.id));
      const totalPages = all.totalPages;
      for (let p = 2; p <= totalPages && fetched < all.total; p++) {
        const chunk = await listFn({ data: { ...listParams, page: p, pageSize: 500 } });
        chunk.rows.forEach((r) => ids.add(r.id));
        fetched += chunk.rows.length;
      }
      setSelected(ids);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const selectedRows = useMemo(
    () => pageRows.filter((r) => selected.has(r.id)),
    [pageRows, selected],
  );

  function resetFilters() {
    setLevelId("");
    setSubjectId("");
    setChapterId("");
    setStatus("");
    setBatch("");
    setDateRange("any");
    setQuery("");
  }

  /* -------- Mutations -------- */

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["qbank-list"] });
    qc.invalidateQueries({ queryKey: ["qbank-stats"] });
  }

  const createMut = useMutation({
    mutationFn: (payload: {
      chapterId: string;
      question: string;
      options: { key: string; text: string }[];
      correctIndex: number;
      explanation: string;
      status: QBankStatus;
    }) => createFn({ data: payload }),
    onSuccess: () => {
      toast.success("Question created");
      invalidateAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: {
      id: string;
      chapterId: string;
      question: string;
      options: { key: string; text: string }[];
      correctIndex: number;
      explanation: string;
      status: QBankStatus;
    }) => updateFn({ data: payload }),
    onSuccess: () => {
      toast.success("Question updated");
      invalidateAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (ids: string[]) => deleteFn({ data: { ids } }),
    onSuccess: (res) => {
      toast.success(`Deleted ${res.deleted} question${res.deleted === 1 ? "" : "s"}`);
      setSelected(new Set());
      invalidateAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const statusMut = useMutation({
    mutationFn: (payload: { ids: string[]; status: QBankStatus }) => statusFn({ data: payload }),
    onSuccess: (res) => {
      toast.success(`Updated status on ${res.updated}`);
      invalidateAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const moveMut = useMutation({
    mutationFn: (payload: { ids: string[]; chapterId: string }) => moveFn({ data: payload }),
    onSuccess: (res) => {
      toast.success(`Moved ${res.moved}`);
      setSelected(new Set());
      invalidateAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  /* -------- Export -------- */

  const exportRows = useCallback((rows: QBankRow[]) => {
    const header = [
      "id",
      "question",
      "A",
      "B",
      "C",
      "D",
      "answer",
      "explanation",
      "level",
      "subject",
      "chapter",
      "status",
      "createdBy",
      "createdAt",
      "updatedAt",
      "batch",
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [
          r.id,
          r.question,
          r.options[0]?.text ?? "",
          r.options[1]?.text ?? "",
          r.options[2]?.text ?? "",
          r.options[3]?.text ?? "",
          r.answer,
          r.explanation,
          r.levelName,
          r.subjectName,
          r.chapterName,
          r.status,
          r.createdByName,
          r.createdAt,
          r.updatedAt,
          r.batchId ?? "",
        ]
          .map((v) => esc(String(v)))
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qbank-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const stats = statsQuery.data;
  const kpis = {
    total: stats?.total ?? 0,
    published: stats?.published ?? 0,
    draft: stats?.draft ?? 0,
    today: stats?.today ?? 0,
    levels: stats?.levels ?? 0,
    subjects: stats?.subjects ?? 0,
    chapters: stats?.chapters ?? 0,
    batches: list.batches.length,
  };

  return (
    <div className="space-y-6">
      <PageHeader selectedCount={selected.size} />

      <KpiGrid kpis={kpis} />

      <FilterBar
        levelId={levelId}
        setLevelId={(v) => {
          setLevelId(v);
          setSubjectId("");
          setChapterId("");
        }}
        subjectId={subjectId}
        setSubjectId={(v) => {
          setSubjectId(v);
          setChapterId("");
        }}
        chapterId={chapterId}
        setChapterId={setChapterId}
        levelOptions={levelOptions}
        subjectOptions={subjectOptions}
        chapterOptions={chapterOptions}
        status={status}
        setStatus={setStatus}
        batch={batch}
        setBatch={setBatch}
        batches={list.batches}
        dateRange={dateRange}
        setDateRange={setDateRange}
        query={query}
        setQuery={setQuery}
        sortPreset={sortPreset}
        setSortPreset={setSortPreset}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onReset={resetFilters}
        onBulkUpload={() => setUploadOpen(true)}
        onExportAll={() => exportRows(list.rows)}
      />

      <BulkActionBar
        selected={selectedRows}
        total={list.total}
        onSelectAll={selectAllMatching}
        onClear={clearSelection}
        onMove={() => setMoveRowsSel(selectedRows)}
        onDelete={() => setDeleteRowsSel(selectedRows)}
        onExport={() => exportRows(selectedRows)}
        onChangeStatus={(s) => statusMut.mutate({ ids: selectedRows.map((r) => r.id), status: s })}
      />

      {viewMode === "table" ? (
        <TableCard
          loading={loading}
          rows={pageRows}
          totalRows={list.total}
          pageStart={(list.page - 1) * list.pageSize}
          selected={selected}
          toggleRow={toggleRow}
          togglePageSelect={togglePageSelect}
          allOnPageSelected={allOnPageSelected}
          page={list.page}
          setPage={setPage}
          totalPages={list.totalPages}
          pageSize={list.pageSize}
          setPageSize={setPageSize}
          onView={setViewRow}
          onEdit={setEditRow}
          onMove={(r) => setMoveRowsSel([r])}
          onDelete={(r) => setDeleteRowsSel([r])}
          onOpenUpload={() => setUploadOpen(true)}
          onResetFilters={resetFilters}
        />
      ) : (
        <CardsView
          loading={loading}
          rows={pageRows}
          totalRows={list.total}
          selected={selected}
          toggleRow={toggleRow}
          page={list.page}
          setPage={setPage}
          totalPages={list.totalPages}
          pageSize={list.pageSize}
          setPageSize={setPageSize}
          onView={setViewRow}
          onEdit={setEditRow}
          onMove={(r) => setMoveRowsSel([r])}
          onDelete={(r) => setDeleteRowsSel([r])}
          onOpenUpload={() => setUploadOpen(true)}
          onResetFilters={resetFilters}
        />
      )}

      <BulkUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        tree={tree}
        onImport={async (payload: BulkUploadPayload) => {
          const res = await importFn({
            data: {
              chapterId: payload.chapterId,
              status: "draft",
              rows: payload.rows,
            },
          });
          invalidateAll();
          return res;
        }}
      />

      <AnimatePresence>
        {viewRow && (
          <ViewModal
            row={viewRow}
            onClose={() => setViewRow(null)}
            onEdit={() => {
              setEditRow(viewRow);
              setViewRow(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editRow && (
          <EditModal
            row={editRow}
            tree={tree}
            onClose={() => setEditRow(null)}
            onSave={async (payload) => {
              await updateMut.mutateAsync({ id: editRow.id, ...payload });
              setEditRow(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {moveRowsSel && (
          <MoveModal
            rows={moveRowsSel}
            tree={tree}
            onClose={() => setMoveRowsSel(null)}
            onConfirm={async (target) => {
              await moveMut.mutateAsync({ ids: moveRowsSel.map((r) => r.id), chapterId: target });
              setMoveRowsSel(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deleteRowsSel && (
          <DeleteModal
            rows={deleteRowsSel}
            onClose={() => setDeleteRowsSel(null)}
            onConfirm={async () => {
              await deleteMut.mutateAsync(deleteRowsSel.map((r) => r.id));
              setDeleteRowsSel(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Suppress unused warning for reserved createMut (available for future inline create UI) */}
      <span data-create-ready={createMut.isPending ? "1" : "0"} className="hidden" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function PageHeader({ selectedCount }: { selectedCount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/50 p-6 shadow-soft backdrop-blur-2xl sm:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 h-72 w-72 rounded-full bg-gradient-to-br from-primary/25 via-accent/15 to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-gradient-to-tr from-accent/20 to-primary/10 blur-3xl"
      />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition hover:text-foreground"
            >
              <Home className="h-3.5 w-3.5" /> Admin
            </Link>
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            <span className="rounded-md bg-secondary/70 px-2 py-1 text-foreground">
              Qns Bank Manager
            </span>
          </nav>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent text-primary-foreground shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.25)]">
              <ListChecks className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Qns Bank Manager
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Curate, review and publish multiple-choice questions across the entire question
                bank.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {selectedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {selectedCount} selected
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <Shield className="h-3.5 w-3.5 text-success" /> Live · synced
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI grid                                                            */
/* ------------------------------------------------------------------ */

type KpiTone = "primary" | "accent" | "success" | "warning" | "danger" | "neutral";
const KPI_TONE: Record<KpiTone, { grad: string; text: string; ring: string }> = {
  primary: {
    grad: "from-primary/25 via-primary/10 to-transparent",
    text: "text-primary",
    ring: "ring-primary/20",
  },
  accent: {
    grad: "from-accent/25 via-accent/10 to-transparent",
    text: "text-accent",
    ring: "ring-accent/20",
  },
  success: {
    grad: "from-success/25 via-success/10 to-transparent",
    text: "text-success",
    ring: "ring-success/20",
  },
  warning: {
    grad: "from-warning/25 via-warning/10 to-transparent",
    text: "text-warning",
    ring: "ring-warning/20",
  },
  danger: {
    grad: "from-destructive/25 via-destructive/10 to-transparent",
    text: "text-destructive",
    ring: "ring-destructive/20",
  },
  neutral: {
    grad: "from-foreground/10 via-foreground/5 to-transparent",
    text: "text-foreground",
    ring: "ring-border/50",
  },
};

function KpiGrid({ kpis }: { kpis: Record<string, number> }) {
  const items = [
    {
      key: "total",
      label: "Total Questions",
      value: kpis.total,
      icon: Database,
      tone: "primary" as KpiTone,
    },
    {
      key: "published",
      label: "Published",
      value: kpis.published,
      icon: CheckCircle2,
      tone: "success" as KpiTone,
    },
    {
      key: "draft",
      label: "Draft",
      value: kpis.draft,
      icon: ClipboardList,
      tone: "warning" as KpiTone,
    },
    {
      key: "today",
      label: "Today's Upload",
      value: kpis.today,
      icon: Upload,
      tone: "accent" as KpiTone,
    },
    {
      key: "levels",
      label: "Levels",
      value: kpis.levels,
      icon: Layers,
      tone: "neutral" as KpiTone,
    },
    {
      key: "subjects",
      label: "Subjects",
      value: kpis.subjects,
      icon: BookOpen,
      tone: "neutral" as KpiTone,
    },
    {
      key: "chapters",
      label: "Chapters",
      value: kpis.chapters,
      icon: ClipboardList,
      tone: "neutral" as KpiTone,
    },
    {
      key: "batches",
      label: "Batches (view)",
      value: kpis.batches,
      icon: Package,
      tone: "neutral" as KpiTone,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map(({ key, ...rest }, idx) => (
        <KpiCard key={key} {...rest} index={idx} />
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  index,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: KpiTone;
  index: number;
}) {
  const t = KPI_TONE[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className={`group relative overflow-hidden rounded-2xl border border-border/70 bg-card/50 p-4 shadow-soft backdrop-blur-2xl transition ring-1 ring-transparent hover:${t.ring} hover:shadow-md`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-gradient-to-br ${t.grad} blur-2xl opacity-80`}
      />
      <div className="relative flex items-start justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border/60 bg-background/60 ${t.text} shadow-sm transition group-hover:scale-105`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-3 flex items-baseline gap-1">
        <AnimatedCounter
          value={value}
          className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
      />
    </motion.div>
  );
}

function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString());
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    const controls = animateMV(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, mv, rounded]);
  return <span className={className}>{display}</span>;
}

/* ------------------------------------------------------------------ */
/* Filter bar                                                          */
/* ------------------------------------------------------------------ */

function FilterBar(props: {
  levelId: string;
  setLevelId: (v: string) => void;
  subjectId: string;
  setSubjectId: (v: string) => void;
  chapterId: string;
  setChapterId: (v: string) => void;
  levelOptions: Option[];
  subjectOptions: Option[];
  chapterOptions: Option[];
  status: string;
  setStatus: (v: string) => void;
  batch: string;
  setBatch: (v: string) => void;
  batches: string[];
  dateRange: DateFilter;
  setDateRange: (v: DateFilter) => void;
  query: string;
  setQuery: (v: string) => void;
  sortPreset: SortPreset;
  setSortPreset: (v: SortPreset) => void;
  viewMode: "table" | "cards";
  setViewMode: (v: "table" | "cards") => void;
  onReset: () => void;
  onBulkUpload: () => void;
  onExportAll: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.35 }}
      className="rounded-2xl border border-border/70 bg-card/50 p-3 shadow-soft backdrop-blur-2xl sm:p-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={props.query}
              onChange={(e) => props.setQuery(e.target.value)}
              placeholder="Search question or explanation…"
              className="h-10 w-full rounded-xl border border-border/70 bg-background/60 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
            />
            {props.query && (
              <button
                onClick={() => props.setQuery("")}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <SortMenu value={props.sortPreset} onChange={props.setSortPreset} />

          <div className="hidden items-center gap-1 rounded-xl border border-border/70 bg-background/50 p-0.5 sm:inline-flex">
            <ViewToggle
              active={props.viewMode === "table"}
              onClick={() => props.setViewMode("table")}
              icon={Rows3}
              label="Table"
            />
            <ViewToggle
              active={props.viewMode === "cards"}
              onClick={() => props.setViewMode("cards")}
              icon={LayoutGrid}
              label="Cards"
            />
          </div>

          <div className="flex items-center gap-2">
            <ActionButton icon={Download} label="Export" onClick={props.onExportAll} />
            <ActionButton icon={FileSpreadsheet} label="Import" onClick={props.onBulkUpload} />
            <ActionButton
              icon={Upload}
              label="Bulk Upload"
              variant="primary"
              onClick={props.onBulkUpload}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Filter className="h-3 w-3" /> Filters
          </div>
          <FilterIdSelect
            value={props.levelId}
            onChange={props.setLevelId}
            placeholder="All levels"
            options={props.levelOptions}
          />
          <FilterIdSelect
            value={props.subjectId}
            onChange={props.setSubjectId}
            placeholder="All subjects"
            options={props.subjectOptions}
          />
          <FilterIdSelect
            value={props.chapterId}
            onChange={props.setChapterId}
            placeholder="All chapters"
            options={props.chapterOptions}
          />
          <FilterIdSelect
            value={props.status}
            onChange={props.setStatus}
            placeholder="Any status"
            options={STATUSES.map((s) => ({ id: s, name: s.charAt(0).toUpperCase() + s.slice(1) }))}
          />
          <FilterIdSelect
            value={props.dateRange === "any" ? "" : props.dateRange}
            onChange={(v) => props.setDateRange((v || "any") as DateFilter)}
            placeholder="Any date"
            options={DATE_FILTERS.filter((f) => f.key !== "any").map((f) => ({
              id: f.key,
              name: f.label,
            }))}
          />
          <FilterIdSelect
            value={props.batch}
            onChange={props.setBatch}
            placeholder="All batches"
            options={props.batches.map((b) => ({ id: b, name: b }))}
          />
          <button
            onClick={props.onReset}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background/50 px-3 text-xs font-medium text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-destructive/40 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ViewToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition ${
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function SortMenu({ value, onChange }: { value: SortPreset; onChange: (v: SortPreset) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const current = SORT_PRESETS.find((p) => p.key === value);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40"
      >
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden sm:inline text-muted-foreground">Sort:</span>
        <span>{current?.label ?? "Sort"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border/70 bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-xl"
          >
            {SORT_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  onChange(p.key);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${
                  value === p.key
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary/70"
                }`}
              >
                {p.label}
                {value === p.key && <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterIdSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Option[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-[220px] appearance-none rounded-xl border border-border/70 bg-background/60 pl-3 pr-8 text-xs text-foreground shadow-sm outline-none transition hover:border-primary/40 focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  variant = "ghost",
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant?: "ghost" | "primary";
  onClick?: () => void;
}) {
  if (variant === "primary") {
    return (
      <button
        onClick={onClick}
        className="group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary to-accent px-3.5 text-xs font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-14px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
      >
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />
        <Icon className="h-4 w-4" />
        <span className="relative">{label}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk action bar                                                     */
/* ------------------------------------------------------------------ */

function BulkActionBar({
  selected,
  total,
  onSelectAll,
  onClear,
  onMove,
  onDelete,
  onExport,
  onChangeStatus,
}: {
  selected: QBankRow[];
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onMove: () => void;
  onDelete: () => void;
  onExport: () => void;
  onChangeStatus: (s: QBankStatus) => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setStatusOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <AnimatePresence initial={false}>
      {selected.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 p-3 shadow-soft backdrop-blur-2xl sm:p-3.5">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {selected.length} selected
            </span>
            {selected.length < total && (
              <button
                onClick={onSelectAll}
                className="rounded-lg px-2 py-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                Select all {total.toLocaleString()} matching
              </button>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <BulkBtn icon={ArrowRightLeft} label="Move" onClick={onMove} />
              <BulkBtn icon={Download} label="Export" onClick={onExport} />
              <div ref={ref} className="relative">
                <BulkBtn icon={RefreshCw} label="Status" onClick={() => setStatusOpen((o) => !o)} />
                <AnimatePresence>
                  {statusOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.14 }}
                      className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-xl border border-border/70 bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-xl"
                    >
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            onChangeStatus(s);
                            setStatusOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium capitalize text-foreground transition hover:bg-secondary/70"
                        >
                          <StatusDot value={s} /> {s}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <BulkBtn icon={Trash2} label="Delete" onClick={onDelete} tone="danger" />
              <button
                onClick={onClear}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BulkBtn({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  tone?: "danger";
}) {
  const cls =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
      : "border-border/70 bg-card/60 text-foreground hover:border-primary/40";
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition hover:-translate-y-0.5 ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

const COLS: { key: string; label: string; className?: string }[] = [
  { key: "checkbox", label: "", className: "w-10" },
  { key: "serial", label: "#", className: "w-14" },
  { key: "question", label: "Question", className: "min-w-[280px]" },
  { key: "a", label: "Option A", className: "min-w-[160px]" },
  { key: "b", label: "Option B", className: "min-w-[160px]" },
  { key: "c", label: "Option C", className: "min-w-[160px]" },
  { key: "d", label: "Option D", className: "min-w-[160px]" },
  { key: "answer", label: "Correct", className: "w-20" },
  { key: "explanation", label: "Explanation", className: "min-w-[220px]" },
  { key: "level", label: "Level", className: "w-28" },
  { key: "subject", label: "Subject", className: "w-28" },
  { key: "chapter", label: "Chapter", className: "w-32" },
  { key: "createdBy", label: "Created By", className: "w-32" },
  { key: "created", label: "Created", className: "w-28" },
  { key: "updated", label: "Updated", className: "w-28" },
  { key: "status", label: "Status", className: "w-28" },
  { key: "actions", label: "", className: "w-40" },
];

function TableCard(props: {
  loading: boolean;
  rows: QBankRow[];
  totalRows: number;
  pageStart: number;
  selected: Set<string>;
  toggleRow: (id: string) => void;
  togglePageSelect: () => void;
  allOnPageSelected: boolean;
  page: number;
  setPage: (n: number) => void;
  totalPages: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  onView: (r: QBankRow) => void;
  onEdit: (r: QBankRow) => void;
  onMove: (r: QBankRow) => void;
  onDelete: (r: QBankRow) => void;
  onOpenUpload: () => void;
  onResetFilters: () => void;
}) {
  const {
    loading,
    rows,
    totalRows,
    pageStart,
    selected,
    toggleRow,
    togglePageSelect,
    allOnPageSelected,
    page,
    setPage,
    totalPages,
    pageSize,
    setPageSize,
    onView,
    onEdit,
    onMove,
    onDelete,
    onOpenUpload,
    onResetFilters,
  } = props;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card/40 shadow-soft backdrop-blur-2xl"
    >
      <div className="relative max-h-[72vh] overflow-auto">
        <table className="w-full min-w-[1600px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-secondary/80 backdrop-blur-xl">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`whitespace-nowrap border-b border-border/70 px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground first:pl-5 last:pr-5 ${c.className ?? ""}`}
                >
                  {c.key === "checkbox" ? (
                    <Checkbox
                      checked={allOnPageSelected}
                      onChange={togglePageSelect}
                      ariaLabel="Select all rows on this page"
                    />
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="p-0">
                  <EmptyState onUpload={onOpenUpload} onReset={onResetFilters} />
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <McqTableRow
                  key={r.id}
                  row={r}
                  serial={pageStart + idx + 1}
                  selected={selected.has(r.id)}
                  onToggle={() => toggleRow(r.id)}
                  striped={idx % 2 === 1}
                  onView={() => onView(r)}
                  onEdit={() => onEdit(r)}
                  onMove={() => onMove(r)}
                  onDelete={() => onDelete(r)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationFooter
        totalRows={totalRows}
        page={page}
        setPage={setPage}
        totalPages={totalPages}
        pageSize={pageSize}
        setPageSize={setPageSize}
      />
    </motion.div>
  );
}

function PaginationFooter({
  totalRows,
  page,
  setPage,
  totalPages,
  pageSize,
  setPageSize,
}: {
  totalRows: number;
  page: number;
  setPage: (n: number) => void;
  totalPages: number;
  pageSize: number;
  setPageSize: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          Showing{" "}
          <span className="font-semibold text-foreground">
            {totalRows === 0 ? 0 : (page - 1) * pageSize + 1}
          </span>
          –
          <span className="font-semibold text-foreground">
            {Math.min(page * pageSize, totalRows)}
          </span>{" "}
          of <span className="font-semibold text-foreground">{totalRows.toLocaleString()}</span>
        </span>
        <div className="h-4 w-px bg-border/70" />
        <label className="inline-flex items-center gap-2">
          Rows
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 appearance-none rounded-lg border border-border/70 bg-background/60 pl-2 pr-7 text-xs font-medium text-foreground shadow-sm outline-none transition hover:border-primary/40"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <PagerBtn onClick={() => setPage(1)} disabled={page === 1}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </PagerBtn>
        <PagerBtn onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </PagerBtn>
        <span className="min-w-[80px] rounded-lg border border-border/70 bg-background/60 px-2.5 py-1 text-center text-xs font-semibold text-foreground">
          {page} / {totalPages}
        </span>
        <PagerBtn
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </PagerBtn>
        <PagerBtn onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </PagerBtn>
      </div>
    </div>
  );
}

function PagerBtn({
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
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg border border-border/70 bg-background/60 text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  ariaLabel,
  size = "md",
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`grid ${dim} place-items-center rounded-[5px] border transition ${
        checked
          ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
          : "border-border/80 bg-background hover:border-primary/60"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
          <path
            d="M2 6.5 5 9.5 10 3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function McqTableRow({
  row,
  serial,
  selected,
  onToggle,
  striped,
  onView,
  onEdit,
  onMove,
  onDelete,
}: {
  row: QBankRow;
  serial: number;
  selected: boolean;
  onToggle: () => void;
  striped: boolean;
  onView: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <tr
      className={`group cursor-pointer transition-colors ${
        selected
          ? "bg-primary/[0.06]"
          : striped
            ? "bg-background/40 hover:bg-secondary/40"
            : "hover:bg-secondary/40"
      }`}
      onClick={onView}
    >
      <Td className="w-10 pl-5">
        <Checkbox checked={selected} onChange={onToggle} ariaLabel={`Select ${row.id}`} />
      </Td>
      <Td className="w-14 font-mono text-[11px] text-muted-foreground">
        {String(serial).padStart(4, "0")}
      </Td>
      <Td>
        <div className="min-w-0">
          <div className="line-clamp-2 max-w-[380px] text-sm font-medium text-foreground">
            {row.question}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
            <span className="font-mono uppercase tracking-wide">{row.id.slice(0, 8)}</span>
            {row.batchId && (
              <span className="rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5">
                {row.batchId}
              </span>
            )}
          </div>
        </div>
      </Td>
      {["A", "B", "C", "D"].map((k, i) => {
        const opt = row.options[i];
        return (
          <Td key={k}>
            <div
              className={`line-clamp-2 max-w-[220px] text-xs ${opt && row.correctIndex === i ? "font-semibold text-success" : "text-muted-foreground"}`}
            >
              {opt?.text ?? <span className="italic text-destructive/60">—</span>}
            </div>
          </Td>
        );
      })}
      <Td>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-success/20 to-success/5 text-[11px] font-bold text-success ring-1 ring-success/25">
          {row.answer}
        </span>
      </Td>
      <Td>
        <div className="line-clamp-2 max-w-[280px] text-xs text-muted-foreground">
          {row.explanation || <span className="italic text-destructive/80">Missing</span>}
        </div>
      </Td>
      <Td>
        <span className="text-xs text-foreground">{row.levelName}</span>
      </Td>
      <Td>
        <span className="text-xs text-foreground">{row.subjectName}</span>
      </Td>
      <Td>
        <span className="text-xs text-muted-foreground">{row.chapterName}</span>
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-accent/30 text-[9px] font-bold text-primary-foreground">
            {(row.createdByName || "?")
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span className="truncate text-xs text-foreground">{row.createdByName}</span>
        </div>
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          {formatDate(row.createdAt)}
        </span>
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatRelative(row.updatedAt)}
        </span>
      </Td>
      <Td>
        <StatusBadge value={row.status} />
      </Td>
      <Td className="pr-5" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <IconBtn label="View" icon={Eye} tone="neutral" onClick={onView} />
          <IconBtn label="Edit" icon={Pencil} tone="primary" onClick={onEdit} />
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More actions"
              className="grid h-8 w-8 place-items-center rounded-lg border border-border/70 bg-background/60 text-muted-foreground opacity-70 shadow-sm transition group-hover:opacity-100 hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-xl border border-border/70 bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur-xl"
                >
                  <MenuRow
                    icon={Eye}
                    label="View"
                    onClick={() => {
                      setMenuOpen(false);
                      onView();
                    }}
                  />
                  <MenuRow
                    icon={Pencil}
                    label="Edit"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                  />
                  <MenuRow
                    icon={ArrowRightLeft}
                    label="Move"
                    onClick={() => {
                      setMenuOpen(false);
                      onMove();
                    }}
                  />
                  <div className="my-1 h-px bg-border/70" />
                  <MenuRow
                    icon={Trash2}
                    label="Delete"
                    tone="danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Td>
    </tr>
  );
}

function Td({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <td
      onClick={onClick}
      className={`whitespace-nowrap border-b border-border/50 px-3 py-3 align-middle ${className ?? ""}`}
    >
      {children}
    </td>
  );
}

function IconBtn({
  label,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "danger" | "neutral";
  onClick?: () => void;
}) {
  const styles =
    tone === "primary"
      ? "hover:border-primary/40 hover:text-primary"
      : tone === "danger"
        ? "hover:border-destructive/40 hover:text-destructive"
        : "hover:border-border hover:text-foreground";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-border/70 bg-background/60 text-muted-foreground opacity-70 shadow-sm transition group-hover:opacity-100 hover:-translate-y-0.5 ${styles}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function MenuRow({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "danger";
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${
        tone === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-secondary/70"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function StatusDot({ value }: { value: QBankStatus }) {
  const cls =
    value === "published"
      ? "bg-success"
      : value === "review"
        ? "bg-warning"
        : value === "archived"
          ? "bg-muted-foreground/60"
          : "bg-muted-foreground";
  return <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function StatusBadge({ value }: { value: QBankStatus }) {
  const map: Record<QBankStatus, { label: string; cls: string }> = {
    published: { label: "Published", cls: "border-success/30 bg-success/10 text-success" },
    draft: { label: "Draft", cls: "border-border/70 bg-secondary/70 text-muted-foreground" },
    review: { label: "In Review", cls: "border-warning/30 bg-warning/10 text-warning" },
    archived: { label: "Archived", cls: "border-border/70 bg-muted/50 text-muted-foreground" },
  };
  const t = map[value];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${t.cls}`}
    >
      <StatusDot value={value} /> {t.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Cards view                                                          */
/* ------------------------------------------------------------------ */

function CardsView(props: {
  loading: boolean;
  rows: QBankRow[];
  totalRows: number;
  selected: Set<string>;
  toggleRow: (id: string) => void;
  page: number;
  setPage: (n: number) => void;
  totalPages: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  onView: (r: QBankRow) => void;
  onEdit: (r: QBankRow) => void;
  onMove: (r: QBankRow) => void;
  onDelete: (r: QBankRow) => void;
  onOpenUpload: () => void;
  onResetFilters: () => void;
}) {
  const {
    loading,
    rows,
    totalRows,
    selected,
    toggleRow,
    page,
    setPage,
    totalPages,
    pageSize,
    setPageSize,
    onView,
    onEdit,
    onMove,
    onDelete,
    onOpenUpload,
    onResetFilters,
  } = props;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card/40 shadow-soft backdrop-blur-2xl"
    >
      <div className="max-h-[72vh] overflow-auto p-3 sm:p-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-40 rounded-2xl border border-border/60 bg-secondary/40 animate-pulse"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState onUpload={onOpenUpload} onReset={onResetFilters} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <McqCard
                key={r.id}
                row={r}
                selected={selected.has(r.id)}
                onToggle={() => toggleRow(r.id)}
                onView={() => onView(r)}
                onEdit={() => onEdit(r)}
                onMove={() => onMove(r)}
                onDelete={() => onDelete(r)}
              />
            ))}
          </div>
        )}
      </div>
      <PaginationFooter
        totalRows={totalRows}
        page={page}
        setPage={setPage}
        totalPages={totalPages}
        pageSize={pageSize}
        setPageSize={setPageSize}
      />
    </motion.div>
  );
}

function McqCard({
  row,
  selected,
  onToggle,
  onView,
  onEdit,
  onMove,
  onDelete,
}: {
  row: QBankRow;
  selected: boolean;
  onToggle: () => void;
  onView: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`group relative overflow-hidden rounded-2xl border p-4 shadow-soft backdrop-blur-xl transition ${
        selected
          ? "border-primary/40 bg-primary/[0.05]"
          : "border-border/70 bg-card/60 hover:border-primary/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox checked={selected} onChange={onToggle} ariaLabel={`Select ${row.id}`} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {row.id.slice(0, 8)}
          </span>
        </div>
        <StatusBadge value={row.status} />
      </div>
      <button
        onClick={onView}
        className="mt-3 line-clamp-3 text-left text-sm font-semibold text-foreground hover:text-primary"
      >
        {row.question}
      </button>
      <div className="mt-3 space-y-1">
        {row.options.slice(0, 4).map((o, i) => (
          <div
            key={o.key}
            className={`flex items-start gap-2 text-xs ${row.correctIndex === i ? "text-success font-medium" : "text-muted-foreground"}`}
          >
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded ${row.correctIndex === i ? "bg-success/15 text-success" : "bg-secondary/70"} text-[10px] font-bold`}
            >
              {o.key}
            </span>
            <span className="line-clamp-1">{o.text}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
        <Chip>{row.levelName}</Chip>
        <Chip>{row.subjectName}</Chip>
        <Chip>{row.chapterName}</Chip>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" />
          {row.createdByName}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatRelative(row.updatedAt)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1">
        <IconBtn label="View" icon={Eye} tone="neutral" onClick={onView} />
        <IconBtn label="Edit" icon={Pencil} tone="primary" onClick={onEdit} />
        <IconBtn label="Move" icon={ArrowRightLeft} tone="neutral" onClick={onMove} />
        <IconBtn label="Delete" icon={Trash2} tone="danger" onClick={onDelete} />
      </div>
    </motion.div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton + Empty                                                    */
/* ------------------------------------------------------------------ */

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <tr key={i} className={i % 2 ? "bg-background/40" : ""}>
          {COLS.map((c, j) => (
            <td key={j} className="border-b border-border/50 px-3 py-3 first:pl-5 last:pr-5">
              <div
                className="h-3.5 rounded-md bg-gradient-to-r from-secondary/60 via-secondary/40 to-secondary/60 bg-[length:200%_100%]"
                style={{
                  animation: "mcq-shimmer 1.4s ease-in-out infinite",
                  width: c.key === "question" ? "80%" : c.key === "checkbox" ? "16px" : "60%",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
      <style>{`@keyframes mcq-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </>
  );
}

function EmptyState({ onUpload, onReset }: { onUpload?: () => void; onReset?: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-4 mx-auto h-40 w-64 rounded-full bg-gradient-to-br from-primary/15 to-accent/10 blur-3xl"
      />
      <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-border/70 bg-card/70 text-primary shadow-soft">
        <Inbox className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground shadow">
          <Sparkles className="h-2.5 w-2.5" />
        </span>
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">
          No questions match these filters
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Try clearing filters, adjusting your search, or upload a new batch to get started.
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={onReset}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40"
        >
          <X className="h-3.5 w-3.5" /> Clear filters
        </button>
        <button
          onClick={onUpload}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-accent px-3 text-xs font-semibold text-primary-foreground shadow transition hover:-translate-y-0.5"
        >
          <Upload className="h-3.5 w-3.5" /> Bulk Upload
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

/* ------------------------------------------------------------------ */
/* Modal shell                                                         */
/* ------------------------------------------------------------------ */

function ModalShell({
  onClose,
  children,
  maxWidth = "max-w-2xl",
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={`relative z-10 w-full ${maxWidth} overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-2xl`}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function ModalHeader({
  icon: Icon,
  title,
  subtitle,
  onClose,
  tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  onClose: () => void;
  tone?: "primary" | "danger";
}) {
  const glow =
    tone === "danger"
      ? "from-destructive/25 via-destructive/10 to-transparent"
      : "from-primary/25 via-accent/10 to-transparent";
  const iconCls =
    tone === "danger"
      ? "from-destructive to-destructive/70 text-destructive-foreground"
      : "from-primary via-primary/80 to-accent text-primary-foreground";
  return (
    <div className="relative overflow-hidden border-b border-border/70 px-6 py-5">
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-gradient-to-br ${glow} blur-2xl`}
      />
      <div className="relative flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${iconCls} shadow`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-border/70 bg-background/60 text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View modal                                                          */
/* ------------------------------------------------------------------ */

function ViewModal({
  row,
  onClose,
  onEdit,
}: {
  row: QBankRow;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <ModalShell onClose={onClose} maxWidth="max-w-3xl">
      <ModalHeader
        icon={Eye}
        title="Question Details"
        subtitle={`${row.id.slice(0, 8)} · ${row.levelName} · ${row.subjectName}`}
        onClose={onClose}
      />
      <div className="max-h-[70vh] space-y-5 overflow-auto px-6 py-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Question
          </div>
          <div className="mt-1.5 text-base font-medium leading-relaxed text-foreground">
            {row.question}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Options
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {row.options.map((o, i) => {
              const correct = i === row.correctIndex;
              return (
                <div
                  key={o.key}
                  className={`rounded-xl border p-3 transition ${
                    correct
                      ? "border-success/40 bg-success/[0.08]"
                      : "border-border/70 bg-background/60"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-lg text-[11px] font-bold ${correct ? "bg-success/20 text-success" : "bg-secondary/70 text-foreground"}`}
                    >
                      {o.key}
                    </span>
                    <span className="text-sm text-foreground">{o.text}</span>
                    {correct && <CheckCircle2 className="ml-auto h-4 w-4 text-success" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Explanation
          </div>
          <div className="mt-1.5 rounded-xl border border-border/70 bg-background/60 p-3 text-sm leading-relaxed text-foreground">
            {row.explanation || (
              <span className="italic text-muted-foreground">No explanation provided.</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetaField label="Level" value={row.levelName} />
          <MetaField label="Subject" value={row.subjectName} />
          <MetaField label="Chapter" value={row.chapterName} />
          <MetaField label="Status" value={<StatusBadge value={row.status} />} />
          <MetaField label="Created By" value={row.createdByName} />
          <MetaField label="Batch" value={row.batchId ?? "—"} />
          <MetaField label="Created" value={formatDate(row.createdAt)} />
          <MetaField label="Updated" value={formatRelative(row.updatedAt)} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-4">
        <button
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-foreground shadow-sm transition hover:-translate-y-0.5"
        >
          Close
        </button>
        <button
          onClick={onEdit}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-accent px-3 text-xs font-semibold text-primary-foreground shadow transition hover:-translate-y-0.5"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit Question
        </button>
      </div>
    </ModalShell>
  );
}

function MetaField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xs font-medium text-foreground">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Edit modal                                                          */
/* ------------------------------------------------------------------ */

type UpsertPayload = {
  chapterId: string;
  question: string;
  options: { key: string; text: string }[];
  correctIndex: number;
  explanation: string;
  status: QBankStatus;
};

function EditModal({
  row,
  tree,
  onClose,
  onSave,
}: {
  row: QBankRow;
  tree: ApiLevel[];
  onClose: () => void;
  onSave: (payload: UpsertPayload) => Promise<void> | void;
}) {
  const [question, setQuestion] = useState(row.question);
  const [options, setOptions] = useState<{ key: string; text: string }[]>(
    row.options.length
      ? row.options.map((o) => ({ ...o }))
      : ["A", "B", "C", "D"].map((k) => ({ key: k, text: "" })),
  );
  const [correctIndex, setCorrectIndex] = useState(row.correctIndex);
  const [explanation, setExplanation] = useState(row.explanation);
  const [status, setStatus] = useState<QBankStatus>(row.status);
  const [levelId, setLevelId] = useState(row.levelId);
  const [subjectId, setSubjectId] = useState(row.subjectId);
  const [chapterId, setChapterId] = useState(row.chapterId);
  const [busy, setBusy] = useState(false);

  const levelOpts = tree.map((l) => ({ id: l.id, name: l.name }));
  const subjectOpts = (tree.find((l) => l.id === levelId)?.subjects ?? []).map((s) => ({
    id: s.id,
    name: s.name,
  }));
  const chapterOpts = (
    tree.flatMap((l) => l.subjects).find((s) => s.id === subjectId)?.chapters ?? []
  ).map((c) => ({ id: c.id, name: c.name }));

  function setOption(i: number, text: string) {
    setOptions((os) => os.map((o, idx) => (idx === i ? { ...o, text } : o)));
  }

  const canSave =
    question.trim().length > 0 &&
    options.filter((o) => o.text.trim()).length >= 2 &&
    correctIndex >= 0 &&
    correctIndex < options.length &&
    options[correctIndex]?.text.trim() &&
    chapterId &&
    !busy;

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-3xl">
      <ModalHeader
        icon={Pencil}
        title="Edit Question"
        subtitle={row.id.slice(0, 8)}
        onClose={onClose}
      />
      <div className="max-h-[70vh] space-y-5 overflow-auto px-6 py-5">
        <FormField label="Question">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border/70 bg-background/60 p-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
          />
        </FormField>

        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Options
          </div>
          <div className="space-y-2">
            {options.map((o, i) => {
              const isCorrect = correctIndex === i;
              return (
                <div
                  key={o.key}
                  className={`flex items-start gap-2 rounded-xl border p-2.5 transition ${
                    isCorrect
                      ? "border-success/40 bg-success/[0.06]"
                      : "border-border/70 bg-background/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setCorrectIndex(i)}
                    aria-label={`Mark ${o.key} correct`}
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold transition ${
                      isCorrect
                        ? "bg-success text-success-foreground shadow"
                        : "bg-secondary/70 text-foreground hover:bg-primary/15 hover:text-primary"
                    }`}
                  >
                    {o.key}
                  </button>
                  <input
                    value={o.text}
                    onChange={(e) => setOption(i, e.target.value)}
                    placeholder={`Option ${o.key}`}
                    className="h-9 flex-1 rounded-lg border border-border/60 bg-background/60 px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
                  />
                  {isCorrect && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-1 text-[10px] font-semibold text-success">
                      <CheckCircle2 className="h-3 w-3" /> Correct
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <FormField label="Explanation">
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border/70 bg-background/60 p-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <FormField label="Level">
            <IdSelectField
              value={levelId}
              onChange={(v) => {
                setLevelId(v);
                setSubjectId("");
                setChapterId("");
              }}
              options={levelOpts}
              placeholder="Pick"
            />
          </FormField>
          <FormField label="Subject">
            <IdSelectField
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setChapterId("");
              }}
              options={subjectOpts}
              placeholder={levelId ? "Pick" : "Choose level first"}
              disabled={!levelId}
            />
          </FormField>
          <FormField label="Chapter">
            <IdSelectField
              value={chapterId}
              onChange={setChapterId}
              options={chapterOpts}
              placeholder={subjectId ? "Pick" : "Choose subject first"}
              disabled={!subjectId}
            />
          </FormField>
          <FormField label="Status">
            <IdSelectField
              value={status}
              onChange={(v) => setStatus(v as QBankStatus)}
              options={STATUSES.map((s) => ({
                id: s,
                name: s.charAt(0).toUpperCase() + s.slice(1),
              }))}
              placeholder=""
            />
          </FormField>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-4">
        <button
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-foreground shadow-sm transition hover:-translate-y-0.5"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            if (!canSave) return;
            setBusy(true);
            try {
              await onSave({
                chapterId,
                question: question.trim(),
                options: options
                  .filter((o) => o.text.trim())
                  .map((o, i) => ({ key: String.fromCharCode(65 + i), text: o.text.trim() })),
                correctIndex,
                explanation: explanation.trim(),
                status,
              });
            } finally {
              setBusy(false);
            }
          }}
          disabled={!canSave}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-accent px-3 text-xs font-semibold text-primary-foreground shadow transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Save changes
        </button>
      </div>
    </ModalShell>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      {children}
    </label>
  );
}

function IdSelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-border/70 bg-background/60 pl-3 pr-8 text-sm text-foreground shadow-sm outline-none transition hover:border-primary/40 focus:border-primary/50 focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Move modal                                                          */
/* ------------------------------------------------------------------ */

function MoveModal({
  rows,
  tree,
  onClose,
  onConfirm,
}: {
  rows: QBankRow[];
  tree: ApiLevel[];
  onClose: () => void;
  onConfirm: (chapterId: string) => Promise<void> | void;
}) {
  const [levelId, setLevelId] = useState(rows[0].levelId);
  const [subjectId, setSubjectId] = useState(rows[0].subjectId);
  const [chapterId, setChapterId] = useState(rows[0].chapterId);
  const [busy, setBusy] = useState(false);

  const levelOpts = tree.map((l) => ({ id: l.id, name: l.name }));
  const subjectOpts = (tree.find((l) => l.id === levelId)?.subjects ?? []).map((s) => ({
    id: s.id,
    name: s.name,
  }));
  const chapterOpts = (
    tree.flatMap((l) => l.subjects).find((s) => s.id === subjectId)?.chapters ?? []
  ).map((c) => ({ id: c.id, name: c.name }));

  const currentLevels = uniq(rows.map((r) => r.levelName));
  const currentSubjects = uniq(rows.map((r) => r.subjectName));
  const currentChapters = uniq(rows.map((r) => r.chapterName));

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader
        icon={ArrowRightLeft}
        title={rows.length === 1 ? "Move Question" : `Move ${rows.length} Questions`}
        subtitle="Reassign to a new chapter"
        onClose={onClose}
      />
      <div className="space-y-4 px-6 py-5">
        <div className="rounded-xl border border-border/70 bg-background/40 p-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Package className="h-3.5 w-3.5" /> Currently in
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
            <div>
              <div className="uppercase tracking-wider text-[9px]">Level</div>
              <div className="mt-0.5 text-foreground">{currentLevels.join(", ")}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-[9px]">Subject</div>
              <div className="mt-0.5 text-foreground">{currentSubjects.join(", ")}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-[9px]">Chapter</div>
              <div className="mt-0.5 text-foreground">{currentChapters.join(", ")}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Move to Level">
            <IdSelectField
              value={levelId}
              onChange={(v) => {
                setLevelId(v);
                setSubjectId("");
                setChapterId("");
              }}
              options={levelOpts}
              placeholder="Pick"
            />
          </FormField>
          <FormField label="Move to Subject">
            <IdSelectField
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setChapterId("");
              }}
              options={subjectOpts}
              placeholder={levelId ? "Pick" : "Choose level first"}
              disabled={!levelId}
            />
          </FormField>
          <FormField label="Move to Chapter">
            <IdSelectField
              value={chapterId}
              onChange={setChapterId}
              options={chapterOpts}
              placeholder={subjectId ? "Pick" : "Choose subject first"}
              disabled={!subjectId}
            />
          </FormField>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-4">
        <button
          onClick={onClose}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            if (busy || !chapterId) return;
            setBusy(true);
            try {
              await onConfirm(chapterId);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !chapterId}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-accent px-3 text-xs font-semibold text-primary-foreground shadow transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Move className="h-3.5 w-3.5" />
          )}
          {busy ? "Moving…" : `Move ${rows.length > 1 ? `${rows.length} Questions` : "Question"}`}
        </button>
      </div>
    </ModalShell>
  );
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

/* ------------------------------------------------------------------ */
/* Delete modal                                                        */
/* ------------------------------------------------------------------ */

function DeleteModal({
  rows,
  onClose,
  onConfirm,
}: {
  rows: QBankRow[];
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const need = rows.length >= 5 ? "DELETE" : null;
  const levels = uniq(rows.map((r) => r.levelName));
  const subjects = uniq(rows.map((r) => r.subjectName));
  const chapters = uniq(rows.map((r) => r.chapterName));
  const canDelete = (need ? confirmText === need : true) && !busy;
  const handle = async () => {
    if (!canDelete) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader
        icon={TriangleAlert}
        title={rows.length === 1 ? "Delete this question?" : `Delete ${rows.length} questions?`}
        subtitle="This action cannot be undone."
        onClose={onClose}
        tone="danger"
      />
      <div className="space-y-4 px-6 py-5">
        <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3 text-xs text-destructive">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4" />
            You are about to permanently remove {rows.length.toLocaleString()} question
            {rows.length > 1 ? "s" : ""}.
          </div>
          <p className="mt-1.5 text-destructive/80">
            Students will lose access immediately and any linked practice sessions will exclude
            these questions.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <MetaField label="Total selected" value={rows.length.toLocaleString()} />
          <MetaField label="Affected levels" value={levels.join(", ") || "—"} />
          <MetaField label="Affected subjects" value={subjects.join(", ") || "—"} />
          <MetaField label="Affected chapters" value={chapters.join(", ") || "—"} />
        </div>
        {need && (
          <FormField label={`Type ${need} to confirm`}>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={need}
              className="h-10 w-full rounded-xl border border-border/70 bg-background/60 px-3 text-sm text-foreground outline-none transition focus:border-destructive/50 focus:ring-4 focus:ring-destructive/15"
            />
          </FormField>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-4">
        <button
          onClick={onClose}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handle}
          disabled={!canDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-destructive to-destructive/80 px-3 text-xs font-semibold text-destructive-foreground shadow transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {busy ? "Deleting…" : "Permanently delete"}
        </button>
      </div>
    </ModalShell>
  );
}
