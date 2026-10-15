# Aval

A Telegram-style chat PWA. Next.js 16 (App Router) + Tailwind v4 + Motion on Vercel, Neon Postgres via Prisma 7, Ably for real-time, Cloudflare R2 for media, Upstash for rate limiting.

**Status: Phase 4 — personal contacts and access requests.** Checklists: [phase 1](docs/phase-1-checklist.md), [phase 2](docs/phase-2-checklist.md), [phase 3](docs/phase-3-checklist.md), [phase 4](docs/phase-4-checklist.md).

## Architecture in one screen

| Concern | How |
|---|---|
| Sessions | Random 256-bit token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie (`__Host-aval.sid` in prod). Only its SHA-256 is stored (`sessions`). 30-day sliding expiry. |
| Passwords | argon2id (19 MiB, t=2, p=1). Unknown accounts still spend a hash verification (no timing oracle). |
| CSRF | Every non-GET route checks `Origin` (fallback `Sec-Fetch-Site`) in `route()` ([src/lib/api.ts](src/lib/api.ts)), plus `SameSite=Lax`. |
| Validation | zod everywhere; shared schemas in [src/lib/validation](src/lib/validation). Text is NFC-normalized and stripped of control and bidi-override characters. |
| Rate limits | [src/lib/security/rate-limit.ts](src/lib/security/rate-limit.ts): login per IP and per identifier, signup, username check, reset, uploads. |
| Email links | Tokens travel in the URL **fragment** (`#token=`), so they never reach server logs or `Referer`. Single-use, hashed at rest, superseded by newer links. |
| Media | Images are downscaled and re-encoded in the browser (strips EXIF/GPS). Upload = presigned PUT that signs exact `Content-Type` + `Content-Length` → confirm checks size and real file signature (images, video, audio) → attach to a message. Reads go through `/api/media/:id`, which checks chat membership, deletion and "delete for me", then redirects to a 1-hour signed URL. Plain files are always served as downloads. Forwarded media share the R2 object; objects are deleted when no attachment references them. |
| Link previews | Fetched server-side after sending, with an SSRF guard at connect time (every resolved IP checked, private/link-local/metadata ranges refused, ports 80/443 only, redirects re-validated, 512 KB cap, 5 s timeout). The page's image is copied into R2, so browsers never load third-party URLs. |
| Personal contacts | A contact is a one-way chat (type `CONTACT`, the owner is its only member). Who may see it is decided in one pure function, [`contactRole`](src/lib/contacts/policy.ts): owner, viewer (approved and still public), discoverable (public: name and photo only) or hidden (private, or blocked either way). Every route goes through [src/lib/authz/contacts.ts](src/lib/authz/contacts.ts). Viewers get read access via `getChatAccess`; every write still requires chat membership, so they're read-only by construction (no sending, reacting, forwarding, starring or downloads). Going Private, revoking, blocking or deleting ends access on the next request, and real-time recipients are recomputed per event. |
| Receipts | Per-member watermarks in `receipts`: *delivered* advances when the chat list loads or a message reaches a device; *read* when the chat is open and scrolled to the bottom. ✓ sent, ✓✓ delivered, green ✓✓ read. |
| Client storage | None. No localStorage/IndexedDB; the only JS-readable cookie is the theme preference. Logout sends `Clear-Site-Data: "cache"` and empties Cache Storage. |
| Rendering | Cache Components: each page prerenders a static shell; session-dependent parts stream inside `<Suspense>`. `proxy.ts` only does optimistic redirects. |
| Real-time | Clients hold an Ably token that can only **subscribe** (and enter presence) on `user:{theirId}`. Every event is published by the server after the API route has authorized it and written it to Postgres, to each recipient's own channel ([src/lib/realtime/server.ts](src/lib/realtime/server.ts)). Without Ably, the client polls. On reconnect it refetches what it missed. |
| Chat data | Chat list is one indexed SQL query (last message, peer, privacy-filtered photo, unread count) rendered on the server. Messages load 30 at a time with a `(created_at, id)` keyset cursor into a virtualized list. Unread counts come from a per-member read watermark (`receipts`). |
| Privacy | "Contacts" = people you've sent a message to. *Who can message me* (Everyone / Contacts), *last seen* and *profile photo* are enforced in search, chat creation, sending, presence and avatar URLs. Blocks hide people from each other everywhere. |

## Local setup

Requirements: Node 22+ and pnpm.

```bash
pnpm install
```

Start a local Postgres (Prisma's built-in dev server). It prints a `postgres://…` TCP URL:

```bash
pnpm exec prisma dev --name aval --detach
```

Create `.env` from `.env.example`. For local work only `APP_URL` and `DATABASE_URL` are required (use the TCP URL from above; `DIRECT_URL` can be omitted). Mail prints to the console, rate limits run in memory, and uploads return 503 until R2 is configured. Then:

```bash
pnpm db:migrate
```

```bash
pnpm dev
```

Open http://localhost:3000. Verification and reset links appear in the dev server output.

Optional: two verified test accounts that can chat with each other (local databases only; credentials are in [prisma/seed-dev.mts](prisma/seed-dev.mts)):

```bash
pnpm db:seed
```

To try two users at once, use a normal and a private window (cookies are per profile).

Media locally: run any S3-compatible server and point `R2_ENDPOINT` at it (it's also added to the CSP in development). For example with [s3rver](https://github.com/jamhall/s3rver) and a CORS file allowing `PUT`/`GET` from `http://localhost:3000`:

```bash
npx s3rver@3 -d ./.s3 -p 4569 --configure-bucket aval-media ./cors.xml
```

Then set `R2_ACCOUNT_ID=local`, `R2_ACCESS_KEY_ID=S3RVER`, `R2_SECRET_ACCESS_KEY=S3RVER`, `R2_BUCKET=aval-media` and `R2_ENDPOINT=http://localhost:4569` in `.env`.

Checks:

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

## Cloud services

1. **Neon** — create a project and a database `aval`. Copy the *pooled* connection string to `DATABASE_URL` and the *direct* one to `DIRECT_URL`. Optional: create a `dev` branch for local work. On the free plan computes suspend when idle (~0.5 s cold start); disable autosuspend on the production branch if that matters.
2. **Upstash** — create a Redis database (region near your Vercel region) and copy the REST URL and token.
3. **Cloudflare R2** — create bucket `aval-media` (keep it private; no public access, no custom domain). Create an API token with *Object Read & Write* on that bucket and copy Account ID, Access Key ID and Secret. Under the bucket's **Settings → CORS policy**, paste [r2-cors.json](r2-cors.json) with your real domain.
4. **Ably** — create an app and copy its root API key to `ABLY_API_KEY` (keep it server-side). For instant online/offline updates, add a webhook under **Integrations → Webhooks**: URL `https://YOUR-DOMAIN/api/realtime/webhook`, source **Presence**, channel filter `^user:`, **enveloped** and **signed with the same key**. Without the webhook, status still refreshes every 30 s.
5. **SMTP** — any provider (Resend, Postmark, SES, Brevo…). Use a verified sending domain in `SMTP_FROM`.
6. **CRON_SECRET** — any long random string.

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework: Next.js; defaults are fine).
2. Add every variable from `.env.example` for **Production** and **Preview**. `APP_URL` must be the deployed origin.
3. Run migrations against Neon before (or as part of) the first deploy, from your machine with production env loaded:
   ```bash
   pnpm db:migrate
   ```
   To automate it, set the Vercel build command to `pnpm db:migrate && pnpm build`.
4. Deploy. `vercel.json` registers a daily cron for `/api/cron/sweep` (stale uploads, expired sessions and tokens).
5. After the first deploy, add the production origin to the R2 CORS policy.

## Migrations

`prisma/migrations/20261016000000_init` contains the whole schema plus hand-written SQL that Prisma can't express: `COLLATE "C"` on `username_lower`/`name_lower` (so the btree index serves `LIKE 'prefix%'`) and a trigger that maintains `messages.search_vector`. For new migrations, use `pnpm db:migrate:dev` against a dev branch and review the SQL before committing.

## Project layout

```
prisma/                     schema + migrations
src/proxy.ts                optimistic auth redirects, sliding cookie refresh
src/app/(auth)/             login, signup, welcome, verify, forgot/reset
src/app/(app)/              signed-in shell: chats, settings
src/app/api/                route handlers (auth, me, uploads, media, cron)
src/lib/                    server libs: db, env, api helpers, auth, security, r2, mail
src/lib/chats/              chat queries, services, receipts, cursor, timeline, shared types
src/lib/contacts/           contact access policy, service (requests, grants, notifications), types
src/lib/media/              upload policy, signature sniffing, uploads, ref-counted deletion
src/lib/link-preview.ts     SSRF-safe preview fetcher (pure parsing in link-meta.ts)
src/lib/realtime/           Ably token + server-side publishing
src/lib/client/             browser helpers (fetch wrapper, upload, time, hooks)
src/components/chats/       chat list, search, conversation, composer, menus, dialogs, media players
src/components/contacts/    contacts pages, owner management, public contact sheet
src/components/notifications/ in-app notifications (provider + page)
src/components/realtime/    Ably connection / polling fallback provider
src/components/             UI kit, auth screens, settings, app shell
tests/                      vitest unit tests
```
