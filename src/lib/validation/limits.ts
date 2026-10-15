// Limits and pure checks shared by forms and the API. Deliberately zod-free:
// client components import from here so the schema library stays out of the
// browser bundle. The schema modules re-export these.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const MIN_AGE_YEARS = 13;

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "aval", "api", "app", "help", "login", "logout", "me",
  "moderator", "null", "official", "root", "security", "settings", "signup", "staff",
  "support", "system", "undefined", "verify",
]);

/** Why a username is invalid, or null when it is fine. Shared by the form and the API. */
export function usernameProblem(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters`;
  if (v.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters`;
  if (!/^[a-z0-9_.]+$/.test(v)) return "Only letters, numbers, _ and .";
  if (RESERVED_USERNAMES.has(v)) return "This username is reserved";
  return null;
}

export const MESSAGE_MAX = 4096;
export const PAGE_SIZE = 30;
export const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
export const MAX_PINNED_CHATS = 5;
export const MAX_FORWARD_TARGETS = 10;
export const REPORT_REASONS = ["SPAM", "HARASSMENT", "IMPERSONATION", "INAPPROPRIATE", "OTHER"] as const;

export const AUDIENCES = ["EVERYONE", "CONTACTS", "NOBODY"] as const;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
