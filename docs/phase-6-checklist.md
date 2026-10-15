# Phase 6 test checklist — polish and PWA install

✅ = verified during the build: 125 unit tests (including the new contrast audit), re-runs of all four API suites (50 + 21 + 62 + 55 checks), a production build driven by headless Chrome (27 checks: manifest, icons, service worker, caching, offline, updates, sign-out), 6 more for the iPhone install flow and banner dismissal, the query-plan check with 20k synthetic messages, and screenshots in light and dark. ☐ = please check by hand on real devices.

## Install
- ✅ `/manifest.webmanifest`: name, standalone display, start at the chat list, theme colours, 192/512 icons for both *any* and *maskable*, shortcuts to Contacts and Starred.
- ✅ Every page links the manifest, an SVG favicon (with `.ico` fallback) and an Apple touch icon. Icons are generated from the logo with `pnpm icons`.
- ✅ Chrome/Edge: an **Install Aval** card appears at the top of the chat list (✕ hides it for 90 days on this device). Settings → **App** has the same Install button, or a check mark once installed.
- ✅ iPhone/iPad Safari: the card and Settings open a two-step "Share → Add to Home Screen" sheet.
- ☐ Android Chrome: install from the card; the app opens full screen with the maskable icon (no white ring).
- ☐ Desktop Chrome/Edge: install from the card or the address-bar icon; the window opens on the chat list.
- ☐ iPhone: Add to Home Screen, open it, then enable push in Settings and receive a message.

## Service worker and storage rule
- ✅ Registered as `/sw.js?v=<build id>`; Settings → App shows the build id.
- ✅ Caches only static files: hashed JS/CSS/fonts from `/_next/static`, icons and the offline page. After signing in and using chats, Cache Storage holds no page, API, RSC or media response.
- ✅ No localStorage, sessionStorage or IndexedDB in use.
- ✅ **Log out** deletes every cache (the login page then caches only its own static files again).
- ✅ Development builds register the worker without caching anything, so hot reload is unaffected.

## Updates
- ✅ A new deploy installs a new worker that takes over and deletes the previous build's cache (also when the old worker was still mid-way through caching).
- ✅ Open tabs check `/api/version` when they become visible (at most every 30 minutes); if a newer build is live, a **A new version of Aval is ready · Reload** bar appears. Settings → App → **Check for updates** checks immediately.
- ☐ Deploy twice to Vercel with a tab open: within 30 minutes of returning to it (or via Check for updates) the bar appears, and Reload lands on the new build.

## Offline
- ✅ Losing the connection shows "Offline. Messages send when you're back." at the top.
- ✅ Reloading while offline shows the branded offline page (no data on it); it reloads by itself when the connection returns.
- ✅ Messages that failed for lack of network are sent again automatically when the connection returns, without duplicates (the server de-duplicates by `clientId`). Other failures still show their error and a Retry button.
- ☐ On a phone: airplane mode mid-conversation, send two messages, turn it off: both send once, in order.

## Polish
- ✅ Contrast (light and dark): every text colour passes AA on every surface, focus rings pass 3:1, white text passes across the whole brand gradient. Two light-theme tokens were darkened slightly (subtle text, focus ring). Group sender-name colours now have a light and a dark shade, each AA on its bubble.
- ✅ Reduced motion: springs become fades (Motion), CSS animations stop, and jump-to-message / scroll-to-bottom no longer scroll smoothly.
- ✅ Safe areas on all four edges, including landscape notches.
- ✅ Error screens: a page error inside the app shows **Something went wrong** with Try again while the chat list stays usable; a failure of the root layout shows a standalone error page.
- ✅ Every form uses `method="post"`, so a tap on Sign in before the page has finished loading can never put the password in the address bar (found during this phase's testing).
- ☐ VoiceOver/TalkBack pass over the chat list, a conversation and the composer.
- ☐ Turn on Reduce Motion in the OS and open a few chats: nothing slides or bounces.

## Performance
- ✅ `pnpm db:explain --synthetic`: with 20k messages and 200 chats, every hot query is index-backed — chat list ~17 ms, latest 30 messages ~0.4 ms, pinned ~0.1 ms, search in a chat ~0.3 ms, search across chats ~27 ms (GIN index), people search ~0.1 ms (local Postgres).
- ✅ Opening a chat makes one database round trip fewer (my read receipt now comes from the batched query).
- ✅ JavaScript (compressed): sign-in page 221 KiB, chat page 277 KiB. zod no longer ships to the browser (−30 KiB on every page); forms import limits from a zod-free module. The rest is React, Next and Motion.
- ☐ After deploying: `pnpm db:explain` against Neon (read-only) and a Lighthouse run on the chat list from a phone.
