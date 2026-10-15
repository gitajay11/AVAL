import { ApiError, clientIp, json, parseJson, route } from "@/lib/api";
import { sendVerification } from "@/lib/auth/email-tokens";
import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { db, uniqueViolation } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { meSelect, toMe } from "@/lib/users";
import { SignUpSchema } from "@/lib/validation/auth";

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await rateLimit("signupIp", ip);
  const input = await parseJson(req, SignUpSchema);

  const passwordHash = await hashPassword(input.password);
  let user;
  try {
    user = await db.user.create({
      data: {
        username: input.username,
        usernameLower: input.username,
        email: input.email,
        emailLower: input.email.toLowerCase(),
        passwordHash,
        displayName: input.displayName,
        bio: input.bio || null,
        dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null,
      },
      select: meSelect,
    });
  } catch (err) {
    const fields = uniqueViolation(err);
    if (!fields) throw err;
    const isUsername = fields.some((f) => f.includes("username"));
    throw new ApiError(409, "conflict", "That account already exists.", {
      [isUsername ? "username" : "email"]: isUsername ? "That username is taken" : "An account with this email already exists",
    });
  }

  await sendVerification(user).catch((err) => console.error("[signup] verification email failed", err));

  const token = await createSession(user.id, { userAgent: req.headers.get("user-agent"), ip });
  const res = json({ user: toMe(user) }, { status: 201 });
  setSessionCookie(res, token);
  return res;
});
