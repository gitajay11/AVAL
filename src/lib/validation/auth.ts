import { z } from "zod";
import { cleanText, multiLine, singleLine } from "./common";
import { MIN_AGE_YEARS, PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN, usernameProblem } from "./limits";

export { MIN_AGE_YEARS, PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN, usernameProblem };

export const username = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .superRefine((v, ctx) => {
    const problem = usernameProblem(v);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const email = z
  .string()
  .transform((v) => cleanText(v).trim())
  .pipe(z.email("Enter a valid email").max(254));

export const password = z
  .string()
  .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `At most ${PASSWORD_MAX} characters`);

export const displayName = singleLine(64).pipe(z.string().min(1, "Enter a display name"));

export const bio = multiLine(160);

/** YYYY-MM-DD, not in the future, and at least MIN_AGE_YEARS old. */
export const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Invalid date")
  .refine((v) => {
    const dob = new Date(`${v}T00:00:00Z`);
    const limit = new Date();
    limit.setUTCFullYear(limit.getUTCFullYear() - MIN_AGE_YEARS);
    return dob <= limit && dob.getUTCFullYear() >= 1900;
  }, `You must be at least ${MIN_AGE_YEARS}`);

export const SignUpSchema = z
  .object({
    username,
    email,
    password,
    displayName,
    bio: bio.optional(),
    dateOfBirth: dateOfBirth.optional(),
  })
  .refine((d) => d.password.toLowerCase() !== d.username, {
    path: ["password"],
    message: "Password can't be your username",
  });

export const SignInSchema = z.object({
  identifier: z
    .string()
    .transform((v) => cleanText(v).trim().toLowerCase())
    .pipe(z.string().min(1, "Enter your username or email").max(254)),
  password: z.string().min(1, "Enter your password").max(PASSWORD_MAX),
});

export const TokenSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid or expired link"),
});

export const ForgotPasswordSchema = z.object({ email });

export const ResetPasswordSchema = TokenSchema.extend({ password });

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: password,
});
