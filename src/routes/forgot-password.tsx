import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { AuthShell, Field } from "@/components/auth/AuthShell";
import { ensureAuthReady, homeForRole, sendPasswordReset } from "@/lib/auth";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  beforeLoad: async () => {
    const snap = await ensureAuthReady();
    if (snap.status === "signedIn") {
      throw redirect({ to: homeForRole(snap.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "Reset your password — CL Aspire" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Request a secure password reset link for your CL Aspire student account.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/rate/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  return msg || "We couldn't send the reset email. Please try again.";
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailError = !email.trim()
    ? "Email address is required."
    : !emailRe.test(email.trim())
      ? "Enter a valid email address."
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (emailError) return;
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      brand={{
        eyebrow: "Password Recovery",
        headline: "We'll help you",
        gradientWord: "get back in.",
        description:
          "Enter the email on your CL Aspire account and we'll send a secure link to set a new password.",
        badges: [
          { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Secure Reset" },
          { icon: <Sparkles className="h-3.5 w-3.5" />, label: "One-click Link" },
        ],
        stats: [
          { value: "24h", label: "Link Valid" },
          { value: "1-tap", label: "Sign back in" },
          { value: "TLS", label: "Encrypted" },
        ],
        gradient: "linear-gradient(135deg, #0f172a 0%, #4338ca 40%, #7c3aed 80%, #06b6d4 130%)",
      }}
    >
      <div className="glass shadow-glow relative overflow-hidden rounded-3xl border border-border p-6 sm:p-9">
        <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-brand-gradient opacity-20 blur-3xl" />

        <h1
          className="text-3xl font-bold tracking-tight sm:text-[2rem]"
          style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          Reset your password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We'll email a secure link to reset your CL Aspire password.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
          <Field
            id="reset-email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            icon={<Mail className="h-4 w-4" />}
            value={email}
            onChange={setEmail}
            onBlur={() => setTouched(true)}
            error={touched ? emailError : null}
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

          {sent && (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-xs font-medium text-success"
            >
              If an account exists for {email}, a reset email is on its way.
            </motion.div>
          )}

          <button
            type="submit"
            disabled={submitting || !!emailError}
            aria-busy={submitting}
            className="group relative mt-2 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-brand-gradient px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending link…</span>
              </>
            ) : (
              <>
                <span>Send reset link</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link
            to="/login"
            className="rounded-md font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
