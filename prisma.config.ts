import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrate, studio) needs a direct, unpooled connection. The app itself
// connects with the pooled DATABASE_URL through the Neon adapter (src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
