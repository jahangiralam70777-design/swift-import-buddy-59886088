import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Braces,
  Building2,
  ChevronDown,
  Clock3,
  Cloud,
  Database,
  DownloadCloud,
  Fingerprint,
  Globe2,
  GraduationCap,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Languages,
  Loader2,
  Mail,
  Monitor,
  Moon,
  Palette,
  Phone,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { getAdminSettings, saveAdminSettings, getSystemStats } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Admin Settings — CL Aspire" },
      { name: "description", content: "Configure the CL Aspire platform." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminSettingsPage,
});

/* ------------------------------------------------------------------ */
/*  Settings shape + defaults                                          */
/* ------------------------------------------------------------------ */

type PasswordPolicy = "basic" | "standard" | "strict";
type SidebarStyle = "expanded" | "compact" | "floating";
type ThemeMode = "system" | "light" | "dark";

type Settings = {
  general: {
    platformName: string;
    logoDataUrl: string | null;
    supportEmail: string;
    contactNumber: string;
    timezone: string;
    language: string;
  };
  auth: {
    allowRegistration: boolean;
    requireEmailVerification: boolean;
    passwordPolicy: PasswordPolicy;
  };
  email: {
    fromName: string;
    fromEmail: string;
    smtpHost: string;
    smtpPort: number;
  };
  notifications: {
    email: boolean;
    student: boolean;
    admin: boolean;
    weeklyDigest: boolean;
  };
  security: {
    twoFactor: boolean;
    sessionTimeoutMins: number;
    ipAllowlist: string;
  };
  appearance: {
    theme: ThemeMode;
    primaryColor: string;
    sidebarStyle: SidebarStyle;
  };
  academic: {
    enableLevels: boolean;
    enableSubjects: boolean;
    enableChapters: boolean;
  };
  backup: {
    autoBackup: boolean;
    frequency: "daily" | "weekly" | "monthly";
    retentionDays: number;
  };
};

const DEFAULTS: Settings = {
  general: {
    platformName: "CL Aspire",
    logoDataUrl: null,
    supportEmail: "support@claspire.io",
    contactNumber: "+880 1700 000000",
    timezone: "Asia/Dhaka",
    language: "en",
  },
  auth: {
    allowRegistration: true,
    requireEmailVerification: true,
    passwordPolicy: "standard",
  },
  email: {
    fromName: "CL Aspire",
    fromEmail: "no-reply@claspire.io",
    smtpHost: "smtp.claspire.io",
    smtpPort: 587,
  },
  notifications: {
    email: true,
    student: true,
    admin: true,
    weeklyDigest: false,
  },
  security: {
    twoFactor: false,
    sessionTimeoutMins: 60,
    ipAllowlist: "",
  },
  appearance: {
    theme: "system",
    primaryColor: "#6D5EF8",
    sidebarStyle: "expanded",
  },
  academic: {
    enableLevels: true,
    enableSubjects: true,
    enableChapters: true,
  },
  backup: {
    autoBackup: true,
    frequency: "daily",
    retentionDays: 30,
  },
};

const STORAGE_KEY = "cl-aspire:admin-settings:v1";

/* ------------------------------------------------------------------ */

const SECTIONS = [
  { id: "general", label: "General", icon: Building2 },
  { id: "platform", label: "Platform", icon: ServerCog },
  { id: "authentication", label: "Authentication", icon: Fingerprint },
  { id: "email", label: "Email", icon: Mail },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "academic", label: "Academic", icon: GraduationCap },
  { id: "backup", label: "Backup", icon: DownloadCloud },
  { id: "system", label: "System Information", icon: Braces },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function mergeSettings(raw: unknown): Settings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = JSON.parse(JSON.stringify(DEFAULTS));
  (Object.keys(DEFAULTS) as (keyof Settings)[]).forEach((k) => {
    const v = src[k as string];
    if (v && typeof v === "object") {
      out[k] = { ...out[k], ...(v as object) };
    }
  });
  return out as Settings;
}

function AdminSettingsPage() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getAdminSettings);
  const persistSettings = useServerFn(saveAdminSettings);

  const settingsQuery = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => fetchSettings(),
    staleTime: 30_000,
  });

  const saved: Settings = useMemo(
    () => mergeSettings(settingsQuery.data?.settings),
    [settingsQuery.data],
  );

  const [draft, setDraft] = useState<Settings>(() => DEFAULTS);
  const [initialized, setInitialized] = useState(false);
  const [active, setActive] = useState<SectionId>("general");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const { resolved: theme, setTheme } = useTheme();

  // Hydrate from server once
  useEffect(() => {
    if (settingsQuery.data && !initialized) {
      setDraft(mergeSettings(settingsQuery.data.settings));
      setInitialized(true);
    }
  }, [settingsQuery.data, initialized]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const saveMutation = useMutation({
    mutationFn: (next: Settings) => persistSettings({ data: { settings: next as never } }),
    onSuccess: (_res, vars) => {
      qc.setQueryData(
        ["admin-settings"],
        (prev: { settings: unknown; updatedAt: string | null } | undefined) => ({
          settings: vars,
          updatedAt: new Date().toISOString(),
        }),
      );
      setTheme(vars.appearance.theme);
      setToast({ kind: "ok", msg: "Settings saved" });
    },
    onError: (err: Error) => {
      setToast({ kind: "err", msg: err.message || "Failed to save" });
    },
  });

  const dirty = useMemo(
    () => initialized && JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft, initialized],
  );

  // Cmd/Ctrl+S to save
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saveMutation.isPending) saveMutation.mutate(draft);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const update = <K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) =>
    setDraft((d) => ({ ...d, [section]: { ...d[section], ...patch } }));

  const save = () => {
    // basic validation
    if (draft.general.supportEmail && !/^\S+@\S+\.\S+$/.test(draft.general.supportEmail)) {
      setToast({ kind: "err", msg: "Support email is invalid" });
      return;
    }
    if (draft.email.fromEmail && !/^\S+@\S+\.\S+$/.test(draft.email.fromEmail)) {
      setToast({ kind: "err", msg: "From email is invalid" });
      return;
    }
    if (draft.security.sessionTimeoutMins < 5 || draft.security.sessionTimeoutMins > 1440) {
      setToast({ kind: "err", msg: "Session timeout must be 5–1440 minutes" });
      return;
    }
    saveMutation.mutate(draft);
  };

  const resetSection = () => {
    const key = active === "platform" || active === "system" ? "general" : active;
    setDraft((d) => ({ ...d, [key]: (DEFAULTS as Record<string, unknown>)[key] }) as Settings);
    setToast({ kind: "ok", msg: `${labelFor(active)} reset to defaults` });
  };

  const resetAll = () => {
    if (!confirm("Reset ALL settings to defaults? This cannot be undone until you save.")) return;
    setDraft(DEFAULTS);
    setToast({ kind: "ok", msg: "All settings reset to defaults" });
  };

  const discard = () => {
    setDraft(saved);
    setToast({ kind: "ok", msg: "Changes discarded" });
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cl-aspire-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ kind: "ok", msg: "Backup downloaded" });
  };

  const importBackup = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setDraft(mergeSettings(parsed));
      setToast({ kind: "ok", msg: "Settings imported — review then Save" });
    } catch {
      setToast({ kind: "err", msg: "Invalid settings file" });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* ---------------- Section rail ---------------- */}
      <aside className="lg:sticky lg:top-[88px] lg:self-start">
        <nav className="rounded-2xl border border-border/60 bg-card/60 p-2 shadow-sm backdrop-blur-xl">
          <div className="px-3 pb-2 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sections
          </div>
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setActive(s.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      isActive
                        ? "bg-gradient-to-r from-primary/15 via-primary/8 to-transparent text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-accent transition-opacity ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <Icon
                      className={`h-4 w-4 shrink-0 transition ${isActive ? "text-primary" : "group-hover:text-foreground"}`}
                    />
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* ---------------- Panel ---------------- */}
      <div className="space-y-6">
        <SectionSwitch active={active} draft={draft} update={update} theme={theme} />

        {/* Sticky action bar */}
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/85 p-3 shadow-xl backdrop-blur-2xl">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${dirty ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}
            />
            <span className="font-medium text-foreground">
              {dirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <span className="hidden text-muted-foreground sm:inline">· {labelFor(active)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                importBackup(e.target.files?.[0] ?? null);
                if (e.target) e.target.value = "";
              }}
            />
            <button
              onClick={() => importRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-secondary/60"
            >
              <UploadCloud className="h-3.5 w-3.5" /> Import
            </button>
            <button
              onClick={exportBackup}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-secondary/60"
            >
              <Cloud className="h-3.5 w-3.5" /> Export
            </button>
            <button
              onClick={resetSection}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-secondary/60"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset section
            </button>
            <button
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-xs font-semibold text-rose-400 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-500/10"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset all
            </button>
            <button
              onClick={discard}
              disabled={!dirty}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <X className="h-3.5 w-3.5" /> Discard
            </button>
            <button
              onClick={save}
              disabled={!dirty || saveMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-accent px-4 py-2 text-xs font-semibold text-primary-foreground shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saveMutation.isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-xl ${
              toast.kind === "err"
                ? "border-rose-500/60 bg-rose-500/10 text-rose-200"
                : "border-border/70 bg-popover/95 text-popover-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {toast.msg}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function labelFor(id: SectionId) {
  return SECTIONS.find((s) => s.id === id)?.label ?? id;
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function SectionSwitch({
  active,
  draft,
  update,
  theme,
}: {
  active: SectionId;
  draft: Settings;
  update: <K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) => void;
  theme: "light" | "dark";
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={active}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 }}
        className="space-y-6"
      >
        {active === "general" && <GeneralSection draft={draft} update={update} />}
        {active === "platform" && <PlatformSection draft={draft} update={update} />}
        {active === "authentication" && <AuthSection draft={draft} update={update} />}
        {active === "email" && <EmailSection draft={draft} update={update} />}
        {active === "notifications" && <NotificationsSection draft={draft} update={update} />}
        {active === "security" && <SecuritySection draft={draft} update={update} />}
        {active === "appearance" && (
          <AppearanceSection draft={draft} update={update} theme={theme} />
        )}
        {active === "academic" && <AcademicSection draft={draft} update={update} />}
        {active === "backup" && <BackupSection draft={draft} update={update} />}
        {active === "system" && <SystemSection />}
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------- General ---------- */

function GeneralSection({ draft, update }: SectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const g = draft.general;
  const onLogo = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update("general", { logoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <Card
      title="General"
      hint="Basic identity of your platform. Shown across emails and pages."
      icon={Building2}
    >
      <Grid>
        <TextField
          label="Platform name"
          value={g.platformName}
          onChange={(v) => update("general", { platformName: v })}
        />
        <TextField
          label="Support email"
          type="email"
          value={g.supportEmail}
          onChange={(v) => update("general", { supportEmail: v })}
          icon={Mail}
        />
        <TextField
          label="Contact number"
          value={g.contactNumber}
          onChange={(v) => update("general", { contactNumber: v })}
          icon={Phone}
        />
        <SelectField
          label="Timezone"
          value={g.timezone}
          onChange={(v) => update("general", { timezone: v })}
          icon={Clock3}
          options={[
            ["Asia/Dhaka", "Asia/Dhaka (GMT+6)"],
            ["Asia/Kolkata", "Asia/Kolkata (GMT+5:30)"],
            ["UTC", "UTC"],
            ["Europe/London", "Europe/London"],
            ["America/New_York", "America/New_York"],
          ]}
        />
        <SelectField
          label="Language"
          value={g.language}
          onChange={(v) => update("general", { language: v })}
          icon={Languages}
          options={[
            ["en", "English"],
            ["bn", "বাংলা (Bengali)"],
            ["hi", "हिन्दी (Hindi)"],
            ["ar", "العربية"],
          ]}
        />
        <div>
          <Label>Platform logo</Label>
          <div className="mt-1 flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-2.5">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-muted-foreground">
              {g.logoDataUrl ? (
                <img src={g.logoDataUrl} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">
                PNG, JPG or SVG. Recommended 512×512.
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary/60"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload
                </button>
                {g.logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => update("general", { logoDataUrl: null })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/70 px-2.5 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          </div>
        </div>
      </Grid>
    </Card>
  );
}

/* ---------- Platform ---------- */

function PlatformSection({ draft, update }: SectionProps) {
  return (
    <Card title="Platform" hint="Global runtime behaviour." icon={ServerCog}>
      <SwitchRow
        icon={Globe2}
        label="Maintenance mode"
        hint="Show a maintenance page to non-admin users."
        enabled={false}
        onToggle={() => {
          /* placeholder wired to draft in future */
        }}
      />
      <SelectField
        label="Region"
        value={draft.general.timezone}
        onChange={(v) => update("general", { timezone: v })}
        options={[
          ["Asia/Dhaka", "South Asia"],
          ["Europe/London", "Europe"],
          ["America/New_York", "North America"],
          ["UTC", "Global"],
        ]}
      />
    </Card>
  );
}

/* ---------- Authentication ---------- */

function AuthSection({ draft, update }: SectionProps) {
  const a = draft.auth;
  return (
    <Card title="Authentication" hint="Control how students and admins sign in." icon={Fingerprint}>
      <SwitchRow
        icon={Layers}
        label="Allow registration"
        hint="Allow new users to sign up from the public site."
        enabled={a.allowRegistration}
        onToggle={() => update("auth", { allowRegistration: !a.allowRegistration })}
      />
      <SwitchRow
        icon={ShieldCheck}
        label="Require email verification"
        hint="Users must confirm their email before signing in."
        enabled={a.requireEmailVerification}
        onToggle={() => update("auth", { requireEmailVerification: !a.requireEmailVerification })}
      />
      <SelectField
        label="Password policy"
        value={a.passwordPolicy}
        onChange={(v) => update("auth", { passwordPolicy: v as PasswordPolicy })}
        icon={KeyRound}
        options={[
          ["basic", "Basic · 6+ characters"],
          ["standard", "Standard · 8+ chars, mixed case & number"],
          ["strict", "Strict · 12+ chars, symbol required"],
        ]}
      />
    </Card>
  );
}

/* ---------- Email ---------- */

function EmailSection({ draft, update }: SectionProps) {
  const e = draft.email;
  return (
    <Card title="Email" hint="Outbound email delivery configuration." icon={Mail}>
      <Grid>
        <TextField
          label="From name"
          value={e.fromName}
          onChange={(v) => update("email", { fromName: v })}
        />
        <TextField
          label="From email"
          type="email"
          value={e.fromEmail}
          onChange={(v) => update("email", { fromEmail: v })}
          icon={Mail}
        />
        <TextField
          label="SMTP host"
          value={e.smtpHost}
          onChange={(v) => update("email", { smtpHost: v })}
        />
        <TextField
          label="SMTP port"
          type="number"
          value={String(e.smtpPort)}
          onChange={(v) => update("email", { smtpPort: Number(v) || 0 })}
        />
      </Grid>
    </Card>
  );
}

/* ---------- Notifications ---------- */

function NotificationsSection({ draft, update }: SectionProps) {
  const n = draft.notifications;
  return (
    <Card title="Notifications" hint="Who gets pinged, and by which channel." icon={Bell}>
      <SwitchRow
        icon={Mail}
        label="Email notifications"
        hint="Send transactional email for account events."
        enabled={n.email}
        onToggle={() => update("notifications", { email: !n.email })}
      />
      <SwitchRow
        icon={GraduationCap}
        label="Student notifications"
        hint="Notify students about new content and reminders."
        enabled={n.student}
        onToggle={() => update("notifications", { student: !n.student })}
      />
      <SwitchRow
        icon={ShieldCheck}
        label="Admin notifications"
        hint="Notify admins about security & platform events."
        enabled={n.admin}
        onToggle={() => update("notifications", { admin: !n.admin })}
      />
      <SwitchRow
        icon={Bell}
        label="Weekly digest"
        hint="Summarize activity every Monday morning."
        enabled={n.weeklyDigest}
        onToggle={() => update("notifications", { weeklyDigest: !n.weeklyDigest })}
      />
    </Card>
  );
}

/* ---------- Security ---------- */

function SecuritySection({ draft, update }: SectionProps) {
  const s = draft.security;
  return (
    <Card title="Security" hint="Harden your admin surface." icon={ShieldCheck}>
      <SwitchRow
        icon={ShieldCheck}
        label="Require two-factor for admins"
        hint="Admins must verify a second factor at every sign-in."
        enabled={s.twoFactor}
        onToggle={() => update("security", { twoFactor: !s.twoFactor })}
      />
      <NumberField
        label="Session timeout"
        suffix="minutes"
        value={s.sessionTimeoutMins}
        onChange={(v) => update("security", { sessionTimeoutMins: Math.max(5, Math.min(1440, v)) })}
      />
      <div>
        <Label>IP allowlist</Label>
        <textarea
          value={s.ipAllowlist}
          onChange={(e) => update("security", { ipAllowlist: e.target.value })}
          placeholder="One CIDR per line, e.g. 203.0.113.0/24"
          rows={3}
          className="mt-1 w-full rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
        />
      </div>
    </Card>
  );
}

/* ---------- Appearance ---------- */

const PALETTE = [
  "#6D5EF8",
  "#22C55E",
  "#0EA5E9",
  "#F97316",
  "#EF4444",
  "#A855F7",
  "#EAB308",
  "#14B8A6",
];

function AppearanceSection({ draft, update, theme }: SectionProps & { theme: "light" | "dark" }) {
  const a = draft.appearance;
  return (
    <Card title="Appearance" hint="How CL Aspire looks for you." icon={Palette}>
      <div>
        <Label>Theme</Label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {(["light", "dark", "system"] as const).map((mode) => {
            const active = a.theme === mode;
            const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
            return (
              <button
                key={mode}
                onClick={() => update("appearance", { theme: mode })}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold capitalize transition ${
                  active
                    ? "border-primary/60 bg-primary/10 text-foreground shadow-inner"
                    : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {mode}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Currently rendered as <span className="font-medium text-foreground">{theme}</span>.
          Applied on save.
        </p>
      </div>

      <div>
        <Label>Primary color</Label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => update("appearance", { primaryColor: c })}
              className={`h-8 w-8 rounded-full border-2 transition ${
                a.primaryColor === c
                  ? "border-foreground scale-110"
                  : "border-border/60 hover:scale-105"
              }`}
              style={{ background: c }}
              aria-label={`Set primary color ${c}`}
            />
          ))}
          <label className="ml-1 inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-2.5 py-1.5">
            <span className="text-[11px] text-muted-foreground">Custom</span>
            <input
              type="color"
              value={a.primaryColor}
              onChange={(e) => update("appearance", { primaryColor: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-border/60 bg-transparent"
            />
            <span className="font-mono text-[11px] text-muted-foreground">{a.primaryColor}</span>
          </label>
        </div>
      </div>

      <SelectField
        label="Sidebar style"
        value={a.sidebarStyle}
        onChange={(v) => update("appearance", { sidebarStyle: v as SidebarStyle })}
        options={[
          ["expanded", "Expanded"],
          ["compact", "Compact"],
          ["floating", "Floating"],
        ]}
      />
    </Card>
  );
}

/* ---------- Academic ---------- */

function AcademicSection({ draft, update }: SectionProps) {
  const a = draft.academic;
  return (
    <Card
      title="Academic"
      hint="Which curriculum layers are exposed to students."
      icon={GraduationCap}
    >
      <SwitchRow
        icon={Layers}
        label="Enable levels"
        hint="Class/level segmentation (HSC, SSC, etc.)."
        enabled={a.enableLevels}
        onToggle={() => update("academic", { enableLevels: !a.enableLevels })}
      />
      <SwitchRow
        icon={GraduationCap}
        label="Enable subjects"
        hint="Subject grouping under each level."
        enabled={a.enableSubjects}
        onToggle={() => update("academic", { enableSubjects: !a.enableSubjects })}
      />
      <SwitchRow
        icon={Braces}
        label="Enable chapters"
        hint="Fine-grained chapter breakdown per subject."
        enabled={a.enableChapters}
        onToggle={() => update("academic", { enableChapters: !a.enableChapters })}
      />
    </Card>
  );
}

/* ---------- Backup ---------- */

function BackupSection({ draft, update }: SectionProps) {
  const b = draft.backup;
  return (
    <Card
      title="Backup"
      hint="Automated exports of the current configuration."
      icon={DownloadCloud}
    >
      <SwitchRow
        icon={Cloud}
        label="Automatic backups"
        hint="Persist a settings snapshot on the configured schedule."
        enabled={b.autoBackup}
        onToggle={() => update("backup", { autoBackup: !b.autoBackup })}
      />
      <SelectField
        label="Frequency"
        value={b.frequency}
        onChange={(v) => update("backup", { frequency: v as Settings["backup"]["frequency"] })}
        options={[
          ["daily", "Daily"],
          ["weekly", "Weekly"],
          ["monthly", "Monthly"],
        ]}
      />
      <NumberField
        label="Retention"
        suffix="days"
        value={b.retentionDays}
        onChange={(v) => update("backup", { retentionDays: Math.max(1, Math.min(365, v)) })}
      />
    </Card>
  );
}

/* ---------- System Information ---------- */

function SystemSection() {
  const fetchStats = useServerFn(getSystemStats);
  const statsQuery = useQuery({
    queryKey: ["admin-system-stats"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });
  const s = statsQuery.data;
  const fmt = (n: number | undefined) => (typeof n === "number" ? n.toLocaleString() : "—");

  const rows: [string, string][] = [
    ["Application version", s?.appVersion ?? "—"],
    ["Runtime", s?.runtime ?? "—"],
    ["Environment", s?.environment ?? "—"],
    [
      "Settings updated",
      s?.settingsUpdatedAt ? new Date(s.settingsUpdatedAt).toLocaleString() : "—",
    ],
    ["Users (profiles)", fmt(s?.counts.profiles)],
    ["MCQ questions", fmt(s?.counts.mcq_questions)],
    ["Qns bank questions", fmt(s?.counts.qbank_questions)],
    ["Routines", fmt(s?.counts.routines)],
    ["Academic levels", fmt(s?.counts.academic_levels)],
    ["Academic subjects", fmt(s?.counts.academic_subjects)],
    ["Academic chapters", fmt(s?.counts.academic_chapters)],
    ["Bookmarks", fmt(s?.counts.bookmarks)],
    ["MCQ attempts", fmt(s?.counts.mcq_attempts)],
    ["Qns bank attempts", fmt(s?.counts.qbank_attempts)],
  ];
  return (
    <Card title="System Information" hint="Live diagnostics from the database." icon={Database}>
      {statsQuery.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading system stats…
        </div>
      )}
      {statsQuery.isError && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          Failed to load system stats.
        </div>
      )}
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {k}
            </dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Presentational primitives                                          */
/* ------------------------------------------------------------------ */

type SectionProps = {
  draft: Settings;
  update: <K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) => void;
};

function Card({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-xl">
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </span>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15";

function TextField({
  label,
  value,
  onChange,
  type = "text",
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="relative mt-1">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} ${Icon ? "pl-9" : ""}`}
        />
      </div>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="relative mt-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`${inputCls} pr-16`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="relative mt-1">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} appearance-none pr-9 ${Icon ? "pl-9" : ""}`}
        >
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </label>
  );
}

function SwitchRow({
  icon: Icon,
  label,
  hint,
  enabled,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-3 transition hover:bg-secondary/40">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/60 ${enabled ? "bg-primary/10 text-primary" : "bg-background/60 text-muted-foreground"}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border/70 transition ${
          enabled ? "bg-gradient-to-r from-primary to-accent" : "bg-secondary/80"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-1 ring-black/5 transition ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
