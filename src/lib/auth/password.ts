import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP baseline for argon2id: 19 MiB memory, 2 iterations, 1 lane.
const OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (a const enum, so inlined)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Burn the same time as a real check so unknown accounts can't be detected by timing. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("aval-timing-equalizer");
  await verifyPassword(await dummyHash, password);
  return false;
}
