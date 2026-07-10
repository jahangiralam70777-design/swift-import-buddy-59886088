import { createFileRoute, Link, useNavigate, useRouter, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  GraduationCap,
  Landmark,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { z } from "zod";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { ensureAuthReady, homeForRole, signInWithEmail, signInWithGoogle } from "@/lib/auth";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const searchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/login")({
  validateSearch: (raw) => searchSchema.parse(raw),
  ssr: false,
  beforeLoad: async ({ search }) => {
    const snap = await ensureAuthReady();
    if (snap.status === "signedIn") {
      throw redirect({ to: (search.redirect as string) || homeForRole(snap.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "Student Sign In — CL Aspire" },
      {
        name: "description",
        content:
          "Sign in to CL Aspire and continue your ICAB CA preparation — MCQ practice, chapter quizzes, mock exams and performance analytics.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Student Sign In — CL Aspire" },
      {
        property: "og:description",
        content:
          "Bangladesh's premium ICAB CA practice platform — sign in and pick up right where you left off.",
      },
    ],
  }),
  component: StudentLoginPage,
});

function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/email not confirmed/i.test(msg))
    return "Please confirm your email address first — check your inbox.";
  if (/too many/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  return msg || "We couldn't sign you in. Please try again.";
}

function StudentLoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = !email.trim()
    ? "Email address is required."
    : !emailRe.test(email.trim())
      ? "Enter a valid email address."
      : null;
  const passwordError = !password
    ? "Password is required."
    : password.length < 6
      ? "Password must be at least 6 characters."
      : null;

  const showEmailErr = touched.email && emailError;
  const showPwErr = touched.password && passwordError;
  const canSubmit = !emailError && !passwordError && !submitting;

  async function afterSuccess() {
    const snap = await ensureAuthReady();
    const target = (search.redirect as string) || homeForRole(snap.role);
    await router.invalidate();
    navigate({ to: target, replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setFormError(null);
    if (emailError || passwordError) return;
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      await afterSuccess();
    } catch (err) {
      setFormError(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setFormError(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.redirected) await afterSuccess();
    } catch (err) {
      setFormError(humanizeError(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthShell
      brand={{
        eyebrow: "Student Sign In",
        headline: "Welcome back,",
        gradientWord: "CA candidate.",
        description:
          "Pick up right where you left off — chapter-wise MCQs, timed quizzes and full mock examinations built for Bangladesh CA students.",
        badges: [
          { icon: <BookOpen className="h-3.5 w-3.5" />, label: "Chapter-wise MCQs" },
          { icon: <Calculator className="h-3.5 w-3.5" />, label: "5,500+ Questions" },
          { icon: <Landmark className="h-3.5 w-3.5" />, label: "All ICAB Subjects" },
        ],
        stats: [
          { value: "5.5k+", label: "MCQs" },
          { value: "100+", label: "Mock Exams" },
          { value: "24/7", label: "Practice" },
        ],
        gradient: "linear-gradient(135deg, #312e81 0%, #4f46e5 40%, #7c3aed 75%, #06b6d4 130%)",
      }}
    >
      <div className="glass shadow-glow relative overflow-hidden rounded-3xl border border-border p-6 sm:p-9">
        <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full bg-gradient-to-tr from-accent/40 to-primary/30 opacity-25 blur-3xl" />

        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <GraduationCap className="h-3.5 w-3.5 text-primary" />
          Student Access
        </div>
        <h1
          className="mt-4 text-3xl font-bold tracking-tight sm:text-[2rem]"
          style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          Sign in to continue your ICAB preparation.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Practice smarter. Track better. Pass ICAB exams.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
          <GoogleButton
            label="Continue with Google"
            onClick={handleGoogle}
            loading={googleLoading}
            disabled={submitting}
          />

          <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>

          <Field
            id="email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            icon={<Mail className="h-4 w-4" />}
            value={email}
            onChange={setEmail}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            error={showEmailErr ? emailError : null}
            required
          />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            icon={<Lock className="h-4 w-4" />}
            value={password}
            onChange={setPassword}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            error={showPwErr ? passwordError : null}
            required
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs font-medium text-muted-foreground">
              Session stays signed in on this device.
            </span>
            <Link
              to="/forgot-password"
              className="rounded-md text-xs font-semibold text-primary transition-colors duration-300 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
            >
              Forgot password?
            </Link>
          </div>

          {formError && (
            <motion.div
              role="alert"
              aria-live="assertive"
              initial={{ opacity: 0, y: -4 }}
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
            className="group relative mt-2 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-brand-gradient px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_20px_60px_-18px_rgba(124,58,237,0.55)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 motion-reduce:hover:scale-100 motion-reduce:transition-none"
          >
            {submitting ? (
              <>
                <Loader2 className="relative z-10 h-4 w-4 animate-spin" aria-hidden />
                <span className="relative z-10">Signing in…</span>
              </>
            ) : (
              <>
                <span className="relative z-10">Sign in to CL Aspire</span>
                <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/30 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to CL Aspire?{" "}
          <Link
            to="/signup"
            className="rounded-md font-semibold text-foreground underline-offset-4 transition-colors duration-300 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
          >
            Create your student account
          </Link>
        </p>

        <div className="mt-6 inline-flex w-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Secured by Lovable Cloud · Encrypted end-to-end
        </div>
      </div>
    </AuthShell>
  );
}
