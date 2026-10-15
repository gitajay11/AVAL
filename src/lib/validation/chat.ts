import { z } from "zod";
import { multiLine } from "./common";

export const MESSAGE_MAX = 4096;
export const PAGE_SIZE = 30;

export const StartChatSchema = z.object({ userId: z.uuid() });

export const SendMessageSchema = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid client id"),
  text: multiLine(MESSAGE_MAX).pipe(z.string().min(1, "Message is empty")),
});

export const ReadSchema = z.object({ upTo: z.iso.datetime() });

/** Search query: optional leading @, lowercased, username charset only. */
export const UserSearchSchema = z
  .string()
  .transform((v) => v.trim().replace(/^@/, "").toLowerCase())
  .pipe(z.string().min(1).max(20).regex(/^[a-z0-9_.]+$/));
