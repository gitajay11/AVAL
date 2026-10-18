import { expect, test } from "@playwright/test";
import { directChat, graceContext, openChat, realtimeAvailable, waitForRealtime } from "./helpers";

// "typing…" travels over real-time only, so this needs an Ably key (ABLY_API_KEY).

test("typing shows in the other person's chat list and chat header, then hides", async ({ browser, page, baseURL, viewport }) => {
  test.skip(!(await realtimeAvailable(page.request)), "Real-time isn't configured (no ABLY_API_KEY): typing indicators need it.");

  const graceSide = await graceContext(browser, { viewport });
  const chatId = await directChat(graceSide.request, baseURL!);
  const grace = await graceSide.newPage();
  await openChat(grace, chatId);
  await waitForRealtime(grace);

  await page.goto("/chats");
  const row = page.locator(`a[href="/chats/${chatId}"]`);
  await expect(row).toBeVisible();
  await waitForRealtime(page);

  // In Ada's chat list.
  await grace.locator("textarea").pressSequentially("Hello there", { delay: 80 });
  await expect(row.getByText("typing")).toBeVisible({ timeout: 5_000 });
  // Hidden again a few seconds after Grace stops.
  await expect(row.getByText("typing")).toBeHidden({ timeout: 8_000 });

  // In Ada's chat header.
  await openChat(page, chatId);
  await waitForRealtime(page);
  await grace.locator("textarea").pressSequentially(" again", { delay: 80 });
  await expect(page.locator("header").getByText("typing")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("header").getByText("typing")).toBeHidden({ timeout: 8_000 });

  await graceSide.close();
});
