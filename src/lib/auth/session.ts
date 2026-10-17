import "server-only";
import { cacheLife } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions } from "./cookie";
import { generateToken, hashToken } from "./tokens";

const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // extend the DB expiry at most hourly

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  emailVerified: boolean;
  avatarKey: string | null;
};

export type CurrentSession = { sessionId: string; user: SessionUser };

type Meta = { userAgent?: string | null; ip?: string | null };

/** Keep only the network part of an IP for the device list (no full addresses stored). */
function ipPrefix(ip?: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (v4 === "::1" || v4.startsWith("127.")) return "localhost";
  const parts = v4.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return v4.includes(":") ? `${v4.split(":").slice(0, 3).join(":")}::` : null;
}

export async function createSession(userId: string, meta: Meta): Promise<string> {
  const token = generateToken();
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      ipPrefix: ipPrefix(meta.ip),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    },
  });
  return token;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
}

/**
 * The session row behind the cookie, checked against the clock. A private
 * cache scope: reading cookies and the time here keeps prefetches of signed-in
 * pages valid, and the result is never stored on the server across requests
 * (stale: Infinity = per-request dedupe only, no effect on the route's stale time).
 */
async function readSession() {
  "use cache: private";
  cacheLife({ stale: Infinity });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length !== 43) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      user: {
        select: { id: true, username: true, displayName: true, emailVerifiedAt: true, avatarKey: true },
      },
    },
  });
  if (!session) return null;
  const now = Date.now();
  return {
    id: session.id,
    user: session.user,
    expired: session.expiresAt.getTime() <= now,
    // Sliding expiry is due (the cookie's Max-Age is refreshed by proxy.ts).
    touchAt: now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS ? now : null,
  };
}

/** The current session, validated against the database. Deduped per request. */
export const getSession = cache(async (): Promise<CurrentSession | null> => {
  const session = await readSession();
  if (!session) return null;
  if (session.expired) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.touchAt !== null) {
    const now = session.touchAt;
    await db.session
      .update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000) },
      })
      .catch(() => {});
  }

  const { user } = session;
  return {
    sessionId: session.id,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      emailVerified: user.emailVerifiedAt !== null,
      avatarKey: user.avatarKey,
    },
  };
});

/** For route handlers: the session or a 401. */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "unauthorized", "Please sign in again.");
  return session;
}

/** For pages: the signed-in user or a redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

export async function revokeSession(sessionId: string) {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
