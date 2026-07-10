import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Type,
  Upload,
  X,
} from "lucide-react";
import {
  ISSUE_LABEL,
  SAMPLE_TEXT,
  parseMcqs,
  summarise,
  type ParsedMcq,
  type ParseIssue,
} from "@/lib/mcq-parser";
import type { ApiLevel } from "@/lib/academic.functions";

export type BulkUploadRow = {
  question: string;
  options: { key: string; text: string }[];
  correctIndex: number;
  explanation: string;
};

export type BulkUploadPayload = {
  chapterId: string;
  rows: BulkUploadRow[];
};

export type BulkUploadResult = {
  inserted: number;
  skippedDuplicates: number;
  duplicateIndexes: number[];
  batchId: string;
};

const SAMPLE_ONE = `Q1: What is a major obstacle to increasing tax revenue in Bangladesh?
A. High corporate income tax rates
B. A wide tax base
C. Efficient tax enforcement
D. Narrow tax base with numerous exemptions
Answer: D. Narrow tax base with numerous exemptions
Explanation: Bangladesh has a relatively narrow tax base, and numerous exemptions reduce taxable income further.`;

type Props = {
  open: boolean;
  onClose: () => void;
  tree: ApiLevel[];
  onImport: (payload: BulkUploadPayload) => Promise<BulkUploadResult>;
};

type Stage =
  | "idle"
  | "parsing"
  | "validating"
  | "checking_duplicates"
  | "ready"
  | "importing"
  | "imported"
  | "error";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Idle",
  parsing: "Parsing…",
  validating: "Validating…",
  checking_duplicates: "Checking duplicates…",
  ready: "Ready to import",
  importing: "Importing…",
  imported: "Completed",
  error: "Error",
};

export function BulkUploadDialog({ open, onClose, tree, onImport }: Props) {
  const [levelId, setLevelId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");

  const [pastedText, setPastedText] = useState("");
  const deferredText = useDeferredValue(pastedText);

  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ParsedMcq[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [importSummary, setImportSummary] = useState({
    imported: 0,
    skippedInvalid: 0,
    skippedDuplicate: 0,
    failed: 0,
  });
  const importingRef = useRef(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const level = tree.find((l) => l.id === levelId);
  const subject = level?.subjects.find((s) => s.id === subjectId);
  const chapter = subject?.chapters.find((c) => c.id === chapterId);

  const subjects = level?.subjects ?? [];
  const chapters = subject?.chapters ?? [];

  const levelName = level?.name ?? "";
  const subjectName = subject?.name ?? "";
  const chapterName = chapter?.name ?? "";

  const canSubmit = !!chapterId && pastedText.trim().length > 0;

  const summary = useMemo(() => summarise(rows), [rows]);

  const reset = useCallback(() => {
    setLevelId("");
    setSubjectId("");
    setChapterId("");
    setPastedText("");
    setStage("idle");
    setProgress(0);
    setError("");
    setRows([]);
    setImportedCount(0);
    setImportSummary({ imported: 0, skippedInvalid: 0, skippedDuplicate: 0, failed: 0 });
    setStep(1);
    importingRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage !== "importing") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, stage]);

  const process = useCallback(async () => {
    setError("");
    setStep(2);
    setProgress(0);
    setRows([]);

    try {
      setStage("parsing");
      setProgress(20);
      await new Promise((r) => setTimeout(r, 30));
      const parsed = parseMcqs(pastedText);

      setStage("validating");
      setProgress(60);
      await new Promise((r) => setTimeout(r, 30));

      setStage("checking_duplicates");
      setProgress(85);
      await new Promise((r) => setTimeout(r, 30));

      setRows(parsed);
      setProgress(100);
      setStage("ready");
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? "Failed to parse text.");
      setStage("error");
    }
  }, [pastedText]);

  const runImport = useCallback(async () => {
    if (importingRef.current) return;
    importingRef.current = true;

    const validRows = rows.filter((r) => r.valid);
    const inBatchDup = rows.filter((r) => r.isDuplicate).length;
    const skippedInvalid = rows.filter((r) => !r.valid && !r.isDuplicate).length;

    setStage("importing");
    setProgress(20);
    setImportedCount(0);

    try {
      const payload: BulkUploadPayload = {
        chapterId,
        rows: validRows.map((r) => ({
          question: r.question,
          options: r.options,
          correctIndex: r.options.findIndex((o) => o.key === r.answer),
          explanation: r.explanation,
        })),
      };
      setProgress(60);
      const res = await onImport(payload);
      setProgress(100);
      setImportedCount(res.inserted);
      setImportSummary({
        imported: res.inserted,
        skippedInvalid,
        skippedDuplicate: inBatchDup + res.skippedDuplicates,
        failed: 0,
      });
      setStage("imported");
      setStep(3);
    } catch (err) {
      console.error(err);
      setImportSummary({
        imported: 0,
        skippedInvalid,
        skippedDuplicate: inBatchDup,
        failed: validRows.length,
      });
      setError((err as Error).message ?? "Import failed.");
      setStage("error");
    } finally {
      importingRef.current = false;
    }
  }, [rows, chapterId, onImport]);

  if (!open) return null;

  const canClose = stage !== "importing";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-upload-title"
      className="fixed inset-0 z-[80] flex items-stretch justify-center p-0 sm:items-center sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/70 backdrop-blur-md"
        onClick={() => canClose && onClose()}
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-full w-full max-w-6xl flex-col overflow-hidden border border-border/70 bg-card/90 shadow-[0_40px_80px_-30px_color-mix(in_oklab,var(--foreground)_35%,transparent)] backdrop-blur-2xl sm:h-[92vh] sm:rounded-3xl"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 h-72 w-72 rounded-full bg-gradient-to-br from-primary/25 via-accent/15 to-transparent blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-gradient-to-tr from-accent/20 to-primary/10 blur-3xl"
        />

        <Header step={step} onClose={onClose} canClose={canClose} />

        <div className="relative flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
              >
                <AcademicPanel
                  tree={tree}
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
                  subjects={subjects}
                  chapters={chapters}
                  levelName={levelName}
                  subjectName={subjectName}
                  chapterName={chapterName}
                />

                <PastePanel
                  pastedText={pastedText}
                  setPastedText={setPastedText}
                  deferredText={deferredText}
                  academicReady={!!chapterId}
                />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="p-5 sm:p-7"
              >
                {(stage === "parsing" ||
                  stage === "validating" ||
                  stage === "checking_duplicates" ||
                  stage === "importing") && (
                  <ProcessingCard
                    stageLabel={STAGE_LABEL[stage]}
                    progress={progress}
                    detail={
                      stage === "importing"
                        ? `Importing ${importedCount.toLocaleString()} of ${rows.filter((r) => r.valid).length.toLocaleString()}…`
                        : ""
                    }
                  />
                )}

                {stage === "error" && <ErrorCard message={error} onRetry={process} />}

                {stage === "ready" && (
                  <PreviewPanel
                    rows={rows}
                    summary={summary}
                    level={levelName}
                    subject={subjectName}
                    chapter={chapterName}
                  />
                )}
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="p-5 sm:p-7"
              >
                <SuccessPanel
                  summary={importSummary}
                  level={levelName}
                  subject={subjectName}
                  chapter={chapterName}
                  onDone={onClose}
                  onAnother={reset}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Footer
          step={step}
          stage={stage}
          canSubmit={canSubmit}
          rows={rows}
          onCancel={onClose}
          onBack={() => {
            if (step === 2 && (stage === "ready" || stage === "error")) {
              setStep(1);
              setStage("idle");
              setProgress(0);
            }
          }}
          onStart={process}
          onImport={runImport}
        />
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Header                                                          */
/* -------------------------------------------------------------- */

function Header({
  step,
  onClose,
  canClose,
}: {
  step: 1 | 2 | 3;
  onClose: () => void;
  canClose: boolean;
}) {
  const steps = [
    { n: 1, label: "Paste" },
    { n: 2, label: "Preview" },
    { n: 3, label: "Complete" },
  ];
  return (
    <div className="relative flex items-center gap-4 border-b border-border/70 bg-card/60 px-5 py-4 sm:px-7">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary via-primary/80 to-accent text-primary-foreground shadow-[0_10px_24px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)]">
        <Upload className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent" />
          MCQ Manager · Bulk Text Import
        </div>
        <h2
          id="bulk-upload-title"
          className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg"
        >
          Paste MCQs to import in bulk
        </h2>
      </div>

      <div className="hidden items-center gap-2 sm:flex">
        {steps.map((s, i) => {
          const active = step === s.n;
          const done = step > s.n;
          return (
            <div key={s.n} className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ring-1 transition ${
                  done
                    ? "bg-success text-primary-foreground ring-success/40"
                    : active
                      ? "bg-primary text-primary-foreground ring-primary/40"
                      : "bg-secondary/60 text-muted-foreground ring-border/60"
                }`}
              >
                {done ? "✓" : s.n}
              </span>
              <span
                className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border/70" />}
            </div>
          );
        })}
      </div>

      <button
        onClick={onClose}
        disabled={!canClose}
        aria-label="Close"
        className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 bg-background/60 text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-destructive/40 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Academic panel                                                  */
/* -------------------------------------------------------------- */

function AcademicPanel(props: {
  tree: ApiLevel[];
  levelId: string;
  setLevelId: (v: string) => void;
  subjectId: string;
  setSubjectId: (v: string) => void;
  chapterId: string;
  setChapterId: (v: string) => void;
  subjects: { id: string; name: string }[];
  chapters: { id: string; name: string }[];
  levelName: string;
  subjectName: string;
  chapterName: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-4 shadow-soft backdrop-blur-xl sm:p-5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary">
          1
        </span>
        Choose destination
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Select where these MCQs belong.</p>

      <div className="mt-4 space-y-3">
        <SelectField
          label="Level"
          value={props.levelId}
          onChange={props.setLevelId}
          options={props.tree.map((l) => ({ id: l.id, name: l.name }))}
          placeholder="Pick a level"
        />
        <SelectField
          label="Subject"
          value={props.subjectId}
          onChange={props.setSubjectId}
          options={props.subjects.map((s) => ({ id: s.id, name: s.name }))}
          placeholder={props.levelId ? "Pick a subject" : "Choose level first"}
          disabled={!props.levelId}
        />
        <SelectField
          label="Chapter"
          value={props.chapterId}
          onChange={props.setChapterId}
          options={props.chapters.map((c) => ({ id: c.id, name: c.name }))}
          placeholder={props.subjectId ? "Pick a chapter" : "Choose subject first"}
          disabled={!props.subjectId}
        />
      </div>

      {props.chapterId && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success/8 px-3 py-2 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {props.levelName} · {props.subjectName} · {props.chapterName}
        </div>
      )}

      {props.tree.length === 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/8 px-3 py-2 text-[11px] text-warning">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
          <span>
            No academic taxonomy defined yet. Add levels, subjects and chapters in{" "}
            <strong>Academic Manager</strong> first.
          </span>
        </div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-border/70 bg-background/60 pl-3 pr-9 text-sm text-foreground shadow-sm outline-none transition hover:border-primary/40 focus:border-primary/50 focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <ArrowRight className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-muted-foreground" />
      </div>
    </label>
  );
}

/* -------------------------------------------------------------- */
/* Paste panel                                                     */
/* -------------------------------------------------------------- */

function PastePanel(props: {
  pastedText: string;
  setPastedText: (v: string) => void;
  deferredText: string;
  academicReady: boolean;
}) {
  const chars = props.pastedText.length;
  const mcqCount = useMemo(() => {
    const m = props.deferredText.match(/(^|\n)\s*Q\s*\d{1,5}\s*[:.\-)]/gi);
    return m ? m.length : 0;
  }, [props.deferredText]);
  const [copied, setCopied] = useState(false);
  const copySample = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_ONE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-border/70 bg-card/50 p-4 shadow-soft backdrop-blur-xl sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary">
            2
          </span>
          Paste MCQs (10,000+ supported)
        </div>
        <button
          type="button"
          onClick={() => props.setPastedText(SAMPLE_TEXT)}
          disabled={!props.academicReady}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
        >
          <Copy className="h-3 w-3" />
          Load sample
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-border/70 bg-background/50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Required MCQ Format
          </div>
          <button
            type="button"
            onClick={copySample}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1 text-[10px] font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
          >
            {copied ? (
              <CheckCircle2 className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? "Copied" : "Copy Sample Format"}
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {SAMPLE_ONE}
        </pre>
        <div className="mt-2 text-[10px] text-muted-foreground">
          Explanation is optional. Answer must exactly match one of the four options.
        </div>
      </div>

      <textarea
        value={props.pastedText}
        onChange={(e) => props.setPastedText(e.target.value)}
        disabled={!props.academicReady}
        spellCheck={false}
        placeholder={`Q1: What is the SI unit of electric current?
A. Volt
B. Ampere
C. Ohm
D. Watt
Answer: B. Ampere
Explanation: The ampere (A) is the SI base unit of electric current.

Q2: ...`}
        className="mt-3 min-h-[420px] flex-1 w-full resize-y rounded-2xl border border-border/70 bg-background/60 p-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/70 shadow-inner outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          <Type className="mr-1 inline h-3 w-3" />
          {chars.toLocaleString()} characters
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 font-mono">
          ~{mcqCount.toLocaleString()} MCQs detected
        </span>
      </div>

      {!props.academicReady && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[10px] font-semibold text-warning">
          <AlertTriangle className="h-3 w-3" />
          Pick level, subject & chapter first
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Processing / Error                                              */
/* -------------------------------------------------------------- */

function ProcessingCard({
  stageLabel,
  progress,
  detail,
}: {
  stageLabel: string;
  progress: number;
  detail?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/50 p-8 shadow-soft backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-lg flex-col items-center text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border/70 bg-background/60 text-primary shadow-soft">
          <Loader2 className="h-6 w-6 animate-spin" />
        </span>
        <div className="mt-4 text-sm font-semibold tracking-tight text-foreground">
          {stageLabel}
        </div>
        {detail && <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>}

        <div className="mt-6 w-full">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>Progress</span>
            <span className="font-mono text-foreground">{progress}%</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-secondary/70">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              className="h-full rounded-full bg-gradient-to-r from-primary via-primary/80 to-accent shadow-[0_0_20px_-4px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/[0.06] p-8 text-center shadow-soft">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-destructive/30 bg-background text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <div className="mt-3 text-sm font-semibold text-foreground">Something went wrong</div>
      <div className="mt-1 text-xs text-muted-foreground">{message}</div>
      <button
        onClick={onRetry}
        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-foreground transition hover:-translate-y-0.5 hover:border-primary/40"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Preview                                                         */
/* -------------------------------------------------------------- */

function PreviewPanel({
  rows,
  summary,
  level,
  subject,
  chapter,
}: {
  rows: ParsedMcq[];
  summary: ReturnType<typeof summarise>;
  level: string;
  subject: string;
  chapter: string;
}) {
  const [filter, setFilter] = useState<"all" | "valid" | "invalid" | "duplicate">("all");
  const visible = useMemo(() => {
    if (filter === "valid") return rows.filter((r) => r.valid);
    if (filter === "invalid") return rows.filter((r) => !r.valid && !r.isDuplicate);
    if (filter === "duplicate") return rows.filter((r) => r.isDuplicate);
    return rows;
  }, [rows, filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Preview
          </div>
          <div className="text-lg font-bold tracking-tight text-foreground">
            {summary.total.toLocaleString()} MCQs parsed
          </div>
          <div className="text-xs text-muted-foreground">
            Destination · {level} → {subject} → {chapter}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-border/70 bg-background/60 p-1 text-[11px] font-medium">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
            All · {summary.total}
          </FilterPill>
          <FilterPill active={filter === "valid"} onClick={() => setFilter("valid")} tone="success">
            Valid · {summary.valid}
          </FilterPill>
          <FilterPill
            active={filter === "invalid"}
            onClick={() => setFilter("invalid")}
            tone="danger"
          >
            Invalid · {summary.invalid}
          </FilterPill>
          <FilterPill
            active={filter === "duplicate"}
            onClick={() => setFilter("duplicate")}
            tone="warning"
          >
            Duplicates · {summary.duplicates}
          </FilterPill>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total" value={summary.total} tone="neutral" icon={FileText} />
        <SummaryCard label="Valid" value={summary.valid} tone="success" icon={CheckCircle2} />
        <SummaryCard label="Invalid" value={summary.invalid} tone="danger" icon={ShieldAlert} />
        <SummaryCard label="Duplicates" value={summary.duplicates} tone="warning" icon={Copy} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/40 shadow-soft backdrop-blur-xl">
        <div className="relative max-h-[46vh] overflow-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-secondary/80 backdrop-blur-xl">
              <tr>
                {["Question No.", "Question", "Answer", "Status", "Reason"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-border/70 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground first:pl-5 last:pr-5"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center text-xs text-muted-foreground">
                    No rows match this filter.
                  </td>
                </tr>
              ) : (
                visible.map((r, idx) => (
                  <PreviewRow key={r.serial} row={r} striped={idx % 2 === 1} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "success" | "danger" | "warning";
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : "text-foreground";
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 transition ${active ? `bg-secondary/80 shadow ${toneCls}` : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "danger" | "warning" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const textCls =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : tone === "primary"
            ? "text-primary"
            : "text-foreground";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card/50 p-3 shadow-soft backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg border border-border/60 bg-background/60 ${textCls}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function PreviewRow({ row, striped }: { row: ParsedMcq; striped: boolean }) {
  const missing = <span className="italic text-destructive">—</span>;
  const answerText = row.answer
    ? row.answerText || row.options.find((o) => o.key === row.answer)?.text || ""
    : "";
  return (
    <tr
      className={`transition-colors ${
        !row.valid
          ? row.isDuplicate
            ? "bg-warning/[0.04] hover:bg-warning/[0.08]"
            : "bg-destructive/[0.04] hover:bg-destructive/[0.08]"
          : striped
            ? "bg-background/40 hover:bg-secondary/40"
            : "hover:bg-secondary/40"
      }`}
    >
      <td className="whitespace-nowrap border-b border-border/50 py-2.5 pl-5 pr-3 align-top font-mono text-[11px] text-muted-foreground">
        Q{row.detectedSerial ?? row.serial}
      </td>
      <td className="border-b border-border/50 px-3 py-2.5 align-top">
        <div className="line-clamp-2 max-w-md text-sm text-foreground">
          {row.question || missing}
        </div>
      </td>
      <td className="border-b border-border/50 px-3 py-2.5 align-top">
        {row.answer ? (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-6 min-w-[24px] items-center justify-center rounded-md bg-gradient-to-br from-success/20 to-success/5 px-1.5 text-[11px] font-bold text-success ring-1 ring-success/25">
              {row.answer}
            </span>
            <span className="line-clamp-2 max-w-[220px] text-[12px] text-foreground">
              {answerText}
            </span>
          </div>
        ) : (
          missing
        )}
      </td>
      <td className="whitespace-nowrap border-b border-border/50 px-3 py-2.5 align-top">
        <StatusPill row={row} />
      </td>
      <td className="border-b border-border/50 pl-3 pr-5 py-2.5 align-top">
        {row.issues.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.issues.map((iss: ParseIssue) => (
              <span
                key={iss}
                className="inline-flex items-center gap-1 rounded-md border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive"
              >
                <AlertTriangle className="h-3 w-3" />
                {ISSUE_LABEL[iss]}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ row }: { row: ParsedMcq }) {
  if (row.valid) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
        <CheckCircle2 className="h-3 w-3" /> Valid
      </span>
    );
  }
  if (row.isDuplicate) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
        <Copy className="h-3 w-3" /> Duplicate
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
      <ShieldAlert className="h-3 w-3" /> Invalid
    </span>
  );
}

/* -------------------------------------------------------------- */
/* Success                                                         */
/* -------------------------------------------------------------- */

function SuccessPanel({
  summary,
  level,
  subject,
  chapter,
  onDone,
  onAnother,
}: {
  summary: { imported: number; skippedInvalid: number; skippedDuplicate: number; failed: number };
  level: string;
  subject: string;
  chapter: string;
  onDone: () => void;
  onAnother: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative mx-auto max-w-xl overflow-hidden rounded-3xl border border-success/30 bg-card/60 p-8 text-center shadow-soft backdrop-blur-xl"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-gradient-to-br from-success/30 to-primary/20 blur-3xl"
      />
      <motion.span
        initial={{ scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-success to-primary text-primary-foreground shadow-[0_20px_40px_-14px_color-mix(in_oklab,var(--success)_60%,transparent)]"
      >
        <CheckCircle2 className="h-8 w-8" />
      </motion.span>
      <h3 className="relative mt-4 text-lg font-bold tracking-tight text-foreground">
        Import complete
      </h3>
      <p className="relative mt-1 text-sm text-muted-foreground">
        {level} · {subject} · {chapter}
      </p>

      <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Imported" value={summary.imported} tone="success" />
        <StatTile label="Skipped Invalid" value={summary.skippedInvalid} tone="danger" />
        <StatTile label="Skipped Duplicate" value={summary.skippedDuplicate} tone="warning" />
        <StatTile label="Failed" value={summary.failed} tone="neutral" />
      </div>

      <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={onAnother}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-4 text-xs font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40"
        >
          <Upload className="h-3.5 w-3.5" />
          Import more
        </button>
        <button
          onClick={onDone}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-accent px-4 text-xs font-semibold text-primary-foreground shadow transition hover:-translate-y-0.5"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Back to MCQ Manager
        </button>
      </div>
    </motion.div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "warning" | "neutral";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tracking-tight ${cls}`}>{value.toLocaleString()}</div>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Footer                                                          */
/* -------------------------------------------------------------- */

function Footer({
  step,
  stage,
  canSubmit,
  rows,
  onCancel,
  onBack,
  onStart,
  onImport,
}: {
  step: 1 | 2 | 3;
  stage: Stage;
  canSubmit: boolean;
  rows: ParsedMcq[];
  onCancel: () => void;
  onBack: () => void;
  onStart: () => void;
  onImport: () => void;
}) {
  const validCount = rows.filter((r) => r.valid).length;
  if (step === 3) return null;

  return (
    <div className="relative flex items-center justify-between gap-3 border-t border-border/70 bg-card/60 px-5 py-3 sm:px-7">
      <div className="hidden text-[11px] text-muted-foreground sm:block">
        {step === 1 && "Only valid MCQs will be imported. Invalid rows are skipped automatically."}
        {step === 2 &&
          stage === "ready" &&
          `${validCount.toLocaleString()} valid MCQs ready to import.`}
        {step === 2 && stage === "importing" && "Importing — don't close this tab."}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {step === 2 && (stage === "ready" || stage === "error") && (
          <button
            onClick={onBack}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-muted-foreground transition hover:-translate-y-0.5 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={stage === "importing"}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 text-xs font-medium text-muted-foreground transition hover:-translate-y-0.5 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Cancel
        </button>

        {step === 1 && (
          <button
            onClick={onStart}
            disabled={!canSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-primary via-primary to-accent px-4 text-xs font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Parse & preview
          </button>
        )}

        {step === 2 && stage === "ready" && (
          <button
            onClick={onImport}
            disabled={validCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-primary via-primary to-accent px-4 text-xs font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40"
          >
            <Upload className="h-3.5 w-3.5" />
            Import {validCount.toLocaleString()} MCQ{validCount === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}
