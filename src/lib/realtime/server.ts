import "server-only";
import * as Ably from "ably";
import type { RealtimeEvent } from "@/lib/chats/types";

/**
 * Server side of real-time. Clients can only *subscribe* to their own
 * `user:{id}` channel (and enter presence there); every event is published
 * here, after the API route has authorized it and written it to the database.
 */

let rest: Ably.Rest | null | undefined;

export function ablyRest(): Ably.Rest | null {
  if (rest !== undefined) return rest;
  const key = process.env.ABLY_API_KEY;
  rest = key ? new Ably.Rest({ key }) : null;
  return rest;
}

export const realtimeEnabled = () => ablyRest() !== null;

export const userChannel = (userId: string) => `user:${userId}`;

export const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Signed token request scoped to the user's own channel: subscribe + presence, never publish. */
export async function createUserTokenRequest(userId: string) {
  const client = ablyRest();
  if (!client) return null;
  return client.auth.createTokenRequest({
    clientId: userId,
    ttl: TOKEN_TTL_MS,
    capability: JSON.stringify({ [userChannel(userId)]: ["subscribe", "presence"] }),
  });
}

/**
 * Publish one event to many users. Best effort: the database is the source of
 * truth and clients catch up on reconnect, so failures are logged, not thrown.
 */
export async function publishToUsers<E extends RealtimeEvent>(userIds: string[], name: E["name"], data: E["data"]) {
  const client = ablyRest();
  if (!client || userIds.length === 0) return;
  const channels = [...new Set(userIds)].map(userChannel);
  try {
    for (let i = 0; i < channels.length; i += 100) {
      await client.batchPublish({ channels: channels.slice(i, i + 100), messages: [{ name, data }] });
    }
  } catch (err) {
    console.error("[realtime] publish failed", name, err);
  }
}

/** Whether the user currently has a live connection (present on their channel). */
export async function isOnline(userId: string): Promise<boolean | null> {
  const client = ablyRest();
  if (!client) return null;
  try {
    const page = await client.channels.get(userChannel(userId)).presence.get({ limit: 1 });
    return page.items.length > 0;
  } catch (err) {
    console.error("[realtime] presence check failed", err);
    return null;
  }
}
