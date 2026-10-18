import { expect, test } from "@playwright/test";
import { directChat, graceContext, realtimeAvailable, setProfilePhoto, waitForRealtime } from "./helpers";

// When Grace changes her photo, Ada (with the app open) sees it without reloading,
// and still after reloading. With real-time the change arrives in about a second;
// without it (no Ably key), the app's polling fallback picks it up.

test("a new profile photo shows for the other person, live and after a reload", async ({ browser, page, baseURL, viewport }) => {
  const grace = await graceContext(browser, { viewport });
  const chatId = await directChat(grace.request, baseURL!);

  await page.goto("/chats");
  const row = page.locator(`a[href="/chats/${chatId}"]`);
  await expect(row).toBeVisible();
  const live = await realtimeAvailable(page.request);
  if (live) await waitForRealtime(page);

  const newUrl = await setProfilePhoto(grace.request, baseURL!);

  // In Ada's chat list, without a reload.
  const rowPhoto = row.locator("img");
  await expect(rowPhoto).toHaveAttribute("src", newUrl, { timeout: live ? 3_000 : 20_000 });
  await expect.poll(() => rowPhoto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // In the chat header.
  await row.click();
  await expect(page.locator("header img").first()).toHaveAttribute("src", newUrl);

  // And after a reload (nothing stale is cached).
  await page.reload();
  await expect(page.locator("header img").first()).toHaveAttribute("src", newUrl);
  await page.goto("/chats");
  await expect(row.locator("img")).toHaveAttribute("src", newUrl);

  await grace.close();
});
