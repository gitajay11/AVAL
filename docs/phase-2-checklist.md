# Phase 2 test checklist — 1:1 chat and real-time

✅ = verified during the build (unit tests, HTTP against local Postgres, or the in-app browser in polling mode). ☐ = please check by hand. Items marked **(Ably)** need `ABLY_API_KEY` set.

Setup for two users locally: `pnpm db:seed`, then sign in as `ada_l` in one window and `grace.h` in a private window (passwords in `prisma/seed-dev.mts`).

## Finding people and starting chats
- ✅ Searching `@gr` finds `grace.h`. A single character only matches an exact username; 2+ characters match by prefix. You never appear in your own results.
- ✅ Blocked users (either direction) don't appear in search.
- ✅ Tapping a result opens the existing chat, or creates one. Starting twice (from either side) reuses the same chat.
- ✅ An unverified account can't start chats ("Verify your email to start chatting").
- ✅ If the other person set **Who can message me → My contacts** and has never messaged you, starting a chat is refused with a clear reason.
- ✅ An empty new chat doesn't show in either list until the first message is sent.

## Messaging
- ✅ Text and emoji send instantly (optimistic bubble with a clock icon, then ✓). Emoji, accents and skin tones survive the round trip.
- ✅ Retrying a send with the same `clientId` never duplicates a message.
- ✅ Links are clickable and open in a new tab. Text is never rendered as HTML.
- ✅ 1–3 emoji on their own are shown large without a bubble.
- ✅ Bubbles group when consecutive (same sender, < 5 min); a day separator ("Today", "Yesterday", date) appears between days.
- ✅ The latest 30 messages render first; scrolling up loads older pages (keyset cursor) without the view jumping. At the top: "This is the start of your conversation".
- ✅ Non-members get 404 for a chat's page, messages and send endpoints, the same as a chat that doesn't exist.
- ☐ Kill the network mid-send: the bubble shows a red retry icon, and tapping it resends.
- ☐ Enter sends on desktop; Shift+Enter adds a line; on a phone, Enter adds a line and the button sends. The composer grows up to ~6 lines.
- ☐ The emoji palette inserts at the cursor and closes on Escape or an outside click.
- ☐ Drafts survive switching between chats (in memory only; gone after a reload).

## Real-time
- ✅ Without Ably: new messages arrive within about 3 s in an open chat, and the chat list refreshes every 10 s.
- ☐ **(Ably)** A message appears in the other window instantly, in the open chat and at the top of the list.
- ☐ **(Ably)** Typing shows "typing…" in the chat header and in the list row, and stops about 5 s after the last keystroke or when the message arrives.
- ☐ **(Ably)** Turn Wi-Fi off for 30 s, have the other user send messages, then turn it back on: the header shows "Connecting…" briefly and the missed messages appear.
- ☐ **(Ably)** In DevTools, the token from `/api/realtime/token` has only `subscribe`/`presence` on `user:<your id>`, and publishing from the console fails.

## Unread counts and reading
- ✅ Messages that arrive while you're on the list raise the unread badge (muted chats get a grey badge).
- ✅ Opening the chat shows an **Unread messages** divider before the first unread message, and clears the badge (server count goes to 0).
- ✅ The read watermark only moves forward and never past "now".
- ☐ Scroll up in a chat, then receive messages: a ⌄ button shows a counter, and the chat isn't marked read until you scroll back down.

## Presence and last seen
- ✅ The header shows "online", "last seen 5 min ago" or "last seen today at …"; it refreshes every 30 s (and instantly with the Ably webhook).
- ✅ With **Last seen → My contacts**, only people you've messaged see it; everyone else sees "last seen recently". **Nobody** hides it from everyone.
- ✅ Blocked users never see your status.
- ☐ **(Ably + webhook)** Closing the other user's last tab flips them to "last seen just now" within a few seconds.

## Layout and motion
- ✅ Desktop: chat list on the left (active chat highlighted), conversation on the right. Mobile: the list full-width, and the chat slides in with a back button.
- ✅ Chat list and chat screens show skeletons while loading.
- ✅ The header is glass with messages scrolling beneath it; the composer floats at the bottom and respects the home-indicator safe area.
- ☐ Sent bubbles spring in from the right and received ones from the left. Older messages loaded by scrolling don't animate.
- ☐ Scrolling a long chat stays smooth (only visible rows are in the DOM, checkable in DevTools).
- ☐ With "Reduce motion" on, the springs become fades.

## Not in this phase
Media, replies, edit/delete, reactions, delivered/read ticks for the sender, pin/archive/mute actions and blocking from the UI come in Phase 3. Groups, message search and push come in Phase 5.
