// Local development seed: two verified test accounts that can chat with each other.
// Refuses to run against anything but a local database.
//
//   pnpm db:seed
//
// Test accounts (local only):
//   ada_l    / ada@example.test    / test-password-ada
//   grace.h  / grace@example.test  / test-password-grace
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL ?? "";
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to seed non-local database host "${host}".`);
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const users = [
  { username: "ada_l", email: "ada@example.test", password: "test-password-ada", displayName: "Ada Lovelace", bio: "Poetical science." },
  { username: "grace.h", email: "grace@example.test", password: "test-password-grace", displayName: "Grace Hopper", bio: null },
];

for (const u of users) {
  const passwordHash = await hash(u.password, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  await db.user.upsert({
    where: { usernameLower: u.username },
    update: { passwordHash, emailVerifiedAt: new Date() },
    create: {
      username: u.username,
      usernameLower: u.username,
      email: u.email,
      emailLower: u.email,
      passwordHash,
      displayName: u.displayName,
      bio: u.bio,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`seeded ${u.username}`);
}
await db.$disconnect();
