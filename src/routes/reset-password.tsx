import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Loader2, Lock, ShieldCheck } from "lucide-react";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { ensureAuthReady, updatePassword } from "@/lib/auth";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — CL Aspire" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Set a new password for your CL Aspire student account.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

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
  if (/session|expired|invalid|not found/i.test(msg))
    return "Your reset link has expired. Request a new one and try again.";
  return msg || "We couldn't update your password. Please try again.";
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase places a recovery token in the URL hash and the client picks it
  // up automatically via `detectSessionInUrl`. We only need to wait until a
  // session is present (or bail out with an explanation).
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setSessionReady(true);
        setChecking(false);
        return;
      }
      // Wait briefly for detectSessionInUrl to complete.
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (session) {
          setSessionReady(true);
          setChecking(false);
        }
      });
      setTimeout(() => {
        if (!cancelled) setChecking(false);
        sub.subscription.unsubscribe();
      }, 2500);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const score = useMemo(() => passwordScore(password), [password]);
  const passwordError = !password
    ? "Create a new password."
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

  const canSubmit = sessionReady && !passwordError && !confirmError && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    setError(null);
    if (passwordError || confirmError) return;
    setSubmitting(true);
    try {
      await updatePassword(password);
      setDone(true);
      const snap = await ensureAuthReady();
      await router.invalidate();
      setTimeout(() => {
        navigate({
          to: snap.role === "admin" ? "/admin" : "/student",
          replace: true,
        });
      }, 800);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      brand={{
        eyebrow: "Reset Password",
        headline: "Pick a strong",
        gradientWord: "new password.",
        description:
          "Choose something you'll remember. We'll sign you in as soon as your new password is set.",
        badges: [
          { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Encrypted" },
          { icon: <Lock className="h-3.5 w-3.5" />, label: "One-time link" },
        ],
        stats: [
          { value: "8+", label: "Chars" },
          { value: "A1!", label: "Mix it up" },
          { value: "TLS", label: "Secure" },
        ],
        gradient: "linear-gradient(135deg, #0f172a 0%, #4338ca 40%, #7c3aed 75%, #06b6d4 130%)",
      }}
    >
      <div className="glass shadow-glow relative overflow-hidden rounded-3xl border border-border p-6 sm:p-9">
        <h1
          className="text-3xl font-bold tracking-tight sm:text-[2rem]"
          style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          Set a new password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter and confirm your new CL Aspire password.
        </p>

        {checking && (
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying your reset link…
          </div>
        )}

        {!checking && !sessionReady && (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive">
            This reset link has expired or is invalid.{" "}
            <Link to="/forgot-password" className="underline">
              Request a new one
            </Link>
            .
          </div>
        )}

        {sessionReady && (
          <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
            <Field
              id="new-password"
              label="New password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              icon={<Lock className="h-4 w-4" />}
              value={password}
              onChange={setPassword}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              error={touched.password ? passwordError : null}
              required
            />
            <Field
              id="new-confirm"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              icon={<Lock className="h-4 w-4" />}
              value={confirm}
              onChange={setConfirm}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              error={touched.confirm ? confirmError : null}
              required
            />

            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
              >
                {error}
              </motion.div>
            )}

            {done && (
              <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-xs font-medium text-success">
                Password updated. Signing you in…
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={submitting}
              className="group relative mt-2 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-brand-gradient px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating…</span>
                </>
              ) : (
                <>
                  <span>Update password</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
