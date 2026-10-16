# Deploying Aval to Vercel

About 30 minutes end to end. You need accounts on Vercel, Neon (database and object storage), Upstash, Ably and an SMTP provider, plus a GitHub repository with this code.

## 1. Create the services

Pick **one region** and keep everything near it. Aval's Neon project runs in AWS **`ap-southeast-1` (Singapore)**, so use Vercel **`sin1`** and an Upstash database in Singapore too. Every page load makes a few database round trips, so distance between Vercel functions and Neon matters most.

| Service | What to create | Values you'll copy |
|---|---|---|
| **Neon** | Already linked: project `ancient-darkness-60354121`, branch `production`, database `neondb` ([neon.ts](../neon.ts), `.neon`). `neon deploy` applies neon.ts and refreshes the database variables in `.env`. | `DATABASE_URL` (pooled, `-pooler` host) and `DATABASE_URL_UNPOOLED` (direct, used by migrations), written by `neon deploy` / `neon env pull`. |
| **Upstash** | Redis database in the same region. | REST URL → `UPSTASH_REDIS_REST_URL`, REST token → `UPSTASH_REDIS_REST_TOKEN`. |
| **Neon Object Storage** | Private bucket `aval-media`, declared in [neon.ts](../neon.ts) and created by `neon deploy` on the same branch as the database. | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, written into `.env` by `neon deploy`. Plus `STORAGE_BUCKET=aval-media`. |
| **Ably** | An app. | Root API key → `ABLY_API_KEY` (server-side only). |
| **SMTP** | Any provider (Resend, Postmark, SES, Brevo…) with a verified sending domain. | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. |
| **Web Push** | Nothing to sign up for. Run `npx web-push generate-vapid-keys` once. | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`; `VAPID_SUBJECT=mailto:you@your-domain`. Keep them forever: new keys silently break existing subscriptions. |
| **Cron secret** | Any long random string (`openssl rand -hex 32`). | `CRON_SECRET`. |

## 2. Import the project

1. Vercel → **Add New → Project** → import the GitHub repository. Framework preset: Next.js. Leave the build and output settings at their defaults.
2. **Settings → Functions → Function Region**: the region next to your Neon database.
3. **Settings → Environment Variables**: add every variable from [.env.example](../.env.example) for **Production** and **Preview**:

   | Variable | Production | Preview |
   |---|---|---|
   | `APP_URL` | `https://your-domain` (no trailing slash) | Your preview domain, or leave as production if you only test there |
   | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon `production` branch | A separate Neon branch (`neon checkout dev --create`), so previews never touch real data |
   | `AWS_*` (object storage), `STORAGE_BUCKET` | Neon `production` branch | The preview branch's own storage (`neon checkout` provisions it; files branch with the data) |
   | `UPSTASH_*`, `ABLY_API_KEY`, `SMTP_*`, `VAPID_*`, `CRON_SECRET` | Required | Same, or separate resources |

   Leave `SHADOW_DATABASE_URL` unset; it's for local development only.
4. Production fails closed: if Upstash or SMTP variables are missing, API routes return errors instead of running without rate limits or email.

## 3. Create the database schema

Put the live values in `.env` (it's git-ignored; local development uses `.env.local` instead), then from your machine:

```bash
pnpm db:migrate:live
```

It loads only `.env`, so it can't fall back to your local database: with `DATABASE_URL` still blank it stops with "Connection url is empty".

This applies every migration in `prisma/migrations`, including the hand-written full-text search trigger. To run migrations on every deploy instead, set the Vercel build command to:

```bash
pnpm db:migrate && pnpm build
```

## 4. Deploy

Push to the production branch (or click **Deploy**). Then:

1. **Custom domain**: Settings → Domains. Update `APP_URL` to it and redeploy.
2. **Storage CORS**: with your real domain in `APP_URL` (in `.env`), run `pnpm storage:cors:live`. It sets the bucket's CORS rules through the S3 API so browsers can PUT uploads to presigned URLs (`--show` prints the current rules; extra origins can be passed as arguments). Without this, uploads fail in the browser.
3. **Ably presence webhook** (instant online/offline): Ably → your app → Integrations → Webhooks → new webhook. URL `https://your-domain/api/realtime/webhook`, source **Presence**, channel filter `^user:`, **Enveloped**, **Sign with key**: the same key as `ABLY_API_KEY`. Without it, online status still refreshes every 30 s.
4. **Cron**: [vercel.json](../vercel.json) already schedules `/api/cron/sweep` daily (stale uploads, expired sessions and tokens). Check it under Settings → Cron Jobs.
5. Recommended where your plan offers it: **Skew Protection** (project settings). Tabs that stay open across a deploy keep loading their own build's code instead of hard-reloading.

## 5. Check the deployment

- Sign up, verify the email (the link arrives by SMTP), sign in.
- Open the app on a phone: Chrome/Android offers **Install**; on iPhone use Share → **Add to Home Screen**. The installed app opens full screen on the chat list.
- Settings → Notifications → **Push on this device**, then send yourself a message from another account with the app closed.
- Settings → App shows the deployed build id. After the next deploy, open tabs offer **Reload** within 30 minutes (or right away with **Check for updates**).
- Query plans against real data (read-only):

  ```bash
  pnpm db:explain:live
  ```

  It runs the app's own hot queries as the busiest user and prints the indexes each one used; it exits non-zero if any of them scans `messages`, `chat_members` or `users` sequentially. It reads the live `.env`; `pnpm db:explain` (no suffix) checks your local database instead.

## Operations

- **Logs**: Vercel → Logs. API errors are logged as `[api] unhandled …` with the route.
- **Rotating secrets**: `CRON_SECRET`, SMTP and storage credentials can be rotated any time (re-run `neon deploy` for new storage keys) (update the variable, redeploy). After rotating `ABLY_API_KEY`, update the presence webhook's signing key too; connected clients fetch new tokens on their own. Don't rotate VAPID keys unless you accept that every device must re-enable push.
- **Backups**: Neon keeps point-in-time history (the window depends on your plan); restore into a branch first to inspect. Object storage branches with the database (point-in-time too); objects are only deleted when no message references them.
- **Database driver**: Prisma talks to Neon through node-postgres (`pg`) on the pooled endpoint, with `attachDatabasePool` from `@vercel/functions` so Vercel Fluid compute reuses the pool and releases idle connections. That's Neon's recommended setup on Vercel. `sslmode` is pinned to `verify-full` in [src/lib/db.ts](../src/lib/db.ts).
- **Scaling**: the app is stateless; Neon's pooled endpoint handles serverless connection bursts. If chat lists get slow for heavy users, `pnpm db:explain:live --user <id>` shows where.
