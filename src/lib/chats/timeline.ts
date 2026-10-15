import { dayKey } from "@/lib/dates";
import type { MessageDTO } from "./types";

/** A message as the chat screen holds it: confirmed, or optimistic and in flight. */
export type UiMessage = MessageDTO & {
  status: "sent" | "sending" | "failed";
  /** 0–1 while an attachment is uploading (optimistic messages only). */
  upload?: number;
};

export type TimelineItem =
  | { kind: "day"; key: string; iso: string }
  | { kind: "unread"; key: "unread" }
  | { kind: "message"; key: string; message: UiMessage; groupStart: boolean; groupEnd: boolean };

const GROUP_GAP_MS = 5 * 60 * 1000;

/** Stable across the optimistic → confirmed swap, so the bubble never re-mounts. */
export function messageKey(m: Pick<MessageDTO, "id" | "clientId" | "senderId">): string {
  return m.clientId && m.senderId ? `c:${m.senderId}:${m.clientId}` : `m:${m.id}`;
}

function sameGroup(a: UiMessage, b: UiMessage): boolean {
  return (
    a.senderId === b.senderId &&
    a.type !== "SYSTEM" &&
    b.type !== "SYSTEM" &&
    Date.parse(b.createdAt) - Date.parse(a.createdAt) < GROUP_GAP_MS &&
    dayKey(a.createdAt) === dayKey(b.createdAt)
  );
}

/**
 * Turns an ordered message list into rows: day separators, an "unread messages"
 * divider before the first message from someone else after `unreadAfter`, and
 * grouping flags for consecutive messages from the same sender.
 */
export function buildTimeline(messages: UiMessage[], opts: { meId: string; unreadAfter: string | null }): TimelineItem[] {
  const items: TimelineItem[] = [];
  let unreadPlaced = opts.unreadAfter === null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)) {
      items.push({ kind: "day", key: `day:${dayKey(m.createdAt)}`, iso: m.createdAt });
    }
    if (!unreadPlaced && m.senderId !== opts.meId && m.status === "sent" && m.createdAt > opts.unreadAfter!) {
      items.push({ kind: "unread", key: "unread" });
      unreadPlaced = true;
    }
    items.push({
      kind: "message",
      key: messageKey(m),
      message: m,
      groupStart: !prev || !sameGroup(prev, m),
      groupEnd: !next || !sameGroup(m, next),
    });
  }
  return items;
}

/** Insert or replace a confirmed message, keeping (createdAt, id) order. */
export function upsertSorted(list: UiMessage[], m: UiMessage): UiMessage[] {
  const existing = list.findIndex((x) => x.id === m.id);
  if (existing !== -1) {
    const copy = list.slice();
    copy[existing] = m;
    return copy;
  }
  let i = list.length;
  while (i > 0 && (list[i - 1].createdAt > m.createdAt || (list[i - 1].createdAt === m.createdAt && list[i - 1].id > m.id))) i--;
  return [...list.slice(0, i), m, ...list.slice(i)];
}

/** Up to three emoji and nothing else: rendered large, without a bubble. */
export function isJumboEmoji(text: string | null): boolean {
  if (!text) return false;
  const t = text.replace(/\s/g, "");
  if (!t || t.length > 40) return false;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)];
  return segments.length <= 3 && segments.every((s) => /\p{Extended_Pictographic}/u.test(s.segment));
}
