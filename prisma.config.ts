import { config } from "dotenv";

// Same precedence as Next.js: .env.local (local development) wins over .env
// (live site). Variables already set in the shell win over both, which is how
// the *:live scripts point a command at production (node --env-file=.env).
config({ path: [".env.local", ".env"], quiet: true });
import { defineConfig } from "prisma/config";

// The CLI (migrate, studio) needs a direct, unpooled connection. The app itself
// connects with the pooled DATABASE_URL through the Neon adapter (src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct (unpooled) connection: Neon's `neon env pull` names it
    // DATABASE_URL_UNPOOLED; DIRECT_URL also works. `||`, not `??`: .env.local blanks
    // both, so the live ones can't leak into local commands.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
    // Only needed where the server can't create a scratch database itself
    // (e.g. local `prisma dev`, which runs a separate shadow server).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
