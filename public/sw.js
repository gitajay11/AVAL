/* Aval service worker.
 * Phase 5: push notifications only. It caches nothing (Phase 6 adds an app-shell
 * cache for static assets only; messages and user data are never cached here).
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Is a visible, focused window already showing this chat? Then don't notify. */
async function chatIsOnScreen(chatId) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return windows.some((w) => w.focused && w.visibilityState === "visible" && chatId && new URL(w.url).pathname === `/chats/${chatId}`);
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Aval", body: "You have a new notification", url: "/chats" };
  }
  event.waitUntil(
    (async () => {
      if (data.kind === "message" && (await chatIsOnScreen(data.chatId))) return;
      const actions = [];
      // Inline reply (Chromium); other browsers ignore unknown action types.
      if (data.reply && data.chatId) actions.push({ action: "reply", type: "text", title: "Reply", placeholder: "Message" });
      actions.push({ action: "open", title: "Open" });
      await self.registration.showNotification(data.title || "Aval", {
        body: data.body || "",
        tag: data.tag,
        renotify: true,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
        data: { url: data.url || "/chats", chatId: data.chatId || null },
        actions,
      });
    })(),
  );
});

async function openUrl(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
  if (existing) {
    await existing.focus();
    if ("navigate" in existing) return existing.navigate(url);
    return existing;
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const { url, chatId } = event.notification.data || {};
  event.notification.close();

  if (event.action === "reply" && chatId && event.reply) {
    // Same-origin request with the session cookie; the API checks auth, membership
    // and Origin exactly as for the app itself.
    event.waitUntil(
      fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: crypto.randomUUID().replace(/-/g, ""), text: event.reply }),
      }).then((res) => {
        if (!res.ok) return openUrl(url || "/chats");
      }),
    );
    return;
  }
  event.waitUntil(openUrl(url || "/chats"));
});
