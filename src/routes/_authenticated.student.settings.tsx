import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Camera,
  Check,
  Download,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
  BookOpen,
} from "lucide-react";

import { ConfirmDialog } from "@/components/mcq/ConfirmDialog";
import { useTheme, type Theme } from "@/hooks/use-theme";
import {
  changeMyEmail,
  deleteMyAccount,
  exportMyData,
  getMyPreferences,
  getMyProfile,
  signOutAllDevices,
  updateMyPreferences,
  updateMyProfile,
  DEFAULT_STUDY,
  DEFAULT_NOTIF,
  DEFAULT_PROFILE_EXTRAS,
  type MyProfile,
  type NotificationPreferences,
  type ProfileExtras,
  type StudentPreferencesShape,
  type StudyPreferences,
} from "@/lib/student-settings.functions";
import { sendPasswordReset, signOut, updatePassword } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/student/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Student Panel" },
      {
        name: "description",
        content: "Update your profile, appearance, notifications and sign-out preferences.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StudentSettingsPage,
});

type SectionKey = "profile" | "account" | "study" | "notifications" | "appearance" | "privacy";

const SECTIONS: {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "profile", label: "Profile", icon: UserIcon },
  { key: "account", label: "Account", icon: ShieldCheck },
  { key: "study", label: "Study", icon: BookOpen },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "privacy", label: "Privacy", icon: Lock },
];

const PROFILE_KEY = ["student", "settings", "profile"] as const;
const PREFS_KEY = ["student", "settings", "preferences"] as const;

function StudentSettingsPage() {
  const [active, setActive] = useState<SectionKey>("profile");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <Sparkles className="h-3 w-3 text-amber-500" />
          Personalize your experience
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Your profile, study preferences and account controls — synced to your account.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="lg:sticky lg:top-24 lg:self-start">
          <div className="scrollbar-lux -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/60 p-1.5 shadow-sm backdrop-blur lg:mx-0 lg:grid lg:grid-cols-1 lg:overflow-visible">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActive(s.key)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-all lg:shrink ${
                    isActive
                      ? "bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/10 to-transparent text-foreground shadow-inner ring-1 ring-indigo-500/20"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 transition-transform ${
                      isActive
                        ? "text-indigo-500 scale-110"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div
          key={active}
          className="min-w-0 motion-safe:animate-[cla-fade-in-up_.35s_ease-out_both]"
        >
          {active === "profile" && <ProfileSection />}
          {active === "account" && <AccountSection />}
          {active === "study" && <StudySection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "appearance" && <AppearanceSection />}
          {active === "privacy" && <PrivacySection />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                    */
/* ------------------------------------------------------------------ */

function SectionCard({
  title,
  description,
  icon,
  children,
  footer,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-sm backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400 opacity-70" />
      <div className="flex items-start gap-3 border-b border-border/60 px-6 py-5">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-500">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-background/40 px-6 py-4">
          {footer}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-indigo-500/60 focus:bg-background focus:ring-2 focus:ring-indigo-500/20";

function Flash({
  show,
  kind = "ok",
  children,
}: {
  show: boolean;
  kind?: "ok" | "err";
  children?: React.ReactNode;
}) {
  if (!show) return null;
  const okCls = "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20";
  const errCls = "bg-red-500/10 text-red-600 ring-red-500/20";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${kind === "ok" ? okCls : errCls}`}
    >
      {kind === "ok" ? <Check className="h-3 w-3" /> : null}
      {children ?? "Saved"}
    </span>
  );
}

function ActionButton({
  variant = "primary",
  disabled,
  onClick,
  icon,
  children,
  type = "button",
}: {
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold shadow-sm transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50";
  const variantCls =
    variant === "primary"
      ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:from-indigo-600 hover:to-fuchsia-600 hover:shadow-md hover:shadow-indigo-500/25"
      : variant === "danger"
        ? "border border-border/60 bg-background/60 text-muted-foreground hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-500 focus-visible:ring-red-500/40"
        : "border border-border/60 bg-background/60 text-foreground hover:bg-accent";
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${variantCls}`}>
      {icon}
      {children}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/40 px-4 py-3 transition hover:border-border">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-50 ${
          checked ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 shadow-sm" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data hooks                                                         */
/* ------------------------------------------------------------------ */

function useMyProfileQuery() {
  const fn = useServerFn(getMyProfile);
  return useQuery({ queryKey: PROFILE_KEY, queryFn: () => fn(), staleTime: 30_000 });
}

function useMyPrefsQuery() {
  const fn = useServerFn(getMyPreferences);
  return useQuery({ queryKey: PREFS_KEY, queryFn: () => fn(), staleTime: 30_000 });
}

/* ------------------------------------------------------------------ */
/* Profile                                                            */
/* ------------------------------------------------------------------ */

function ProfileSection() {
  const qc = useQueryClient();
  const profileQ = useMyProfileQuery();
  const prefsQ = useMyPrefsQuery();
  const updateProfile = useServerFn(updateMyProfile);
  const updatePrefs = useServerFn(updateMyPreferences);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const initialProfile = profileQ.data;
  const initialExtras: ProfileExtras = prefsQ.data?.profileExtras ?? DEFAULT_PROFILE_EXTRAS;

  const [draft, setDraft] = useState<{
    fullName: string;
    phone: string;
    institution: string;
    photoUrl: string;
    extras: ProfileExtras;
  } | null>(null);

  useEffect(() => {
    if (!initialProfile) return;
    setDraft({
      fullName: initialProfile.fullName,
      phone: initialProfile.phone,
      institution: initialProfile.institution,
      photoUrl: initialProfile.photoUrl,
      extras: initialExtras,
    });
  }, [initialProfile, initialExtras]);

  const dirty = useMemo(() => {
    if (!draft || !initialProfile) return false;
    return (
      draft.fullName !== initialProfile.fullName ||
      draft.phone !== initialProfile.phone ||
      draft.institution !== initialProfile.institution ||
      draft.photoUrl !== initialProfile.photoUrl ||
      draft.extras.currentLevel !== initialExtras.currentLevel ||
      draft.extras.timeZone !== initialExtras.timeZone ||
      draft.extras.country !== initialExtras.country ||
      draft.extras.bio !== initialExtras.bio
    );
  }, [draft, initialProfile, initialExtras]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      await updateProfile({
        data: {
          fullName: draft.fullName,
          phone: draft.phone,
          institution: draft.institution,
          photoUrl: draft.photoUrl,
        },
      });
      await updatePrefs({ data: { section: "profileExtras", patch: draft.extras } });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: PROFILE_KEY }),
        qc.invalidateQueries({ queryKey: PREFS_KEY }),
        qc.invalidateQueries({ queryKey: ["student-dashboard"] }),
      ]);
    },
  });

  const onPhoto = (file: File | null) => {
    if (!file || !draft) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Please pick an image under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((d) => (d ? { ...d, photoUrl: String(reader.result ?? "") } : d));
    reader.readAsDataURL(file);
  };

  if (profileQ.isLoading || prefsQ.isLoading || !draft || !initialProfile) {
    return (
      <SectionCard title="Profile" icon={<UserIcon className="h-5 w-5" />}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </div>
      </SectionCard>
    );
  }

  const initials =
    (draft.fullName || initialProfile.email || "S")
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S";

  return (
    <SectionCard
      title="Profile"
      description="Your name, photo and academic details — used across CL Aspire."
      icon={<UserIcon className="h-5 w-5" />}
      footer={
        <>
          <Flash show={saveMut.isSuccess && !dirty}>Saved</Flash>
          {saveMut.isError && (
            <Flash show kind="err">
              {(saveMut.error as Error)?.message ?? "Save failed"}
            </Flash>
          )}
          <ActionButton
            variant="secondary"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            disabled={!dirty || saveMut.isPending}
            onClick={() =>
              setDraft({
                fullName: initialProfile.fullName,
                phone: initialProfile.phone,
                institution: initialProfile.institution,
                photoUrl: initialProfile.photoUrl,
                extras: initialExtras,
              })
            }
          >
            Reset
          </ActionButton>
          <ActionButton
            icon={
              saveMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )
            }
            disabled={!dirty || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Save Changes
          </ActionButton>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-2xl font-bold text-white shadow-lg shadow-indigo-500/30 ring-4 ring-background">
              {draft.photoUrl ? (
                <img src={draft.photoUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition hover:bg-accent"
              aria-label="Upload profile photo"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
            />
          </div>
          {draft.photoUrl && (
            <button
              type="button"
              onClick={() => setDraft((d) => (d ? { ...d, photoUrl: "" } : d))}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="h-3 w-3" /> Remove photo
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name">
            <input
              className={inputCls}
              value={draft.fullName}
              onChange={(e) => setDraft((d) => (d ? { ...d, fullName: e.target.value } : d))}
              placeholder="Your name"
              autoComplete="name"
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              value={draft.phone}
              onChange={(e) => setDraft((d) => (d ? { ...d, phone: e.target.value } : d))}
              placeholder="+8801XXXXXXXXX"
              autoComplete="tel"
            />
          </Field>
          <Field label="Institution">
            <input
              className={inputCls}
              value={draft.institution}
              onChange={(e) => setDraft((d) => (d ? { ...d, institution: e.target.value } : d))}
              placeholder="School / College"
            />
          </Field>
          <Field label="Current Level">
            <input
              className={inputCls}
              value={draft.extras.currentLevel}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, extras: { ...d.extras, currentLevel: e.target.value } } : d,
                )
              }
              placeholder="HSC 2nd year, Admission, …"
            />
          </Field>
          <Field label="Time Zone">
            <input
              className={inputCls}
              value={draft.extras.timeZone}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, extras: { ...d.extras, timeZone: e.target.value } } : d,
                )
              }
              placeholder="Asia/Dhaka"
            />
          </Field>
          <Field label="Country">
            <input
              className={inputCls}
              value={draft.extras.country}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, extras: { ...d.extras, country: e.target.value } } : d,
                )
              }
              placeholder="Bangladesh"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Bio" hint="A short line about you.">
              <textarea
                className={inputCls}
                rows={3}
                value={draft.extras.bio}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, extras: { ...d.extras, bio: e.target.value } } : d))
                }
                placeholder="Tell us a bit about yourself"
                maxLength={500}
              />
            </Field>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Account                                                            */
/* ------------------------------------------------------------------ */

function AccountSection() {
  const profileQ = useMyProfileQuery();
  const changeEmailFn = useServerFn(changeMyEmail);
  const qc = useQueryClient();
  const auth = useAuth();

  const [newEmail, setNewEmail] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const emailMut = useMutation({
    mutationFn: async (email: string) => changeEmailFn({ data: { email } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILE_KEY }),
  });

  const passwordMut = useMutation({
    mutationFn: async () => {
      if (pw1.length < 8) throw new Error("Password must be at least 8 characters");
      if (pw1 !== pw2) throw new Error("Passwords do not match");
      await updatePassword(pw1);
    },
    onSuccess: () => {
      setPw1("");
      setPw2("");
    },
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      if (!auth.user?.email) throw new Error("No email on file");
      await sendPasswordReset(auth.user.email);
    },
  });

  const p = profileQ.data;

  return (
    <SectionCard
      title="Account"
      description="Email, password and account details."
      icon={<ShieldCheck className="h-5 w-5" />}
    >
      {!p ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading account…
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="Current email" value={p.email || "—"} />
              <InfoRow
                label="Email verified"
                value={p.emailVerified ? "Verified" : "Unverified"}
                tone={p.emailVerified ? "ok" : "warn"}
              />
              <InfoRow label="Account created" value={fmtDate(p.createdAt)} />
              <InfoRow label="Last sign-in" value={fmtDate(p.lastSignInAt)} />
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/40 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Mail className="h-4 w-4 text-indigo-500" /> Change email
            </div>
            <p className="text-xs text-muted-foreground">
              You'll receive a confirmation link at the new address to complete the change.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={inputCls}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@example.com"
              />
              <ActionButton
                disabled={!newEmail || emailMut.isPending}
                icon={
                  emailMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )
                }
                onClick={() => emailMut.mutate(newEmail)}
              >
                Update email
              </ActionButton>
            </div>
            {emailMut.isError && (
              <Flash show kind="err">
                {(emailMut.error as Error).message}
              </Flash>
            )}
            {emailMut.isSuccess && <Flash show>Confirmation email sent</Flash>}
          </div>

          <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/40 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lock className="h-4 w-4 text-indigo-500" /> Change password
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={inputCls}
                type="password"
                autoComplete="new-password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                placeholder="New password"
              />
              <input
                className={inputCls}
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                disabled={!pw1 || !pw2 || passwordMut.isPending}
                icon={
                  passwordMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )
                }
                onClick={() => passwordMut.mutate()}
              >
                Update password
              </ActionButton>
              <ActionButton
                variant="secondary"
                disabled={resetMut.isPending}
                icon={
                  resetMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )
                }
                onClick={() => resetMut.mutate()}
              >
                Send reset email
              </ActionButton>
              {passwordMut.isError && (
                <Flash show kind="err">
                  {(passwordMut.error as Error).message}
                </Flash>
              )}
              {passwordMut.isSuccess && <Flash show>Password updated</Flash>}
              {resetMut.isSuccess && <Flash show>Reset email sent</Flash>}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-medium ${
          tone === "ok"
            ? "text-emerald-600"
            : tone === "warn"
              ? "text-amber-600"
              : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return "—";
  }
}

/* ------------------------------------------------------------------ */
/* Study                                                              */
/* ------------------------------------------------------------------ */

function StudySection() {
  const qc = useQueryClient();
  const prefsQ = useMyPrefsQuery();
  const updatePrefs = useServerFn(updateMyPreferences);
  const initial: StudyPreferences = prefsQ.data?.study ?? DEFAULT_STUDY;
  const [draft, setDraft] = useState<StudyPreferences>(initial);

  useEffect(() => {
    if (prefsQ.data?.study) setDraft(prefsQ.data.study);
  }, [prefsQ.data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const saveMut = useMutation({
    mutationFn: async () => updatePrefs({ data: { section: "study", patch: draft } }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: PREFS_KEY }),
        qc.invalidateQueries({ queryKey: ["student-dashboard"] }),
        qc.invalidateQueries({ queryKey: ["mcq-practice"] }),
        qc.invalidateQueries({ queryKey: ["qbank-practice"] }),
        qc.invalidateQueries({ queryKey: ["custom-exam"] }),
        qc.invalidateQueries({ queryKey: ["routine-tracker"] }),
      ]),
  });

  return (
    <SectionCard
      title="Study Settings"
      description="How practice sessions and exams behave by default."
      icon={<BookOpen className="h-5 w-5" />}
      footer={
        <>
          {saveMut.isSuccess && !dirty && <Flash show>Saved</Flash>}
          {saveMut.isError && (
            <Flash show kind="err">
              {(saveMut.error as Error).message}
            </Flash>
          )}
          <ActionButton
            variant="secondary"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            disabled={!dirty || saveMut.isPending}
            onClick={() => setDraft(initial)}
          >
            Reset
          </ActionButton>
          <ActionButton
            icon={
              saveMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )
            }
            disabled={!dirty || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Save Changes
          </ActionButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Exam Countdown Date" hint="Target date for your exam.">
          <input
            className={inputCls}
            type="date"
            value={draft.examCountdownDate ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, examCountdownDate: e.target.value || null }))}
          />
        </Field>
        <Field label="Preferred Daily Study Hours">
          <input
            className={inputCls}
            type="number"
            min={0}
            max={16}
            step={0.5}
            value={draft.dailyStudyHours}
            onChange={(e) =>
              setDraft((d) => ({ ...d, dailyStudyHours: Number(e.target.value) || 0 }))
            }
          />
        </Field>
        <Field label="Default MCQ Mode">
          <select
            className={inputCls}
            value={draft.defaultMcqMode}
            onChange={(e) =>
              setDraft((d) => ({ ...d, defaultMcqMode: e.target.value as "practice" | "exam" }))
            }
          >
            <option value="practice">Practice</option>
            <option value="exam">Exam</option>
          </select>
        </Field>
        <Field label="Default Question Order">
          <select
            className={inputCls}
            value={draft.defaultQuestionOrder}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                defaultQuestionOrder: e.target.value as "sequential" | "random",
              }))
            }
          >
            <option value="sequential">Sequential</option>
            <option value="random">Random</option>
          </select>
        </Field>
        <Field label="Language">
          <select
            className={inputCls}
            value={draft.language}
            onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
          >
            <option value="en">English</option>
            <option value="bn">Bangla</option>
          </select>
        </Field>
        <div className="sm:col-span-2 grid gap-3">
          <Switch
            checked={draft.autoResumePractice}
            onChange={(v) => setDraft((d) => ({ ...d, autoResumePractice: v }))}
            label="Auto Resume Practice"
            description="Pick up where you left off in MCQ / Qns Bank sessions."
          />
          <Switch
            checked={draft.autoShowExplanations}
            onChange={(v) => setDraft((d) => ({ ...d, autoShowExplanations: v }))}
            label="Show Explanations Automatically"
            description="Reveal the explanation immediately after answering."
          />
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                      */
/* ------------------------------------------------------------------ */

function NotificationsSection() {
  const qc = useQueryClient();
  const prefsQ = useMyPrefsQuery();
  const updatePrefs = useServerFn(updateMyPreferences);
  const initial: NotificationPreferences = prefsQ.data?.notifications ?? DEFAULT_NOTIF;
  const [draft, setDraft] = useState<NotificationPreferences>(initial);

  useEffect(() => {
    if (prefsQ.data?.notifications) setDraft(prefsQ.data.notifications);
  }, [prefsQ.data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const saveMut = useMutation({
    mutationFn: async () => updatePrefs({ data: { section: "notifications", patch: draft } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PREFS_KEY }),
  });

  return (
    <SectionCard
      title="Notifications"
      description="Choose what CL Aspire pings you about."
      icon={<Bell className="h-5 w-5" />}
      footer={
        <>
          {saveMut.isSuccess && !dirty && <Flash show>Saved</Flash>}
          {saveMut.isError && (
            <Flash show kind="err">
              {(saveMut.error as Error).message}
            </Flash>
          )}
          <ActionButton
            variant="secondary"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            disabled={!dirty || saveMut.isPending}
            onClick={() => setDraft(initial)}
          >
            Reset
          </ActionButton>
          <ActionButton
            icon={
              saveMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )
            }
            disabled={!dirty || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Save Changes
          </ActionButton>
        </>
      }
    >
      <div className="grid gap-3">
        <Switch
          checked={draft.email}
          onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
          label="Email Notifications"
          description="Important account updates and summaries."
        />
        <Switch
          checked={draft.routineReminder}
          onChange={(v) => setDraft((d) => ({ ...d, routineReminder: v }))}
          label="Routine Reminder"
          description="Nudge me about today's assigned routine."
        />
        <Switch
          checked={draft.examReminder}
          onChange={(v) => setDraft((d) => ({ ...d, examReminder: v }))}
          label="Exam Reminder"
          description="Alert me a day before an upcoming custom exam."
        />
        <Switch
          checked={draft.practiceReminder}
          onChange={(v) => setDraft((d) => ({ ...d, practiceReminder: v }))}
          label="Practice Reminder"
          description="Remind me if I haven't practiced in a while."
        />
        <Switch
          checked={draft.weeklyProgressReport}
          onChange={(v) => setDraft((d) => ({ ...d, weeklyProgressReport: v }))}
          label="Weekly Progress Report"
          description="A weekly digest of your study progress."
        />
        <Switch
          checked={draft.marketing}
          onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))}
          label="Marketing Notifications"
          description="News, offers and product updates."
        />
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Appearance                                                         */
/* ------------------------------------------------------------------ */

function AppearanceSection() {
  const qc = useQueryClient();
  const prefsQ = useMyPrefsQuery();
  const { theme, setTheme } = useTheme();
  const updatePrefs = useServerFn(updateMyPreferences);

  // Sync remote study.theme -> local theme (cross-device sync).
  useEffect(() => {
    const remote = prefsQ.data?.study.theme;
    if (remote && remote !== theme) setTheme(remote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsQ.data?.study.theme]);

  const saveMut = useMutation({
    mutationFn: async (v: Theme) =>
      updatePrefs({ data: { section: "study", patch: { theme: v } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PREFS_KEY }),
  });

  const pick = (v: Theme) => {
    setTheme(v);
    saveMut.mutate(v);
  };

  const opts: { v: Theme; label: string; icon: React.ReactNode; hint: string }[] = [
    {
      v: "light",
      label: "Light",
      icon: <Sun className="h-4 w-4" />,
      hint: "Bright, high contrast",
    },
    { v: "dark", label: "Dark", icon: <Moon className="h-4 w-4" />, hint: "Easier at night" },
    { v: "system", label: "System", icon: <Monitor className="h-4 w-4" />, hint: "Match device" },
  ];

  return (
    <SectionCard
      title="Appearance"
      description="Theme syncs across your devices."
      icon={<Palette className="h-5 w-5" />}
      footer={
        <>
          {saveMut.isSuccess && <Flash show>Saved</Flash>}
          {saveMut.isError && (
            <Flash show kind="err">
              {(saveMut.error as Error).message}
            </Flash>
          )}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {opts.map((o) => {
          const isActive = theme === o.v;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => pick(o.v)}
              className={`relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                isActive
                  ? "border-indigo-400/80 bg-indigo-400/10 shadow-md shadow-indigo-500/15"
                  : "border-border/60 bg-background/40 hover:-translate-y-0.5 hover:border-indigo-300/60 hover:bg-accent/40"
              }`}
            >
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                  isActive
                    ? "bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {o.icon}
              </span>
              <div>
                <div className="text-sm font-semibold text-foreground">{o.label}</div>
                <div className="text-[11px] text-muted-foreground">{o.hint}</div>
              </div>
              {isActive && (
                <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-white">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy                                                            */
/* ------------------------------------------------------------------ */

function PrivacySection() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const exportFn = useServerFn(exportMyData);
  const signOutAllFn = useServerFn(signOutAllDevices);
  const deleteFn = useServerFn(deleteMyAccount);

  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const exportMut = useMutation({
    mutationFn: async () => exportFn(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cl-aspire-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  const logoutAllMut = useMutation({
    mutationFn: async () => {
      await signOutAllFn();
    },
    onSuccess: async () => {
      await signOut({ queryClient: qc });
      navigate({ to: "/login", replace: true });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => deleteFn({ data: { confirm: "DELETE" } }),
    onSuccess: async () => {
      await signOut({ queryClient: qc });
      navigate({ to: "/", replace: true });
    },
  });

  return (
    <SectionCard
      title="Privacy"
      description="Download your data, sign out everywhere, or delete your account."
      icon={<Lock className="h-5 w-5" />}
    >
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Download My Data</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Exports your profile, preferences, attempts, bookmarks and sessions as JSON.
            </p>
          </div>
          <ActionButton
            variant="secondary"
            icon={
              exportMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )
            }
            disabled={exportMut.isPending}
            onClick={() => exportMut.mutate()}
          >
            Download JSON
          </ActionButton>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Logout From All Devices</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Ends every active session on this account.
            </p>
          </div>
          <ActionButton
            variant="danger"
            icon={
              logoutAllMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )
            }
            disabled={logoutAllMut.isPending}
            onClick={() => setConfirmLogoutAll(true)}
          >
            Logout Everywhere
          </ActionButton>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-red-400/40 bg-red-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-red-600">Delete My Account</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently deletes your account and all associated data. This cannot be undone.
            </p>
          </div>
          <ActionButton
            variant="danger"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => {
              setDeleteInput("");
              setConfirmDelete(true);
            }}
          >
            Delete Account
          </ActionButton>
        </div>

        {(exportMut.isError || logoutAllMut.isError || deleteMut.isError) && (
          <Flash show kind="err">
            {((exportMut.error || logoutAllMut.error || deleteMut.error) as Error)?.message}
          </Flash>
        )}
      </div>

      <ConfirmDialog
        open={confirmLogoutAll}
        destructive
        title="Logout from all devices?"
        description="You'll be signed out here and everywhere else. You can sign back in any time."
        confirmLabel="Yes, Logout Everywhere"
        cancelLabel="Cancel"
        onCancel={() => setConfirmLogoutAll(false)}
        onConfirm={() => {
          setConfirmLogoutAll(false);
          logoutAllMut.mutate();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        destructive
        title="Delete your account?"
        description={
          <div className="space-y-2">
            <p>This permanently removes your account and all data. This cannot be undone.</p>
            <p className="text-xs">
              Type <span className="font-mono font-semibold text-foreground">DELETE</span> to
              confirm.
            </p>
            <input
              className={inputCls}
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="DELETE"
              autoFocus
            />
          </div>
        }
        confirmLabel={deleteMut.isPending ? "Deleting…" : "Delete forever"}
        cancelLabel="Cancel"
        confirmDisabled={deleteInput !== "DELETE" || deleteMut.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (deleteInput !== "DELETE") return;
          setConfirmDelete(false);
          deleteMut.mutate();
        }}
      />
    </SectionCard>
  );
}

// Silence unused when tree-shaken references are missing.
void useCallback;
export type _Unused = StudentPreferencesShape | MyProfile;
