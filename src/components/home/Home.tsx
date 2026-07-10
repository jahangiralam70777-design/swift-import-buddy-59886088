import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  Sparkles,
  Moon,
  Sun,
  ArrowRight,
  ListChecks,
  BookOpen,
  LineChart,
  FileText,
  Calculator,
  ShieldCheck,
  Star,
  Users,
  Landmark,
  Menu,
  X,
  LogIn,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import {
  StatsSection,
  FeaturesSection,
  WhyAspireSection,
  LearningExperienceSection,
  ProgressPreviewSection,
} from "./Sections";
import { TestimonialsSection, FAQSection, FinalCTA, Footer } from "./Final";

/* ---------- Theme toggle ---------- */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      aria-pressed={isDark}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/70 backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-primary/40 hover:shadow-glow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 motion-reduce:hover:scale-100 motion-reduce:transition-none"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all duration-500 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all duration-500 dark:rotate-0 dark:scale-100" />
    </button>
  );
}

/* ---------- Navbar ---------- */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const idle =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
    idle(() => {
      void router.preloadRoute({ to: "/login" });
      void router.preloadRoute({ to: "/signup" });
    });
  }, [router]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while mobile menu is open, close on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const links = [
    { label: "Home", href: "#home" },
    { label: "Features", href: "#features" },
    { label: "About", href: "#about" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#contact" },
  ];

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div
          className={`mt-3 flex items-center justify-between rounded-2xl px-3 py-2.5 transition-all duration-500 sm:px-4 sm:py-3 ${
            scrolled
              ? "glass shadow-soft border-border"
              : "border border-transparent bg-transparent"
          }`}
        >
          {/* Logo */}
          <a href="#home" aria-label="CL Aspire — home" className="group flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-glow transition-transform duration-500 group-hover:scale-110">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden="true" />
              <div className="absolute inset-0 rounded-xl bg-brand-gradient opacity-60 blur-lg -z-10" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold tracking-tight sm:text-lg">CL Aspire</span>
              <span className="hidden sm:inline text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                ICAB · Bangladesh
              </span>
            </div>
          </a>

          {/* Center nav */}
          <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="relative rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:text-foreground"
              >
                <span className="relative z-10">{l.label}</span>
                <span className="absolute inset-0 -z-0 rounded-lg bg-secondary opacity-0 transition-opacity duration-300 hover:opacity-100" />
              </a>
            ))}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            {/* Sign In — ghost / outline */}
            <Link
              to="/login"
              className="group relative hidden sm:inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-semibold text-foreground/85 backdrop-blur-xl transition-all duration-300 hover:-translate-y-[1px] hover:border-primary/40 hover:bg-card hover:text-foreground hover:shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
            >
              <LogIn
                className="h-3.5 w-3.5 opacity-70 transition-all duration-300 group-hover:opacity-100 group-hover:text-primary"
                aria-hidden="true"
              />
              <span>Sign in</span>
            </Link>

            {/* Sign Up — gradient primary */}
            <Link
              to="/signup"
              className="group relative hidden sm:inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow ring-1 ring-white/15 transition-all duration-300 hover:-translate-y-[1px] hover:scale-[1.02] hover:shadow-[0_18px_50px_-16px_rgba(124,58,237,0.6)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 motion-reduce:transition-none sm:px-5"
            >
              <span className="relative z-10">Sign up</span>
              <ArrowRight
                className="relative z-10 h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/30 to-white/0 transition-transform duration-700 group-hover:translate-x-full"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-1 -z-10 rounded-full bg-brand-gradient opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-60"
              />
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/70 backdrop-blur-xl transition-all duration-300 hover:border-primary/40 hover:shadow-glow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 md:hidden"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        id="mobile-nav"
        className={`md:hidden fixed inset-x-0 top-[68px] z-40 origin-top px-4 transition-all duration-500 ${
          mobileOpen
            ? "pointer-events-auto opacity-100 translate-y-0 scale-100"
            : "pointer-events-none opacity-0 -translate-y-2 scale-[0.98]"
        }`}
      >
        <div className="glass shadow-glow rounded-3xl border border-border p-3">
          <nav aria-label="Mobile" className="flex flex-col">
            {links.map((l, i) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-2xl px-4 py-3 text-base font-medium transition-all duration-300 hover:bg-secondary"
                style={{
                  transitionDelay: mobileOpen ? `${i * 40}ms` : "0ms",
                }}
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm font-semibold text-foreground backdrop-blur-xl transition-all duration-300 hover:border-primary/40 hover:shadow-soft"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign in
            </Link>
            <Link
              to="/signup"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-brand-gradient px-4 py-3 text-sm font-semibold text-white shadow-glow ring-1 ring-white/15"
            >
              Sign up
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 top-[68px] -z-10 bg-background/60 backdrop-blur-sm"
        />
      )}
    </motion.header>
  );
}

/* ---------- Particle field ---------- */
function Particles({ count = 24 }: { count?: number }) {
  const reduce = useReducedMotion();
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        dur: Math.random() * 8 + 8,
        delay: Math.random() * 6,
      })),
    [count],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-foreground/40 dark:bg-white/60"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            boxShadow: "0 0 8px currentColor",
          }}
          animate={{
            y: [0, -60, 0],
            opacity: [0, 0.8, 0],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ---------- Floating card ---------- */
function FloatingCard({
  icon,
  title,
  subtitle,
  className = "",
  delay = 0,
  duration = 6,
  offset = -14,
  accent = "bg-brand-gradient",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  className?: string;
  delay?: number;
  duration?: number;
  offset?: number;
  accent?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.6 + delay, ease: [0.16, 1, 0.3, 1] }}
      className={`absolute z-20 ${className}`}
    >
      <motion.div
        animate={{ y: [0, offset, 0] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
        className="glass shadow-soft flex items-center gap-3 rounded-2xl border border-border px-3.5 py-3 min-w-[180px]"
      >
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent} text-white shadow-glow`}
        >
          {icon}
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------- Dashboard preview ---------- */
function DashboardPreview({ mouseX, mouseY }: { mouseX: number; mouseY: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotateX: 10 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1400 }}
      className="relative"
    >
      <motion.div
        style={{ rotateX: mouseY * -6, rotateY: mouseX * 6 }}
        transition={{ type: "spring", stiffness: 60, damping: 18 }}
        className="glass shadow-glow relative overflow-hidden rounded-3xl border border-border"
      >
        {/* Titlebar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <div className="ml-3 text-[10px] font-medium text-muted-foreground">
            claspire.com / student
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Live
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-12 gap-3 p-4 sm:p-5">
          {/* Sidebar */}
          <div className="col-span-4 space-y-1.5">
            {[
              { l: "Overview", a: true },
              { l: "MCQ Practice" },
              { l: "Chapter Quiz" },
              { l: "Mock Exam" },
              { l: "Question Bank" },
            ].map((s) => (
              <div
                key={s.l}
                className={`rounded-lg px-2.5 py-2 text-[11px] font-medium ${
                  s.a
                    ? "bg-brand-gradient text-white shadow-glow"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {s.l}
              </div>
            ))}
          </div>

          {/* Main */}
          <div className="col-span-8 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: "Streak", v: "42d" },
                { l: "Accuracy", v: "87%" },
                { l: "Rank", v: "#128" },
              ].map((s, i) => (
                <div
                  key={s.l}
                  className="rounded-xl border border-border bg-card/70 p-2.5"
                  style={{ animation: `slide-up 0.8s ${0.9 + i * 0.1}s both` }}
                >
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    {s.l}
                  </div>
                  <div className="text-lg font-bold tracking-tight text-gradient">{s.v}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold">Weekly progress</div>
                <div className="text-[10px] text-success font-medium">+24%</div>
              </div>
              <div className="flex h-20 items-end gap-1.5">
                {[35, 55, 42, 78, 60, 92, 82].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.9, delay: 1.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    className="flex-1 rounded-t-md bg-brand-gradient"
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold">Next up</div>
                <div className="text-[10px] text-muted-foreground">3 items</div>
              </div>
              <div className="space-y-1.5">
                {[
                  "Audit & Assurance · Ch. 5 · 20 MCQs",
                  "Financial Accounting · Timed Quiz · 6pm",
                  "Mock Exam · Certificate Level",
                ].map((t, i) => (
                  <div
                    key={t}
                    className="flex items-center justify-between rounded-lg bg-secondary/60 px-2.5 py-1.5 text-[10px]"
                    style={{ animation: `slide-up 0.7s ${1.3 + i * 0.08}s both` }}
                  >
                    <span>{t}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* glow underneath */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-brand-gradient opacity-25 blur-3xl" />
    </motion.div>
  );
}

/* ---------- Hero ---------- */
function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yShift = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const fade = useTransform(scrollYProgress, [0, 1], [1, 0]);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setMouse({
        x: (e.clientX - cx) / cx,
        y: (e.clientY - cy) / cy,
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduce]);

  return (
    <section
      id="home"
      ref={ref}
      className="relative isolate min-h-screen overflow-hidden pt-32 pb-24 sm:pt-36"
    >
      {/* --- Background layers --- */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* grid */}
        <div className="absolute inset-0 grid-pattern opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]" />

        {/* animated gradient mesh orbs */}
        <motion.div
          style={{ x: mouse.x * 40, y: mouse.y * 40 }}
          className="absolute -left-32 top-10 h-[520px] w-[520px] rounded-full opacity-40 blur-[130px] animate-float"
        >
          <div
            className="h-full w-full rounded-full"
            style={{ background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)" }}
          />
        </motion.div>
        <motion.div
          style={{ x: mouse.x * -30, y: mouse.y * -30 }}
          className="absolute right-[-120px] top-1/3 h-[460px] w-[460px] rounded-full opacity-40 blur-[120px] animate-float"
        >
          <div
            className="h-full w-full rounded-full"
            style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
          />
        </motion.div>
        <motion.div
          style={{ x: mouse.x * 20, y: mouse.y * -40 }}
          className="absolute left-1/3 bottom-[-100px] h-[380px] w-[380px] rounded-full opacity-30 blur-[110px]"
        >
          <div
            className="h-full w-full rounded-full"
            style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }}
          />
        </motion.div>

        {/* light rays */}
        <div
          className="absolute left-1/2 top-0 h-[900px] w-[1200px] -translate-x-1/2 opacity-[0.14] mix-blend-screen"
          style={{
            background:
              "conic-gradient(from 210deg at 50% 0%, transparent 0deg, #7c3aed 20deg, transparent 60deg, transparent 120deg, #06b6d4 150deg, transparent 200deg, transparent 300deg, #4f46e5 330deg, transparent 360deg)",
            filter: "blur(40px)",
          }}
        />

        {/* particles */}
        <Particles count={28} />
      </div>

      {/* --- Content grid --- */}
      <motion.div style={{ y: yShift, opacity: fade }} className="relative mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-10">
          {/* Left */}
          <div className="lg:col-span-6 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="glass mx-auto lg:mx-0 mb-8 inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium"
            >
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Built for Bangladesh CA Students · ICAB 2026
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-balance text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl xl:text-[5.25rem]"
              style={{ letterSpacing: "-0.04em", lineHeight: 1.02 }}
            >
              Master Your ICAB CA
              <br />
              <span className="text-gradient animate-gradient">Journey with Confidence.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="mx-auto lg:mx-0 mt-7 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Chapter-wise MCQ practice, timed quizzes, mock examinations, question bank and
              performance analytics — thoughtfully designed for ICAB Certificate, Professional and
              Advanced Level students across Bangladesh.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.45 }}
              className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-3"
            >
              <button className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-brand-gradient px-7 py-3.5 text-base font-semibold text-white shadow-glow transition-transform duration-300 hover:scale-[1.03]">
                <span className="relative z-10">Start Practicing</span>
                <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/30 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
              </button>
              <button className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-7 py-3.5 text-base font-semibold backdrop-blur transition-all duration-300 hover:bg-card hover:-translate-y-0.5">
                Explore Features
              </button>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.7 }}
              className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-xs text-muted-foreground"
            >
              {[
                { icon: <ShieldCheck className="h-3.5 w-3.5 text-success" />, l: "ICAB Focused" },
                { icon: <Users className="h-3.5 w-3.5 text-accent" />, l: "Growing CA Community" },
                {
                  icon: <Star className="h-3.5 w-3.5 fill-warning text-warning" />,
                  l: "4.9 Student Rating",
                },
                {
                  icon: <Landmark className="h-3.5 w-3.5 text-warning" />,
                  l: "Made in Bangladesh",
                },
              ].map((b, i) => (
                <motion.div
                  key={b.l}
                  animate={{ y: [0, -3, 0] }}
                  transition={{
                    duration: 3 + i * 0.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.2,
                  }}
                  className="glass inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium"
                >
                  {b.icon} {b.l}
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Right */}
          <div className="relative lg:col-span-6">
            <DashboardPreview mouseX={mouse.x} mouseY={mouse.y} />

            {/* Floating cards around dashboard */}
            <FloatingCard
              icon={<ListChecks className="h-4 w-4" />}
              title="MCQ Practice"
              subtitle="Chapter-wise"
              className="-left-4 -top-6 sm:-left-10"
              delay={0.1}
              duration={6}
              offset={-14}
            />
            <FloatingCard
              icon={<BookOpen className="h-4 w-4" />}
              title="Chapter Quiz"
              subtitle="Timed · Ready"
              className="-right-2 top-12 sm:-right-10"
              delay={0.25}
              duration={7}
              offset={16}
              accent="bg-gradient-to-br from-cyan-500 to-blue-600"
            />
            <FloatingCard
              icon={<LineChart className="h-4 w-4" />}
              title="Progress Tracking"
              subtitle="+24% this week"
              className="-left-6 bottom-24 sm:-left-14"
              delay={0.4}
              duration={8}
              offset={-12}
              accent="bg-gradient-to-br from-emerald-500 to-teal-600"
            />
            <FloatingCard
              icon={<FileText className="h-4 w-4" />}
              title="Mock Exam"
              subtitle="Certificate Level"
              className="-right-4 bottom-16 sm:-right-8"
              delay={0.55}
              duration={7.5}
              offset={14}
              accent="bg-gradient-to-br from-fuchsia-500 to-pink-600"
            />
            <FloatingCard
              icon={<Calculator className="h-4 w-4" />}
              title="Question Bank"
              subtitle="5,500+ MCQs"
              className="left-1/2 -bottom-6 -translate-x-1/2"
              delay={0.7}
              duration={6.5}
              offset={-10}
              accent="bg-gradient-to-br from-amber-500 to-orange-600"
            />
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ---------- Home ---------- */
export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Nav />
      <main>
        <Hero />
        <StatsSection />
        <FeaturesSection />
        <WhyAspireSection />
        <LearningExperienceSection />
        <ProgressPreviewSection />
        <TestimonialsSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
