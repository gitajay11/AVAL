# Phase 4 test checklist — personal contacts and access requests

✅ = verified during the build: 100 unit tests (including the full access-policy matrix), a 62-check contacts API suite against local Postgres + S3, re-runs of the earlier API (50) and media (21) suites, and the in-app browser. ☐ = please check by hand. **(Ably)** needs `ABLY_API_KEY`.

Two local users: `pnpm db:seed`, then `ada_l` in one window and `grace.h` in a private window.

## Creating and writing (owner)
- ✅ **Contacts** (book icon in the chat list header) → **New**: name, optional note, visibility (Private by default).
- ✅ The contact gets a one-way chat that shows in your chat list right away (even while empty), titled with the contact's name and photo.
- ✅ Header shows "Personal contact · private/public". Tapping it opens the management page.
- ✅ Write with every message type and action from Phase 3 (text, photos, files, voice, reply, edit, delete, pin, star). No delivery or read ticks are shown.
- ✅ Contact photo: tap the avatar on the management page. Only the owner can set it (verified upload, like profile photos).
- ✅ Delete contact: removes the contact, its chat, all messages and all media. Viewers lose access immediately.

## Private (the default)
- ✅ Invisible to everyone else: not in search; the card, chat, messages, pinned, media, photo and management endpoints all return 404 (indistinguishable from "doesn't exist"); can't be requested.

## Public
- ✅ Search (sidebar search, or Contacts → Find public contacts, 2+ letters) finds it by name prefix and shows **name and photo only**: never the owner, the note, or the chat. Your own contacts and those of people blocked either way don't appear.
- ✅ Without approval, the chat and its media stay 404.

## Requests
- ✅ **Request to view** with an optional note. A second request while pending is rejected; you can withdraw it.
- ✅ The owner gets an in-app notification (bell badge, toast with Ably) showing who asked and the note. The management page lists pending requests.
- ✅ Approve or decline from the notification or the management page. Old notifications for requests that are no longer pending show "No longer pending" instead of buttons.
- ✅ The requester is notified: approved (with an **Open** link), or declined (may ask again).
- ☐ Push notification for new requests. Push is wired in Phase 5.

## Viewing (approved)
- ✅ Contacts → **Shared with me** lists it ("Shared by <owner>"). It does *not* appear in the viewer's chat list.
- ✅ The chat opens read-only: header "View only · shared with you", a notice instead of the composer, no long-press/right-click menu, no swipe-to-reply, reactions not clickable.
- ✅ Photos, video and voice play inline. Downloads are refused (`?download=1` → 403), files show "Not available in view-only", and the lightbox has no download button.
- ✅ Every write is refused server-side (404): send, react, forward, star, pin, edit, delete, hide, typing, read, chat settings, uploads, contact management.
- ✅ New entries appear for viewers (polling every 3 s; instantly with Ably).
- ✅ Viewers can report the contact (Report in its card). Owners can't report their own.

## Ending access
- ✅ **Revoke** a person on the management page: their next request is 404, their open chat closes with "Your access to this contact has ended", it leaves Shared with me, they're notified, and they may ask again.
- ✅ **Switch to Private**: confirms first, then removes everyone's access and cancels pending requests in one step. Switching back to Public does *not* restore old access.
- ✅ **Block** either way: hides the contact from each other and ends sharing. Unblocking does not restore it (ask again).
- ✅ Returning to a background tab re-checks at once. A hard reload of a revoked chat shows "Nothing here".
- ☐ **(Ably)** With both windows open, revoking closes the viewer's chat instantly, without waiting for a poll.

## Not in this phase
Push for access requests and new messages is Phase 5, along with groups and message search.
