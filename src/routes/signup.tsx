import { createFileRoute, Link, useNavigate, useRouter, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Check,
  Landmark,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { ensureAuthReady, homeForRole, signInWithGoogle, signUpWithEmail } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  ssr: false,
  beforeLoad: async () => {
    const snap = await ensureAuthReady();
    if (snap.status === "signedIn") {
      throw redirect({ to: homeForRole(snap.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "Create Your Student Account — CL Aspire" },
      {
        name: "description",
        content:
          "Create a free CL Aspire account and begin practising ICAB Certificate, Professional or Advanced Level MCQs, quizzes and mock examinations.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Create Your Student Account — CL Aspire" },
      {
        property: "og:description",
        content:
          "Join Bangladesh CA students practising smarter with chapter-wise MCQs, mock exams and performance analytics.",
      },
    ],
  }),
  component: StudentSignupPage,
});

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const bdMobileRe = /^(?:\+?880|0)?1[3-9]\d{8}$/;

function passwordScore(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/already registered|already exists|user already/i.test(msg))
    return "An account with this email already exists. Try signing in instead.";
  if (/rate limit|too many/i.test(msg))
    return "Too many attempts. Please wait a minute and try again.";
  if (/password should be/i.test(msg)) return msg;
  return msg || "We couldn't create your account. Please try again.";
}

function StudentSignupPage() {
  const navigate = useNavigate();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const score = useMemo(() => passwordScore(password), [password]);
  const strengthLabel = ["Too short", "Weak", "Fair", "Strong", "Excellent"][score];
  const strengthTone = [
    "bg-destructive/70",
    "bg-destructive",
    "bg-warning",
    "bg-success/80",
    "bg-success",
  ][score];

  const nameError = !name.trim()
    ? "Full name is required."
    : name.trim().length < 2
      ? "Please enter your full name."
      : null;
  const emailError = !email.trim()
    ? "Email address is required."
    : !emailRe.test(email.trim())
      ? "Enter a valid email address."
      : null;
  const mobileError =
    mobile.trim() && !bdMobileRe.test(mobile.replace(/\s|-/g, ""))
      ? "Enter a valid Bangladeshi mobile number (e.g. 01712 345678)."
      : null;
  const passwordError = !password
    ? "Create a password."
    : password.length < 8
      ? "Password must be at least 8 characters."
      : score < 2
        ? "Add a number or uppercase letter to strengthen your password."
        : null;
  const confirmError = !confirm
    ? "Please confirm your password."
    : confirm !== password
      ? "Passwords don't match."
      : null;

  const errors = {
    name: touched.name ? nameError : null,
    email: touched.email ? emailError : null,
    mobile: touched.mobile ? mobileError : null,
    password: touched.password ? passwordError : null,
    confirm: touched.confirm ? confirmError : null,
  };

  const canSubmit =
    !nameError &&
    !emailError &&
    !mobileError &&
    !passwordError &&
    !confirmError &&
    agree &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, mobile: true, password: true, confirm: true });
    setFormError(null);
    setNotice(null);
    if (nameError || emailError || mobileError || passwordError || confirmError || !agree) return;
    setSubmitting(true);
    try {
      const result = await signUpWithEmail({
        email,
        password,
        fullName: name,
        phone: mobile || undefined,
      });
      if (result.session) {
        await router.invalidate();
        navigate({ to: "/student", replace: true });
      } else {
        setNotice("Check your email to confirm your account, then sign in to start practising.");
      }
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
      if (!result.redirected) {
        await router.invalidate();
        navigate({ to: "/student", replace: true });
      }
    } catch (err) {
      setFormError(humanizeError(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthShell
      reverse
      brand={{
        eyebrow: "New Student · Free Account",
        headline: "Start your ICAB",
        gradientWord: "CA journey today.",
        description:
          "Chapter-wise MCQ practice, timed quizzes, mock examinations and performance analytics — thoughtfully designed for Bangladesh CA students.",
        badges: [
          { icon: <BookOpen className="h-3.5 w-3.5" />, label: "Chapter-wise Practice" },
          { icon: <Calculator className="h-3.5 w-3.5" />, label: "Real Exam Simulation" },
          { icon: <Landmark className="h-3.5 w-3.5" />, label: "Made in Bangladesh" },
        ],
        stats: [
          { value: "300+", label: "Quizzes" },
          { value: "16+", label: "Subjects" },
          { value: "1.2k+", label: "Students" },
        ],
        gradient: "linear-gradient(135deg, #0f172a 0%, #4338ca 40%, #7c3aed 70%, #ec4899 130%)",
      }}
    >
      <div className="glass shadow-glow relative overflow-hidden rounded-3xl border border-border p-6 sm:p-9">
        <div className="pointer-events-none absolute -top-24 -left-24 h-56 w-56 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-52 w-52 rounded-full bg-gradient-to-tr from-accent/40 to-primary/30 opacity-25 blur-3xl" />

        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Create Student Account
        </div>
        <h1
          className="mt-4 text-3xl font-bold tracking-tight sm:text-[2rem]"
          style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          Join Bangladesh's premium ICAB practice platform.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Free forever plan. Chapter-wise MCQs, mock exams and analytics from day one.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
          <GoogleButton
            label="Sign up with Google"
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
            id="name"
            label="Full name"
            autoComplete="name"
            placeholder="Md. Rahim Hossain"
            icon={<User className="h-4 w-4" />}
            value={name}
            onChange={setName}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            error={errors.name}
            required
          />
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
            error={errors.email}
            required
          />
          <Field
            id="mobile"
            label="Mobile number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01712 345678"
            icon={<Phone className="h-4 w-4" />}
            value={mobile}
            onChange={setMobile}
            onBlur={() => setTouched((t) => ({ ...t, mobile: true }))}
            error={errors.mobile}
            hint="For account recovery and exam reminders."
            optional
          />

          <div>
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              icon={<Lock className="h-4 w-4" />}
              value={password}
              onChange={setPassword}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              error={errors.password}
              required
            />
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      i < score ? strengthTone : "bg-secondary"
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {password ? strengthLabel : "Set a password"}
              </span>
            </div>
          </div>

          <Field
            id="confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            icon={<Lock className="h-4 w-4" />}
            value={confirm}
            onChange={setConfirm}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
            error={errors.confirm}
            required
          />

          <label className="group flex cursor-pointer items-start gap-2.5 pt-1 text-xs text-muted-foreground transition-colors duration-300 hover:text-foreground">
            <span className="relative mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                required
              />
              <span className="h-4 w-4 rounded-md border border-border bg-card/70 transition-all duration-300 peer-checked:border-transparent peer-checked:bg-brand-gradient peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20" />
              <Check
                aria-hidden
                className="pointer-events-none absolute h-2.5 w-2.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                strokeWidth={3}
              />
            </span>
            <span>
              I accept the{" "}
              <a
                href="#"
                className="rounded-md font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="#"
                className="rounded-md font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>

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

          {notice && (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-xs font-medium text-success"
            >
              {notice}
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
                <span className="relative z-10">Creating your account…</span>
              </>
            ) : (
              <>
                <span className="relative z-10">Create account</span>
                <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/30 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="rounded-md font-semibold text-foreground underline-offset-4 transition-colors duration-300 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
          >
            Sign in
          </Link>
        </p>

        <div className="mt-6 inline-flex w-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          No credit card required · Free forever plan
        </div>
      </div>
    </AuthShell>
  );
}
