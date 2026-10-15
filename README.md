# Aval

A Telegram-style chat PWA. Next.js 16 (App Router) + Tailwind v4 + Motion on Vercel, Neon Postgres via Prisma 7, Ably for real-time, Cloudflare R2 for media, Upstash for rate limiting.

**Status: Phase 6 — polish and PWA install (all six phases done).** Deploy guide: [docs/deploy.md](docs/deploy.md). Checklists: [phase 1](docs/phase-1-checklist.md), [phase 2](docs/phase-2-checklist.md), [phase 3](docs/phase-3-checklist.md), [phase 4](docs/phase-4-checklist.md), [phase 5](docs/phase-5-checklist.md), [phase 6](docs/phase-6-checklist.md).

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
| Groups | Up to 200 members with roles owner / admin / member ([src/lib/groups/service.ts](src/lib/groups/service.ts)). Adding someone follows their *Who can message me* setting and blocks, exactly like starting a 1:1 chat. Admins edit name, description and photo and add or remove members; only the owner promotes or demotes admins or removes an admin. If the owner leaves, ownership passes to the longest-standing admin (else member); the last one out deletes the group and its media. Every change is posted as a system line. Members' photos follow each person's photo privacy. |
| Search | Postgres full-text search on `messages.search_vector` (GIN index, `simple` config, trigger-maintained). The query is rebuilt from letters and digits only ([src/lib/search/tsquery.ts](src/lib/search/tsquery.ts)), so user input can never inject tsquery operators. In-chat search uses the same access check as reading the chat; global search joins on my memberships and applies "clear history" and "delete for me" in the same query. Keyset-paginated, rate-limited. Picking a result loads a window around that message (`?around=`) and lets you scroll both ways. |
| Push | Web Push with VAPID ([src/lib/push](src/lib/push)). Subscriptions are per device (HTTPS endpoints only) and removed on sign-out, "sign out everywhere", password reset, and when the push service answers 404/410. Not sent for muted chats, personal contacts, your own messages, blocked people, or when *New messages* is off; *Show message preview* controls whether text is included. The service worker shows nothing when that chat is already open and focused, and offers **Reply** (posts with your cookie, same authorization as the app) and **Open**. |
| Receipts | Per-member watermarks in `receipts`: *delivered* advances when the chat list loads or a message reaches a device; *read* when the chat is open and scrolled to the bottom. ✓ sent, ✓✓ delivered, green ✓✓ read. |
| Client storage | No localStorage, sessionStorage or IndexedDB. JS-readable cookies: the theme preference and "install banner dismissed". Cache Storage holds only the static app shell (below). Logout sends `Clear-Site-Data: "cache"` and deletes every cache. |
| PWA | [Manifest](src/app/manifest.ts) with any + maskable icons (generated from the logo by `pnpm icons`), Android/desktop install prompt and iOS "Add to Home Screen" steps ([pwa.tsx](src/components/app/pwa.tsx)). The [service worker](public/sw.js) is registered as `/sw.js?v=<build id>` and caches **only** hashed build assets, icons and a static [offline page](public/offline.html): pages, RSC payloads, API responses and media are never intercepted for caching. Each deploy gets a fresh worker and cache, the previous cache is deleted, and open tabs learn about a newer build from `/api/version` and offer **Reload**. While offline, Next's `useOffline` drives a status bar, soft navigations wait for the network, and messages that failed to send are retried when the connection returns (de-duplicated by `clientId`). |
| Accessibility | WCAG AA contrast for every text token on every surface in both themes, and 3:1 for focus rings, enforced by [tests/contrast.test.ts](tests/contrast.test.ts). Keyboard focus rings only (`:focus-visible`), no tap highlight, safe-area insets on all four edges, and `prefers-reduced-motion` turns springs into fades and smooth scrolling into jumps. |
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

Push locally: add VAPID keys to `.env` (see Cloud services) and use Chrome or Edge on `http://localhost:3000` (a secure context). Settings → Notifications → **Push on this device**. Browsers deliver through their real push service, so your machine needs internet access.

Media locally: run any S3-compatible server and point `R2_ENDPOINT` at it (it's also added to the CSP in development). For example with [s3rver](https://github.com/jamhall/s3rver) and a CORS file allowing `PUT`/`GET` from `http://localhost:3000`:

```bash
npx s3rver@3 -d ./.s3 -p 4569 --configure-bucket aval-media ./cors.xml
```

Then set `R2_ACCOUNT_ID=local`, `R2_ACCESS_KEY_ID=S3RVER`, `R2_SECRET_ACCESS_KEY=S3RVER`, `R2_BUCKET=aval-media` and `R2_ENDPOINT=http://localhost:4569` in `.env`.

Checks:

```bash
pnpm test
```

Query plans for the hot paths (local only: adds 20k messages and 200 chats, then removes them):

```bash
pnpm db:explain --synthetic
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
7. **Web Push** — generate a key pair once and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a `mailto:` you read):
   ```bash
   npx web-push generate-vapid-keys
   ```
   Keep the same keys forever; changing them silently breaks every existing subscription. On iPhone and iPad, push works only after **Add to Home Screen** (iOS 16.4+).

## Deploy to Vercel

Step by step, including the post-deploy checks: **[docs/deploy.md](docs/deploy.md)**. In short:

1. Import the GitHub repo in Vercel, set the function region next to Neon, and add every variable from `.env.example` for Production and Preview.
2. Apply migrations to Neon:
   ```bash
   pnpm db:migrate
   ```
3. Deploy, add your domain to the R2 CORS policy, and add the Ably presence webhook.

The service worker and manifest need no extra setup; each deploy rolls out a new worker automatically.

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
src/lib/groups/             group service (create, members, roles, leave), avatar URLs
src/lib/search/             tsquery builder, in-chat and global message search
src/lib/push/               VAPID sender (cleans dead subscriptions), message/access-request notifications
src/app/manifest.ts         web app manifest; icon.svg, apple-icon.png, favicon.ico are generated
src/components/app/         app shell, PWA provider (install, updates), offline/update/install banners
public/sw.js                service worker: static app-shell cache, offline page, push, notification Reply/Open
public/offline.html         static page shown when a full page load fails offline
public/icons/               PWA icons (any, maskable, badge), generated by `pnpm icons`
scripts/                    icon generator, query-plan checker (`pnpm db:explain`)
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
