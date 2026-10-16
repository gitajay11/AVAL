import type { Audience } from "@/generated/prisma/client";

/** Avatar URL for <img>: an authorized redirect to a signed storage URL. Versioned to bust caches. */
export function avatarUrl(userId: string, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  const version = avatarKey.slice(avatarKey.lastIndexOf("/") + 1, avatarKey.lastIndexOf("."));
  return `/api/media/avatar/${userId}?v=${version}`;
}

export const meSelect = {
  id: true,
  username: true,
  email: true,
  emailVerifiedAt: true,
  displayName: true,
  bio: true,
  dateOfBirth: true,
  avatarKey: true,
  lastSeenAudience: true,
  avatarAudience: true,
  messageAudience: true,
  notifyMessages: true,
  notifyPreviews: true,
  notifyAccessRequests: true,
  createdAt: true,
} as const;

type MeRow = {
  id: string;
  username: string;
  email: string;
  emailVerifiedAt: Date | null;
  displayName: string;
  bio: string | null;
  dateOfBirth: Date | null;
  avatarKey: string | null;
  lastSeenAudience: Audience;
  avatarAudience: Audience;
  messageAudience: Audience;
  notifyMessages: boolean;
  notifyPreviews: boolean;
  notifyAccessRequests: boolean;
  createdAt: Date;
};

/** The signed-in user's own profile and settings, as sent to the client. */
export function toMe(u: MeRow) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    displayName: u.displayName,
    bio: u.bio,
    dateOfBirth: u.dateOfBirth ? u.dateOfBirth.toISOString().slice(0, 10) : null,
    avatarUrl: avatarUrl(u.id, u.avatarKey),
    privacy: {
      lastSeenAudience: u.lastSeenAudience,
      avatarAudience: u.avatarAudience,
      messageAudience: u.messageAudience,
    },
    notifications: {
      notifyMessages: u.notifyMessages,
      notifyPreviews: u.notifyPreviews,
      notifyAccessRequests: u.notifyAccessRequests,
    },
    createdAt: u.createdAt.toISOString(),
  };
}

export type Me = ReturnType<typeof toMe>;
