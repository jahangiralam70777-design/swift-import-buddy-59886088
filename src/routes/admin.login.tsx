import { createFileRoute, Link, useNavigate, useRouter, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Radar,
  Shield,
  ShieldCheck,
  Fingerprint,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { ensureAuthReady, signInWithEmail, signOut } from "@/lib/auth";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  beforeLoad: async () => {
    const snap = await ensureAuthReady();
    if (snap.status === "signedIn") {
      throw redirect({ to: snap.role === "admin" ? "/admin" : "/student" });
    }
  },
  head: () => ({
    meta: [
      { title: "Admin Sign In — CL Aspire" },
      {
        name: "description",
        content:
          "Restricted administrator access to the CL Aspire control panel. Authorised staff only.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin Sign In — CL Aspire" },
      {
        property: "og:description",
        content: "Restricted administrator access. Authorised staff only.",
      },
    ],
  }),
  component: AdminLoginPage,
});

function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/email not confirmed/i.test(msg))
    return "Please confirm the email address before signing in.";
  if (/too many/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  return msg || "Sign-in failed. Please try again.";
}

function SecurityCrest() {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute -top-14 left-1/2 z-10 -translate-x-1/2">
      <div className="relative h-24 w-24">
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full border border-primary/30"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          style={{
            maskImage:
              "conic-gradient(from 0deg, #000 0deg, transparent 90deg, #000 180deg, transparent 270deg, #000 360deg)",
          }}
        />
        <motion.div
          aria-hidden
          className="absolute inset-2 rounded-full border border-accent/40"
          animate={reduce ? undefined : { rotate: -360 }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          style={{
            maskImage:
              "conic-gradient(from 45deg, transparent 0deg, #000 60deg, transparent 120deg, #000 240deg, transparent 300deg)",
          }}
        />
        <motion.div
          aria-hidden
          className="absolute inset-3 rounded-full blur-xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--primary) 60%, transparent) 0%, transparent 70%)",
          }}
          animate={reduce ? undefined : { opacity: [0.35, 0.75, 0.35] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-3 flex items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-slate-900 via-indigo-800 to-slate-900 shadow-glow ring-1 ring-white/10">
          <ShieldCheck className="h-8 w-8 text-white" strokeWidth={2.25} />
        </div>
      </div>
    </div>
  );
}

function AdminLoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = !email.trim()
    ? "Admin email is required."
    : !emailRe.test(email.trim())
      ? "Enter a valid email address."
      : null;
  const passwordError = !password
    ? "Password is required."
    : password.length < 8
      ? "Admin passwords must be at least 8 characters."
      : null;

  const showEmailErr = touched.email && emailError;
  const showPwErr = touched.password && passwordError;
  const canSubmit = !emailError && !passwordError && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setFormError(null);
    if (emailError || passwordError) return;
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      const snap = await ensureAuthReady();
      if (snap.role !== "admin") {
        // Not an administrator — kick the session out and stay on this page.
        await signOut({ queryClient });
        setFormError("This account is not authorised for the admin console.");
        return;
      }
      await router.invalidate();
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setFormError(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      brand={{
        eyebrow: "Restricted · Administrator Access",
        headline: "Command centre",
        gradientWord: "for CL Aspire.",
        description:
          "Manage the ICAB question bank, mock examinations, students and platform analytics. Access is limited to authorised administrators only.",
        badges: [
          { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "SSO Ready" },
          { icon: <Radar className="h-3.5 w-3.5" />, label: "Audit Logging" },
          { icon: <KeyRound className="h-3.5 w-3.5" />, label: "MFA Enforced" },
        ],
        stats: [
          { value: "SOC-2", label: "Aligned" },
          { value: "AES-256", label: "At Rest" },
          { value: "TLS 1.3", label: "In Transit" },
        ],
        gradient: "linear-gradient(135deg, #020617 0%, #0f172a 30%, #1e293b 60%, #4338ca 130%)",
      }}
    >
      <div className="relative pt-14">
        <div className="glass shadow-glow relative overflow-hidden rounded-3xl border border-border p-6 pt-14 sm:p-9 sm:pt-14">
          <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-br from-indigo-500 to-slate-900 opacity-25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full bg-gradient-to-tr from-slate-800 to-indigo-500 opacity-20 blur-3xl" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.12] [mask-image:radial-gradient(ellipse_at_top,black_40%,transparent_75%)]"
            style={{
              backgroundImage:
                "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />

          <SecurityCrest />

          <div className="relative">
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-warning">
              <Shield className="h-3.5 w-3.5" />
              Restricted · Administrator
            </div>
            <h1
              className="text-3xl font-bold tracking-tight sm:text-[2rem]"
              style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Secure administrator sign in.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Authorised CL Aspire staff only. Every access attempt is logged and audited.
            </p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
              <Field
                id="admin-email"
                label="Admin email"
                type="email"
                autoComplete="email"
                placeholder="admin@claspire.com"
                icon={<Mail className="h-4 w-4" />}
                value={email}
                onChange={setEmail}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={showEmailErr ? emailError : null}
                required
              />
              <Field
                id="admin-password"
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your admin password"
                icon={<Lock className="h-4 w-4" />}
                value={password}
                onChange={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={showPwErr ? passwordError : null}
                required
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="group inline-flex cursor-pointer items-center gap-2.5 text-xs font-medium text-muted-foreground">
                  <span className="relative inline-flex h-4 w-4 items-center justify-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                    />
                    <span className="h-4 w-4 rounded-md border border-border bg-card/70 transition-all duration-300 peer-checked:border-transparent peer-checked:bg-gradient-to-br peer-checked:from-slate-900 peer-checked:to-indigo-600 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20" />
                    <svg
                      aria-hidden
                      viewBox="0 0 12 12"
                      className="pointer-events-none absolute h-2.5 w-2.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 6.5 5 9.5 10 3.5" />
                    </svg>
                  </span>
                  <span className="inline-flex items-center gap-1.5 transition-colors duration-300 group-hover:text-foreground">
                    <Fingerprint className="h-3.5 w-3.5" />
                    Remember this device
                  </span>
                </label>

                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  Encrypted channel
                </span>
              </div>

              {formError && (
                <motion.div
                  role="alert"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
                >
                  {formError}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                aria-busy={submitting}
                className="group relative mt-2 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-700 to-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_20px_60px_-20px_rgba(79,70,229,0.6)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 motion-reduce:hover:scale-100 motion-reduce:transition-none dark:from-white dark:via-indigo-200 dark:to-white dark:text-slate-900"
              >
                {submitting ? (
                  <>
                    <Loader2 className="relative z-10 h-4 w-4 animate-spin" aria-hidden />
                    <span className="relative z-10">Verifying credentials…</span>
                  </>
                ) : (
                  <>
                    <Lock className="relative z-10 h-4 w-4" />
                    <span className="relative z-10">Access admin console</span>
                    <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 grid grid-cols-3 gap-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-2 py-2">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                SOC-2
              </div>
              <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-2 py-2">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                AES-256
              </div>
              <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-2 py-2">
                <Radar className="h-3.5 w-3.5 text-accent" />
                Audited
              </div>
            </div>

            <div className="mt-6 text-center text-[11px] text-muted-foreground">
              Not an administrator?{" "}
              <Link
                to="/login"
                className="rounded-md font-semibold text-foreground underline-offset-4 transition-colors duration-300 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
              >
                Go to the student portal
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
