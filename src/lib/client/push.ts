"use client";

import { api, ClientApiError } from "./api";
import { APP_VERSION } from "@/lib/version";

export type PushState = "unsupported" | "unconfigured" | "denied" | "off" | "on" | "needs-install";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** One worker per build (its app-shell cache is per build too). */
const SW_URL = `/sw.js?v=${encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev")}&app=${encodeURIComponent(APP_VERSION)}`;

/** The app's service worker registration. Registering the same URL again is a no-op; a new build's URL updates it. */
export async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
}

/** Where push stands on this device. */
export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  }
  const { publicKey } = await api<{ publicKey: string | null }>("/api/push");
  if (!publicKey) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Ask permission, subscribe this browser, and register it with the server. */
export async function enablePush(): Promise<PushState> {
  const { publicKey } = await api<{ publicKey: string | null }>("/api/push");
  if (!publicKey) return "unconfigured";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new ClientApiError(0, "push", "Couldn't enable notifications.");
  await api("/api/push/subscriptions", { body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } } });
  return "on";
}

/** Unsubscribe this browser and forget it on the server. Safe to call when already off. */
export async function disablePush(): Promise<void> {
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : null;
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("/api/push/subscriptions", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
