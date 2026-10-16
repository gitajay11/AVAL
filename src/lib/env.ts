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

  // Neon Object Storage: AWS-standard names, written by `neon deploy`. Locally
  // they point at an S3-compatible emulator (s3rver/MinIO).
  AWS_ENDPOINT_URL_S3: requiredInProd(z.url()),
  AWS_ACCESS_KEY_ID: requiredInProd(z.string().min(1)),
  AWS_SECRET_ACCESS_KEY: requiredInProd(z.string().min(1)),
  AWS_REGION: z.string().min(1).optional(),
  STORAGE_BUCKET: z.string().min(1).default("aval-media"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated server env. Read lazily so `next build` works without secrets. */
export function env(): Env {
  if (cached) return cached;
  // Blank values count as unset, so .env.local can switch a live integration off with KEY="".
  const present = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = EnvSchema.safeParse(present);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export const IS_PROD = isProd;
