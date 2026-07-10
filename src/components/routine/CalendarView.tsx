import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  LayoutGrid,
  Rows3,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CalendarRoutine = {
  id: string;
  title: string;
  audience: string;
  status: "active" | "draft" | "paused" | "completed";
  accent: string;
  tags: string[];
  tasks: { time: string; title: string; duration: string; subject: string; done?: boolean }[];
};

type ViewMode = "day" | "week" | "month" | "timeline";

type ScheduledBlock = {
  id: string;
  routineId: string;
  routineTitle: string;
  accent: string;
  title: string;
  subject: string;
  date: string; // yyyy-mm-dd
  startMin: number; // minutes from midnight
  durationMin: number;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfWeek = (d: Date) => {
  const x = startOfDay(d);
  const day = x.getDay(); // Sun=0
  return addDays(x, -day);
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const parseTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const parseDuration = (d: string) => {
  const m = /(\d+)\s*m/.exec(d);
  const h = /(\d+)\s*h/.exec(d);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0) || 60;
};
const minToLabel = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/* Build the initial schedule: 14-day window centred on today */
function buildSchedule(routines: CalendarRoutine[]): ScheduledBlock[] {
  const today = startOfDay(new Date());
  const blocks: ScheduledBlock[] = [];
  for (let offset = -3; offset <= 10; offset++) {
    const date = addDays(today, offset);
    for (const r of routines) {
      if (r.status === "draft") continue;
      for (const t of r.tasks) {
        blocks.push({
          id: `${r.id}_${dayKey(date)}_${t.time}_${t.title}`,
          routineId: r.id,
          routineTitle: r.title,
          accent: r.accent,
          title: t.title,
          subject: t.subject,
          date: dayKey(date),
          startMin: parseTime(t.time),
          durationMin: parseDuration(t.duration),
        });
      }
    }
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export function CalendarView({ routines }: { routines: CalendarRoutine[] }) {
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [blocks, setBlocks] = useState<ScheduledBlock[]>(() => buildSchedule(routines));
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Recompute schedule when routine set truly changes
  const routineSig = routines.map((r) => `${r.id}:${r.tasks.length}`).join("|");
  useMemoResync(() => setBlocks(buildSchedule(routines)), routineSig);

  const rescheduleTo = (id: string, targetDate: string, targetStartMin?: number) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, date: targetDate, startMin: targetStartMin ?? b.startMin } : b,
      ),
    );
    const b = blocks.find((x) => x.id === id);
    if (b) {
      setToast(
        `Rescheduled "${b.title}" → ${targetDate}${targetStartMin != null ? ` · ${minToLabel(targetStartMin)}` : ""}`,
      );
      setTimeout(() => setToast(null), 2200);
    }
  };

  const nav = (dir: -1 | 1) => {
    setCursor((c) => {
      if (view === "day") return addDays(c, dir);
      if (view === "week" || view === "timeline") return addDays(c, dir * 7);
      const x = new Date(c);
      x.setMonth(x.getMonth() + dir);
      return x;
    });
  };

  const label = useMemo(() => {
    if (view === "day")
      return cursor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    if (view === "week" || view === "timeline") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [view, cursor]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-6 backdrop-blur-2xl sm:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-accent/20 via-primary/15 to-transparent blur-3xl"
      />

      {/* Header */}
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur">
            <CalendarRange className="h-3 w-3 text-accent" />
            Schedule surface
          </div>
          <h2 className="mt-3 bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
            Routine Calendar
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every published routine, plotted across time. Drag blocks between days or hours to
            reschedule instantly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Calendar view mode"
            className="inline-flex items-center gap-1 rounded-2xl border border-border/70 bg-card/60 p-1 shadow-sm backdrop-blur-md"
          >
            {(["day", "week", "month", "timeline"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                aria-label={`${v} view`}
                onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                  view === v
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "day" && <Clock className="h-3.5 w-3.5" aria-hidden />}
                {v === "week" && <LayoutGrid className="h-3.5 w-3.5" aria-hidden />}
                {v === "month" && <CalendarDays className="h-3.5 w-3.5" aria-hidden />}
                {v === "timeline" && <Rows3 className="h-3.5 w-3.5" aria-hidden />}
                {v}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1 rounded-2xl border border-border/70 bg-card/60 p-1 shadow-sm backdrop-blur-md">
            <button
              type="button"
              onClick={() => nav(-1)}
              aria-label="Previous period"
              className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setCursor(startOfDay(new Date()))}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => nav(1)}
              aria-label="Next period"
              className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="relative mt-2 text-sm font-medium text-muted-foreground">{label}</div>

      {/* Body */}
      <div className="relative mt-6 -mx-1 overflow-x-auto pb-1">
        <div className="min-w-[720px] px-1">
          {view === "day" && (
            <DayGrid
              cursor={cursor}
              blocks={blocks}
              dragId={dragId}
              setDragId={setDragId}
              hoverTarget={hoverTarget}
              setHoverTarget={setHoverTarget}
              onReschedule={rescheduleTo}
            />
          )}
          {view === "week" && (
            <WeekGrid
              cursor={cursor}
              blocks={blocks}
              dragId={dragId}
              setDragId={setDragId}
              hoverTarget={hoverTarget}
              setHoverTarget={setHoverTarget}
              onReschedule={rescheduleTo}
            />
          )}
          {view === "month" && (
            <MonthGrid
              cursor={cursor}
              blocks={blocks}
              dragId={dragId}
              setDragId={setDragId}
              hoverTarget={hoverTarget}
              setHoverTarget={setHoverTarget}
              onReschedule={rescheduleTo}
            />
          )}
          {view === "timeline" && (
            <TimelineGrid
              routines={routines}
              cursor={cursor}
              blocks={blocks}
              dragId={dragId}
              setDragId={setDragId}
              hoverTarget={hoverTarget}
              setHoverTarget={setHoverTarget}
              onReschedule={rescheduleTo}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-border/70 bg-card/95 px-4 py-2 text-sm font-medium text-foreground shadow-xl backdrop-blur-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* Tiny helper: re-run an effect only when a signature string changes */
function useMemoResync(fn: () => void, sig: string) {
  useMemo(() => {
    fn(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [sig]);
}

/* ------------------------------------------------------------------ */
/* Shared DnD                                                          */
/* ------------------------------------------------------------------ */

type DnDProps = {
  cursor: Date;
  blocks: ScheduledBlock[];
  dragId: string | null;
  setDragId: (v: string | null) => void;
  hoverTarget: string | null;
  setHoverTarget: (v: string | null) => void;
  onReschedule: (id: string, date: string, startMin?: number) => void;
};

function BlockChip({
  block,
  compact,
  onDragStart,
  onDragEnd,
}: {
  block: ScheduledBlock;
  compact?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <motion.div
      layoutId={block.id}
      draggable
      onDragStart={(e) => {
        (e as unknown as DragEvent).dataTransfer?.setData("text/plain", block.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      whileHover={{ y: -1 }}
      className={`group relative cursor-grab overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-md transition active:cursor-grabbing ${compact ? "px-2 py-1" : "p-2.5"}`}
      style={{
        background: `linear-gradient(180deg, color-mix(in oklab, ${block.accent} 22%, var(--card)) 0%, var(--card) 100%)`,
        borderColor: `color-mix(in oklab, ${block.accent} 35%, var(--border))`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="h-3 w-3 text-muted-foreground/60 opacity-0 transition group-hover:opacity-100" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {minToLabel(block.startMin)} · {block.durationMin}m
        </span>
      </div>
      <div
        className={`truncate font-semibold text-foreground ${compact ? "text-[11px]" : "text-xs mt-0.5"}`}
      >
        {block.title}
      </div>
      {!compact && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] text-muted-foreground">{block.subject}</span>
          <span className="truncate rounded-full border border-border/60 bg-background/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
            {block.routineTitle}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Day view                                                            */
/* ------------------------------------------------------------------ */

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00–21:00

function DayGrid({
  cursor,
  blocks,
  setDragId,
  hoverTarget,
  setHoverTarget,
  onReschedule,
}: DnDProps) {
  const key = dayKey(cursor);
  const dayBlocks = blocks.filter((b) => b.date === key);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/40 backdrop-blur">
      <div className="grid grid-cols-[64px_1fr]">
        <div className="border-r border-border/60">
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex h-20 items-start justify-end px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div className="relative">
          {HOURS.map((h) => {
            const slot = `${key}_${h}`;
            return (
              <div
                key={h}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverTarget(slot);
                }}
                onDragLeave={() => setHoverTarget(null)}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) onReschedule(id, key, h * 60);
                  setHoverTarget(null);
                  setDragId(null);
                }}
                className={`h-20 border-b border-border/40 transition ${hoverTarget === slot ? "bg-primary/10" : ""}`}
              />
            );
          })}
          {dayBlocks.map((b) => {
            const top = ((b.startMin - HOURS[0] * 60) / 60) * 80;
            const height = Math.max(40, (b.durationMin / 60) * 80 - 4);
            return (
              <div key={b.id} className="absolute left-2 right-2" style={{ top, height }}>
                <BlockChip
                  block={b}
                  onDragStart={() => setDragId(b.id)}
                  onDragEnd={() => setDragId(null)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Week view                                                           */
/* ------------------------------------------------------------------ */

function WeekGrid({
  cursor,
  blocks,
  setDragId,
  hoverTarget,
  setHoverTarget,
  onReschedule,
}: DnDProps) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/40 backdrop-blur">
      <div className="grid grid-cols-7 border-b border-border/60 bg-card/50">
        {days.map((d) => (
          <div key={d.toISOString()} className="px-3 py-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </div>
            <div
              className={`mt-0.5 text-sm font-semibold ${dayKey(d) === dayKey(new Date()) ? "text-primary" : "text-foreground"}`}
            >
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>
      <div className="grid min-h-[420px] grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          const items = blocks
            .filter((b) => b.date === key)
            .sort((a, b) => a.startMin - b.startMin);
          return (
            <div
              key={key}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverTarget(key);
              }}
              onDragLeave={() => setHoverTarget(null)}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) onReschedule(id, key);
                setHoverTarget(null);
                setDragId(null);
              }}
              className={`space-y-1.5 border-r border-border/40 p-2 transition last:border-r-0 ${hoverTarget === key ? "bg-primary/5" : ""}`}
            >
              {items.length === 0 && (
                <div className="grid h-full min-h-[80px] place-items-center text-[10px] uppercase tracking-widest text-muted-foreground/50">
                  · · ·
                </div>
              )}
              {items.map((b) => (
                <BlockChip
                  key={b.id}
                  block={b}
                  onDragStart={() => setDragId(b.id)}
                  onDragEnd={() => setDragId(null)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Month view                                                          */
/* ------------------------------------------------------------------ */

function MonthGrid({
  cursor,
  blocks,
  setDragId,
  hoverTarget,
  setHoverTarget,
  onReschedule,
}: DnDProps) {
  const first = startOfMonth(cursor);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthIdx = cursor.getMonth();

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/40 backdrop-blur">
      <div className="grid grid-cols-7 border-b border-border/60 bg-card/50 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const key = dayKey(d);
          const items = blocks
            .filter((b) => b.date === key)
            .sort((a, b) => a.startMin - b.startMin);
          const inMonth = d.getMonth() === monthIdx;
          const isToday = key === dayKey(new Date());
          return (
            <div
              key={key}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverTarget(key);
              }}
              onDragLeave={() => setHoverTarget(null)}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) onReschedule(id, key);
                setHoverTarget(null);
                setDragId(null);
              }}
              className={`min-h-[112px] space-y-1 border-b border-r border-border/40 p-1.5 transition ${
                inMonth ? "bg-transparent" : "bg-secondary/20"
              } ${hoverTarget === key ? "bg-primary/5" : ""}`}
            >
              <div
                className={`text-right text-[11px] font-semibold ${isToday ? "text-primary" : inMonth ? "text-foreground" : "text-muted-foreground/50"}`}
              >
                {d.getDate()}
              </div>
              {items.slice(0, 3).map((b) => (
                <BlockChip
                  key={b.id}
                  block={b}
                  compact
                  onDragStart={() => setDragId(b.id)}
                  onDragEnd={() => setDragId(null)}
                />
              ))}
              {items.length > 3 && (
                <div className="text-[10px] font-medium text-muted-foreground">
                  +{items.length - 3} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline (per routine × days)                                       */
/* ------------------------------------------------------------------ */

function TimelineGrid({
  routines,
  cursor,
  blocks,
  setDragId,
  hoverTarget,
  setHoverTarget,
  onReschedule,
}: DnDProps & { routines: CalendarRoutine[] }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const rows = routines.filter((r) => r.status !== "draft");

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/40 backdrop-blur">
      <div className="grid grid-cols-[220px_1fr]">
        <div className="border-r border-border/60 bg-card/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Routine
        </div>
        <div className="grid grid-cols-7 bg-card/50">
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="border-l border-border/60 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
            >
              {d.toLocaleDateString(undefined, { weekday: "short" })} {d.getDate()}
            </div>
          ))}
        </div>
      </div>

      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[220px_1fr] border-t border-border/40">
          <div className="flex items-center gap-2 border-r border-border/60 px-3 py-3">
            <span className="h-2 w-2 rounded-full" style={{ background: r.accent }} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{r.title}</div>
              <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                {r.audience}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const key = `${r.id}_${dayKey(d)}`;
              const items = blocks.filter((b) => b.routineId === r.id && b.date === dayKey(d));
              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverTarget(key);
                  }}
                  onDragLeave={() => setHoverTarget(null)}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) onReschedule(id, dayKey(d));
                    setHoverTarget(null);
                    setDragId(null);
                  }}
                  className={`min-h-[72px] space-y-1 border-l border-border/40 p-1.5 transition ${hoverTarget === key ? "bg-primary/5" : ""}`}
                >
                  {items.map((b) => (
                    <BlockChip
                      key={b.id}
                      block={b}
                      compact
                      onDragStart={() => setDragId(b.id)}
                      onDragEnd={() => setDragId(null)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
