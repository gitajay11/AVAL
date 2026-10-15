import { clientIp, json, route } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { usernameProblem } from "@/lib/validation/auth";

/** GET ?u=name → { available, reason? }. Used for the live check on sign-up. */
export const GET = route(async (req) => {
  await rateLimit("usernameCheck", clientIp(req));
  const raw = (req.nextUrl.searchParams.get("u") ?? "").slice(0, 64);
  const problem = usernameProblem(raw);
  if (problem) return json({ available: false, reason: problem });

  const taken = await db.user.findUnique({
    where: { usernameLower: raw.trim().toLowerCase() },
    select: { id: true },
  });
  return json(taken ? { available: false, reason: "That username is taken" } : { available: true });
});
