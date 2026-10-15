# Phase 1 test checklist — auth and profiles

✅ = verified during the build (unit tests or HTTP against a local Postgres). ☐ = please check by hand (mostly visual or device-specific).

## Sign up
- ✅ Username availability updates live while typing: "✓ Available", "That username is taken", rule errors (length, characters, reserved).
- ✅ Usernames are case-insensitive: `ADA_L` is reported taken after `ada_l` signs up.
- ✅ Duplicate username → error on the username field; duplicate email (any case) → error on the email field.
- ✅ Password under 8 characters, or equal to the username, is rejected.
- ✅ Optional bio and date of birth save; under-13 and future dates are rejected.
- ✅ After sign-up you land on **Welcome** (photo step) and a verification email is sent.
- ✅ Sign-up is rate-limited (5 per hour per IP).
- ☐ The strength meter, the optional section's expand animation and the error messages look right in light and dark.

## Email verification
- ✅ The link verifies the account and shows "Email verified"; the token is removed from the address bar.
- ✅ A used link, or an older link after "Resend email", shows "invalid or expired".
- ☐ An unverified account shows the "Verify your email" banner in the chat list; **Resend email** shows a toast.

## Sign in / out
- ✅ Sign in works with the username (any case) or the email (any case).
- ✅ A wrong password and an unknown account return the same message.
- ✅ 9th failed attempt on one account within 15 min → "Too many attempts".
- ✅ Visiting `/settings` signed out redirects to `/login?next=/settings`; after sign-in you return there.
- ✅ Log out ends only this device (the other device stays signed in), clears the cookie and sends `Clear-Site-Data`.
- ✅ **Log out of all devices** ends every session, including this one.
- ☐ Visiting `/login` while signed in jumps to `/chats`.

## Password
- ✅ Forgot password always answers the same way, with the same timing, whether or not the email exists.
- ✅ The reset link works once; it expires after 30 minutes and is superseded by a newer link.
- ✅ Reset signs out every device; the old password stops working, the new one works.
- ✅ Change password needs the current password, keeps this device signed in and signs out the others.
- ☐ Show/hide password toggle and the reset page's "Link not valid" state.

## Profile and settings
- ✅ Display name, bio and date of birth save; input is trimmed and control characters are stripped.
- ✅ Settings only accept known fields (attempts to set `passwordHash`/`emailVerifiedAt` are ignored).
- ✅ Privacy (last seen, profile photo, who can message me) and notification toggles persist.
- ✅ Devices list shows each session, marks "This device", and can sign out others.
- ☐ Theme: System / Light / Dark switches instantly, survives a reload with no flash, and System follows the OS.
- ☐ Avatar (needs R2 configured): pick a photo → instant preview → saved as a 512px square WebP; it shows in the chat-list header; **Remove photo** works. Uploading a renamed non-image is rejected.
- ✅ Without R2 configured, uploads fail cleanly with "Media storage isn't configured."

## Security
- ✅ Mutations from another origin, or with no Origin header, return 403.
- ✅ Session cookie is `HttpOnly`, `SameSite=Lax` (and `Secure` + `__Host-` in production).
- ✅ CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` headers are present.
- ✅ Post-login redirect ignores external URLs (`//evil.com`, `https://…`).
- ✅ Uploads: only JPEG/PNG/WebP up to 5 MB are presigned, and the confirm step checks the real bytes.
- ☐ DevTools → Application: Local Storage, Session Storage and IndexedDB are empty for the site; the only JS-readable cookie is `aval-theme`.

## UI / accessibility
- ☐ Desktop (≥768px): two panes, with the chat list on the left. Mobile: `/chats` shows the list full-width, and Settings slides in with a back button.
- ☐ Tabbing shows emerald focus rings; clicking doesn't. No blue tap highlight on mobile.
- ☐ With "Reduce motion" on in the OS, springs and slides become simple fades.
- ☐ Notch and home-indicator safe areas are respected on an iPhone (headers and the toast area).
