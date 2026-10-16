# Phase 3 test checklist — media, message actions and receipts

✅ = verified during the build: unit tests (83), an API suite (50 checks) and a media suite (21 checks) against local Postgres and a local S3 emulator, plus the in-app browser in polling mode. ☐ = please check by hand. **(Ably)** needs `ABLY_API_KEY`. **(Storage)** needs Neon Object Storage (or the local S3 setup in the README).

## Media
- ✅ Photo with a caption: the preview shows in the composer, then an upload ring on the bubble, then the photo at its real aspect ratio. Tap opens a full-screen viewer with download.
- ✅ Images are re-encoded in the browser (EXIF/GPS stripped; longest side ≤ 2560 px). GIFs are sent untouched.
- ✅ Files show name, size and a download button, and are always served as downloads (`application/octet-stream`, `Content-Disposition: attachment`), never rendered.
- ✅ Voice notes keep their waveform and duration. The player has play/pause, seek on the waveform, 1×/1.5×/2× speed, and only one plays at a time.
- ✅ A file renamed to `.png` (HTML inside) is rejected and deleted. A declared size that doesn't match the upload never becomes sendable.
- ✅ Uploads are tied to their chat. They can't be sent twice, sent before confirmation, or sent into another chat.
- ✅ Media URLs work only for chat members (others get 404), stop working after "delete for everyone", and are 1-hour signed redirects.
- ✅ A forwarded photo keeps working after the original is deleted (the object is shared and reference-counted).
- ☐ **(Storage)** Record a voice note: tap the mic, allow the microphone, watch the live meter, send. Trash discards it.
- ☐ **(Storage)** Video plays inline (`playsInline` on iOS) and seeks.
- ☐ Paste an image from the clipboard, or drag a file onto the composer.
- ☐ On iPhone, pick a HEIC photo: it's converted to JPEG (Safari) or sent as a file (other browsers).

## Link previews
- ✅ A message with a link gets a preview card (site, title, description) a few seconds after sending. It's removed if an edit changes the link.
- ✅ No previews for `localhost`, `127.0.0.1`, `169.254.169.254`, `[::1]`, non-standard ports, or hostnames that resolve to private IPs (`localtest.me`).
- ☐ **(Storage)** For a page with `og:image`, the image appears in the card, served from our storage.

## Message actions (right-click on desktop, long-press on touch)
- ✅ The menu shows 7 quick reactions, then Reply · Copy text · Forward · Pin · Star · Edit · Delete · Report (not on your own messages). It stays on screen near edges and has frosted glass.
- ✅ Reactions: one per person (picking another replaces it, picking the same removes it). Chips show counts and highlight yours. Only one emoji is accepted.
- ✅ Reply: the composer shows a "Reply to …" bar (Esc cancels). The sent bubble quotes the original, and tapping the quote scrolls to and highlights it (loading older pages if needed).
- ✅ Edit: only your own messages, within 48 hours. Others see "edited".
- ✅ Delete for everyone (your messages): a "Message deleted" placeholder; media, reactions, stars and pin are removed. Delete for me: hidden on all your devices, still visible to others.
- ✅ Forward to up to 10 chats: shows "Forwarded from <original sender>"; you can't forward into chats you can't send in.
- ✅ Pin: a pinned bar under the header (tap to jump, × to unpin), visible to both people.
- ✅ Star: private to you, listed in **Starred messages** (★ in the chat list header). Deleted messages drop out.
- ☐ Touch: swipe a bubble left to reply (with a little haptic on Android).
- ☐ Copy text puts the message on the clipboard.

## Receipts
- ✅ ✓ sent → ✓✓ delivered (the other person's app loaded) → green ✓✓ read (they opened the chat at the bottom). Shown on bubbles and on your last message in the chat list.
- ✅ Without Ably, the open chat refreshes receipts every 3 s; with Ably they update instantly.
- ☐ **(Ably)** Two windows: send from A, then open B's chat list (A sees ✓✓), then open the chat in B (A sees green ✓✓).

## Chat list actions
- ✅ Right-click a chat: Pin/Unpin (max 5), Mark as read/unread, Mute/Unmute, Archive/Unarchive. Changes sync to your other devices.
- ✅ Archived chats move under **Archived chats** (with an unread count). A new message un-archives a chat unless it's muted.
- ☐ Touch: swipe right for Pin / Read, swipe left for Mute / Archive. Tapping an open row closes it.
- ☐ Muted chats show a bell-off icon and a grey unread badge.

## Blocking and reporting
- ✅ Tap the chat header to open the profile: photo, name, @username, bio, plus Mute · Block · Report.
- ✅ Blocking: they can't message or react, can't see your photo, status or typing, and you vanish from each other's search. Your composer shows "You blocked X · Unblock".
- ✅ Settings → **Blocked** lists blocked people with Unblock.
- ✅ Reports (user or message) need a reason, are rate-limited to 10 per day, and can't target yourself or your own messages.

## Not in this phase
Groups, message search and push notifications are Phase 5. Personal contacts are Phase 4.
