import "server-only";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

type Rule = { limit: number; window: Duration };

/** Every throttled action and its budget. Keys are per IP, user or identifier. */
export const RULES = {
  loginIp: { limit: 20, window: "10 m" },
  loginIdentifier: { limit: 8, window: "15 m" },
  signupIp: { limit: 5, window: "1 h" },
  usernameCheck: { limit: 60, window: "1 m" },
  forgotPasswordIp: { limit: 10, window: "1 h" },
  forgotPasswordEmail: { limit: 3, window: "15 m" },
  resetPassword: { limit: 10, window: "15 m" },
  verifyEmailResend: { limit: 3, window: "15 m" },
  changePassword: { limit: 5, window: "15 m" },
  avatarUpload: { limit: 20, window: "1 h" },
  profileUpdate: { limit: 30, window: "10 m" },
} satisfies Record<string, Rule>;

export type RuleName = keyof typeof RULES;

let limiters: Map<RuleName, Ratelimit> | null | undefined;

function getLimiters(): Map<RuleName, Ratelimit> | null {
  if (limiters !== undefined) return limiters;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env();
  if (!url || !token) return (limiters = null);
  const redis = new Redis({ url, token });
  limiters = new Map(
    (Object.entries(RULES) as [RuleName, Rule][]).map(([name, rule]) => [
      name,
      new Ratelimit({
        redis,
        prefix: `aval:rl:${name}`,
        limiter: Ratelimit.slidingWindow(rule.limit, rule.window),
        analytics: false,
      }),
    ]),
  );
  return limiters;
}

// Development-only fallback when Upstash isn't configured (env() requires it in prod).
const memory = new Map<string, number[]>();
const UNIT_MS: Record<string, number> = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 };

/** Returns 0 when allowed, otherwise seconds until the oldest hit leaves the window. */
function memoryLimit(name: RuleName, key: string): number {
  const { limit, window } = RULES[name];
  const [amount, unit] = window.split(" ");
  const windowMs = Number(amount) * UNIT_MS[unit];
  const now = Date.now();
  const hits = (memory.get(`${name}:${key}`) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return Math.ceil((hits[0] + windowMs - now) / 1000);
  hits.push(now);
  memory.set(`${name}:${key}`, hits);
  return 0;
}

/** Throws 429 when `key` has exhausted the budget for `name`. */
export async function rateLimit(name: RuleName, key: string): Promise<void> {
  const map = getLimiters();
  let ok: boolean;
  let retryAfter = 60;
  if (map) {
    const res = await map.get(name)!.limit(key);
    ok = res.success;
    retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
  } else {
    retryAfter = memoryLimit(name, key);
    ok = retryAfter === 0;
  }
  if (!ok) {
    throw new ApiError(429, "rate_limited", `Too many attempts. Try again in ${formatWait(retryAfter)}.`);
  }
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}
