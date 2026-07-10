// Presentational Question + Option cards extracted so review-mode views
// (bookmarks, wrong answers) can share the exact look-and-feel used inside
// MCQ / Qns Bank practice sessions without duplicating markup.

import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import type { ReactNode } from "react";

export type OptionItem = { key: string; text: string };

export function QuestionCard({
  number,
  question,
  headerRight,
  children,
  footer,
}: {
  /** 1-based question number shown in the badge. */
  number: number;
  question: string;
  /** Optional slot next to the header (e.g. source badge / bookmark date). */
  headerRight?: ReactNode;
  /** Options + result banner slot. */
  children: ReactNode;
  /** Optional footer (nav buttons). */
  footer?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-xl sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/15 via-fuchsia-500/10 to-transparent blur-2xl"
      />
      {headerRight && (
        <div className="relative mb-4 flex flex-wrap items-center justify-end gap-2">
          {headerRight}
        </div>
      )}
      <div className="relative mb-7 flex items-start gap-4">
        <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
          {String(number).padStart(2, "0")}
        </span>
        <h2 className="text-xl font-semibold leading-[1.35] tracking-tight text-foreground sm:text-2xl md:text-[26px]">
          {question}
        </h2>
      </div>

      <div className="relative flex flex-col gap-3">{children}</div>

      {footer && <div className="relative mt-6">{footer}</div>}
    </div>
  );
}

/**
 * A single MCQ option. Matches the visual language of the practice session:
 *   - "correct"  → green highlight (correct answer)
 *   - "wrong"    → red highlight (student-picked wrong option)
 *   - "selected" → indigo highlight (unresolved selection)
 *   - default    → neutral
 * `readOnly` disables click and hover translate — used in review mode.
 */
export function OptionCard({
  option,
  variant = "default",
  readOnly = false,
  onClick,
}: {
  option: OptionItem;
  variant?: "default" | "selected" | "correct" | "wrong";
  readOnly?: boolean;
  onClick?: () => void;
}) {
  const showCorrect = variant === "correct";
  const showWrong = variant === "wrong";
  const selected = variant === "selected";

  const container = showCorrect
    ? "border-emerald-400/80 bg-emerald-400/10 shadow-lg shadow-emerald-500/10"
    : showWrong
      ? "border-rose-400/80 bg-rose-400/10 shadow-lg shadow-rose-500/10"
      : selected
        ? "border-indigo-400/80 bg-indigo-400/10 shadow-md shadow-indigo-500/15"
        : "border-border/60 bg-background/40" +
          (readOnly
            ? ""
            : " hover:-translate-y-[1px] hover:border-indigo-300/70 hover:bg-accent/40 hover:shadow-md hover:shadow-indigo-500/[0.06]");

  const radio = showCorrect
    ? "border-emerald-500 bg-emerald-500"
    : showWrong
      ? "border-rose-500 bg-rose-500"
      : selected
        ? "border-indigo-500 bg-indigo-500"
        : "border-border/80 bg-background";

  const letter = showCorrect
    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
    : showWrong
      ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
      : selected
        ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30"
        : "bg-muted text-muted-foreground";

  return (
    <button
      type="button"
      disabled={readOnly && !onClick}
      onClick={onClick}
      className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border-2 px-4 py-4 text-left text-[15px] transition-all sm:px-5 sm:py-4 ${container} ${
        readOnly ? "cursor-default" : "cursor-pointer"
      }`}
    >
      <span className="relative flex shrink-0 items-center gap-3">
        <span
          className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${radio}`}
          aria-hidden
        >
          {(selected || showCorrect || showWrong) && (
            <span className="h-2 w-2 rounded-full bg-white" />
          )}
        </span>
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition ${letter}`}
        >
          {option.key}
        </span>
      </span>
      <span className="flex-1 text-[15px] leading-relaxed text-foreground sm:text-base">
        {option.text}
      </span>
      {showCorrect && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
      {showWrong && <XCircle className="h-5 w-5 shrink-0 text-rose-500" />}
    </button>
  );
}

export function ExplanationCard({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-2xl border border-border/60 bg-background/50 p-5">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
        Explanation
      </div>
      <p className="text-[15px] leading-relaxed text-foreground/90">{text}</p>
    </div>
  );
}

export function CorrectAnswerBanner({
  correctKey,
  correctText,
}: {
  correctKey: string;
  correctText: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/60 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-5">
      <div className="flex items-start gap-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold tracking-tight text-emerald-600 dark:text-emerald-300">
            Correct Answer
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground/80">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-300">
              <span className="text-[11px] font-bold">{correctKey}</span>
              <span>{correctText}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
