import { ApiError, clientIp, json, parseJson, route } from "@/lib/api";
import { verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { meSelect, toMe } from "@/lib/users";
import { SignInSchema } from "@/lib/validation/auth";

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await rateLimit("loginIp", ip);
  const { identifier, password } = await parseJson(req, SignInSchema);
  await rateLimit("loginIdentifier", identifier);

  const user = await db.user.findUnique({
    where: identifier.includes("@") ? { emailLower: identifier } : { usernameLower: identifier },
    select: { ...meSelect, passwordHash: true },
  });

  const ok = user ? await verifyPassword(user.passwordHash, password) : await verifyAgainstDummy(password);
  if (!user || !ok) {
    throw new ApiError(401, "invalid_credentials", "Incorrect username, email or password.");
  }

  const token = await createSession(user.id, { userAgent: req.headers.get("user-agent"), ip });
  const res = json({ user: toMe(user) });
  setSessionCookie(res, token);
  return res;
});
