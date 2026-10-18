import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/** The two local test accounts from prisma/seed-dev.mts (never real accounts). */
export const ADA = { username: "ada_l", password: "test-password-ada" };
export const GRACE = { username: "grace.h", password: "test-password-grace" };

type User = { username: string; password: string };

/** Where a user's signed-in session is saved by auth.setup.ts. */
export const authFile = (user: User) => path.join(__dirname, ".auth", `${user.username}.json`);

/** Signs in through the API (the session cookie lands in the request context). */
export async function login(request: APIRequestContext, user: User, baseURL: string) {
  const res = await request.post("/api/auth/login", {
    data: { identifier: user.username, password: user.password },
    headers: { origin: baseURL },
  });
  expect(res.status(), `login ${user.username}`).toBe(200);
}

async function call<T>(request: APIRequestContext, baseURL: string, method: "GET" | "POST", url: string, data?: unknown): Promise<T> {
  const res = await request.fetch(url, { method, data, headers: { origin: baseURL } });
  expect(res.ok(), `${method} ${url}: ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}

/** Grace's 1:1 chat with Ada (created, with a first message, if it doesn't exist yet). */
export async function directChat(grace: APIRequestContext, baseURL: string): Promise<string> {
  const { results } = await call<{ results: { id: string; username: string }[] }>(grace, baseURL, "GET", `/api/users/search?q=${ADA.username}`);
  const ada = results.find((r) => r.username === ADA.username);
  expect(ada, "Ada is searchable").toBeTruthy();
  const { chatId } = await call<{ chatId: string }>(grace, baseURL, "POST", "/api/chats", { userId: ada!.id });
  await sendMessage(grace, baseURL, chatId, "Hello from the e2e tests");
  return chatId;
}

export async function sendMessage(request: APIRequestContext, baseURL: string, chatId: string, text: string) {
  await call(request, baseURL, "POST", `/api/chats/${chatId}/messages`, { clientId: randomUUID(), text });
}

/** Sets a new profile photo for the signed-in user, the way the app does: presign, upload, confirm. */
export async function setProfilePhoto(request: APIRequestContext, baseURL: string): Promise<string> {
  const body = readFileSync(path.join(__dirname, "..", "public", "icons", "icon-192.v3.png"));
  const upload = await call<{ uploadId: string; url: string; headers: Record<string, string> }>(request, baseURL, "POST", "/api/uploads/avatar", {
    contentType: "image/png",
    size: body.length,
  });
  const put = await request.put(upload.url, { data: body, headers: upload.headers });
  expect(put.ok(), `upload to storage: ${put.status()}`).toBe(true);
  const { user } = await call<{ user: { avatarUrl: string } }>(request, baseURL, "POST", "/api/uploads/avatar/confirm", { uploadId: upload.uploadId });
  return user.avatarUrl;
}

/** A second phone for Grace, the same model as the test's project, already signed in. */
export async function graceContext(browser: Browser, device: { viewport: { width: number; height: number } | null; userAgent?: string; isMobile?: boolean; hasTouch?: boolean; deviceScaleFactor?: number }) {
  return browser.newContext({
    storageState: authFile(GRACE),
    viewport: device.viewport ?? undefined,
    userAgent: device.userAgent,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    deviceScaleFactor: device.deviceScaleFactor,
  });
}

/** Whether this app instance has real-time (Ably); without it, it polls instead. Needs a signed-in request. */
export async function realtimeAvailable(request: APIRequestContext): Promise<boolean> {
  const status = (await request.get("/api/realtime/token")).status();
  expect(status, "signed in for the real-time check").not.toBe(401);
  return status !== 503;
}

/** Waits until this page's real-time connection is up (when the app has real-time). */
export async function waitForRealtime(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-realtime", "live", { timeout: 20_000 });
}

/** Waits until the chat has opened and its composer is ready. */
export async function openChat(page: Page, chatId: string) {
  await page.goto(`/chats/${chatId}`);
  await expect(page.locator("textarea")).toBeVisible();
}

/** The composer is entirely inside the visible part of the screen (the visual viewport). */
export async function expectComposerOnScreen(page: Page) {
  const bar = page.getByTestId("composer-bar");
  await expect(bar).toBeVisible();
  await expect(page.locator("textarea")).toBeInViewport({ ratio: 1 });
  const { top, bottom, visibleTop, visibleBottom, pageScroll } = await bar.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    return {
      top: r.top,
      bottom: r.bottom,
      visibleTop: vv ? vv.offsetTop : 0,
      visibleBottom: vv ? vv.offsetTop + vv.height : window.innerHeight,
      pageScroll: window.scrollY,
    };
  });
  expect(pageScroll, "the page itself never scrolls").toBe(0);
  expect(top).toBeGreaterThanOrEqual(visibleTop - 1);
  expect(bottom).toBeLessThanOrEqual(visibleBottom + 1);
}
