// Admin → User Manager. Connected to the real Supabase backend.
//
// Data source: `admin_list_users` / `admin_user_stats` RPCs (SECURITY DEFINER
// with a `has_role(admin)` guard). Every mutation goes through a server
// function protected by `requireSupabaseAuth` + admin role check.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Eye,
  Filter,
  KeyRound,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Search,
  SearchX,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users2,
  X,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  changeUserRole,
  deleteUsers,
  forceLogout,
  getUserStats,
  listUsers,
  sendPasswordReset,
  setUsersBanned,
  updateUserProfile,
  type AdminUserRow,
  type UserRole,
  type UserStatus,
} from "@/lib/user.functions";

export const Route = createFileRoute("/_authenticated/admin/user-manager")({
  head: () => ({
    meta: [
      { title: "User Manager — CL Aspire" },
      { name: "description", content: "Manage users across the CL Aspire platform." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UserManagerPage,
});

/* ------------------------------------------------------------------ */
/*  Utils                                                              */
/* ------------------------------------------------------------------ */

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
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
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
};

const initials = (name: string, email: string) => {
  const src = name.trim() || email;
  return src
    .split(/\s+|@/)
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

// Deterministic avatar hue from user id so the avatars stay stable.
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

const PAGE_SIZES = [25, 50, 100, 250, 500] as const;

type SortKey =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "email_asc"
  | "email_desc"
  | "last_login_desc"
  | "last_login_asc";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function UserManagerPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Filters
  const [qInput, setQInput] = useState("");
  const q = useDebouncedValue(qInput, 300);
  const [role, setRole] = useState<"" | UserRole>("");
  const [status, setStatus] = useState<"" | UserStatus>("");
  const [verif, setVerif] = useState<"" | "verified" | "unverified">("");
  const [regFrom, setRegFrom] = useState("");
  const [regTo, setRegTo] = useState("");
  const [sort, setSort] = useState<SortKey>("created_desc");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [q, role, status, verif, regFrom, regTo, sort, pageSize]);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialogs / toast
  const [viewing, setViewing] = useState<AdminUserRow | null>(null);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    body: string;
    tone: "danger" | "warning" | "primary";
    action: () => void | Promise<void>;
    cta: string;
  }>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // Server calls
  const listFn = useServerFn(listUsers);
  const statsFn = useServerFn(getUserStats);
  const updateFn = useServerFn(updateUserProfile);
  const roleFn = useServerFn(changeUserRole);
  const banFn = useServerFn(setUsersBanned);
  const resetFn = useServerFn(sendPasswordReset);
  const signOutFn = useServerFn(forceLogout);
  const deleteFn = useServerFn(deleteUsers);

  const listQuery = useQuery({
    queryKey: ["admin-users", { q, role, status, verif, regFrom, regTo, sort, page, pageSize }],
    queryFn: () =>
      listFn({
        data: {
          page,
          pageSize,
          search: q || null,
          role: role || null,
          status: status || null,
          verified: verif || null,
          from: regFrom || null,
          to: regTo || null,
          sort,
        },
      }),
    placeholderData: (prev) => prev,
  });

  const statsQuery = useQuery({
    queryKey: ["admin-user-stats"],
    queryFn: () => statsFn({}),
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const loading = listQuery.isLoading || listQuery.isFetching;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-user-stats"] });
  };

  const doMutation = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setToast(ok);
      invalidateAll();
    } catch (e) {
      setToast((e as Error).message || "Something went wrong");
    }
  };

  const allOnPageSelected = rows.length > 0 && rows.every((u) => selected.has(u.id));
  const someOnPageSelected = rows.some((u) => selected.has(u.id));

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((u) => next.delete(u.id));
      else rows.forEach((u) => next.add(u.id));
      return next;
    });
  };
  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setQInput("");
    setRole("");
    setStatus("");
    setVerif("");
    setRegFrom("");
    setRegTo("");
    setSort("created_desc");
    setPage(1);
  };

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      {/* ---------------- KPI ROW ---------------- */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Total Users"
          value={stats?.total ?? 0}
          icon={Users2}
          accent="from-primary to-accent"
        />
        <Kpi
          label="Students"
          value={stats?.students ?? 0}
          icon={UserCheck}
          accent="from-emerald-400 to-teal-500"
        />
        <Kpi
          label="Admins"
          value={stats?.admins ?? 0}
          icon={Crown}
          accent="from-amber-400 to-orange-500"
        />
        <Kpi
          label="Active Today"
          value={stats?.activeToday ?? 0}
          icon={TrendingUp}
          accent="from-sky-400 to-indigo-500"
        />
        <Kpi
          label="Verified Users"
          value={stats?.verified ?? 0}
          icon={ShieldCheck}
          accent="from-violet-400 to-fuchsia-500"
        />
        <Kpi
          label="New (7 days)"
          value={stats?.newLast7Days ?? 0}
          icon={UserPlus}
          accent="from-rose-400 to-pink-500"
        />
      </section>

      {/* ---------------- FILTER BAR ---------------- */}
      <section className="rounded-2xl border border-border/60 bg-card/60 p-3 shadow-sm backdrop-blur-xl sm:p-4">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search name, email, phone…"
                className="h-10 w-full rounded-xl border border-border/70 bg-background/70 pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
              />
            </div>
          </div>
          <Select
            label="Role"
            value={role}
            onChange={(v) => setRole(v as "" | UserRole)}
            className="md:col-span-2"
            options={[
              ["", "All roles"],
              ["student", "Student"],
              ["admin", "Admin"],
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as "" | UserStatus)}
            className="md:col-span-2"
            options={[
              ["", "All statuses"],
              ["active", "Active"],
              ["disabled", "Disabled"],
            ]}
          />
          <Select
            label="Verification"
            value={verif}
            onChange={(v) => setVerif(v as "" | "verified" | "unverified")}
            className="md:col-span-2"
            options={[
              ["", "All"],
              ["verified", "Verified"],
              ["unverified", "Unverified"],
            ]}
          />
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={resetFilters}
              className="h-10 w-full rounded-xl border border-border/70 bg-background/60 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-secondary/60"
            >
              Reset filters
            </button>
          </div>
          <DateField
            label="Registered from"
            value={regFrom}
            onChange={setRegFrom}
            className="md:col-span-3"
          />
          <DateField
            label="Registered to"
            value={regTo}
            onChange={setRegTo}
            className="md:col-span-3"
          />
          <Select
            label="Sort by"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            className="md:col-span-3"
            options={[
              ["created_desc", "Newest first"],
              ["created_asc", "Oldest first"],
              ["name_asc", "Name A→Z"],
              ["name_desc", "Name Z→A"],
              ["email_asc", "Email A→Z"],
              ["last_login_desc", "Recent login"],
              ["last_login_asc", "Least recent login"],
            ]}
          />
          <div className="md:col-span-3 flex items-end justify-end gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>{total.toLocaleString()} results</span>
          </div>
        </div>
      </section>

      {/* ---------------- BULK BAR ---------------- */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.section
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-accent/10 to-transparent px-3 py-2 backdrop-blur-xl sm:px-4"
          >
            <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
            <span className="mx-2 h-4 w-px bg-border/70" />
            <BulkBtn
              icon={CheckCircle2}
              label="Activate"
              tone="success"
              onClick={() =>
                doMutation(async () => {
                  await banFn({ data: { userIds: Array.from(selected), banned: false } });
                  setSelected(new Set());
                }, `${selected.size} user(s) activated`)
              }
            />
            <BulkBtn
              icon={Ban}
              label="Disable"
              tone="warning"
              onClick={() =>
                setConfirm({
                  title: "Disable selected users?",
                  body: `${selected.size} account(s) will be unable to sign in until reactivated.`,
                  tone: "warning",
                  cta: "Disable",
                  action: () =>
                    doMutation(async () => {
                      await banFn({ data: { userIds: Array.from(selected), banned: true } });
                      setSelected(new Set());
                    }, `${selected.size} user(s) disabled`),
                })
              }
            />
            <BulkBtn
              icon={Trash2}
              label="Delete"
              tone="danger"
              onClick={() =>
                setConfirm({
                  title: "Delete selected users?",
                  body: `${selected.size} account(s) will be permanently removed along with all related data. This cannot be undone.`,
                  tone: "danger",
                  cta: "Delete",
                  action: () =>
                    doMutation(async () => {
                      const n = selected.size;
                      await deleteFn({ data: { userIds: Array.from(selected) } });
                      setSelected(new Set());
                      setToast(`${n} user(s) deleted`);
                    }, `${selected.size} user(s) deleted`),
                })
              }
            />
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ---------------- TABLE ---------------- */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/50 shadow-sm backdrop-blur-xl">
        <div className="max-h-[64vh] overflow-auto">
          <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Th className="w-10 pl-4">
                  <Checkbox
                    checked={allOnPageSelected}
                    indeterminate={!allOnPageSelected && someOnPageSelected}
                    onChange={togglePage}
                    ariaLabel="Select all on page"
                  />
                </Th>
                <Th className="w-14">Profile</Th>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                <Th>Last login</Th>
                <Th>Status</Th>
                <Th className="pr-4 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                rows.length === 0 &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-t border-border/60">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 shrink-0 rounded bg-muted/60 animate-pulse" />
                        <div className="h-9 w-9 shrink-0 rounded-full bg-muted/60 animate-pulse" />
                        <div
                          className="h-3 flex-1 rounded bg-muted/60 animate-pulse"
                          style={{ maxWidth: `${40 + ((i * 13) % 40)}%` }}
                        />
                        <div className="h-3 w-16 rounded bg-muted/50 animate-pulse" />
                        <div className="h-5 w-16 rounded-full bg-muted/50 animate-pulse" />
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-16">
                    <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary/60 text-muted-foreground">
                        <SearchX className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-foreground">
                        No users match your filters
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try loosening a filter, clearing search, or resetting all filters.
                      </p>
                      <button
                        onClick={resetFilters}
                        className="mt-4 rounded-xl border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        Reset filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((u) => {
                const isSel = selected.has(u.id);
                return (
                  <tr
                    key={u.id}
                    onDoubleClick={() =>
                      navigate({ to: "/admin/user-manager/$userId", params: { userId: u.id } })
                    }
                    className={`border-t border-border/60 transition-colors ${
                      isSel ? "bg-primary/5" : "hover:bg-secondary/40"
                    }`}
                  >
                    <td className="pl-4 py-3">
                      <Checkbox
                        checked={isSel}
                        onChange={() => toggleRow(u.id)}
                        ariaLabel={`Select ${u.fullName || u.email}`}
                      />
                    </td>
                    <td className="py-3">
                      <Avatar user={u} />
                    </td>
                    <td className="py-3 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">{u.fullName || "—"}</span>
                        {u.verified && <BadgeCheck className="h-3.5 w-3.5 text-sky-500" />}
                        {u.role === "admin" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[220px]">
                        {u.id}
                      </div>
                    </td>
                    <td className="py-3 pr-2 text-muted-foreground">{u.email}</td>
                    <td className="py-3 pr-2 text-muted-foreground">{u.phone || "—"}</td>
                    <td className="py-3 pr-2">
                      <RolePill role={u.role} />
                    </td>
                    <td className="py-3 pr-2 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                    <td className="py-3 pr-2 text-muted-foreground">
                      {fmtRelative(u.lastLoginAt)}
                    </td>
                    <td className="py-3 pr-2">
                      <StatusPill status={u.status} />
                    </td>
                    <td className="py-3 pr-4">
                      <RowActions
                        user={u}
                        onView={() => setViewing(u)}
                        onOpen={() =>
                          navigate({ to: "/admin/user-manager/$userId", params: { userId: u.id } })
                        }
                        onEdit={() => setEditing(u)}
                        onDisable={() =>
                          setConfirm({
                            title: `Disable ${u.fullName || u.email}?`,
                            body: "The user will be signed out and unable to sign back in.",
                            tone: "warning",
                            cta: "Disable",
                            action: () =>
                              doMutation(
                                () => banFn({ data: { userIds: [u.id], banned: true } }),
                                "User disabled",
                              ),
                          })
                        }
                        onActivate={() =>
                          doMutation(
                            () => banFn({ data: { userIds: [u.id], banned: false } }),
                            "User activated",
                          )
                        }
                        onReset={() =>
                          setConfirm({
                            title: "Send password reset?",
                            body: `A password reset link will be sent to ${u.email}.`,
                            tone: "primary",
                            cta: "Send link",
                            action: () =>
                              doMutation(
                                () =>
                                  resetFn({
                                    data: {
                                      email: u.email,
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
                        onForceLogout={() =>
                          setConfirm({
                            title: "Force logout all sessions?",
                            body: "The user will be signed out from every device.",
                            tone: "warning",
                            cta: "Sign out",
                            action: () =>
                              doMutation(
                                () => signOutFn({ data: { userId: u.id } }),
                                "All sessions signed out",
                              ),
                          })
                        }
                        onChangeRole={() =>
                          setConfirm({
                            title: `Change role to ${u.role === "admin" ? "Student" : "Admin"}?`,
                            body: `${u.fullName || u.email} will ${
                              u.role === "admin"
                                ? "lose admin privileges"
                                : "gain full admin privileges"
                            }.`,
                            tone: u.role === "admin" ? "warning" : "primary",
                            cta: "Change role",
                            action: () =>
                              doMutation(
                                () =>
                                  roleFn({
                                    data: {
                                      userId: u.id,
                                      role: u.role === "admin" ? "student" : "admin",
                                    },
                                  }),
                                "Role updated",
                              ),
                          })
                        }
                        onDelete={() =>
                          setConfirm({
                            title: `Delete ${u.fullName || u.email}?`,
                            body: "This account and all related records will be permanently removed. This cannot be undone.",
                            tone: "danger",
                            cta: "Delete",
                            action: () =>
                              doMutation(
                                () => deleteFn({ data: { userIds: [u.id] } }),
                                "User deleted",
                              ),
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-card/60 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <div className="relative">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 appearance-none rounded-lg border border-border/70 bg-background/70 pl-2 pr-7 text-xs font-medium text-foreground outline-none focus:border-primary/50"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <span className="ml-2">
              {total === 0
                ? "0"
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`}
              {" of "}
              {total.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <PagerBtn onClick={() => setPage(1)} disabled={page === 1}>
              «
            </PagerBtn>
            <PagerBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </PagerBtn>
            <span className="px-2 text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <PagerBtn
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </PagerBtn>
            <PagerBtn onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
              »
            </PagerBtn>
          </div>
        </div>
      </section>

      {/* Dialogs */}
      <ViewDialog user={viewing} onClose={() => setViewing(null)} />
      <EditDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          await doMutation(
            () =>
              updateFn({
                data: {
                  userId: editing.id,
                  fullName: patch.fullName,
                  phone: patch.phone,
                },
              }),
            "Profile updated",
          );
          setEditing(null);
        }}
      />
      <ConfirmDialog data={confirm} onClose={() => setConfirm(null)} />

      {/* Toast */}
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

/* ------------------------------------------------------------------ */
/*  Presentational sub-components                                      */
/* ------------------------------------------------------------------ */

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-md">
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-15 blur-2xl transition group-hover:opacity-25`}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
            <Counter to={value} />
          </div>
        </div>
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-inner`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <TrendingUp className="h-3 w-3 text-emerald-500" />
        <span>Live · updated just now</span>
      </div>
    </div>
  );
}

function Counter({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString()}</>;
}

function Select({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-xl border border-border/70 bg-background/70 pl-3 pr-8 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
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

function DateField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15"
      />
    </label>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={`py-2.5 pr-2 font-semibold ${className ?? ""}`}>{children}</th>;
}

function Checkbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer rounded border-border/70 bg-background/70 text-primary accent-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    />
  );
}

function Avatar({ user }: { user: AdminUserRow }) {
  const hue = hueFromId(user.id);
  const bg = `linear-gradient(135deg, oklch(0.72 0.14 ${hue}), oklch(0.55 0.16 ${(hue + 40) % 360}))`;
  return (
    <div className="relative">
      {user.photoUrl ? (
        <img
          src={user.photoUrl}
          alt=""
          className="h-9 w-9 rounded-full object-cover shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        />
      ) : (
        <div
          className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
          style={{ background: bg }}
        >
          {initials(user.fullName, user.email)}
        </div>
      )}
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
          user.status === "active" ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />
    </div>
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

function RolePill({ role }: { role: UserRole }) {
  const cls =
    role === "admin"
      ? "bg-amber-500/12 text-amber-600 dark:text-amber-400 ring-amber-500/25"
      : "bg-sky-500/12 text-sky-600 dark:text-sky-400 ring-sky-500/25";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}
    >
      {role === "admin" ? "Admin" : "Student"}
    </span>
  );
}

function RowActions({
  user,
  onView,
  onOpen,
  onEdit,
  onDisable,
  onActivate,
  onReset,
  onForceLogout,
  onChangeRole,
  onDelete,
}: {
  user: AdminUserRow;
  onView: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDisable: () => void;
  onActivate: () => void;
  onReset: () => void;
  onForceLogout: () => void;
  onChangeRole: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, []);
  return (
    <div ref={ref} className="relative flex justify-end">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-transparent px-2 py-1.5 text-muted-foreground transition hover:border-border/70 hover:bg-secondary/60 hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="text-lg leading-none">⋯</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-border/70 bg-popover/95 p-1 text-sm text-popover-foreground shadow-xl backdrop-blur-xl"
          >
            <MenuItem
              icon={Eye}
              label="Quick view"
              onClick={() => {
                setOpen(false);
                onView();
              }}
            />
            <MenuItem
              icon={Pencil}
              label="Edit profile"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            />
            <MenuItem
              icon={Crown}
              label={user.role === "admin" ? "Demote to student" : "Promote to admin"}
              onClick={() => {
                setOpen(false);
                onChangeRole();
              }}
            />
            <div className="my-1 h-px bg-border/70" />
            <MenuItem
              icon={KeyRound}
              label="Send password reset"
              onClick={() => {
                setOpen(false);
                onReset();
              }}
            />
            <MenuItem
              icon={LogOut}
              label="Force logout"
              onClick={() => {
                setOpen(false);
                onForceLogout();
              }}
              tone="warning"
            />
            {user.status === "active" ? (
              <MenuItem
                icon={Ban}
                label="Disable account"
                onClick={() => {
                  setOpen(false);
                  onDisable();
                }}
                tone="warning"
              />
            ) : (
              <MenuItem
                icon={CheckCircle2}
                label="Activate account"
                onClick={() => {
                  setOpen(false);
                  onActivate();
                }}
                tone="success"
              />
            )}
            <div className="my-1 h-px bg-border/70" />
            <MenuItem
              icon={Eye}
              label="Open full details"
              onClick={() => {
                setOpen(false);
                onOpen();
              }}
            />
            <MenuItem
              icon={Trash2}
              label="Delete user"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              tone="danger"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
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
  const toneCls =
    tone === "danger"
      ? "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
      : tone === "warning"
        ? "text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
        : tone === "success"
          ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
          : "hover:bg-secondary/70";
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition ${toneCls}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function BulkBtn({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "success" | "warning" | "danger";
  onClick: () => void;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
      : tone === "warning"
        ? "border-orange-500/40 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
        : "border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-background/60 px-2.5 py-1.5 text-xs font-semibold transition ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function PagerBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 min-w-8 place-items-center rounded-lg border border-border/70 bg-background/70 px-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border/70 disabled:hover:bg-background/70"
    >
      {children}
    </button>
  );
}

/* ------------------------- Modals ------------------------- */

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

function ViewDialog({ user, onClose }: { user: AdminUserRow | null; onClose: () => void }) {
  return (
    <ModalShell open={!!user} onClose={onClose} size="md">
      {user && (
        <div>
          <div className="relative h-24 bg-gradient-to-br from-primary/25 via-accent/15 to-transparent">
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition hover:bg-background/60 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="-mt-8 px-6 pb-6">
            <div className="flex items-end gap-4">
              <div className="ring-4 ring-card">
                <Avatar user={user} />
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-lg font-semibold">{user.fullName || "—"}</h3>
                  {user.verified && <BadgeCheck className="h-4 w-4 text-sky-500" />}
                  {user.role === "admin" && <Crown className="h-4 w-4 text-amber-500" />}
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate">{user.id}</div>
              </div>
              <div className="ml-auto pb-1">
                <StatusPill status={user.status} />
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Info icon={Mail} label="Email" value={user.email} />
              <Info icon={Phone} label="Phone" value={user.phone || "—"} />
              <Info label="Role" value={user.role === "admin" ? "Admin" : "Student"} />
              <Info label="Verified" value={user.verified ? "Yes" : "No"} />
              <Info label="Joined" value={fmtDate(user.createdAt)} />
              <Info
                label="Last login"
                value={`${fmtDate(user.lastLoginAt)} · ${fmtRelative(user.lastLoginAt)}`}
              />
            </dl>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function Info({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

function EditDialog({
  user,
  onClose,
  onSave,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
  onSave: (p: { fullName: string; phone: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.fullName);
    setPhone(user.phone);
  }, [user]);

  return (
    <ModalShell open={!!user} onClose={onClose} size="md">
      {user && (
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
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Role">
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
      )}
    </ModalShell>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/15";

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
    action: () => void | Promise<void>;
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
