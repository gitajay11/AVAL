import { expect, test } from "@playwright/test";
import { directChat, expectComposerOnScreen, graceContext, openChat } from "./helpers";

// The composer must stay on screen whatever the phone does: keyboard, scrolling,
// sending, rotating. The chat screen is a fixed column (components/app/app-shell.tsx,
// .app-shell in globals.css); these guard it.

let chatId: string;

test.beforeAll(async ({ browser, baseURL, viewport }) => {
  const grace = await graceContext(browser, { viewport });
  chatId = await directChat(grace.request, baseURL!);
  await grace.close();
});

// Ada (the project's signed-in user) has the chat open.
test.beforeEach(async ({ page }) => {
  await openChat(page, chatId);
});

test("stays on screen when the keyboard resizes the page (Android)", async ({ page }) => {
  const { width, height } = page.viewportSize()!;
  await page.locator("textarea").focus();
  await page.setViewportSize({ width, height: Math.round(height * 0.55) });
  await expectComposerOnScreen(page);
});

test("stays on screen when the keyboard shrinks only the visual viewport (iOS)", async ({ page }) => {
  // iOS keeps the page full height and shrinks / slides only the visual viewport.
  // Stand in a controllable visualViewport before the app's scripts run.
  await page.addInitScript(() => {
    const fake = new EventTarget();
    let height: number | null = null;
    let offsetTop = 0;
    Object.defineProperties(fake, {
      height: { get: () => height ?? window.innerHeight },
      width: { get: () => window.innerWidth },
      offsetTop: { get: () => offsetTop },
      offsetLeft: { get: () => 0 },
      pageTop: { get: () => offsetTop },
      pageLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
    (window as unknown as { __keyboard: (h: number | null, top?: number) => void }).__keyboard = (h, top = 0) => {
      height = h;
      offsetTop = top;
      fake.dispatchEvent(new Event("resize"));
      fake.dispatchEvent(new Event("scroll"));
    };
  });
  await openChat(page, chatId);
  const { height } = page.viewportSize()!;
  await page.locator("textarea").focus();

  // Keyboard up: the visible area is the top 55%.
  await page.evaluate((h) => (window as unknown as { __keyboard: (h: number) => void }).__keyboard(h), Math.round(height * 0.55));
  await page.waitForTimeout(100);
  await expectComposerOnScreen(page);

  // iOS slides the visible area down the page: the shell follows it.
  await page.evaluate((h) => (window as unknown as { __keyboard: (h: number, top: number) => void }).__keyboard(h, 120), Math.round(height * 0.55));
  await page.waitForTimeout(100);
  await expectComposerOnScreen(page);

  // Keyboard down again.
  await page.evaluate(() => (window as unknown as { __keyboard: (h: null) => void }).__keyboard(null));
  await page.waitForTimeout(100);
  await expectComposerOnScreen(page);
});

test("stays on screen after scrolling up through the history", async ({ page }) => {
  const list = page.locator(".chat-fade");
  await list.evaluate((el) => el.scrollTo({ top: 0 }));
  await list.evaluate((el) => el.scrollBy({ top: -2000 }));
  // The page itself is locked: trying to scroll it does nothing.
  await page.evaluate(() => window.scrollTo(0, 400));
  await expectComposerOnScreen(page);
});

test("stays on screen after sending, and the message shows", async ({ page }) => {
  const text = `Composer check ${Date.now()}`;
  await page.locator("textarea").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".chat-fade").getByText(text)).toBeVisible();
  await expect(page.locator("textarea")).toHaveValue("");
  await expectComposerOnScreen(page);
});

test("stays on screen after rotating the phone", async ({ page }) => {
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width: height, height: width });
  await expectComposerOnScreen(page);
  await page.setViewportSize({ width, height });
  await expectComposerOnScreen(page);
});

test("a several-line message keeps the latest messages in view", async ({ page }) => {
  const list = page.locator(".chat-fade");
  await page.locator("textarea").fill("one\ntwo\nthree\nfour\nfive");
  await expectComposerOnScreen(page);
  const fromEnd = await list.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  // Within a few pixels of the end (sub-pixel row heights differ per engine).
  expect(fromEnd).toBeLessThanOrEqual(8);
});
