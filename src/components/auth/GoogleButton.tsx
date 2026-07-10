import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.68 4.1-5.5 4.1-3.3 0-6-2.73-6-6.1S8.7 6 12 6c1.88 0 3.14.8 3.86 1.5l2.63-2.54C16.9 3.44 14.66 2.5 12 2.5 6.77 2.5 2.5 6.77 2.5 12s4.27 9.5 9.5 9.5c5.48 0 9.1-3.85 9.1-9.27 0-.62-.07-1.1-.16-1.53H12z"
      />
      <path
        fill="#4285F4"
        d="M21.1 10.7H12v3.9h5.5c-.25 1.4-1.7 4.1-5.5 4.1v3.3c5.48 0 9.1-3.85 9.1-9.27 0-.62-.07-1.1-.16-1.53z"
      />
      <path
        fill="#FBBC05"
        d="M6 12c0-.66.11-1.3.3-1.9L3 7.6A9.5 9.5 0 0 0 2.5 12c0 1.55.37 3 1 4.3l3.3-2.5A5.9 5.9 0 0 1 6 12z"
      />
      <path
        fill="#34A853"
        d="M12 18.2c-2.4 0-4.4-1.6-5.2-3.8L3.5 16.9C5.1 20 8.3 22 12 22c2.66 0 4.9-.87 6.53-2.37l-3.16-2.45c-.86.57-2 .92-3.37.92z"
      />
    </svg>
  );
}

export function GoogleButton({
  label,
  onClick,
  disabled,
  loading: externalLoading,
  errorSlot,
}: {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  errorSlot?: ReactNode;
}) {
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = externalLoading ?? internalLoading;

  async function handleClick() {
    if (disabled || loading) return;
    setInternalLoading(true);
    try {
      await onClick();
    } finally {
      setInternalLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-label={loading ? "Connecting to Google" : label}
        className="group relative inline-flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-border bg-card/85 px-5 py-3.5 text-sm font-semibold text-foreground shadow-soft backdrop-blur-xl transition-all duration-300 hover:-translate-y-[1px] hover:border-primary/40 hover:bg-card hover:shadow-glow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GoogleGlyph />}
        <span>{loading ? "Connecting…" : label}</span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
      </button>
      {errorSlot}
    </>
  );
}
