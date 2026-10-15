# Phase 5 test checklist — groups, message search, push notifications

✅ = verified during the build: 109 unit tests (including the tsquery builder and group validation), a 55-check Phase 5 API suite against local Postgres + S3 + a local HTTPS push endpoint, re-runs of the earlier API (50), media (21) and contacts (62) suites, and the in-app browser. ☐ = please check by hand. **(Ably)** needs `ABLY_API_KEY`. **(Push)** needs VAPID keys and a real browser.

Two local users: `pnpm db:seed`, then `ada_l` in one window and `grace.h` in a private window.

## Creating a group
- ✅ Compose button (pencil, top right of the chat list) → **New group**: name, then search people by @username and tick them. **Create group with N** opens the group.
- ✅ People who only accept messages from their contacts, or who blocked you (or you them), can't be added. The error names who and why.
- ✅ The group appears in everyone's chat list with its initials (or photo), "N members" in the header and a system line "Ada created the group".

## In the group
- ✅ Other people's messages show their name (stable colour per person) and photo; consecutive messages from one person are grouped.
- ✅ Chat list preview reads "Grace: text" (or "You: text"). System changes show in italics.
- ✅ Header shows "N members", or "Grace is typing" **(Ably)**.
- ✅ Receipts: ✓✓ once every member has received it, green once every member has read it. Message info lists every member.
- ✅ Admins can delete anyone's message for everyone and pin messages; members can't pin.
- ☐ Messages, reactions, edits and member changes arrive live in the other window **(Ably)**, or within a few seconds by polling.

## Group info (tap the header)
- ✅ Everyone sees the photo, name, description, member list with owner (crown) and admin (shield) marks, mute, and **Leave group**.
- ✅ Admins: change photo (crop → verified upload; remove), rename, edit the description, **Add** people (same rules as creating), remove members. Each change posts a system line.
- ✅ Owner only: **Make admin** / **Remove admin**, remove an admin.
- ✅ Members can't edit anything (server returns 403 even if called directly).
- ✅ Removed people lose the chat at once: the chat closes and leaves their list; its messages, media, photo and search results return 404.
- ✅ The owner leaving hands ownership to the longest-standing admin (else member). The last person leaving deletes the group and its media.
- ✅ Group photo shows for members and is refused (404) for everyone else.

## Message search
- ✅ In a chat: magnifier in the header. Results appear from 2 characters, newest first, with the matched words highlighted; **Show older results** pages back. Picking one jumps to it; old messages load in a window around it and you can scroll both ways. Sending from an old window returns to the latest messages.
- ✅ Across chats: type in the chat list search box. A **Messages** section lists matches with chat name, sender and time; tapping opens the chat at that message.
- ✅ Prefix matching on the last word ("piz" finds "pizza"); all words must match; any language's letters work.
- ✅ Only your own view is searched: chats you're in, nothing you deleted for yourself, nothing deleted for everyone. Shared contacts you only view aren't in global search (search inside them works).
- ☐ Nothing from before **Clear history** matches (same filter as the message list; not covered by the suite).
- ✅ Operators and SQL in the query are treated as plain words.

## Push notifications **(Push)**
- ✅ Settings → Notifications → **Push on this device** shows the right state: on, off, blocked by the browser, not supported, not configured on the server, or "add to Home Screen" on iPhone/iPad. (The in-app browser blocks notifications, so only the "blocked" state was seen there.)
- ✅ Server side (against a local push endpoint): 1:1 and group messages push to every other member; muted chats, *New messages* off and your own messages don't; dead subscriptions (410) are deleted on first failure; "sign out everywhere" removes them; non-HTTPS endpoints are refused.
- ✅ Access requests push to the contact's owner.
- ☐ *Show message preview* off: the notification says "New message" with no text. Group notifications read "Grace: text" under the group name.
- ☐ No push from someone you blocked; password reset removes every subscription; approvals push to the requester.
- ☐ Turn it on in Chrome/Edge, close the tab, send from the other account: a notification appears. Clicking it opens the chat.
- ☐ **Reply** from the notification (Chrome/Edge desktop, Android): the reply is sent as you.
- ☐ With the chat open and focused, no notification is shown for that chat.
- ☐ On iPhone: Add to Home Screen, open from there, enable, and receive one.
- ☐ Signing out turns push off for that device.

## Not in this phase
- App-shell caching, install prompt, icons and offline screen are Phase 6 (the service worker currently handles push only).
