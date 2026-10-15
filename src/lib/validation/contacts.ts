import { z } from "zod";
import { multiLine, singleLine } from "./common";

export const visibility = z.enum(["PRIVATE", "PUBLIC"]);

const name = singleLine(64).pipe(z.string().min(1, "Give the contact a name"));
const note = multiLine(500);

export const CreateContactSchema = z.object({
  name,
  note: note.optional(),
  visibility: visibility.default("PRIVATE"),
});

export const UpdateContactSchema = z
  .object({
    name,
    note: note.nullable(),
    visibility,
    removeAvatar: z.literal(true),
  })
  .partial();

export const AccessRequestSchema = z.object({ note: multiLine(280).optional() });

export const DecisionSchema = z.object({ decision: z.enum(["approve", "decline"]) });

export const ContactSearchSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().min(2).max(64));

export const NotificationsReadSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });
