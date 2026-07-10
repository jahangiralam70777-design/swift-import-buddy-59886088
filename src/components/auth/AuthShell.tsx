import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, Moon, Sparkles, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

/* ---------- Theme toggle ---------- */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      aria-pressed={isDark}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/70 backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-primary/40 hover:shadow-glow focus-visible:ring-4 focus-visible:ring-primary/25 motion-reduce:hover:scale-100 motion-reduce:transition-none"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all duration-500 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all duration-500 dark:rotate-0 dark:scale-100" />
    </button>
  );
}

/* ---------- Ambient particles ---------- */
function AuthParticles({ count = 18 }: { count?: number }) {
  const reduce = useReducedMotion();
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2.5 + 1,
        dur: Math.random() * 8 + 10,
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
          className="absolute rounded-full bg-white/70"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            boxShadow: "0 0 10px currentColor",
          }}
          animate={{ y: [0, -40, 0], opacity: [0, 0.9, 0] }}
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

/* ---------- Brand panel content ---------- */
export type BrandBadge = { icon: ReactNode; label: string };
export type BrandStat = { value: string; label: string };

function BrandPanel({
  eyebrow,
  headline,
  gradientWord,
  description,
  badges,
  stats,
  gradient,
}: {
  eyebrow: string;
  headline: string;
  gradientWord: string;
  description: string;
  badges: BrandBadge[];
  stats: BrandStat[];
  gradient: string;
}) {
  return (
    <div className="relative isolate hidden overflow-hidden lg:flex lg:w-[46%] xl:w-1/2">
      {/* Base gradient */}
      <div className="absolute inset-0 -z-20" style={{ background: gradient }} />
      {/* Grid */}
      <div className="absolute inset-0 -z-10 grid-pattern opacity-25 [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]" />

      {/* Orbs */}
      <motion.div
        aria-hidden
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full opacity-60 blur-[110px]"
        style={{ background: "radial-gradient(circle, #ffffff55 0%, transparent 70%)" }}
      />
      <motion.div
        aria-hidden
        animate={{ x: [0, -30, 20, 0], y: [0, 30, -10, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-40 -right-24 h-[500px] w-[500px] rounded-full opacity-50 blur-[130px]"
        style={{ background: "radial-gradient(circle, #ffffff44 0%, transparent 70%)" }}
      />

      {/* Light ray */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[900px] opacity-25 mix-blend-screen"
        style={{
          background:
            "conic-gradient(from 210deg at 50% 0%, transparent 0deg, #ffffff 20deg, transparent 60deg, transparent 300deg, #ffffff 340deg, transparent 360deg)",
          filter: "blur(40px)",
        }}
      />

      <AuthParticles />

      <div className="relative z-10 flex w-full flex-col justify-between px-12 py-14 xl:px-16 xl:py-16">
        {/* Logo */}
        <Link to="/" className="group inline-flex items-center gap-2.5 self-start">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md ring-1 ring-white/25 shadow-glow transition-transform duration-500 group-hover:scale-110">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-none text-white">
            <span className="text-base font-bold tracking-tight">CL Aspire</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/70">
              ICAB · Bangladesh
            </span>
          </div>
        </Link>

        {/* Headline block */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md text-white"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {eyebrow}
          </div>
          <h1
            className="text-4xl font-bold tracking-tight sm:text-5xl xl:text-[3.5rem]"
            style={{ letterSpacing: "-0.035em", lineHeight: 1.05 }}
          >
            {headline}
            <br />
            <span className="bg-gradient-to-r from-white via-white/95 to-white/70 bg-clip-text text-transparent">
              {gradientWord}
            </span>
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/85">{description}</p>

          {/* Badges */}
          <div className="mt-8 flex flex-wrap gap-2">
            {badges.map((b, i) => (
              <motion.span
                key={b.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 + i * 0.08 }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/95 backdrop-blur-md"
              >
                {b.icon}
                {b.label}
              </motion.span>
            ))}
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="grid max-w-md grid-cols-3 gap-4 text-white"
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="border-l border-white/20 pl-4 first:border-l-0 first:pl-0"
            >
              <div
                className="text-2xl font-bold tracking-tight"
                style={{ letterSpacing: "-0.03em" }}
              >
                {s.value}
              </div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-white/70">
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/* ---------- Field primitives ---------- */
export function Field({
  id,
  label,
  type = "text",
  autoComplete,
  placeholder,
  icon,
  value,
  onChange,
  required,
  error,
  hint,
  onBlur,
  inputMode,
  optional,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  icon: ReactNode;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string | null;
  hint?: string;
  onBlur?: () => void;
  inputMode?: "text" | "email" | "tel" | "numeric" | "search" | "url";
  optional?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;
  const hasError = Boolean(error);

  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/75">
        <span>
          {label}
          {required && (
            <span aria-hidden className="ml-1 text-primary/80">
              *
            </span>
          )}
        </span>
        {optional && (
          <span className="text-[10px] font-medium normal-case tracking-widest text-muted-foreground">
            Optional
          </span>
        )}
      </span>
      <div className="group relative">
        <span
          className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 transition-all duration-300 group-focus-within:text-primary group-focus-within:scale-105 ${
            hasError ? "text-destructive" : "text-muted-foreground"
          }`}
          aria-hidden
        >
          {icon}
        </span>
        <input
          id={id}
          type={inputType}
          autoComplete={autoComplete}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          inputMode={inputMode}
          aria-invalid={hasError || undefined}
          aria-required={required || undefined}
          aria-describedby={hasError ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`w-full rounded-2xl border bg-card/70 py-3.5 pl-11 text-[15px] leading-tight text-foreground shadow-soft outline-none backdrop-blur-xl transition-all duration-300 placeholder:text-muted-foreground/70 hover:bg-card/85 focus:-translate-y-[1px] focus:bg-card focus:ring-4 motion-reduce:transform-none motion-reduce:transition-none ${
            isPassword ? "pr-11" : "pr-4"
          } ${
            hasError
              ? "border-destructive/70 focus:border-destructive focus:ring-destructive/15"
              : "border-border hover:border-primary/40 focus:border-primary/60 focus:ring-primary/15"
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all duration-300 hover:bg-secondary/70 hover:text-foreground focus-visible:bg-secondary/70 focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hasError ? (
        <p
          id={`${id}-error`}
          role="alert"
          aria-live="polite"
          className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-destructive"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-1 w-1 flex-none rounded-full bg-destructive"
          />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </label>
  );
}

/* ---------- Auth shell ---------- */
export function AuthShell({
  brand,
  children,
  reverse = false,
}: {
  brand: {
    eyebrow: string;
    headline: string;
    gradientWord: string;
    description: string;
    badges: BrandBadge[];
    stats: BrandStat[];
    gradient: string;
  };
  children: ReactNode;
  reverse?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setMouse({ x: (e.clientX - cx) / cx, y: (e.clientY - cy) / cy });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduce]);

  return (
    <div
      ref={wrapRef}
      className={`relative flex min-h-dvh w-full overflow-hidden bg-background text-foreground ${
        reverse ? "flex-row-reverse" : ""
      }`}
    >
      {/* Ambient background for the form side */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-pattern opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        {/* Slow-rotating conic aurora */}
        {!reduce && (
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.18] mix-blend-screen"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, #7c3aed 60deg, transparent 140deg, #06b6d4 220deg, transparent 300deg, #4f46e5 340deg, transparent 360deg)",
              filter: "blur(80px)",
            }}
          />
        )}
        <motion.div
          animate={reduce ? undefined : { x: mouse.x * 30, y: mouse.y * 30 }}
          transition={{ type: "spring", stiffness: 60, damping: 20 }}
          className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-30 blur-[130px]"
        >
          <div
            className="h-full w-full rounded-full"
            style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
          />
        </motion.div>
        <motion.div
          animate={reduce ? undefined : { x: mouse.x * -20, y: mouse.y * -20 }}
          transition={{ type: "spring", stiffness: 60, damping: 20 }}
          className="absolute right-[-100px] bottom-[-80px] h-[380px] w-[380px] rounded-full opacity-30 blur-[120px]"
        >
          <div
            className="h-full w-full rounded-full"
            style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }}
          />
        </motion.div>
      </div>

      <BrandPanel {...brand} />

      {/* Form column */}
      <main className="relative flex w-full flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-4 sm:px-8 sm:py-5">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" />
            Back to home
          </Link>

          {/* Compact logo, mobile only */}
          <Link
            to="/"
            aria-label="CL Aspire home"
            className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 lg:hidden"
          >
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient shadow-glow">
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold tracking-tight">CL Aspire</span>
          </Link>

          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-10 pt-2 sm:px-8 sm:pb-12 sm:pt-4">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md"
          >
            {children}
          </motion.div>
        </div>

        <div className="px-4 pb-6 text-center text-[11px] text-muted-foreground sm:px-8">
          © {new Date().getFullYear()} CL Aspire · Bangladesh's Premium Platform for ICAB CA
          Students
        </div>
      </main>
    </div>
  );
}
