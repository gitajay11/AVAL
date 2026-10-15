// Date formatting for display. Runs in the browser only (the server doesn't know
// the viewer's time zone); components render times client-side.

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const timeFmt = () => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatClock(iso: string): string {
  return timeFmt().format(new Date(iso));
}

/** Chat list: "14:05" today, "Tue" this week, otherwise a short date. */
export function formatListTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days <= 0) return formatClock(iso);
  if (days < 7) return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "2-digit" }) }).format(d);
}

/** Day separator in a conversation. */
export function formatDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(d);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(d);
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "last seen just now / 5 min ago / today at 14:05 / yesterday at … / 12 Mar". */
export function formatLastSeen(iso: string | null, now = new Date()): string {
  if (!iso) return "last seen a long time ago";
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "last seen just now";
  if (mins < 60) return `last seen ${mins} min ago`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days === 0) return `last seen today at ${formatClock(iso)}`;
  if (days === 1) return `last seen yesterday at ${formatClock(iso)}`;
  return `last seen ${formatListTime(iso, now)}`;
}
