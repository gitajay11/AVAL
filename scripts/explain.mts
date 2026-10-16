// Query-plan check: runs the app's own hot-path queries (chat list, message
// pages, pinned, search, people search) through a logging Prisma client, then
// EXPLAIN ANALYZEs every captured statement and flags sequential scans on the
// big tables. Read-only against any database:
//
//   pnpm db:explain                       # local database (.env.local)
//   pnpm db:explain:live                  # live database (.env), read-only
//   pnpm db:explain --user <uuid>         # pick whose view to test
//   pnpm db:explain --synthetic           # LOCAL ONLY: add 20k messages + 200 chats first, remove them after
//
// Run with --conditions=react-server (see package.json) so the app's
// server-only modules can be imported.
import { config } from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// .env.local (local) wins over .env; `pnpm db:explain:live` preloads .env so it targets the live database.
config({ path: [".env.local", ".env"], quiet: true });

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const url = new URL(connectionString);
const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
if (flag("synthetic") && !local) throw new Error("--synthetic only runs against a local database.");

type Captured = { label: string; sql: string; params: unknown[] };
const captured: Captured[] = [];
let label = "";

const prisma = new PrismaClient({
  adapter: url.hostname.endsWith(".neon.tech")
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString, max: Number(url.searchParams.get("connection_limit")) || 1 }),
  log: [{ emit: "event", level: "query" }],
});
prisma.$on("query", (e) => {
  if (label && /^\s*SELECT/i.test(e.query)) captured.push({ label, sql: e.query, params: JSON.parse(e.params) });
});
// The app's `db` reuses this client (src/lib/db.ts keeps one on globalThis).
(globalThis as { prisma?: PrismaClient }).prisma = prisma;

const { listChats, listMessagesBefore, latestPinned } = await import("../src/lib/chats/queries");
const { searchInChat, searchAll } = await import("../src/lib/search/messages");

const SYNTHETIC = "perf-synthetic";
const MESSAGES = 20_000;
const EXTRA_CHATS = 200;

async function cleanup() {
  await prisma.$executeRawUnsafe(`DELETE FROM chats WHERE title LIKE '${SYNTHETIC}%'`);
}

async function seedSynthetic(me: string) {
  const other = (
    await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id <> ${me}::uuid ORDER BY created_at LIMIT 1`
  )[0]?.id;
  if (!other) throw new Error("Need at least two users (pnpm db:seed).");
  await cleanup();
  const [{ id: chatId }] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO chats (id, type, title, created_by_id, last_message_at, created_at, updated_at)
    VALUES (gen_random_uuid(), 'GROUP', ${SYNTHETIC}, ${me}::uuid, now(), now(), now()) RETURNING id`;
  await prisma.$executeRaw`
    INSERT INTO chat_members (chat_id, user_id, role) VALUES (${chatId}::uuid, ${me}::uuid, 'OWNER'), (${chatId}::uuid, ${other}::uuid, 'MEMBER')`;
  await prisma.$executeRaw`
    INSERT INTO messages (id, chat_id, sender_id, type, text, created_at)
    SELECT gen_random_uuid(), ${chatId}::uuid, CASE WHEN g % 2 = 0 THEN ${me}::uuid ELSE ${other}::uuid END, 'TEXT'::"MessageType",
           'message ' || g || ' about ' || (ARRAY['lunch','pizza','meeting','report','travel','coffee'])[1 + g % 6],
           now() - make_interval(secs => g)
    FROM generate_series(1, ${MESSAGES}) g`;
  await prisma.$executeRaw`
    WITH c AS (
      INSERT INTO chats (id, type, title, created_by_id, last_message_at, created_at, updated_at)
      SELECT gen_random_uuid(), 'GROUP', ${SYNTHETIC} || '-' || g, ${me}::uuid, now() - make_interval(mins => g), now(), now()
      FROM generate_series(1, ${EXTRA_CHATS}) g RETURNING id
    ), m AS (INSERT INTO chat_members (chat_id, user_id, role) SELECT id, ${me}::uuid, 'OWNER' FROM c)
    INSERT INTO messages (id, chat_id, sender_id, type, text, created_at)
    SELECT gen_random_uuid(), c.id, ${me}::uuid, 'TEXT'::"MessageType", 'hello ' || n, now() - make_interval(mins => n)
    FROM c, generate_series(1, 5) n`;
  await prisma.$executeRawUnsafe("ANALYZE");
  return chatId;
}

async function pickUser() {
  const given = option("user");
  if (given) return given;
  const rows = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT user_id FROM chat_members GROUP BY user_id ORDER BY count(*) DESC LIMIT 1`;
  if (!rows[0]) throw new Error("No chat members yet.");
  return rows[0].user_id;
}

async function busiestChat(me: string) {
  const rows = await prisma.$queryRaw<{ chat_id: string }[]>`
    SELECT cm.chat_id FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
    WHERE cm.user_id = ${me}::uuid ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1`;
  return rows[0]?.chat_id;
}

async function run(name: string, fn: () => Promise<unknown>) {
  label = name;
  await fn();
  label = "";
}

const BIG_TABLES = ["messages", "chat_members", "users", "hidden_messages", "receipts", "chats"];

try {
  const me = await pickUser();
  const chatId = flag("synthetic") ? await seedSynthetic(me) : (option("chat") ?? (await busiestChat(me)));
  if (!chatId) throw new Error("That user has no chats.");
  console.log(`Explaining as user ${me}, chat ${chatId}${flag("synthetic") ? ` (+${MESSAGES} synthetic messages)` : ""}\n`);

  await run("chat list", () => listChats(me));
  await run("message page (latest 30)", () => listMessagesBefore(me, chatId, null, null));
  await run("pinned message", () => latestPinned(me, chatId, null));
  await run("search in chat", () => searchInChat(me, chatId, null, "pizza", null));
  await run("search all chats", () => searchAll(me, "pizza", null));
  await run("people search (prefix)", () =>
    prisma.user.findMany({ where: { id: { not: me }, usernameLower: { startsWith: "gr" } }, orderBy: { usernameLower: "asc" }, take: 25 }),
  );

  let problems = 0;
  const seen = new Set<string>();
  for (const q of captured) {
    if (seen.has(q.sql)) continue;
    seen.add(q.sql);
    const plan = (await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN (ANALYZE, BUFFERS) ${q.sql}`, ...q.params)).map(
      (r) => r["QUERY PLAN"],
    );
    const time = plan.find((l) => l.startsWith("Execution Time"))?.replace("Execution Time: ", "") ?? "?";
    const indexes = [...new Set(plan.flatMap((l) => [...l.matchAll(/(?:Index Scan|Index Only Scan)(?: Backward)? using (\S+)|Bitmap Index Scan on (\S+)/g)].map((m) => m[1] ?? m[2])))];
    const seqScans = plan
      .map((l) => l.match(/Seq Scan on (\w+).*?rows=(\d+) loops=(\d+)/))
      .filter((m): m is RegExpMatchArray => Boolean(m) && BIG_TABLES.includes(m![1]))
      .filter((m) => Number(m[2]) * Number(m[3]) > 1_000 || flag("strict"));
    const ok = seqScans.length === 0;
    if (!ok) problems++;
    console.log(`${ok ? "OK  " : "WARN"} ${q.label.padEnd(26)} ${time.padStart(10)}  ${indexes.join(", ") || "(no index)"}`);
    for (const s of seqScans) console.log(`       seq scan on ${s[1]} (${s[2]} rows × ${s[3]} loops)`);
    if (flag("verbose") || !ok) console.log(plan.map((l) => `       ${l}`).join("\n"));
  }
  console.log(problems ? `\n${problems} statement(s) scan large tables sequentially.` : "\nEvery hot query is index-backed.");
  process.exitCode = problems ? 1 : 0;
} finally {
  if (flag("synthetic")) await cleanup();
  await prisma.$disconnect();
}
