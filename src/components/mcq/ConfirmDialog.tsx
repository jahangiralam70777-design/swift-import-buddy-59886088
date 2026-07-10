// Small confirmation dialog used for destructive actions (bookmark removal).
// Standalone, no external deps, closes on Escape / backdrop click.

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`absolute inset-x-0 top-0 h-1 ${
            destructive
              ? "bg-gradient-to-r from-rose-500 via-red-500 to-orange-500"
              : "bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400"
          }`}
        />
        <div className="flex items-start gap-3 px-6 pt-6">
          <span
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
              destructive ? "bg-rose-500/10 text-rose-500" : "bg-indigo-500/10 text-indigo-500"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-muted-foreground transition hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-border/60 bg-background/40 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-accent"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            disabled={confirmDisabled}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
              destructive
                ? "bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                : "bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-600 hover:to-fuchsia-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
