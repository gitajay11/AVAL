import "server-only";
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

// Integrations that are optional in development (console mail, in-memory rate
// limiter, uploads disabled) but required in production.
const requiredInProd = <T extends z.ZodType>(schema: T) => (isProd ? schema : schema.optional());

const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  APP_URL: z.url(),

  UPSTASH_REDIS_REST_URL: requiredInProd(z.url()),
  UPSTASH_REDIS_REST_TOKEN: requiredInProd(z.string().min(1)),

  SMTP_HOST: requiredInProd(z.string().min(1)),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: requiredInProd(z.string().min(3)),

  R2_ACCOUNT_ID: requiredInProd(z.string().min(1)),
  R2_ACCESS_KEY_ID: requiredInProd(z.string().min(1)),
  R2_SECRET_ACCESS_KEY: requiredInProd(z.string().min(1)),
  R2_BUCKET: requiredInProd(z.string().min(1)),
  // Optional S3-compatible endpoint override (local MinIO/s3rver for development).
  R2_ENDPOINT: z.url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated server env. Read lazily so `next build` works without secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export const IS_PROD = isProd;
