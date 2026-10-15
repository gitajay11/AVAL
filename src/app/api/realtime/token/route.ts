import { ApiError, json, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { touchLastSeen } from "@/lib/presence";
import { createUserTokenRequest } from "@/lib/realtime/server";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * Ably token request for the signed-in user. The token allows only
 * subscribe + presence on `user:{id}`: clients can't publish anything.
 */
export const GET = route(async () => {
  const { user } = await requireSession();
  await rateLimit("realtimeToken", user.id);
  const tokenRequest = await createUserTokenRequest(user.id);
  if (!tokenRequest) throw new ApiError(503, "realtime_unavailable", "Real-time isn't configured.");
  await touchLastSeen(user.id);
  return json(tokenRequest);
});
