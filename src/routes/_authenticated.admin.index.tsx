import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import {
  Activity,
  CalendarClock,
  GraduationCap,
  Library,
  ListChecks,
  Loader2,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users2,
} from "lucide-react";
import { getUserStats, type UserStats } from "@/lib/user.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Admin Console" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDashboard,
});

type NavItem = {
  to: string;
  label: string;
  description: string;
  icon: typeof GraduationCap;
};

const MANAGERS: NavItem[] = [
  {
    to: "/admin/academic-manager",
    label: "Academic Manager",
    description: "Levels, subjects and chapters.",
    icon: GraduationCap,
  },
  {
    to: "/admin/mcq-manager",
    label: "MCQ Manager",
    description: "Curate and publish MCQs.",
    icon: ListChecks,
  },
  {
    to: "/admin/qns-bank-manager",
    label: "Qns Bank Manager",
    description: "Long-form question bank.",
    icon: Library,
  },
  {
    to: "/admin/routine-manager",
    label: "Routine Manager",
    description: "Plans, days and tasks.",
    icon: CalendarClock,
  },
  {
    to: "/admin/user-manager",
    label: "User Manager",
    description: "Members, roles and access.",
    icon: Users2,
  },
  {
    to: "/admin/settings",
    label: "Admin Settings",
    description: "Workspace configuration.",
    icon: Settings,
  },
];

function AdminDashboard() {
  const fetchStats = useServerFn(getUserStats);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<UserStats>({
    queryKey: ["admin", "user-stats"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });

  const stats: Array<{ label: string; value: number | string; icon: typeof Users2 }> = [
    { label: "Total users", value: data?.total ?? "—", icon: Users2 },
    { label: "Students", value: data?.students ?? "—", icon: GraduationCap },
    { label: "Admins", value: data?.admins ?? "—", icon: ShieldCheck },
    { label: "Active today", value: data?.activeToday ?? "—", icon: Activity },
    { label: "Verified", value: data?.verified ?? "—", icon: UserCheck },
    { label: "New (7d)", value: data?.newLast7Days ?? "—", icon: UserPlus },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-1 py-2">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-6 shadow-soft backdrop-blur-2xl sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-gradient-to-br from-primary/25 via-accent/20 to-transparent blur-3xl"
        />
        <div className="relative flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-border/70 bg-secondary/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-accent" />
            Admin overview
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Welcome back
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Monitor your workspace at a glance and jump straight into the tool you need.
          </p>
        </div>
      </motion.header>

      <section aria-labelledby="stats-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="stats-heading" className="text-sm font-semibold text-foreground">
            Workspace stats
          </h2>
          {isFetching ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Refreshing
            </span>
          ) : null}
        </div>

        {isError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">Couldn't load stats.</div>
            <div className="mt-0.5 text-xs opacity-80">
              {(error as Error)?.message ?? "Unknown error"}
            </div>
            <button
              onClick={() => refetch()}
              className="mt-3 inline-flex h-8 items-center rounded-lg border border-destructive/40 bg-background px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-soft backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {s.label}
                    </span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                    {isLoading ? (
                      <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted" />
                    ) : (
                      s.value
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="managers-heading" className="space-y-3">
        <h2 id="managers-heading" className="text-sm font-semibold text-foreground">
          Managers
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MANAGERS.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.to}
                to={m.to}
                className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 text-left shadow-soft backdrop-blur-xl transition hover:border-primary/40 hover:bg-card/80"
              >
                <div className="grid h-10 w-10 flex-none place-items-center rounded-xl border border-border/70 bg-secondary/60">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                    {m.label}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {m.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
