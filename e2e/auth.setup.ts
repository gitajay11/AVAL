import { test as setup } from "@playwright/test";
import { ADA, GRACE, authFile, login } from "./helpers";

// Signs both test users in once per run and saves their sessions, so the tests
// don't sign in again and again (the app rate-limits sign-ins).
for (const user of [ADA, GRACE]) {
  setup(`sign in ${user.username}`, async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    await login(request, user, baseURL!);
    await request.storageState({ path: authFile(user) });
    await request.dispose();
  });
}
