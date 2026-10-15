import { z } from "zod";
import { MEDIA_LIMITS } from "@/lib/media/policy";
import { multiLine, singleLine } from "./common";

export const MESSAGE_MAX = 4096;
export const PAGE_SIZE = 30;
export const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
export const MAX_PINNED_CHATS = 5;
export const MAX_FORWARD_TARGETS = 10;

export const StartChatSchema = z.object({ userId: z.uuid() });

const clientId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid client id");

export const SendMessageSchema = z
  .object({
    clientId,
    text: multiLine(MESSAGE_MAX).optional().default(""),
    attachmentId: z.uuid().optional(),
    replyToId: z.uuid().optional(),
  })
  .refine((m) => m.text.length > 0 || m.attachmentId, { path: ["text"], message: "Message is empty" });

export const EditMessageSchema = z.object({ text: multiLine(MESSAGE_MAX) });

export const ReadSchema = z.object({ upTo: z.iso.datetime() });

/** Search query: optional leading @, lowercased, username charset only. */
export const UserSearchSchema = z
  .string()
  .transform((v) => v.trim().replace(/^@/, "").toLowerCase())
  .pipe(z.string().min(1).max(20).regex(/^[a-z0-9_.]+$/));

/** Exactly one emoji grapheme (skin tones and ZWJ sequences included). */
export function isSingleEmoji(value: string): boolean {
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  return segments.length === 1 && /\p{Extended_Pictographic}/u.test(value);
}

export const ReactionSchema = z.object({
  emoji: z.string().max(32).refine(isSingleEmoji, "Pick one emoji").nullable(),
});

export const ForwardSchema = z.object({
  chatIds: z.array(z.uuid()).min(1).max(MAX_FORWARD_TARGETS),
});

export const ChatSettingsSchema = z
  .object({
    pinned: z.boolean(),
    archived: z.boolean(),
    markedUnread: z.boolean(),
    mute: z.enum(["8h", "1w", "forever", "off"]),
  })
  .partial();

export const UploadRequestSchema = z
  .object({
    chatId: z.uuid(),
    kind: z.enum(["IMAGE", "VIDEO", "VOICE", "FILE"]),
    contentType: z.string().max(127),
    size: z.number().int().positive(),
    fileName: singleLine(255).optional(),
    width: z.number().int().positive().max(20_000).optional(),
    height: z.number().int().positive().max(20_000).optional(),
    durationMs: z.number().int().nonnegative().max(6 * 60 * 60 * 1000).optional(),
    waveform: z.array(z.number().int().min(0).max(31)).max(100).optional(),
  })
  .refine((u) => u.size <= MEDIA_LIMITS[u.kind], { path: ["size"], message: "That file is too large" });

export const ConfirmUploadSchema = z.object({ uploadId: z.uuid() });

export const REPORT_REASONS = ["SPAM", "HARASSMENT", "IMPERSONATION", "INAPPROPRIATE", "OTHER"] as const;

export const ReportSchema = z
  .object({
    targetUserId: z.uuid().optional(),
    targetMessageId: z.uuid().optional(),
    reason: z.enum(REPORT_REASONS),
    details: multiLine(1000).optional(),
  })
  .refine((r) => r.targetUserId || r.targetMessageId, { message: "Nothing to report" });
