import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Bell,
  CalendarClock,
  ChevronsLeft,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Library,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Users2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { signOut } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context, location }) => {
    const auth = (context as { auth?: { role?: string | null } }).auth;
    if (auth?.role !== "admin") {
      throw redirect({
        to: auth?.role === "student" ? "/student" : "/login",
        search: auth?.role ? undefined : { redirect: location.href },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Admin Console — CL Aspire" },
      {
        name: "description",
        content: "Authorised administrator workspace for CL Aspire.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/academic-manager", label: "Academic Manager", icon: GraduationCap },
  { to: "/admin/mcq-manager", label: "MCQ Manager", icon: ListChecks },
  { to: "/admin/qns-bank-manager", label: "Qns Bank Manager", icon: Library },
  { to: "/admin/routine-manager", label: "Routine Manager", icon: CalendarClock },
  { to: "/admin/user-manager", label: "User Manager", icon: Users2 },
  { to: "/admin/settings", label: "Admin Settings", icon: Settings },
];

const TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/academic-manager": "Academic Manager",
  "/admin/mcq-manager": "MCQ Manager",
  "/admin/qns-bank-manager": "Qns Bank Manager",
  "/admin/routine-manager": "Routine Manager",
  "/admin/user-manager": "User Manager",
  "/admin/settings": "Admin Settings",
};

function AdminLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const displayName = useMemo(() => {
    const meta = (auth.user?.user_metadata ?? {}) as Record<string, unknown>;
    const raw =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      auth.user?.email?.split("@")[0] ||
      "Admin";
    return String(raw);
  }, [auth.user]);
  const email = auth.user?.email ?? "";
  const initials = useMemo(() => {
    const src = displayName || email || "AD";
    const parts = src.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "A") + (parts[1]?.[0] ?? "")).toUpperCase();
  }, [displayName, email]);

  const handleSignOut = async () => {
    setProfileOpen(false);
    await signOut({ queryClient });
    navigate({ to: "/login", replace: true });
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const title = TITLES[pathname] ?? "Admin";

  // Auth pages (e.g. /admin/login) render standalone without the admin shell.
  if (pathname.startsWith("/admin/login")) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased [font-feature-settings:'ss01','cv11']">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-primary/25 via-accent/15 to-transparent blur-3xl animate-float" />
        <div className="absolute -bottom-40 -right-32 h-[560px] w-[560px] rounded-full bg-gradient-to-tr from-accent/20 via-primary/10 to-transparent blur-3xl animate-float [animation-delay:-3s]" />
        <div
          className="absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside
          className={`hidden lg:flex sticky top-0 h-screen flex-col border-r border-border/60 bg-card/50 backdrop-blur-2xl transition-[width] duration-300 ease-out shadow-[inset_-1px_0_0_0_color-mix(in_oklab,var(--foreground)_3%,transparent)] ${
            collapsed ? "w-[76px]" : "w-[260px]"
          }`}
        >
          <SidebarBrand collapsed={collapsed} />
          <SidebarNav collapsed={collapsed} pathname={pathname} />
          <SidebarFooter collapsed={collapsed} onCollapseToggle={() => setCollapsed((c) => !c)} />
        </aside>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                key="scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                key="drawer"
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border/60 bg-card/95 backdrop-blur-xl lg:hidden"
              >
                <div className="flex items-center justify-between p-4">
                  <SidebarBrand collapsed={false} />
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
                    aria-label="Close menu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <SidebarNav collapsed={false} pathname={pathname} />
                <SidebarFooter collapsed={false} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/55">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  Admin Console
                </div>
                <h1 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
                  {title}
                </h1>
              </div>

              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                {/* Search */}
                <div className="hidden md:block">
                  <div className="group relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground" />
                    <input
                      type="text"
                      placeholder="Search…"
                      aria-label="Search"
                      className="h-10 w-56 rounded-xl border border-border/70 bg-card/60 pl-9 pr-14 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm outline-none backdrop-blur-md transition-all duration-200 focus:w-72 focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
                    />
                    <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-border/70 bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      ⌘K
                    </kbd>
                  </div>
                </div>
                <button
                  className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:hidden"
                  aria-label="Search"
                >
                  <Search className="h-4 w-4" />
                </button>

                {/* Theme toggle */}
                <button
                  onClick={toggle}
                  aria-label="Toggle theme"
                  className="relative rounded-xl border border-border/70 bg-card/60 p-2.5 text-foreground shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={theme}
                      initial={{ y: -8, opacity: 0, rotate: -30 }}
                      animate={{ y: 0, opacity: 1, rotate: 0 }}
                      exit={{ y: 8, opacity: 0, rotate: 30 }}
                      transition={{ duration: 0.18 }}
                      className="block"
                    >
                      {theme === "dark" ? (
                        <Sun className="h-4 w-4" />
                      ) : (
                        <Moon className="h-4 w-4" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </button>

                {/* Notifications */}
                <button
                  aria-label="Notifications"
                  className="relative rounded-xl border border-border/70 bg-card/60 p-2.5 text-foreground shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                </button>

                {/* Profile */}
                <div ref={profileRef} className="relative">
                  <button
                    onClick={() => setProfileOpen((o) => !o)}
                    className="group flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/60 py-1.5 pl-1.5 pr-2 sm:pr-3 shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary via-primary/80 to-accent text-[11px] font-semibold text-primary-foreground shadow-inner">
                      {initials}
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="block text-xs font-semibold leading-tight text-foreground">
                        {displayName}
                      </span>
                      <span className="block text-[10px] leading-tight text-muted-foreground">
                        Administrator
                      </span>
                    </span>
                  </button>
                  <AnimatePresence>
                    {profileOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        role="menu"
                        className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-2xl border border-border/70 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl"
                      >
                        <div className="flex items-center gap-3 rounded-xl px-3 py-3">
                          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary via-primary/80 to-accent text-xs font-semibold text-primary-foreground">
                            {initials}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{displayName}</div>
                            <div className="truncate text-xs text-muted-foreground">{email}</div>
                          </div>
                        </div>
                        <div className="my-1 h-px bg-border/70" />
                        <MenuBtn
                          icon={Settings}
                          label="Settings"
                          onClick={() => {
                            setProfileOpen(false);
                            navigate({ to: "/admin/settings" });
                          }}
                        />
                        <MenuBtn icon={Sparkles} label="What's new" />
                        <div className="my-1 h-px bg-border/70" />
                        <MenuBtn
                          icon={LogOut}
                          label="Sign out"
                          tone="danger"
                          onClick={handleSignOut}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 pt-5 pb-4 ${collapsed ? "justify-center px-2" : ""}`}
    >
      <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary/80 to-accent text-primary-foreground shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.25)]">
        <span className="text-sm font-black tracking-tight">C</span>
        <span className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-70" />
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold tracking-tight">CL Aspire</div>
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Admin Suite
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarNav({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3">
      {!collapsed && (
        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
          Workspace
        </div>
      )}
      <ul className="space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  active
                    ? "bg-gradient-to-r from-primary/15 via-primary/8 to-transparent text-foreground shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--foreground)_5%,transparent)]"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground hover:translate-x-0.5"
                } ${collapsed ? "justify-center px-2" : ""}`}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="admin-nav-active"
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-accent shadow-[0_0_12px_0_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 transition-all duration-200 ${
                    active
                      ? "text-primary scale-110"
                      : "text-muted-foreground group-hover:text-foreground group-hover:scale-105"
                  }`}
                />
                {!collapsed && <span className="truncate tracking-tight">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarFooter({
  collapsed,
  onCollapseToggle,
}: {
  collapsed: boolean;
  onCollapseToggle?: () => void;
}) {
  return (
    <div className="border-t border-border/60 p-3">
      {!collapsed && (
        <div className="mb-3 rounded-2xl border border-border/70 bg-gradient-to-br from-secondary/60 to-secondary/20 p-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Pro tips
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Press <kbd className="rounded border border-border bg-card px-1 text-[10px]">⌘K</kbd> to
            search anywhere.
          </p>
        </div>
      )}
      {onCollapseToggle && (
        <button
          onClick={onCollapseToggle}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground ${
            collapsed ? "justify-center" : ""
          }`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronsLeft
            className={`h-4 w-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      )}
    </div>
  );
}

function MenuBtn({
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
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
        tone === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-secondary/60"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
