import { ApiError, json, parseJson, route } from "@/lib/api";
import { consumeEmailToken } from "@/lib/auth/email-tokens";
import { db } from "@/lib/db";
import { TokenSchema } from "@/lib/validation/auth";

export const POST = route(async (req) => {
  const { token } = await parseJson(req, TokenSchema);
  const userId = await consumeEmailToken(token, "VERIFY_EMAIL");
  if (!userId) throw new ApiError(400, "invalid_token", "This link is invalid or has expired.");
  await db.user.updateMany({
    where: { id: userId, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  return json({ ok: true });
});
