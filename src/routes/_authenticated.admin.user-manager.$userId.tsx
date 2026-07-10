// Admin → User Manager → user detail. Real Supabase data via `getUser`.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  CalendarClock,
  CheckCircle2,
  Crown,
  KeyRound,
  LogOut,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  changeUserRole,
  deleteUsers,
  forceLogout,
  getUser,
  sendPasswordReset,
  setUsersBanned,
  updateUserProfile,
  type AdminUserDetail,
  type UserStatus,
} from "@/lib/user.functions";

export const Route = createFileRoute("/_authenticated/admin/user-manager/$userId")({
  head: () => ({
    meta: [
      { title: "User Details — CL Aspire" },
      { name: "description", content: "Detailed view of a CL Aspire user account." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UserDetailsPage,
});

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "—";
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const fmtRelative = (iso: string | null) => {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};
const initials = (name: string, email: string) => {
  const s = name.trim() || email;
  return s
    .split(/\s+|@/)
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function UserDetailsPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getUserFn = useServerFn(getUser);
  const updateFn = useServerFn(updateUserProfile);
  const roleFn = useServerFn(changeUserRole);
  const banFn = useServerFn(setUsersBanned);
  const resetFn = useServerFn(sendPasswordReset);
  const signOutFn = useServerFn(forceLogout);
  const deleteFn = useServerFn(deleteUsers);

  const query = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => getUserFn({ data: { userId } }),
  });

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    body: string;
    tone: "danger" | "warning" | "primary";
    cta: string;
    action: () => Promise<unknown> | unknown;
  }>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-user", userId] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-user-stats"] });
  };
  const run = async (fn: () => Promise<unknown> | unknown, ok: string) => {
    try {
      await fn();
      setToast(ok);
      invalidate();
    } catch (e) {
      setToast((e as Error).message || "Something went wrong");
    }
  };

  if (query.isLoading) return <SkeletonDetails />;
  const user = query.data;

  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border/60 bg-card/60 p-8 text-center shadow-sm backdrop-blur-xl">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-500 ring-4 ring-rose-500/20">
          <XCircle className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold">User not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono">{userId}</span> does not exist or was deleted.
        </p>
        <Link
          to="/admin/user-manager"
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-accent px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow"
        >
          <ArrowLeft className="h-4 w-4" /> Back to users
        </Link>
      </div>
    );
  }

  const joinedAgoDays = Math.max(
    1,
    Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86_400_000),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/admin/user-manager"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> User Manager
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="font-medium text-foreground">{user.fullName || user.email}</span>
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-xl">
        <div
          aria-hidden
          className="absolute inset-0 -z-0 opacity-70"
          style={{
            background: `radial-gradient(1200px 260px at 20% -20%, oklch(0.78 0.16 ${hueFromId(user.id)} / 0.35), transparent 55%), radial-gradient(900px 220px at 80% -30%, oklch(0.72 0.16 ${(hueFromId(user.id) + 60) % 360} / 0.28), transparent 60%)`,
          }}
        />
        <div className="relative grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="flex items-center gap-4">
            <BigAvatar user={user} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                  {user.fullName || "—"}
                </h1>
                {user.verified && <BadgeCheck className="h-4 w-4 text-sky-500" />}
                {user.role === "admin" && <Crown className="h-4 w-4 text-amber-500" />}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono truncate max-w-[280px]">{user.id}</span>
                <span className="hidden sm:inline text-muted-foreground/50">•</span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {user.email}
                </span>
                {user.phone && (
                  <>
                    <span className="hidden sm:inline text-muted-foreground/50">•</span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {user.phone}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusPill status={user.status} />
                <Chip>{user.role === "admin" ? "Admin" : "Student"}</Chip>
                <Chip>
                  <CalendarClock className="h-3 w-3" /> Joined {joinedAgoDays}d ago
                </Chip>
              </div>
            </div>
          </div>

          <div className="md:col-start-3 md:row-start-1 md:justify-self-end">
            <div className="flex flex-wrap items-center gap-2">
              <ActionBtn icon={Pencil} label="Edit" onClick={() => setEditing(true)} />
              <ActionBtn
                icon={KeyRound}
                label="Reset password"
                onClick={() =>
                  setConfirm({
                    title: "Send password reset?",
                    body: `A password reset link will be sent to ${user.email}.`,
                    tone: "primary",
                    cta: "Send link",
                    action: () =>
                      run(
                        () =>
                          resetFn({
                            data: {
                              email: user.email,
                              redirectTo:
                                typeof window !== "undefined"
                                  ? `${window.location.origin}/reset-password`
                                  : undefined,
                            },
                          }),
                        "Password reset link sent",
                      ),
                  })
                }
              />
              <ActionBtn
                icon={LogOut}
                label="Force logout"
                tone="warning"
                onClick={() =>
                  setConfirm({
                    title: "Force logout all sessions?",
                    body: "The user will be signed out from every device.",
                    tone: "warning",
                    cta: "Sign out",
                    action: () =>
                      run(
                        () => signOutFn({ data: { userId: user.id } }),
                        "All sessions signed out",
                      ),
                  })
                }
              />
              <ActionBtn
                icon={Crown}
                label={user.role === "admin" ? "Demote" : "Promote"}
                onClick={() =>
                  setConfirm({
                    title: `Change role to ${user.role === "admin" ? "Student" : "Admin"}?`,
                    body:
                      user.role === "admin"
                        ? "User will lose admin privileges."
                        : "User will gain full admin privileges.",
                    tone: user.role === "admin" ? "warning" : "primary",
                    cta: "Change role",
                    action: () =>
                      run(
                        () =>
                          roleFn({
                            data: {
                              userId: user.id,
                              role: user.role === "admin" ? "student" : "admin",
                            },
                          }),
                        "Role updated",
                      ),
                  })
                }
              />
              {user.status === "active" ? (
                <ActionBtn
                  icon={Ban}
                  label="Disable"
                  tone="warning"
                  onClick={() =>
                    setConfirm({
                      title: `Disable ${user.fullName || user.email}?`,
                      body: "The user will be unable to sign in until reactivated.",
                      tone: "warning",
                      cta: "Disable",
                      action: () =>
                        run(
                          () => banFn({ data: { userIds: [user.id], banned: true } }),
                          "User disabled",
                        ),
                    })
                  }
                />
              ) : (
                <ActionBtn
                  icon={CheckCircle2}
                  label="Activate"
                  tone="success"
                  onClick={() =>
                    run(
                      () => banFn({ data: { userIds: [user.id], banned: false } }),
                      "User activated",
                    )
                  }
                />
              )}
              <ActionBtn
                icon={Trash2}
                label="Delete"
                tone="danger"
                onClick={() =>
                  setConfirm({
                    title: `Delete ${user.fullName || user.email}?`,
                    body: "This account and all related records will be permanently removed. This cannot be undone.",
                    tone: "danger",
                    cta: "Delete",
                    action: async () => {
                      await run(() => deleteFn({ data: { userIds: [user.id] } }), "User deleted");
                      navigate({ to: "/admin/user-manager" });
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Profile" className="lg:col-span-1">
          <FieldRow icon={Mail} label="Email" value={user.email} />
          <FieldRow icon={Phone} label="Phone" value={user.phone || "—"} />
          <FieldRow label="User ID" value={user.id} mono />
          <FieldRow label="Institution" value={user.institution || "—"} />
          <FieldRow
            icon={CalendarClock}
            label="Registration date"
            value={fmtDateTime(user.createdAt)}
          />
          <FieldRow
            label="Last login"
            value={`${fmtDateTime(user.lastLoginAt)} · ${fmtRelative(user.lastLoginAt)}`}
          />
          <FieldRow label="Account status" value={<StatusPill status={user.status} />} />
        </Card>

        <Card title="Account" className="lg:col-span-1">
          <ToggleRow
            icon={ShieldCheck}
            label="Email verified"
            hint={user.verified ? "Confirmed via email link" : "Awaiting confirmation"}
            enabled={user.verified}
            readOnly
          />
          <ToggleRow
            icon={CheckCircle2}
            label="Account active"
            hint={user.status === "active" ? "User can sign in" : "Access is disabled"}
            enabled={user.status === "active"}
            onToggle={() =>
              run(
                () => banFn({ data: { userIds: [user.id], banned: user.status === "active" } }),
                user.status === "active" ? "Account disabled" : "Account activated",
              )
            }
          />
          <ToggleRow
            icon={ShieldOff}
            label="Admin role"
            hint={user.role === "admin" ? "Has full admin privileges" : "Standard student"}
            enabled={user.role === "admin"}
            danger={user.role === "admin"}
            onToggle={() =>
              setConfirm({
                title: user.role === "admin" ? "Demote to student?" : "Promote to admin?",
                body:
                  user.role === "admin"
                    ? "The user will lose admin privileges."
                    : "The user will gain full admin privileges.",
                tone: user.role === "admin" ? "warning" : "primary",
                cta: "Confirm",
                action: () =>
                  run(
                    () =>
                      roleFn({
                        data: {
                          userId: user.id,
                          role: user.role === "admin" ? "student" : "admin",
                        },
                      }),
                    "Role updated",
                  ),
              })
            }
          />
        </Card>

        <Card title="Activity" className="lg:col-span-1">
          <FieldRow label="Last login" value={`${fmtDateTime(user.lastLoginAt)}`} />
          <FieldRow label="Last login (relative)" value={fmtRelative(user.lastLoginAt)} />
          <FieldRow label="Registered" value={fmtDateTime(user.createdAt)} />
          <FieldRow label="Days since joining" value={String(joinedAgoDays)} />
          <FieldRow label="Email confirmed" value={user.verified ? "Yes" : "No"} />
        </Card>
      </div>

      <EditDialog
        open={editing}
        user={user}
        onClose={() => setEditing(false)}
        onSave={async (p) => {
          await run(
            () => updateFn({ data: { userId: user.id, fullName: p.fullName, phone: p.phone } }),
            "Profile updated",
          );
          setEditing(false);
        }}
      />
      <ConfirmDialog data={confirm} onClose={() => setConfirm(null)} />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border/70 bg-popover/95 px-4 py-2.5 text-sm font-medium text-popover-foreground shadow-2xl backdrop-blur-xl"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {toast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --- Sub-components (kept identical to premium design) --- */

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-xl ${className ?? ""}`}
    >
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h2>
      </header>
      <div className="divide-y divide-border/60 p-2 sm:p-3">{children}</div>
    </section>
  );
}

function FieldRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-secondary/40">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div
          className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}
        >
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="truncate">{value}</span>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  hint,
  enabled,
  onToggle,
  danger,
  readOnly,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  enabled: boolean;
  onToggle?: () => void;
  danger?: boolean;
  readOnly?: boolean;
}) {
  const onCls = danger ? "bg-rose-500" : "bg-gradient-to-r from-primary to-accent";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-secondary/40">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/60 ${enabled ? (danger ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary") : "bg-background/60 text-muted-foreground"}`}
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
        onClick={readOnly ? undefined : onToggle}
        disabled={readOnly}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border/70 transition disabled:opacity-60 ${enabled ? onCls : "bg-secondary/80"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-1 ring-black/5 transition ${enabled ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: UserStatus }) {
  const cls =
    status === "active"
      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 ring-emerald-500/25"
      : "bg-rose-500/12 text-rose-600 dark:text-rose-400 ring-rose-500/25";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status === "active" ? "Active" : "Disabled"}
    </span>
  );
}

function BigAvatar({ user }: { user: AdminUserDetail }) {
  const hue = hueFromId(user.id);
  const bg = `linear-gradient(135deg, oklch(0.75 0.15 ${hue}), oklch(0.55 0.17 ${(hue + 40) % 360}))`;
  return (
    <div className="relative">
      {user.photoUrl ? (
        <img
          src={user.photoUrl}
          alt=""
          className="h-16 w-16 rounded-2xl object-cover ring-4 ring-card sm:h-20 sm:w-20"
        />
      ) : (
        <div
          className="grid h-16 w-16 place-items-center rounded-2xl text-lg font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-4 ring-card sm:h-20 sm:w-20"
          style={{ background: bg }}
        >
          {initials(user.fullName, user.email)}
        </div>
      )}
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card ${user.status === "active" ? "bg-emerald-500" : "bg-rose-500"}`}
      />
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "danger" | "warning" | "success";
}) {
  const cls =
    tone === "danger"
      ? "border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
      : tone === "warning"
        ? "border-orange-500/40 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
        : tone === "success"
          ? "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
          : "border-border/70 text-foreground hover:bg-secondary/60";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border bg-background/60 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition hover:-translate-y-0.5 ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ModalShell({
  open,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  const width = size === "lg" ? "max-w-3xl" : size === "sm" ? "max-w-sm" : "max-w-lg";
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className={`fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] ${width} -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-2xl`}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15";

function EditDialog({
  open,
  user,
  onClose,
  onSave,
}: {
  open: boolean;
  user: AdminUserDetail;
  onClose: () => void;
  onSave: (p: { fullName: string; phone: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(user.fullName);
    setPhone(user.phone);
  }, [open, user]);

  return (
    <ModalShell open={open} onClose={onClose} size="md">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave({ fullName: name, phone });
          setSaving(false);
        }}
      >
        <header className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold">Edit user</h3>
            <p className="text-xs text-muted-foreground font-mono">{user.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
          <Field label="Full name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Email (read-only)">
            <input
              value={user.email}
              readOnly
              className={`${inputCls} bg-secondary/40 text-muted-foreground`}
            />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Role (read-only)">
            <input
              value={user.role === "admin" ? "Admin" : "Student"}
              readOnly
              className={`${inputCls} bg-secondary/40 text-muted-foreground`}
            />
          </Field>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/40 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm font-medium hover:bg-secondary/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-gradient-to-br from-primary to-accent px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ConfirmDialog({
  data,
  onClose,
}: {
  data: null | {
    title: string;
    body: string;
    tone: "danger" | "warning" | "primary";
    cta: string;
    action: () => Promise<unknown> | unknown;
  };
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toneRing =
    data?.tone === "danger"
      ? "ring-rose-500/30 text-rose-500"
      : data?.tone === "warning"
        ? "ring-orange-500/30 text-orange-500"
        : "ring-primary/30 text-primary";
  const toneBtn =
    data?.tone === "danger"
      ? "bg-rose-600 hover:bg-rose-500 text-white"
      : data?.tone === "warning"
        ? "bg-orange-500 hover:bg-orange-400 text-white"
        : "bg-primary hover:brightness-110 text-primary-foreground";
  return (
    <ModalShell
      open={!!data}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="sm"
    >
      {data && (
        <div className="p-6">
          <div
            className={`mb-4 inline-grid h-11 w-11 place-items-center rounded-2xl ring-4 ${toneRing} bg-background/70`}
          >
            <Ban className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{data.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{data.body}</p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm font-medium hover:bg-secondary/60 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await data.action();
                } finally {
                  setBusy(false);
                  onClose();
                }
              }}
              className={`rounded-xl px-3.5 py-2 text-sm font-semibold shadow disabled:opacity-60 ${toneBtn}`}
            >
              {busy ? "Working…" : data.cta}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function SkeletonDetails() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-40 animate-pulse rounded-lg bg-secondary/60" />
      <div className="h-40 animate-pulse rounded-3xl border border-border/60 bg-card/40" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
        <div className="h-72 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
        <div className="h-72 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
      </div>
    </div>
  );
}
