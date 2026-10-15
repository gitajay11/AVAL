import { z } from "zod";
import { bio, dateOfBirth, displayName } from "./auth";

export const AUDIENCES = ["EVERYONE", "CONTACTS", "NOBODY"] as const;
export const audience = z.enum(AUDIENCES);

export const UpdateProfileSchema = z
  .object({
    displayName,
    bio: bio.nullable(),
    dateOfBirth: dateOfBirth.nullable(),
  })
  .partial();

export const UpdateSettingsSchema = z
  .object({
    lastSeenAudience: audience,
    avatarAudience: audience,
    // "Nobody" isn't offered for messages: existing conversations must keep working.
    messageAudience: z.enum(["EVERYONE", "CONTACTS"]),
    notifyMessages: z.boolean(),
    notifyPreviews: z.boolean(),
    notifyAccessRequests: z.boolean(),
  })
  .partial();

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const AvatarUploadSchema = z.object({
  contentType: z.enum(AVATAR_TYPES),
  /** Set to upload a photo for one of my personal contacts instead of myself. */
  contactId: z.uuid().optional(),
  /** Set to upload a group's photo (admins only). */
  chatId: z.uuid().optional(),
  size: z.number().int().positive().max(AVATAR_MAX_BYTES, "Avatar must be 5 MB or smaller"),
});

export const ConfirmUploadSchema = z.object({ uploadId: z.uuid() });
