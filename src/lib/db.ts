import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

function createClient() {
  const connectionString = env().DATABASE_URL;
  // node-postgres everywhere: Neon's pooled endpoint (`-pooler`, PgBouncer) when
  // deployed, plain TCP for a local `prisma dev`. On Vercel Fluid compute the
  // pool is reused across requests, which is Neon's recommended setup there.
  // `connection_limit` caps the local pool (the `prisma dev` server handles one connection well).
  const url = new URL(connectionString);
  const max = Number(url.searchParams.get("connection_limit")) || undefined;
  // Neon's strings say sslmode=require, which pg 8 treats as full certificate
  // verification but pg 9 will weaken to libpq's "require". Pin the strong mode
  // here (not in .env, which `neon deploy` rewrites).
  if (["require", "prefer", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")) url.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({ connectionString: url.toString(), max });
  // Keeps a Vercel function instance alive until idle connections are released (no-op elsewhere).
  attachDatabasePool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * Created on first use rather than at import, so `next build` can load route
 * modules without database credentials.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const c = client();
    const value = Reflect.get(c, prop);
    return typeof value === "function" ? value.bind(c) : value;
  },
});

type UniqueMeta = {
  target?: unknown;
  driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } };
};

/**
 * For a Prisma unique-constraint violation, the columns or index names involved
 * (match with `.includes("username")`); null for any other error.
 */
export function uniqueViolation(err: unknown): string[] | null {
  if (typeof err !== "object" || err === null || !("code" in err) || err.code !== "P2002") return null;
  const meta = (err as { meta?: UniqueMeta }).meta;
  if (Array.isArray(meta?.target)) return meta.target as string[];
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  return [...(constraint?.fields ?? []), ...(constraint?.index ? [constraint.index] : [])];
}
