import "server-only";
import type { EmailTokenType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/mail";
import { generateToken, hashToken } from "./tokens";

const TTL_MS: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 30 * 60 * 1000,
};

/** Issue a single-use token, invalidating earlier unused ones of the same type. */
async function issue(userId: string, type: EmailTokenType): Promise<string> {
  const token = generateToken();
  await db.$transaction([
    db.emailToken.deleteMany({ where: { userId, type, usedAt: null } }),
    db.emailToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS[type]) },
    }),
  ]);
  return token;
}

/** Mark a token used and return its user id, or null if invalid, expired or used. */
export async function consumeEmailToken(token: string, type: EmailTokenType): Promise<string | null> {
  const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt <= new Date()) return null;
  // Conditional update so two concurrent requests can't both consume it.
  const { count } = await db.emailToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? row.userId : null;
}

export async function sendVerification(user: { id: string; email: string; displayName: string }) {
  const token = await issue(user.id, "VERIFY_EMAIL");
  await sendVerificationEmail(user.email, user.displayName, `${env().APP_URL}/verify-email#token=${token}`);
}

export async function sendPasswordReset(user: { id: string; email: string }) {
  const token = await issue(user.id, "RESET_PASSWORD");
  await sendPasswordResetEmail(user.email, `${env().APP_URL}/reset-password#token=${token}`);
}
