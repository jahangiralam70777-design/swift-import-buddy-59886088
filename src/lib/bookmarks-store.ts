// Small date-formatting helpers used by the Bookmarks (Study Later) page.
// The bookmark data itself now comes from `bookmarks.functions.ts` — this
// module no longer touches localStorage or any client-side stores.

export function isToday(ts: number): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function formatBookmarkDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const y = new Date();
  y.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday · ${time}`;
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}
