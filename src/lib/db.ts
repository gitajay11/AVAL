import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

function createClient() {
  const connectionString = env().DATABASE_URL;
  // Neon in every deployed environment; plain TCP for a local Postgres
  // (`prisma dev`), which the Neon driver can't reach.
  const adapter = new URL(connectionString).hostname.endsWith(".neon.tech")
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
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
