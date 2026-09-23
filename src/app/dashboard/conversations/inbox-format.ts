import type { ConversationRow } from "@/lib/conversations/list";

export type InboxGroup = "needsYou" | "hot" | "rest";

export const GROUP_ORDER: InboxGroup[] = ["needsYou", "hot", "rest"];

export function groupOf(row: ConversationRow): InboxGroup {
  if (row.status === "paused" || row.pendingConfirmation) return "needsYou";
  if (row.hotSignal && row.status !== "closed") return "hot";
  return "rest";
}

export function groupRows(rows: ConversationRow[]): { group: InboxGroup; rows: ConversationRow[] }[] {
  const buckets: Record<InboxGroup, ConversationRow[]> = { needsYou: [], hot: [], rest: [] };
  for (const row of rows) buckets[groupOf(row)].push(row);
  return GROUP_ORDER.filter((group) => buckets[group].length > 0).map((group) => ({ group, rows: buckets[group] }));
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
}

export function formatClock(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatListTime(iso: string, locale: string, yesterday: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return formatClock(iso, locale);
  if (days === 1) return yesterday;
  if (days < 7) return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(iso));
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));
}

export function formatDayLabel(iso: string, locale: string, today: string, yesterday: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return today;
  if (days === 1) return yesterday;
  const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    weekday: days < 7 ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
  }).format(new Date(iso));
}

export function formatFullDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const TINTS = [
  { background: "#e2dfff", color: "#3525cd" },
  { background: "#d7f5e4", color: "#006c49" },
  { background: "#ffe6c9", color: "#8a4b00" },
  { background: "#ffdde5", color: "#9a1f4b" },
  { background: "#d8ecfb", color: "#00598a" },
  { background: "#ece4f9", color: "#5b3a91" },
];

export function avatarTint(seed: string): { background: string; color: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}
