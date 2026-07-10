import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAcademicTree, syncAcademicTree } from "@/lib/academic.functions";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  animate as animateMV,
} from "motion/react";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Filter,
  GraduationCap,
  Home,
  Layers,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Timer,
  Trash2,
  TriangleAlert,
  Upload,
  X,
  ArrowUpRight,
  GripVertical,
  ArrowDownAZ,
  ArrowUpAZ,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/academic-manager")({
  head: () => ({
    meta: [
      { title: "Academic Manager — Admin Console" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcademicManagerPage,
});

/* ---------------------------------------------------------------- Types */

type ChapterStatus = "draft" | "published";

type Chapter = {
  id: string;
  name: string;
  code: string;
  description: string;
  status: ChapterStatus;
  createdAt: number;
  updatedAt: number;
  mcqCount: number;
  quizCount: number;
  mockCount: number;
};

type Subject = {
  id: string;
  name: string;
  code: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  chapters: Chapter[];
};

type Level = {
  id: string;
  name: string;
  code: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  subjects: Subject[];
};

type Kind = "level" | "subject" | "chapter";

type NodeRef =
  | { kind: "level"; levelId: string }
  | { kind: "subject"; levelId: string; subjectId: string }
  | { kind: "chapter"; levelId: string; subjectId: string; chapterId: string };

type EditorInitial = { name: string; code: string; description: string; status?: ChapterStatus };

type EditorState =
  | { mode: "create"; kind: Kind; parent: NodeRef | null }
  | {
      mode: "edit";
      kind: Kind;
      target: NodeRef;
      initial: EditorInitial;
    }
  | null;

type DeleteState =
  | { kind: "single"; target: NodeRef; label: string; nested: number }
  | { kind: "bulk"; refs: NodeRef[] }
  | null;

type ToastTone = "success" | "error" | "info";
type Toast = { id: string; tone: ToastTone; message: string };

/* ---------------------------------------------------------------- Seed */

/* ---------------------------------------------------------------- Utils */

// Must be a valid UUID — Supabase columns are `uuid` typed and reject anything else.
const uid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC4122 v4 fallback
  const b = new Uint8Array(16);
  (typeof crypto !== "undefined" ? crypto : { getRandomValues: (a: Uint8Array) => {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return a;
  } }).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};

function nodeKey(r: NodeRef) {
  if (r.kind === "level") return `L:${r.levelId}`;
  if (r.kind === "subject") return `S:${r.levelId}:${r.subjectId}`;
  return `C:${r.levelId}:${r.subjectId}:${r.chapterId}`;
}

const KIND_LABEL: Record<Kind, string> = {
  level: "Level",
  subject: "Subject",
  chapter: "Chapter",
};

function timeAgo(ts: number) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// Chapter metrics come exclusively from the DB tree — no derived values.

function useCountUp(value: number, duration = 0.9) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animateMV(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return display;
}

/* ---------------------------------------------------------------- Page */

function AcademicManagerPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [activeLevelId, setActiveLevelId] = useState<string>("");
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<"all" | Kind>("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editor, setEditor] = useState<EditorState>(null);
  const [del, setDel] = useState<DeleteState>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);
  const importRef = useRef<HTMLInputElement>(null);

  const fetchTree = useServerFn(getAcademicTree);
  const saveTree = useServerFn(syncAcademicTree);
  const suppressSyncRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Toast helper ---- */
  const pushToast = (tone: ToastTone, message: string) => {
    const id = uid();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  /* ---- Load from cloud ---- */
  useEffect(() => {
    let cancelled = false;
    suppressSyncRef.current = true;
    fetchTree()
      .then((tree) => {
        if (cancelled) return;
        const asLevels = tree as unknown as Level[];
        setLevels(asLevels);
        if (asLevels[0]) {
          setActiveLevelId(asLevels[0].id);
          setActiveSubjectId(asLevels[0].subjects[0]?.id ?? null);
        }
      })
      .catch((err) => {
        console.error("[academic-manager] load failed", err);
        pushToast("error", "Could not load curriculum from the cloud.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          // Allow subsequent local edits to sync back to the cloud.
          setTimeout(() => {
            suppressSyncRef.current = false;
          }, 0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchTree]);

  /* ---- Debounced sync to cloud on any tree change ---- */
  useEffect(() => {
    if (loading || suppressSyncRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Strip client-only createdAt/updatedAt; server owns those.
      const payload = {
        levels: levels.map((l) => ({
          id: l.id,
          name: l.name,
          code: l.code,
          description: l.description,
          subjects: l.subjects.map((s) => ({
            id: s.id,
            name: s.name,
            code: s.code,
            description: s.description,
            chapters: s.chapters.map((c) => ({
              id: c.id,
              name: c.name,
              code: c.code,
              description: c.description,
            })),
          })),
        })),
      };
      saveTree({ data: payload }).catch((err: unknown) => {
        console.error("[academic-manager] save failed", err);
        const msg = err instanceof Error ? err.message : String(err);
        pushToast("error", `Save failed: ${msg}`);
      });
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [levels, loading, saveTree]);

  /* ---- Derived: totals (from DB tree only) ---- */
  const stats = useMemo(() => {
    let l = 0,
      s = 0,
      c = 0,
      published = 0,
      draft = 0,
      latest = 0;
    for (const lvl of levels) {
      l++;
      latest = Math.max(latest, lvl.updatedAt);
      for (const sub of lvl.subjects) {
        s++;
        latest = Math.max(latest, sub.updatedAt);
        for (const ch of sub.chapters) {
          c++;
          if (ch.status === "published") published++;
          else draft++;
          latest = Math.max(latest, ch.updatedAt);
        }
      }
    }
    return { l, s, c, published, draft, latest };
  }, [levels]);

  /* ---- Active level / subject resolution ---- */
  const activeLevel = useMemo(
    () => levels.find((l) => l.id === activeLevelId) ?? levels[0],
    [levels, activeLevelId],
  );

  // Keep active subject valid whenever level or subjects change
  useEffect(() => {
    if (!activeLevel) return;
    if (activeSubjectId && activeLevel.subjects.some((s) => s.id === activeSubjectId)) return;
    setActiveSubjectId(activeLevel.subjects[0]?.id ?? null);
  }, [activeLevel, activeSubjectId]);

  const activeSubject = useMemo(
    () => activeLevel?.subjects.find((s) => s.id === activeSubjectId) ?? null,
    [activeLevel, activeSubjectId],
  );

  /* ---- Filter/sort helpers for panels ---- */
  const q = search.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);
  const dirSort = <T extends { name: string }>(a: T, b: T) =>
    sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);

  const filteredSubjects = useMemo(() => {
    if (!activeLevel) return [] as Subject[];
    const keepAllKinds = filterKind === "all";
    return activeLevel.subjects
      .filter((sub) => {
        if (!keepAllKinds && filterKind !== "subject" && filterKind !== "chapter") return false;
        if (!q) return true;
        if (matches(sub.name) || matches(sub.code) || matches(sub.description)) return true;
        return sub.chapters.some(
          (c) => matches(c.name) || matches(c.code) || matches(c.description),
        );
      })
      .slice()
      .sort(dirSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevel, q, filterKind, sortDir]);

  const filteredChapters = useMemo(() => {
    if (!activeSubject) return [] as Chapter[];
    return activeSubject.chapters
      .filter((c) => {
        if (filterKind === "level" || filterKind === "subject") return false;
        if (!q) return true;
        return matches(c.name) || matches(c.code) || matches(c.description);
      })
      .slice()
      .sort(dirSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubject, q, filterKind, sortDir]);

  /* ---- Mutations ---- */
  function saveNode(values: { name: string; code: string; description: string }) {
    if (!editor) return;
    const clean = {
      name: values.name.trim().slice(0, 120),
      code: values.code.trim().slice(0, 32),
      description: values.description.trim().slice(0, 500),
    };
    if (!clean.name) return;
    const stamp = Date.now();

    try {
      if (editor.mode === "create") {
        if (editor.kind === "level") {
          const nl: Level = {
            id: uid(),
            ...clean,
            createdAt: stamp,
            updatedAt: stamp,
            subjects: [],
          };
          setLevels((prev) => [...prev, nl]);
          setActiveLevelId(nl.id);
          setActiveSubjectId(null);
          pushToast("success", `Level “${clean.name}” created.`);
        } else if (editor.kind === "subject" && editor.parent?.kind === "level") {
          const parentId = editor.parent.levelId;
          const ns: Subject = {
            id: uid(),
            ...clean,
            createdAt: stamp,
            updatedAt: stamp,
            chapters: [],
          };
          setLevels((prev) =>
            prev.map((l) =>
              l.id === parentId ? { ...l, updatedAt: stamp, subjects: [...l.subjects, ns] } : l,
            ),
          );
          setActiveLevelId(parentId);
          setActiveSubjectId(ns.id);
          pushToast("success", `Subject “${clean.name}” created.`);
        } else if (editor.kind === "chapter" && editor.parent?.kind === "subject") {
          const { levelId, subjectId } = editor.parent;
          const nc: Chapter = {
            id: uid(),
            ...clean,
            status: "draft",
            createdAt: stamp,
            updatedAt: stamp,
            mcqCount: 0,
            quizCount: 0,
            mockCount: 0,
          };
          setLevels((prev) =>
            prev.map((l) =>
              l.id !== levelId
                ? l
                : {
                    ...l,
                    updatedAt: stamp,
                    subjects: l.subjects.map((s) =>
                      s.id !== subjectId
                        ? s
                        : { ...s, updatedAt: stamp, chapters: [...s.chapters, nc] },
                    ),
                  },
            ),
          );
          setActiveLevelId(levelId);
          setActiveSubjectId(subjectId);
          pushToast("success", `Chapter “${clean.name}” created.`);
        }
      } else {
        const t = editor.target;
        if (t.kind === "level") {
          setLevels((prev) =>
            prev.map((l) => (l.id === t.levelId ? { ...l, ...clean, updatedAt: stamp } : l)),
          );
        } else if (t.kind === "subject") {
          setLevels((prev) =>
            prev.map((l) =>
              l.id !== t.levelId
                ? l
                : {
                    ...l,
                    updatedAt: stamp,
                    subjects: l.subjects.map((s) =>
                      s.id === t.subjectId ? { ...s, ...clean, updatedAt: stamp } : s,
                    ),
                  },
            ),
          );
        } else {
          setLevels((prev) =>
            prev.map((l) =>
              l.id !== t.levelId
                ? l
                : {
                    ...l,
                    updatedAt: stamp,
                    subjects: l.subjects.map((s) =>
                      s.id !== t.subjectId
                        ? s
                        : {
                            ...s,
                            updatedAt: stamp,
                            chapters: s.chapters.map((c) =>
                              c.id === t.chapterId ? { ...c, ...clean, updatedAt: stamp } : c,
                            ),
                          },
                    ),
                  },
            ),
          );
        }
        pushToast("success", `${KIND_LABEL[editor.kind]} updated.`);
      }
      setEditor(null);
    } catch {
      pushToast("error", "Something went wrong. Please try again.");
    }
  }

  function removeRefs(refs: NodeRef[]) {
    let removedL = 0,
      removedS = 0,
      removedC = 0;
    const levelIds = new Set(refs.filter((r) => r.kind === "level").map((r) => r.levelId));
    const subjectIds = new Set(
      refs
        .filter((r) => r.kind === "subject")
        .map((r) => (r as Extract<NodeRef, { kind: "subject" }>).subjectId),
    );
    const chapterIds = new Set(
      refs
        .filter((r) => r.kind === "chapter")
        .map((r) => (r as Extract<NodeRef, { kind: "chapter" }>).chapterId),
    );

    setLevels((prev) => {
      const next: Level[] = [];
      for (const l of prev) {
        if (levelIds.has(l.id)) {
          removedL++;
          removedS += l.subjects.length;
          for (const s of l.subjects) removedC += s.chapters.length;
          continue;
        }
        const subjects: Subject[] = [];
        for (const s of l.subjects) {
          if (subjectIds.has(s.id)) {
            removedS++;
            removedC += s.chapters.length;
            continue;
          }
          const chapters = s.chapters.filter((c) => {
            if (chapterIds.has(c.id)) {
              removedC++;
              return false;
            }
            return true;
          });
          subjects.push({ ...s, chapters });
        }
        next.push({ ...l, subjects });
      }
      return next;
    });
    setSelectedChapters(new Set());
    const parts: string[] = [];
    if (removedL) parts.push(`${removedL} level${removedL > 1 ? "s" : ""}`);
    if (removedS) parts.push(`${removedS} subject${removedS > 1 ? "s" : ""}`);
    if (removedC) parts.push(`${removedC} chapter${removedC > 1 ? "s" : ""}`);
    pushToast("success", `Deleted ${parts.join(", ") || "items"}.`);
  }

  function duplicateNode(ref: NodeRef) {
    const stamp = Date.now();
    setLevels((prev) => {
      if (ref.kind === "level") {
        const src = prev.find((l) => l.id === ref.levelId);
        if (!src) return prev;
        const clone: Level = {
          ...src,
          id: uid(),
          name: `${src.name} (Copy)`,
          createdAt: stamp,
          updatedAt: stamp,
          subjects: src.subjects.map((s) => ({
            ...s,
            id: uid(),
            createdAt: stamp,
            updatedAt: stamp,
            chapters: s.chapters.map((c) => ({
              ...c,
              id: uid(),
              createdAt: stamp,
              updatedAt: stamp,
            })),
          })),
        };
        return [...prev, clone];
      }
      return prev.map((l) => {
        if (l.id !== ref.levelId) return l;
        if (ref.kind === "subject") {
          const src = l.subjects.find((s) => s.id === ref.subjectId);
          if (!src) return l;
          const clone: Subject = {
            ...src,
            id: uid(),
            name: `${src.name} (Copy)`,
            createdAt: stamp,
            updatedAt: stamp,
            chapters: src.chapters.map((c) => ({
              ...c,
              id: uid(),
              createdAt: stamp,
              updatedAt: stamp,
            })),
          };
          return { ...l, updatedAt: stamp, subjects: [...l.subjects, clone] };
        }
        // chapter
        return {
          ...l,
          updatedAt: stamp,
          subjects: l.subjects.map((s) => {
            if (s.id !== ref.subjectId) return s;
            const src = s.chapters.find((c) => c.id === ref.chapterId);
            if (!src) return s;
            const clone: Chapter = {
              ...src,
              id: uid(),
              name: `${src.name} (Copy)`,
              createdAt: stamp,
              updatedAt: stamp,
            };
            return { ...s, updatedAt: stamp, chapters: [...s.chapters, clone] };
          }),
        };
      });
    });
    pushToast("success", `${KIND_LABEL[ref.kind]} duplicated.`);
  }

  /* ---- Import / Export ---- */
  function onExport() {
    try {
      const blob = new Blob([JSON.stringify(levels, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `academic-manager-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushToast("success", "Curriculum exported.");
    } catch {
      pushToast("error", "Export failed.");
    }
  }
  function onImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("Invalid file");
        setLevels(parsed);
        if (parsed[0]) {
          setActiveLevelId(parsed[0].id);
          setActiveSubjectId(parsed[0].subjects?.[0]?.id ?? null);
        }
        pushToast("success", "Curriculum imported.");
      } catch {
        pushToast("error", "Invalid file. Please upload a valid export.");
      }
    };
    reader.onerror = () => pushToast("error", "Could not read file.");
    reader.readAsText(file);
  }

  /* ---- Chapter selection ---- */
  const toggleChapter = (id: string) =>
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allChapterKeys = filteredChapters.map((c) => c.id);
  const allSelected =
    allChapterKeys.length > 0 && allChapterKeys.every((k) => selectedChapters.has(k));
  const someSelected = !allSelected && allChapterKeys.some((k) => selectedChapters.has(k));
  const toggleAllChapters = () =>
    setSelectedChapters((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      for (const k of allChapterKeys) next.add(k);
      return next;
    });

  const bulkDeleteRefs: NodeRef[] = useMemo(() => {
    if (!activeLevel || !activeSubject) return [];
    return [...selectedChapters].map((id) => ({
      kind: "chapter",
      levelId: activeLevel.id,
      subjectId: activeSubject.id,
      chapterId: id,
    }));
  }, [selectedChapters, activeLevel, activeSubject]);

  /* ---- Chart data ---- */
  const donutTotal = stats.l + stats.s + stats.c;
  const donut = [
    { label: "Levels", value: stats.l, color: "var(--primary)" },
    { label: "Subjects", value: stats.s, color: "var(--accent)" },
    { label: "Chapters", value: stats.c, color: "var(--brand-to)" },
  ];

  /* ---- Guardrails ---- */
  const canAddSubject = !!activeLevel;
  const canAddChapter = !!activeSubject;

  /* ---- Render ---- */
  return (
    <div className="space-y-8">
      {/* ================ Header ================ */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Admin</span>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span className="font-medium text-foreground">Academic Manager</span>
          </nav>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary via-primary/85 to-accent text-primary-foreground shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.25)]">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-bold leading-none tracking-tight text-foreground sm:text-[28px]">
                Academic Manager
              </h2>
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                Curate the <span className="text-foreground">Level → Subject → Chapter</span>{" "}
                hierarchy. Changes autosave locally.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            className="h-10 gap-1.5 rounded-xl"
            onClick={() => importRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button variant="outline" className="h-10 gap-1.5 rounded-xl" onClick={onExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            className="h-10 gap-1.5 rounded-xl bg-gradient-to-r from-primary via-primary to-accent px-4 shadow-[0_10px_28px_-10px_color-mix(in_oklab,var(--primary)_65%,transparent)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-10px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
            onClick={() => setEditor({ mode: "create", kind: "level", parent: null })}
          >
            <Plus className="h-4 w-4" />
            New Level
          </Button>
        </div>
      </div>

      {/* ================ Overview cards (all values from Supabase) ================ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          index={0}
          loading={loading}
          icon={Layers}
          label="Total Levels"
          value={stats.l}
          delta={`${stats.s} subjects`}
          tone="indigo"
        />
        <StatCard
          index={1}
          loading={loading}
          icon={BookOpen}
          label="Total Subjects"
          value={stats.s}
          delta={`${stats.c} chapters`}
          tone="cyan"
        />
        <StatCard
          index={2}
          loading={loading}
          icon={FileText}
          label="Total Chapters"
          value={stats.c}
          delta={stats.latest ? `Updated ${timeAgo(stats.latest)}` : "No changes yet"}
          tone="fuchsia"
        />
        <StatCard
          index={3}
          loading={loading}
          icon={CheckCircle2}
          label="Published Chapters"
          value={stats.published}
          delta={stats.c ? `${Math.round((stats.published / stats.c) * 100)}% of total` : "None yet"}
          tone="amber"
        />
        <StatCard
          index={4}
          loading={loading}
          icon={Pencil}
          label="Draft Chapters"
          value={stats.draft}
          delta={stats.c ? `${Math.round((stats.draft / stats.c) * 100)}% of total` : "None yet"}
          tone="indigo"
        />
      </div>

      {/* ================ Analytics row ================ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <DonutCard total={donutTotal} data={donut} loading={loading} />
        <SystemStatusCard
          totalSubjects={stats.s}
          totalChapters={stats.c}
          published={stats.published}
          draft={stats.draft}
          latest={stats.latest}
          loading={loading}
        />
      </div>

      {/* ================ Level selector pills ================ */}
      <LevelPills
        levels={levels}
        activeId={activeLevel?.id ?? null}
        onSelect={(id) => {
          setActiveLevelId(id);
          setSelectedChapters(new Set());
        }}
        onAdd={() => setEditor({ mode: "create", kind: "level", parent: null })}
        onEdit={(lvl) =>
          setEditor({
            mode: "edit",
            kind: "level",
            target: { kind: "level", levelId: lvl.id },
            initial: { name: lvl.name, code: lvl.code, description: lvl.description },
          })
        }
        onDuplicate={(lvl) => duplicateNode({ kind: "level", levelId: lvl.id })}
        onDelete={(lvl) => {
          const nested = lvl.subjects.length + lvl.subjects.reduce((n, s) => n + s.chapters.length, 0);
          setDel({
            kind: "single",
            target: { kind: "level", levelId: lvl.id },
            label: lvl.name,
            nested,
          });
        }}
      />

      {/* ================ Action bar ================ */}
      <div className="glass-panel flex flex-col gap-3 rounded-2xl p-3 md:flex-row md:items-center md:justify-between md:p-3.5">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search subjects and chapters…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-xl border-border/70 bg-background/70 pl-9 pr-9 backdrop-blur"
              aria-label="Search"
            />
            {search && (
              <button
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="hidden items-center gap-1.5 rounded-xl border border-border/70 bg-background/70 px-1 backdrop-blur sm:flex">
            <Filter className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Select value={filterKind} onValueChange={(v) => setFilterKind(v as typeof filterKind)}>
              <SelectTrigger className="h-8 min-w-[130px] border-0 bg-transparent px-1 shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="level">Levels</SelectItem>
                <SelectItem value="subject">Subjects</SelectItem>
                <SelectItem value="chapter">Chapters</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="h-10 gap-1.5 rounded-xl"
          >
            {sortDir === "asc" ? (
              <ArrowDownAZ className="h-4 w-4" />
            ) : (
              <ArrowUpAZ className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{sortDir === "asc" ? "A → Z" : "Z → A"}</span>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AnimatePresence>
            {selectedChapters.size > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-2"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {selectedChapters.size} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDel({ kind: "bulk", refs: bulkDeleteRefs })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Bulk delete
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-xl"
            disabled={!canAddSubject}
            onClick={() =>
              activeLevel &&
              setEditor({
                mode: "create",
                kind: "subject",
                parent: { kind: "level", levelId: activeLevel.id },
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Subject
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-xl bg-gradient-to-r from-primary to-accent shadow-md"
            disabled={!canAddChapter}
            onClick={() =>
              activeLevel &&
              activeSubject &&
              setEditor({
                mode: "create",
                kind: "chapter",
                parent: { kind: "subject", levelId: activeLevel.id, subjectId: activeSubject.id },
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Chapter
          </Button>
        </div>
      </div>

      {/* ================ Two-column: Subjects / Chapters ================ */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <SubjectsPanel
          loading={loading}
          level={activeLevel ?? null}
          subjects={filteredSubjects}
          activeSubjectId={activeSubject?.id ?? null}
          hasSearch={!!q || filterKind !== "all"}
          onPick={(id) => {
            setActiveSubjectId(id);
            setSelectedChapters(new Set());
          }}
          onAdd={() =>
            activeLevel &&
            setEditor({
              mode: "create",
              kind: "subject",
              parent: { kind: "level", levelId: activeLevel.id },
            })
          }
          onEdit={(sub) =>
            activeLevel &&
            setEditor({
              mode: "edit",
              kind: "subject",
              target: { kind: "subject", levelId: activeLevel.id, subjectId: sub.id },
              initial: { name: sub.name, code: sub.code, description: sub.description },
            })
          }
          onDelete={(sub) =>
            activeLevel &&
            setDel({
              kind: "single",
              target: { kind: "subject", levelId: activeLevel.id, subjectId: sub.id },
              label: sub.name,
              nested: sub.chapters.length,
            })
          }
          onDuplicate={(sub) =>
            activeLevel &&
            duplicateNode({ kind: "subject", levelId: activeLevel.id, subjectId: sub.id })
          }
        />

        <ChaptersPanel
          loading={loading}
          subject={activeSubject}
          chapters={filteredChapters}
          selected={selectedChapters}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleAll={toggleAllChapters}
          onToggle={toggleChapter}
          onAdd={() =>
            activeLevel &&
            activeSubject &&
            setEditor({
              mode: "create",
              kind: "chapter",
              parent: { kind: "subject", levelId: activeLevel.id, subjectId: activeSubject.id },
            })
          }
          onEdit={(ch) =>
            activeLevel &&
            activeSubject &&
            setEditor({
              mode: "edit",
              kind: "chapter",
              target: {
                kind: "chapter",
                levelId: activeLevel.id,
                subjectId: activeSubject.id,
                chapterId: ch.id,
              },
              initial: { name: ch.name, code: ch.code, description: ch.description },
            })
          }
          onDelete={(ch) =>
            activeLevel &&
            activeSubject &&
            setDel({
              kind: "single",
              target: {
                kind: "chapter",
                levelId: activeLevel.id,
                subjectId: activeSubject.id,
                chapterId: ch.id,
              },
              label: ch.name,
              nested: 0,
            })
          }
          onDuplicate={(ch) =>
            activeLevel &&
            activeSubject &&
            duplicateNode({
              kind: "chapter",
              levelId: activeLevel.id,
              subjectId: activeSubject.id,
              chapterId: ch.id,
            })
          }
        />
      </div>

      {/* ================ Dialogs & toasts ================ */}
      <EditorDialog state={editor} onClose={() => setEditor(null)} onSave={saveNode} />
      <ConfirmDialog
        state={del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (!del) return;
          if (del.kind === "single") removeRefs([del.target]);
          else removeRefs(del.refs);
          setDel(null);
        }}
      />
      <ToastStack toasts={toasts} />
    </div>
  );
}

/* ================================================================
   Cards & Panels
================================================================ */

const TONES = {
  indigo: {
    ring: "from-indigo-500/25 via-primary/15 to-transparent",
    icon: "from-indigo-500 to-primary",
  },
  cyan: {
    ring: "from-cyan-500/25 via-accent/15 to-transparent",
    icon: "from-cyan-500 to-accent",
  },
  fuchsia: {
    ring: "from-fuchsia-500/25 via-primary/15 to-transparent",
    icon: "from-fuchsia-500 to-primary",
  },
  amber: {
    ring: "from-amber-400/30 via-orange-500/15 to-transparent",
    icon: "from-amber-500 to-orange-500",
  },
} as const;

function StatCard({
  index,
  loading,
  icon: Icon,
  label,
  value,
  delta,
  tone,
}: {
  index: number;
  loading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  delta: string;
  tone: keyof typeof TONES;
}) {
  const n = useCountUp(value);
  const t = TONES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className="group surface-kpi relative overflow-hidden rounded-2xl p-5"
    >
      {/* Ambient gradient */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-gradient-to-br ${t.ring} blur-2xl opacity-80 transition-opacity duration-500 group-hover:opacity-100`}
      />
      {/* Top sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            {loading ? (
              <div className="h-8 w-16 animate-pulse rounded-lg bg-secondary/60" />
            ) : (
              <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {n}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowUpRight className="h-3 w-3 text-success" />
            {delta}
          </div>
        </div>
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${t.icon} text-white shadow-[0_8px_20px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.3)] transition-transform duration-300 group-hover:scale-105`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </motion.div>
  );
}

function DonutCard({
  total,
  data,
  loading,
}: {
  total: number;
  data: { label: string; value: number; color: string }[];
  loading: boolean;
}) {
  const size = 176;
  const r = 68;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const nTotal = useCountUp(total);

  let offset = 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.5 }}
      className="surface-aurora relative col-span-1 overflow-hidden rounded-3xl p-6 lg:col-span-3"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-gradient-to-br from-primary/20 via-accent/15 to-transparent blur-3xl"
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center justify-center">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="color-mix(in oklab, var(--foreground) 10%, transparent)"
                strokeWidth={14}
              />
              {!loading &&
                total > 0 &&
                data.map((d, i) => {
                  const frac = d.value / total;
                  const len = frac * circumference;
                  const el = (
                    <motion.circle
                      key={d.label}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={d.color}
                      strokeWidth={14}
                      strokeLinecap="round"
                      strokeDasharray={`${len} ${circumference - len}`}
                      strokeDashoffset={-offset}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ delay: 0.2 + i * 0.15, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        filter: `drop-shadow(0 0 8px color-mix(in oklab, ${d.color} 40%, transparent))`,
                      }}
                    />
                  );
                  offset += len;
                  return el;
                })}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Total items
                </div>
                <div className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
                  {loading ? "—" : nTotal}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold tracking-tight text-foreground">
                Content distribution
              </div>
              <div className="text-xs text-muted-foreground">How your curriculum is composed</div>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {data.map((d) => {
              const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
              return (
                <li key={d.label} className="group flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-4 ring-transparent transition-all group-hover:ring-[color-mix(in_oklab,var(--foreground)_6%,transparent)]"
                    style={{
                      background: d.color,
                      boxShadow: `0 0 12px 0 color-mix(in oklab, ${d.color} 45%, transparent)`,
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {d.label}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">{d.value}</span>
                  <span className="w-10 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

function SystemStatusCard({
  totalSubjects,
  totalChapters,
  published,
  draft,
  latest,
  loading,
}: {
  totalSubjects: number;
  totalChapters: number;
  published: number;
  draft: number;
  latest: number;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22, duration: 0.5 }}
      className="surface-aurora relative col-span-1 overflow-hidden rounded-3xl p-6 lg:col-span-2"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -right-12 h-56 w-56 rounded-full bg-gradient-to-tr from-success/25 via-accent/10 to-transparent blur-3xl"
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-success/20 to-accent/15 text-success">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight text-foreground">
              Live workspace
            </div>
            <div className="text-xs text-muted-foreground">Straight from Supabase</div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-success">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Operational
          </span>
        </div>

        <div className="mt-5 space-y-3.5">
          <StatusRow
            icon={CheckCircle2}
            label="Published chapters"
            value={loading ? "—" : String(published)}
            tone="success"
          />
          <StatusRow
            icon={Pencil}
            label="Draft chapters"
            value={loading ? "—" : String(draft)}
            tone="default"
          />
          <StatusRow
            icon={Timer}
            label="Last update"
            value={latest ? timeAgo(latest) : "—"}
            tone="default"
          />
          <StatusRow
            icon={BookOpen}
            label="Total subjects"
            value={loading ? "—" : String(totalSubjects)}
            tone="default"
          />
          <StatusRow
            icon={FileText}
            label="Total chapters"
            value={loading ? "—" : String(totalChapters)}
            tone="default"
          />
        </div>
      </div>
    </motion.div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "success" | "default";
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/60 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      <span
        className={`rounded-lg px-2 py-1 text-xs font-semibold tabular-nums ${
          tone === "success"
            ? "border border-success/25 bg-success/10 text-success"
            : "border border-border/70 bg-background/60 text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function LevelPills({
  levels,
  activeId,
  onSelect,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  levels: Level[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (lvl: Level) => void;
  onDuplicate: (lvl: Level) => void;
  onDelete: (lvl: Level) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:inline">
        Levels
      </span>
      <div className="flex flex-1 gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-card/40 p-1.5 backdrop-blur-xl scrollbar-none">
        {levels.map((lvl) => {
          const active = lvl.id === activeId;
          return (
            <div key={lvl.id} className="group relative flex shrink-0 items-center">
              <button
                onClick={() => onSelect(lvl.id)}
                className={`relative shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                {active && (
                  <motion.span
                    layoutId="lvl-active"
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary via-primary/90 to-accent shadow-[0_10px_28px_-10px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <span className="grid h-5 min-w-[36px] place-items-center rounded-md bg-background/25 px-1.5 font-mono text-[10px] font-bold uppercase tracking-wider">
                    {lvl.code || "—"}
                  </span>
                  <span className="whitespace-nowrap">{lvl.name}</span>
                  <span
                    className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                      active ? "bg-white/20" : "bg-secondary/70 text-foreground/70"
                    }`}
                  >
                    {lvl.subjects.length}
                  </span>
                </span>
              </button>
              <span
                onClick={(e) => e.stopPropagation()}
                className="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
              >
                <RowMenu
                  onEdit={() => onEdit(lvl)}
                  onDuplicate={() => onDuplicate(lvl)}
                  onDelete={() => onDelete(lvl)}
                />
              </span>
            </div>
          );
        })}
        <button
          onClick={onAdd}
          className="shrink-0 rounded-xl border border-dashed border-border/80 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          aria-label="Add level"
        >
          <span className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Level
          </span>
        </button>
      </div>
    </div>
  );
}


/* ---------------- Subjects Panel ---------------- */

function SubjectsPanel({
  loading,
  level,
  subjects,
  activeSubjectId,
  hasSearch,
  onPick,
  onAdd,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  loading: boolean;
  level: Level | null;
  subjects: Subject[];
  activeSubjectId: string | null;
  hasSearch: boolean;
  onPick: (id: string) => void;
  onAdd: () => void;
  onEdit: (s: Subject) => void;
  onDelete: (s: Subject) => void;
  onDuplicate: (s: Subject) => void;
}) {
  return (
    <section className="surface-editorial relative overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Subjects
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {level ? level.name : "No level selected"}
          </h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg"
          onClick={onAdd}
          disabled={!level}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <div className="max-h-[640px] overflow-y-auto p-3">
        {loading ? (
          <SubjectsSkeleton />
        ) : subjects.length === 0 ? (
          <PanelEmpty
            title={hasSearch ? "No matching subjects" : "No subjects yet"}
            body={
              hasSearch
                ? "Try a broader search or clear the filter."
                : "Create the first subject for this level to get started."
            }
            actionLabel={hasSearch ? undefined : "Create subject"}
            onAction={hasSearch ? undefined : onAdd}
            icon={BookOpen}
          />
        ) : (
          <ul className="space-y-2">
            {subjects.map((sub, i) => {
              const active = sub.id === activeSubjectId;
              const publishedCount = sub.chapters.filter((c) => c.status === "published").length;
              return (
                <motion.li
                  key={sub.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <button
                    onClick={() => onPick(sub.id)}
                    className={`group relative flex w-full items-start gap-3 rounded-xl p-3.5 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                      active
                        ? "border border-primary/40 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--foreground)_6%,transparent),0_10px_28px_-16px_color-mix(in_oklab,var(--brand-to)_45%,transparent)]"
                        : "surface-tile"
                    }`}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold tracking-wider ${
                        active
                          ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-inner"
                          : "border border-border/70 bg-secondary/50 text-foreground"
                      }`}
                    >
                      {sub.code?.slice(0, 3).toUpperCase() || sub.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {sub.name}
                        </span>
                        <StatusPill
                          active={publishedCount > 0}
                          label={publishedCount > 0 ? "Live" : "Draft"}
                        />
                      </span>
                      {sub.description && (
                        <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                          {sub.description}
                        </span>
                      )}
                      <span className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {sub.chapters.length} chapters
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ListChecks className="h-3 w-3 text-success" />
                          {publishedCount} published
                        </span>
                        <span className="ml-auto opacity-70">{timeAgo(sub.updatedAt)}</span>
                      </span>
                    </span>
                    <span
                      onClick={(e) => e.stopPropagation()}
                      className="ml-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                    >
                      <RowMenu
                        onEdit={() => onEdit(sub)}
                        onDuplicate={() => onDuplicate(sub)}
                        onDelete={() => onDelete(sub)}
                      />
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function SubjectsSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3.5"
        >
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-secondary/60" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-secondary/60" />
            <div className="h-2.5 w-3/4 animate-pulse rounded bg-secondary/40" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Chapters Panel ---------------- */

function ChaptersPanel({
  loading,
  subject,
  chapters,
  selected,
  allSelected,
  someSelected,
  onToggleAll,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  loading: boolean;
  subject: Subject | null;
  chapters: Chapter[];
  selected: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  onToggle: (id: string) => void;
  onAdd: () => void;
  onEdit: (c: Chapter) => void;
  onDelete: (c: Chapter) => void;
  onDuplicate: (c: Chapter) => void;
}) {
  return (
    <section className="glass-panel relative overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Chapters
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {subject ? subject.name : "Select a subject"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {chapters.length > 0 && (
            <label className="hidden cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground sm:flex">
              <IndeterminateCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={onToggleAll}
                aria-label="Select all chapters"
              />
              <span>Select all</span>
            </label>
          )}
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent"
            onClick={onAdd}
            disabled={!subject}
          >
            <Plus className="h-3.5 w-3.5" />
            Chapter
          </Button>
        </div>
      </div>

      {loading ? (
        <ChaptersSkeleton />
      ) : !subject ? (
        <PanelEmpty
          title="No subject selected"
          body="Pick a subject from the left to view its chapters."
          icon={BookOpen}
        />
      ) : chapters.length === 0 ? (
        <PanelEmpty
          title="No chapters yet"
          body="Create your first chapter for this subject."
          actionLabel="Create chapter"
          onAction={onAdd}
          icon={FileText}
        />
      ) : (
        <>
          {/* Table header (desktop) */}
          <div className="sticky top-0 z-10 hidden grid-cols-[28px_20px_minmax(0,1fr)_88px_72px_72px_72px_88px_44px] items-center gap-3 border-b border-border/60 bg-background/70 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur md:grid">
            <span />
            <span />
            <span>Chapter</span>
            <span className="text-right">MCQ</span>
            <span className="text-right">Quiz</span>
            <span className="text-right">Mock</span>
            <span className="text-right">Status</span>
            <span className="text-right">Updated</span>
            <span />
          </div>

          <ul className="divide-y divide-border/50">
            <AnimatePresence initial={false}>
              {chapters.map((c, i) => {
                const published = c.status === "published";
                const isSelected = selected.has(c.id);
                return (
                  <motion.li
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ delay: i * 0.02 }}
                    className={`row-lux group relative flex flex-col gap-3 px-5 py-4 transition-colors md:grid md:grid-cols-[28px_20px_minmax(0,1fr)_88px_72px_72px_72px_88px_44px] md:items-center md:gap-3 md:py-3 ${
                      isSelected
                        ? "bg-primary/[0.05] shadow-[inset_2px_0_0_0_color-mix(in_oklab,var(--brand-to)_60%,transparent)]"
                        : "hover:bg-secondary/30"
                    }`}
                  >
                    <span className="hidden text-muted-foreground/60 md:block">
                      <GripVertical
                        className="h-4 w-4 cursor-grab active:cursor-grabbing"
                        aria-hidden
                      />
                    </span>
                    <IndeterminateCheckbox
                      checked={isSelected}
                      onChange={() => onToggle(c.id)}
                      aria-label={`Select ${c.name}`}
                    />

                    {/* Chapter meta */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-border/70 bg-secondary/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {c.code || `CH-${(i + 1).toString().padStart(2, "0")}`}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {c.name}
                        </span>
                      </div>
                      {c.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {c.description}
                        </p>
                      )}

                      {/* Mobile inline metrics */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
                        <MetricChip label="MCQ" value={c.mcqCount} tone="indigo" />
                        <MetricChip label="Quiz" value={c.quizCount} tone="cyan" />
                        <MetricChip label="Mock" value={c.mockCount} tone="fuchsia" />
                        <StatusPill
                          active={published}
                          label={published ? "Published" : "Draft"}
                        />
                      </div>
                    </div>

                    <div className="hidden text-right md:block">
                      <MetricNum value={c.mcqCount} tone="indigo" />
                    </div>
                    <div className="hidden text-right md:block">
                      <MetricNum value={c.quizCount} tone="cyan" />
                    </div>
                    <div className="hidden text-right md:block">
                      <MetricNum value={c.mockCount} tone="fuchsia" />
                    </div>
                    <div className="hidden justify-end md:flex">
                      <StatusPill active={published} label={published ? "Live" : "Draft"} />
                    </div>
                    <div className="hidden text-right text-[11px] text-muted-foreground md:block">
                      {timeAgo(c.updatedAt)}
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(c)}
                        className="hidden h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground md:grid"
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <RowMenu
                        onEdit={() => onEdit(c)}
                        onDuplicate={() => onDuplicate(c)}
                        onDelete={() => onDelete(c)}
                      />
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </>
      )}
    </section>
  );
}

function ChaptersSkeleton() {
  return (
    <ul className="divide-y divide-border/50">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-4">
          <div className="h-4 w-4 animate-pulse rounded bg-secondary/60" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-secondary/60" />
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-secondary/40" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded bg-secondary/60" />
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Small building blocks ---------------- */

function MetricNum({ value, tone }: { value: number; tone: "indigo" | "cyan" | "fuchsia" }) {
  const color =
    tone === "indigo"
      ? "text-indigo-500 dark:text-indigo-300"
      : tone === "cyan"
        ? "text-cyan-600 dark:text-cyan-300"
        : "text-fuchsia-600 dark:text-fuchsia-300";
  return <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>;
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "indigo" | "cyan" | "fuchsia";
}) {
  const bg =
    tone === "indigo"
      ? "border-indigo-500/25 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
      : tone === "cyan"
        ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"
        : "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${bg}`}
    >
      {label} <span className="tabular-nums font-semibold">{value}</span>
    </span>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        active
          ? "border-success/25 bg-success/10 text-success"
          : "border-border/70 bg-secondary/60 text-muted-foreground"
      }`}
    >
      <span
        className={`h-1 w-1 rounded-full ${active ? "bg-success" : "bg-muted-foreground/60"}`}
      />
      {label}
    </span>
  );
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  ...rest
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
} & React.HTMLAttributes<HTMLButtonElement>) {
  const state = indeterminate ? "indeterminate" : checked ? "checked" : "unchecked";
  return (
    <button
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      data-state={state}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
        checked || indeterminate
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:border-foreground/50"
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
      {...rest}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded bg-primary-foreground" />
      ) : checked ? (
        <CheckCircle2 className="h-3 w-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}

function RowMenu({
  onEdit,
  onDuplicate,
  onDelete,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          aria-label="More actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PanelEmpty({
  title,
  body,
  actionLabel,
  onAction,
  icon: Icon,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border/70 bg-gradient-to-br from-secondary/70 to-secondary/20 shadow-inner">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 max-w-xs text-xs text-muted-foreground">{body}</div>
      </div>
      {actionLabel && onAction && (
        <Button size="sm" className="mt-1 gap-1.5 rounded-lg" onClick={onAction}>
          <Plus className="h-3.5 w-3.5" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/* ================================================================
   Dialogs & Toasts
================================================================ */

function EditorDialog({
  state,
  onClose,
  onSave,
}: {
  state: EditorState;
  onClose: () => void;
  onSave: (v: { name: string; code: string; description: string }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      setName(state.initial.name);
      setCode(state.initial.code);
      setDescription(state.initial.description);
    } else {
      setName("");
      setCode("");
      setDescription("");
    }
    setNameError(null);
  }, [state]);

  if (!state) return null;

  const kind = state.kind;
  const isEdit = state.mode === "edit";
  const title = `${isEdit ? "Edit" : "Create"} ${KIND_LABEL[kind]}`;
  const description_text = isEdit
    ? `Update the details for this ${kind}.`
    : kind === "level"
      ? "A level groups related subjects and chapters."
      : kind === "subject"
        ? "A subject belongs to a level and contains chapters."
        : "A chapter belongs to a subject.";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setNameError("Name is required.");
    if (trimmed.length > 120) return setNameError("Must be 120 characters or fewer.");
    onSave({ name: trimmed, code, description });
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-2xl backdrop-blur-2xl sm:max-w-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-gradient-to-br from-primary/30 via-accent/20 to-transparent blur-3xl"
        />
        <DialogHeader className="relative">
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-secondary/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-accent" />
            {isEdit ? "Editing" : "New"} · {KIND_LABEL[kind]}
          </div>
          <DialogTitle className="text-xl tracking-tight">{title}</DialogTitle>
          <DialogDescription>{description_text}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="relative space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="am-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="am-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder={
                kind === "level"
                  ? "e.g. Professional Level"
                  : kind === "subject"
                    ? "e.g. Financial Reporting"
                    : "e.g. Conceptual Framework"
              }
              maxLength={120}
              autoFocus
              aria-invalid={!!nameError}
              className="h-11 rounded-xl"
            />
            {nameError && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <TriangleAlert className="h-3 w-3" />
                {nameError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="am-code">Code</Label>
            <Input
              id="am-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={
                kind === "level" ? "e.g. PL" : kind === "subject" ? "e.g. FR" : "e.g. FR-01"
              }
              maxLength={32}
              className="h-11 rounded-xl font-mono uppercase"
            />
            <p className="text-[11px] text-muted-foreground">
              Short identifier shown next to the name.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="am-desc">Description</Label>
            <Textarea
              id="am-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary…"
              maxLength={500}
              rows={3}
              className="rounded-xl"
            />
            <p className="text-right text-[10px] text-muted-foreground">{description.length}/500</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
              Cancel
            </Button>
            <Button
              type="submit"
              className="gap-1.5 rounded-xl bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/20"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isEdit ? "Save changes" : `Create ${KIND_LABEL[kind]}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: DeleteState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const open = !!state;
  let title = "Delete item?";
  let body: React.ReactNode = null;
  if (state?.kind === "single") {
    title = `Delete “${state.label}”?`;
    body =
      state.nested > 0
        ? `This will also delete ${state.nested} nested item${state.nested > 1 ? "s" : ""}. This action cannot be undone.`
        : "This action cannot be undone.";
  } else if (state?.kind === "bulk") {
    title = `Delete ${state.refs.length} chapter${state.refs.length > 1 ? "s" : ""}?`;
    body = "This action cannot be undone.";
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="rounded-2xl border-border/70 backdrop-blur-2xl">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <AlertDialogTitle className="text-center">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-center">{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-xl backdrop-blur-xl ${
              t.tone === "success"
                ? "border-success/25 bg-success/10 text-success"
                : t.tone === "error"
                  ? "border-destructive/25 bg-destructive/10 text-destructive"
                  : "border-border/70 bg-card/90 text-foreground"
            }`}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : t.tone === "error" ? (
              <TriangleAlert className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
