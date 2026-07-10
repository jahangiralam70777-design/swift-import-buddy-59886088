import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  CalendarClock,
  Database,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { signOut } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/student")({
  beforeLoad: ({ context, location }) => {
    const auth = (context as { auth?: { role?: string | null } }).auth;
    if (auth?.role !== "student") {
      throw redirect({
        to: auth?.role === "admin" ? "/admin" : "/login",
        search: auth?.role ? undefined : { redirect: location.href },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Student Panel — CL Aspire" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StudentLayout,
});

const NAV = [
  { to: "/student", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/student/mcq-practice", label: "MCQ Practice", icon: ListChecks, exact: false },
  { to: "/student/qns-bank-practice", label: "Qns Bank Practice", icon: Database, exact: false },
  { to: "/student/custom-exam", label: "Custom Exam", icon: FileText, exact: false },
  { to: "/student/routine-tracker", label: "Routine Tracker", icon: CalendarClock, exact: false },
  { to: "/student/progress-tracker", label: "Progress Tracker", icon: TrendingUp, exact: false },
  { to: "/student/wrong-answers", label: "Wrong Answers", icon: XCircle, exact: false },
  { to: "/student/bookmarks", label: "Bookmarks", icon: Bookmark, exact: false },
  { to: "/student/settings", label: "Settings", icon: SettingsIcon, exact: false },
] as const;

function StudentLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const displayName = useMemo(() => {
    const meta = (auth.user?.user_metadata ?? {}) as Record<string, unknown>;
    return String(
      (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        auth.user?.email?.split("@")[0] ||
        "Student",
    );
  }, [auth.user]);
  const email = auth.user?.email ?? "";

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut({ queryClient });
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl md:hidden">
        <Link to="/student" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
            CL
          </span>
          <span>Student</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-foreground shadow-sm"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex min-h-[calc(100vh-56px)] w-full md:min-h-screen">
        <aside
          className={`${mobileOpen ? "block" : "hidden"} md:block fixed inset-x-0 top-[56px] z-20 border-b border-border/60 bg-background/95 backdrop-blur-xl md:static md:top-0 md:w-64 md:shrink-0 md:border-b-0 md:border-r flex flex-col`}
        >
          <div className="hidden items-center gap-2 border-b border-border/60 px-6 py-5 md:flex">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
              CL
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">CL Aspire</div>
              <div className="text-xs text-muted-foreground">Student Panel</div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1 p-3 md:p-4">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/10 to-transparent text-foreground shadow-inner"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 w-1 rounded-r-full bg-gradient-to-b from-indigo-500 to-fuchsia-500" />
                  )}
                  <item.icon
                    className={`h-4 w-4 transition-colors ${
                      active
                        ? "text-indigo-500"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border/60 p-3">
            <div className="mb-2 px-2">
              <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
              {email && <div className="truncate text-xs text-muted-foreground">{email}</div>}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
