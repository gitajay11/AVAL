import { clientIp, json, route } from "@/lib/api";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { usernameProblem } from "@/lib/validation/auth";

/**
 * GET ?u=name → { available, reason? }. The live check on sign-up and on a
 * personal contact's @username: both share one namespace (the handles table).
 * It doesn't say whether a name belongs to a person or a (possibly private) contact.
 */
export const GET = route(async (req) => {
  await rateLimit("usernameCheck", clientIp(req));
  const raw = (req.nextUrl.searchParams.get("u") ?? "").slice(0, 64);
  const problem = usernameProblem(raw);
  if (problem) return json({ available: false, reason: problem });

  const taken = await db.handle.findUnique({
    where: { handleLower: raw.trim().toLowerCase() },
    select: { handleLower: true },
  });
  return json(taken ? { available: false, reason: "That username is taken" } : { available: true });
});
