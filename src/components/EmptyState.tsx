import type { ReactNode } from "react";

/**
 * Shared empty-state primitive used across dashboards, tables, and lists.
 * Purely presentational — no data logic. Renders inside whatever card /
 * container the caller already provides, matching the existing surface.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-12 text-center " +
        (className ?? "")
      }
    >
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60 text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div className="max-w-md space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
