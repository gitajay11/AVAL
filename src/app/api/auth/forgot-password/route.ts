import { after } from "next/server";
import { clientIp, json, parseJson, route } from "@/lib/api";
import { sendPasswordReset } from "@/lib/auth/email-tokens";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { ForgotPasswordSchema } from "@/lib/validation/auth";

/** Always answers the same way, so it can't be used to discover which emails have accounts. */
export const POST = route(async (req) => {
  await rateLimit("forgotPasswordIp", clientIp(req));
  const { email } = await parseJson(req, ForgotPasswordSchema);
  const emailLower = email.toLowerCase();
  await rateLimit("forgotPasswordEmail", emailLower);

  // Send after responding so response time doesn't reveal whether the account exists.
  after(async () => {
    const user = await db.user.findUnique({ where: { emailLower }, select: { id: true, email: true } });
    if (user) await sendPasswordReset(user).catch((err) => console.error("[forgot] email failed", err));
  });

  return json({ ok: true });
});
